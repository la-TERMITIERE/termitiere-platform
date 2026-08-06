// Implémentation Firebase Realtime Database de la couche de données.
// (Extraite de l'ancien db.js — comportement inchangé pour la PRODUCTION.)
//
// Les données du portail sont rangées sous un namespace dédié `tp/` dans la
// Realtime Database, afin de NE PAS interférer avec les données de l'application
// MAXI-AGRO d'origine (qui écrit ailleurs dans la même base).
import {
  ref,
  onValue,
  get as rtdbGet,
  set as rtdbSet,
  update as rtdbUpdate,
  remove as rtdbRemove,
  push as rtdbPush,
  runTransaction
} from 'firebase/database'
import { rtdb, isFirebaseConfigured } from './firebase'
import { sanitizeData } from './sanitize'
import { checkRate } from './rateLimit'

const ROOT = 'tp' // racine "Termitière Platform" dans la Realtime Database

// ───────────────────────── MODE DÉMO (localStorage) ─────────────────────────
const demoKey = (name) => `termitiere_col_${name}`
const demoListeners = {} // { collectionName: Set<callback> }

function demoRead(name) {
  try {
    const raw = localStorage.getItem(demoKey(name))
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    return []
  }
}

function demoWrite(name, arr) {
  localStorage.setItem(demoKey(name), JSON.stringify(arr))
  ;(demoListeners[name] || []).forEach((cb) => cb([...arr]))
}

function demoGenId() {
  return 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// Convertit l'objet {id: data} de la RTDB en tableau [{ id, ...data }].
function snapToRows(val) {
  if (!val) return []
  // La CLÉ du document fait foi : elle est placée en DERNIER pour l'emporter sur
  // un éventuel champ `id` stocké dans les données. Sinon un document créé via
  // addItem (clé auto) mais portant un champ `id` différent devenait inadressable
  // (modifier créait un doublon, supprimer ne trouvait rien) — cf. Tâches Routinières.
  return Object.entries(val).map(([id, data]) => ({ ...(data || {}), id }))
}

const colRef = (name) => ref(rtdb, `${ROOT}/${name}`)
const docRef = (name, id) => ref(rtdb, `${ROOT}/${name}/${id}`)

// ───────────────────────── API PUBLIQUE ─────────────────────────

export function subscribeCollection(name, callback) {
  if (!isFirebaseConfigured) {
    if (!demoListeners[name]) demoListeners[name] = new Set()
    demoListeners[name].add(callback)
    Promise.resolve().then(() => callback(demoRead(name)))
    return () => demoListeners[name]?.delete(callback)
  }
  return onValue(
    colRef(name),
    (snap) => callback(snapToRows(snap.val())),
    (err) => console.error(`[db] onValue ${name} :`, err)
  )
}

export async function getAll(name) {
  if (!isFirebaseConfigured) return demoRead(name)
  const snap = await rtdbGet(colRef(name))
  return snapToRows(snap.val())
}

export async function getOne(name, id) {
  if (!isFirebaseConfigured) return demoRead(name).find((x) => x.id === id) || null
  const snap = await rtdbGet(docRef(name, id))
  return snap.exists() ? { id, ...snap.val() } : null
}

export async function addItem(name, data) {
  checkRate(name, 'write')
  data = sanitizeData(data)
  const payload = { ...data, createdAt: Date.now() }
  if (!isFirebaseConfigured) {
    const arr = demoRead(name)
    const id = demoGenId()
    // `id` en dernier : la clé générée fait foi (parité avec le mode Firebase).
    arr.push({ ...payload, id })
    demoWrite(name, arr)
    return id
  }
  const r = rtdbPush(colRef(name))
  await rtdbSet(r, payload)
  return r.key
}

export async function setItem(name, id, data) {
  checkRate(name, 'write')
  data = sanitizeData(data)
  if (!isFirebaseConfigured) {
    const arr = demoRead(name)
    const idx = arr.findIndex((x) => x.id === id)
    if (idx >= 0) arr[idx] = { ...arr[idx], ...data, id }
    else arr.push({ id, ...data })
    demoWrite(name, arr)
    return id
  }
  await rtdbUpdate(docRef(name, id), data)
  return id
}

export async function updateItem(name, id, data) {
  checkRate(name, 'write')
  data = sanitizeData(data)
  if (!isFirebaseConfigured) {
    const arr = demoRead(name)
    const idx = arr.findIndex((x) => x.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...data }; demoWrite(name, arr) }
    return
  }
  await rtdbUpdate(docRef(name, id), data)
}

export async function removeItem(name, id) {
  if (!isFirebaseConfigured) {
    demoWrite(name, demoRead(name).filter((x) => x.id !== id))
    return
  }
  await rtdbRemove(docRef(name, id))
}

// Réclame un document de façon ATOMIQUE : n'écrit que si `id` n'existe pas encore,
// renvoie true si CET appel a gagné la réclamation, false si quelqu'un d'autre l'a
// déjà réclamé (ex. deux sessions ouvertes en même temps). Contrairement à
// getOne()+setItem(), il n'y a pas de fenêtre de course entre la lecture et
// l'écriture — utilisé pour garantir qu'une notification n'est envoyée qu'UNE
// SEULE fois même si plusieurs utilisateurs ont l'appli ouverte simultanément.
export async function claimOnce(name, id, data = {}) {
  checkRate(name, 'write')
  data = sanitizeData(data)
  if (!isFirebaseConfigured) {
    const arr = demoRead(name)
    if (arr.some((x) => x.id === id)) return false
    arr.push({ id, ...data, createdAt: Date.now() })
    demoWrite(name, arr)
    return true
  }
  const { committed } = await runTransaction(docRef(name, id), (current) => {
    if (current !== null) return undefined // avorte : déjà réclamé par quelqu'un d'autre
    return { ...data, createdAt: Date.now() }
  })
  return committed
}

// Répare les documents créés par erreur avec un `addItem(..., { id: <valeur imposée>, ... })` :
// `addItem` génère TOUJOURS sa propre clé RTDB (push key) — un champ `id` fourni dans les
// données est simplement ignoré pour l'écriture, mais `snapToRows` (ci-dessus) le fait
// ensuite gagner sur la vraie clé RTDB en le relisant. Résultat : `item.id` (vu par
// l'appli) ≠ la vraie clé du document, donc tout `setItem`/`removeItem(name, item.id)`
// ultérieur vise un chemin qui n'existe pas — il CRÉE un doublon au lieu de modifier
// (setItem) ou ne fait rien (removeItem, silencieusement, puisque rien n'existe à ce
// chemin). Cette fonction déplace chaque document mal placé vers la clé `data.id`
// (celle que l'appli utilise déjà partout) et supprime l'ancien, sans jamais dupliquer.
export async function repairCustomIds(name) {
  if (!isFirebaseConfigured) return { repaired: 0 } // mode démo : tableau plat, pas de clé séparée — non concerné
  const snap = await rtdbGet(colRef(name))
  const val = snap.val()
  if (!val) return { repaired: 0 }
  let repaired = 0
  for (const [vraieCle, data] of Object.entries(val)) {
    if (data && data.id && data.id !== vraieCle) {
      await rtdbSet(docRef(name, data.id), data)
      await rtdbRemove(docRef(name, vraieCle))
      repaired++
    }
  }
  return { repaired }
}

export const ts = () => Date.now()

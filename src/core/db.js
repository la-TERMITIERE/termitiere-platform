// Couche d'accès aux données générique.
// Expose une API CRUD + temps réel identique quel que soit le backend :
//   - Base configurée (Realtime Database) → synchronisation TEMPS RÉEL multi-appareils
//   - Mode DÉMO (aucune base)             → localStorage + émetteur d'évènements local
//
// Les données du portail sont rangées sous un namespace dédié `tp/` dans la
// Realtime Database, afin de NE PAS interférer avec les données de l'application
// MAXI-AGRO d'origine (qui écrit ailleurs dans la même base).
//
// Toutes les fonctions de souscription renvoient une fonction de désinscription
// à appeler au démontage du composant (cleanup useEffect).
import {
  ref,
  onValue,
  get as rtdbGet,
  set as rtdbSet,
  update as rtdbUpdate,
  remove as rtdbRemove,
  push as rtdbPush
} from 'firebase/database'
import { rtdb, isFirebaseConfigured } from './firebase'

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
  return Object.entries(val).map(([id, data]) => ({ id, ...(data || {}) }))
}

const colRef = (name) => ref(rtdb, `${ROOT}/${name}`)
const docRef = (name, id) => ref(rtdb, `${ROOT}/${name}/${id}`)

// ───────────────────────── API PUBLIQUE ─────────────────────────

// Souscription temps réel à une collection entière.
// callback reçoit un tableau d'objets { id, ...data }.
export function subscribeCollection(name, callback) {
  if (!isFirebaseConfigured) {
    if (!demoListeners[name]) demoListeners[name] = new Set()
    demoListeners[name].add(callback)
    Promise.resolve().then(() => callback(demoRead(name)))
    return () => demoListeners[name]?.delete(callback)
  }
  // onValue renvoie directement la fonction de désinscription (SDK modulaire v10).
  return onValue(
    colRef(name),
    (snap) => callback(snapToRows(snap.val())),
    (err) => console.error(`[db] onValue ${name} :`, err)
  )
}

// Lecture ponctuelle (one-shot) de toute la collection.
export async function getAll(name) {
  if (!isFirebaseConfigured) return demoRead(name)
  const snap = await rtdbGet(colRef(name))
  return snapToRows(snap.val())
}

// Lecture d'un document unique par id.
export async function getOne(name, id) {
  if (!isFirebaseConfigured) return demoRead(name).find((x) => x.id === id) || null
  const snap = await rtdbGet(docRef(name, id))
  return snap.exists() ? { id, ...snap.val() } : null
}

// Création d'un document (id auto). Renvoie l'id créé.
export async function addItem(name, data) {
  const payload = { ...data, createdAt: Date.now() }
  if (!isFirebaseConfigured) {
    const arr = demoRead(name)
    const id = demoGenId()
    arr.push({ id, ...payload })
    demoWrite(name, arr)
    return id
  }
  const r = rtdbPush(colRef(name))
  await rtdbSet(r, payload)
  return r.key
}

// Création/écriture avec id explicite (fusion des champs fournis).
export async function setItem(name, id, data) {
  if (!isFirebaseConfigured) {
    const arr = demoRead(name)
    const idx = arr.findIndex((x) => x.id === id)
    if (idx >= 0) arr[idx] = { ...arr[idx], ...data, id }
    else arr.push({ id, ...data })
    demoWrite(name, arr)
    return id
  }
  // update fusionne les champs fournis sans écraser le reste du document.
  await rtdbUpdate(docRef(name, id), data)
  return id
}

// Mise à jour partielle.
export async function updateItem(name, id, data) {
  if (!isFirebaseConfigured) {
    const arr = demoRead(name)
    const idx = arr.findIndex((x) => x.id === id)
    if (idx >= 0) { arr[idx] = { ...arr[idx], ...data }; demoWrite(name, arr) }
    return
  }
  await rtdbUpdate(docRef(name, id), data)
}

// Suppression.
export async function removeItem(name, id) {
  if (!isFirebaseConfigured) {
    demoWrite(name, demoRead(name).filter((x) => x.id !== id))
    return
  }
  await rtdbRemove(docRef(name, id))
}

// Horodatage (millisecondes). Cohérent entre les deux modes.
export const ts = () => Date.now()

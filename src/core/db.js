// Couche d'accès aux données générique.
// Expose une API CRUD + temps réel identique quel que soit le backend :
//   - Firebase configuré  → Firestore (onSnapshot, addDoc, updateDoc, deleteDoc)
//   - Mode DÉMO           → localStorage + émetteur d'évènements local
//
// Toutes les fonctions de souscription renvoient une fonction de désinscription
// à appeler au démontage du composant (cleanup useEffect).
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  serverTimestamp
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'

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
  // Notifier tous les abonnés de cette collection
  ;(demoListeners[name] || []).forEach((cb) => cb([...arr]))
}

function demoGenId() {
  return 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ───────────────────────── API PUBLIQUE ─────────────────────────

// Souscription temps réel à une collection entière.
// callback reçoit un tableau d'objets { id, ...data } trié par createdAt si dispo.
export function subscribeCollection(name, callback) {
  if (!isFirebaseConfigured) {
    if (!demoListeners[name]) demoListeners[name] = new Set()
    demoListeners[name].add(callback)
    // Émission initiale asynchrone (cohérent avec onSnapshot)
    Promise.resolve().then(() => callback(demoRead(name)))
    return () => demoListeners[name]?.delete(callback)
  }

  const q = query(collection(db, name))
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      callback(rows)
    },
    (err) => console.error(`[db] onSnapshot ${name} :`, err)
  )
}

// Lecture ponctuelle (one-shot) de toute la collection.
export async function getAll(name) {
  if (!isFirebaseConfigured) return demoRead(name)
  const snap = await getDocs(collection(db, name))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// Lecture d'un document unique par id.
export async function getOne(name, id) {
  if (!isFirebaseConfigured) return demoRead(name).find((x) => x.id === id) || null
  const snap = await getDoc(doc(db, name, id))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

// Création d'un document (id auto). Renvoie l'id créé.
export async function addItem(name, data) {
  const payload = { ...data, createdAt: isFirebaseConfigured ? serverTimestamp() : Date.now() }
  if (!isFirebaseConfigured) {
    const arr = demoRead(name)
    const id = demoGenId()
    arr.push({ id, ...payload })
    demoWrite(name, arr)
    return id
  }
  const ref = await addDoc(collection(db, name), payload)
  return ref.id
}

// Création/écriture avec id explicite (merge).
export async function setItem(name, id, data) {
  if (!isFirebaseConfigured) {
    const arr = demoRead(name)
    const idx = arr.findIndex((x) => x.id === id)
    if (idx >= 0) arr[idx] = { ...arr[idx], ...data, id }
    else arr.push({ id, ...data })
    demoWrite(name, arr)
    return id
  }
  await setDoc(doc(db, name, id), data, { merge: true })
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
  await updateDoc(doc(db, name, id), data)
}

// Suppression.
export async function removeItem(name, id) {
  if (!isFirebaseConfigured) {
    demoWrite(name, demoRead(name).filter((x) => x.id !== id))
    return
  }
  await deleteDoc(doc(db, name, id))
}

// Horodatage serveur (ou timestamp local en démo).
export const ts = () => (isFirebaseConfigured ? serverTimestamp() : Date.now())

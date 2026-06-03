// Migration des données de l'ancienne app MAXI-AGRO vers la plateforme.
//
// Trois sources possibles :
//  1. localStorage `maxiagro_db_v1` (même origine — utile une fois déployé sur le même domaine)
//  2. Firebase Realtime Database de l'ancienne app (chemin `maxiagro`)
//  3. Fichier JSON exporté depuis l'ancienne app (upload manuel)
//
// Cible : Firestore (collections agro_*) si configuré, sinon collections localStorage de la plateforme.
import { writeBatch, collection, doc, serverTimestamp } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../core/firebase'
import { setItem, addItem } from '../core/db'

const OLD_KEY = 'maxiagro_db_v1'
const FLAG_KEY = 'termitiere_migrated'
// Base de données temps réel de l'ancienne app (lecture seule, migration ponctuelle)
const OLD_RTDB_URL = 'https://max-agro-83baf-default-rtdb.firebaseio.com/maxiagro.json'

// Résumé vide
const recapVide = () => ({ inventaires: 0, factures: 0, demandes: 0, sante: 0 })

// Détecte des données migrables dans le localStorage (ancienne app, même origine).
export function detecterAnciennesDonnees() {
  if (localStorage.getItem(FLAG_KEY)) return null
  const raw = localStorage.getItem(OLD_KEY)
  if (!raw) return null
  try {
    return resumerDB(JSON.parse(raw))
  } catch {
    return null
  }
}

// Compte le contenu opérationnel d'une ancienne DB.
export function resumerDB(oldDB) {
  if (!oldDB) return recapVide()
  return {
    inventaires: Object.keys(oldDB.inventaires || {}).length,
    factures: (oldDB.factures || []).length,
    demandes: (oldDB.demandes || []).length,
    sante: (oldDB.sanitaire || []).length
  }
}

// Récupère la base de l'ancienne app depuis sa Firebase Realtime Database.
export async function fetchAncienneDB() {
  const res = await fetch(OLD_RTDB_URL)
  if (!res.ok) throw new Error(`Firebase RTDB : HTTP ${res.status}`)
  return await res.json()
}

// Cœur de migration : mappe une ancienne DB vers les collections de la plateforme.
export async function migrerDepuisDB(oldDB) {
  const recap = recapVide()
  if (!oldDB) return recap

  if (isFirebaseConfigured) {
    const batch = writeBatch(db)
    Object.entries(oldDB.inventaires || {}).forEach(([date, inv]) => {
      batch.set(doc(db, 'agro_inventaires', date), { date, ...inv, migratedAt: serverTimestamp() })
      recap.inventaires++
    })
    ;(oldDB.factures || []).forEach((f) => { batch.set(doc(collection(db, 'agro_factures')), { ...f, migratedAt: serverTimestamp() }); recap.factures++ })
    ;(oldDB.demandes || []).forEach((d) => { batch.set(doc(collection(db, 'agro_demandes')), { ...d, migratedAt: serverTimestamp() }); recap.demandes++ })
    ;(oldDB.sanitaire || []).forEach((s) => { batch.set(doc(collection(db, 'agro_sante')), { ...s, migratedAt: serverTimestamp() }); recap.sante++ })
    await batch.commit()
  } else {
    // Mode démo : écriture séquentielle dans les collections locales
    for (const [date, inv] of Object.entries(oldDB.inventaires || {})) {
      await setItem('agro_inventaires', date, { date, ...inv }); recap.inventaires++
    }
    for (const f of oldDB.factures || []) { await addItem('agro_factures', f); recap.factures++ }
    for (const d of oldDB.demandes || []) { await addItem('agro_demandes', d); recap.demandes++ }
    for (const s of oldDB.sanitaire || []) { await addItem('agro_sante', s); recap.sante++ }
  }

  localStorage.setItem(FLAG_KEY, new Date().toISOString())
  return recap
}

// Migration depuis le localStorage de l'ancienne app (même origine).
export async function migrerDonnees() {
  const raw = localStorage.getItem(OLD_KEY)
  if (!raw) return recapVide()
  return migrerDepuisDB(JSON.parse(raw))
}

// Migration depuis l'ancienne Firebase Realtime Database.
export async function migrerDepuisFirebase() {
  const oldDB = await fetchAncienneDB()
  return migrerDepuisDB(oldDB)
}

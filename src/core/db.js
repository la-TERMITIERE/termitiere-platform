// Aiguillage de la couche de données (backend interchangeable, même API publique).
//
//   - PRODUCTION (défaut)                    → Firebase Realtime Database (db.firebase.js)
//   - Cible auto-hébergée (VITE_USE_SUPABASE=true) → PostgreSQL / Supabase (db.supabase.js)
//
// Aucun autre fichier de l'app n'a besoin de savoir quel backend est utilisé. Les
// garde-fous (sanitize, rateLimit) sont appliqués dans chaque implémentation.
import * as firebaseImpl from './db.firebase'
import * as supabaseImpl from './db.supabase'
import { isReadOnlyRole } from './roles'

const useSupabase = import.meta.env.VITE_USE_SUPABASE === 'true'
const impl = useSupabase ? supabaseImpl : firebaseImpl

if (useSupabase) console.info('[db] Backend de données : PostgreSQL / Supabase (auto-hébergé)')

// ── VERROU CENTRAL « LECTURE SEULE » (audit sécurité 2026-08-04) ──────────────
// Les rôles `superviseur` et `partenaire` (ce dernier étant un intervenant EXTERNE
// à l'entreprise) sont censés ne rien pouvoir modifier. Ce contrôle n'était en
// réalité posé que dans une partie des écrans : plusieurs pages sensibles
// (facturation et demandes Maxi-Agro, paiements Garderie…) laissaient donc un
// partenaire externe créer, modifier ou supprimer des données.
//
// Plutôt que de compléter une quarantaine de `if` d'affichage — et d'en oublier au
// prochain écran ajouté — le refus est appliqué ICI, sur le passage obligé de
// TOUTE écriture. Un écran qui oublierait sa garde d'affichage échoue désormais
// proprement au lieu d'écrire.
//
// À ne pas confondre avec une sécurité serveur : un utilisateur déterminé peut
// toujours écrire directement dans la base tant que les règles n'imposent pas les
// rôles (cf. docs/URGENCE-SECURITE.md). C'est une défense en profondeur, qui
// couvre l'usage normal de l'application.
//
// Import paresseux du store d'authentification : `auth.js` importe lui-même `db`,
// une importation statique créerait un cycle.
let _lireRole = () => null
export function _brancherRoleCourant(fn) { _lireRole = fn }

const ECRITURES = ['addItem', 'setItem', 'updateItem', 'removeItem', 'claimOnce']

function protegerEcriture(nom, fn) {
  return (...args) => {
    const role = _lireRole()
    if (role && isReadOnlyRole(role)) {
      const err = new Error('Votre profil est en lecture seule : aucune modification n\'est autorisée.')
      err.code = 'LECTURE_SEULE'
      console.warn(`[db] écriture refusée (rôle ${role} en lecture seule) : ${nom}`, args[0])
      return Promise.reject(err)
    }
    return fn(...args)
  }
}

export const subscribeCollection = impl.subscribeCollection
export const getAll = impl.getAll
export const getOne = impl.getOne
export const ts = impl.ts

export const addItem = protegerEcriture('addItem', impl.addItem)
export const setItem = protegerEcriture('setItem', impl.setItem)
export const updateItem = protegerEcriture('updateItem', impl.updateItem)
export const removeItem = protegerEcriture('removeItem', impl.removeItem)
export const claimOnce = protegerEcriture('claimOnce', impl.claimOnce)

// Garde-fou de développement : si une nouvelle fonction d'écriture est ajoutée à
// l'implémentation sans être protégée ici, on le signale au lieu de le découvrir
// lors d'un audit.
if (import.meta.env.DEV) {
  ECRITURES.forEach((n) => {
    if (typeof impl[n] !== 'function') console.warn(`[db] fonction d'écriture attendue absente : ${n}`)
  })
}

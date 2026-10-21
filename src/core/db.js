// Aiguillage de la couche de données (backend interchangeable, même API publique).
//
//   - PRODUCTION (défaut)                    → Firebase Realtime Database (db.firebase.js)
//   - Cible auto-hébergée (VITE_USE_SUPABASE=true) → PostgreSQL / Supabase (db.supabase.js)
//
// Aucun autre fichier de l'app n'a besoin de savoir quel backend est utilisé. Les
// garde-fous (sanitize, rateLimit) sont appliqués dans chaque implémentation.
import * as firebaseImpl from './db.firebase'
import * as supabaseImpl from './db.supabase'
import { isReadOnlyRole, peutEcrireGym, moduleDeCollection, moduleEnLecture } from './roles'
import { demanderMotif, SuppressionAnnulee } from './motifSuppression'

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
let _lireDroits = () => null
export function _brancherDroitsCourants(fn) { _lireDroits = fn }

const ECRITURES = ['addItem', 'setItem', 'updateItem', 'removeItem', 'claimOnce', 'updateAtomic']

function protegerEcriture(nom, fn) {
  return (...args) => {
    const role = _lireRole()
    if (role && isReadOnlyRole(role)) {
      const err = new Error('Votre profil est en lecture seule : aucune modification n\'est autorisée.')
      err.code = 'LECTURE_SEULE'
      console.warn(`[db] écriture refusée (rôle ${role} en lecture seule) : ${nom}`, args[0])
      return Promise.reject(err)
    }
    // MAXI-GYM : seuls les agents, Info et l'Assistant PAU écrivent dans les collections `gym_*` (cf. peutEcrireGym).
    // Les mouvements bancaires (`gym_banque`) relèvent de la Comptabilité et de ses propres profils : ils ne sont pas visés.
    const collection = String(args[0] || '')
    if (role && collection.startsWith('gym_') && !collection.endsWith('_banque') && !peutEcrireGym(role)) {
      const err = new Error('MAXI-GYM : seuls les agents, Info et Assistant PAU peuvent modifier ces données, votre profil est en lecture seule.')
      err.code = 'LECTURE_SEULE'
      console.warn(`[db] écriture refusée (rôle ${role}, MAXI-GYM réservé aux agents, à Info et à Assistant PAU) : ${nom}`, args[0])
      return Promise.reject(err)
    }
    // Droit « lecture seule » accordé à ce compte sur un module précis (Utilisateurs, détail d'accès).
    const moduleCible = moduleDeCollection(collection)
    if (role && moduleCible && moduleEnLecture(_lireDroits(), moduleCible)) {
      const err = new Error('Votre accès à ce module est en lecture seule : aucune modification n’est autorisée.')
      err.code = 'LECTURE_SEULE'
      console.warn(`[db] écriture refusée (module ${moduleCible} en lecture seule pour ce compte) : ${nom}`, args[0])
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
// ── MOTIF OBLIGATOIRE DE SUPPRESSION ─────────────────────────────────────────
// Toute suppression passe ici : une fenêtre demande le motif (impossible de supprimer sans),
// puis le motif est tracé dans le Journal (« SUPPRESSION »). Exceptions : données purement
// techniques (abonnements push, secrets d'utilisateurs, notifications, corbeille) et les
// suppressions automatiques ou de masse qui passent `{ sansMotif: true }` (purges, remise à zéro).
// `{ motif }` : motif déjà recueilli par l'appelant (aucune question posée).
const COLLECTIONS_TECHNIQUES = new Set(['push_subs', 'users_secret', 'notifications', 'depense_depenses_supprimees'])
const supprimerSansMotif = protegerEcriture('removeItem', impl.removeItem)
const libelleDe = (rec, id) => {
  if (!rec) return id
  if (rec.num && rec.clientNom) return `${rec.num} : ${rec.clientNom}`
  return rec.num || rec.nom || rec.libelle || rec.titre || rec.intitule || rec.designation || rec.clientNom || id
}

export async function removeItem(collection, id, options = {}) {
  const role = _lireRole()
  // Profil ou module en lecture seule : on laisse le garde central refuser tout de suite, sans demander de motif pour rien.
  const moduleCible = moduleDeCollection(collection)
  const refuse = role && ((isReadOnlyRole(role)) || (moduleCible && moduleEnLecture(_lireDroits(), moduleCible)) || (String(collection).startsWith('gym_') && !String(collection).endsWith('_banque') && !peutEcrireGym(role)))
  if (options.sansMotif || COLLECTIONS_TECHNIQUES.has(collection) || refuse) {
    return supprimerSansMotif(collection, id)
  }
  // Règle générale : un agent ne supprime JAMAIS (aucun bouton ne lui est montré ; ce refus couvre
  // les écrans qui l'auraient oublié). Les données techniques ci-dessus restent permises.
  if (role === 'agent') {
    const err = new Error(`Les agents ne peuvent pas supprimer : demandez à l'administration.`)
    err.code = 'SUPPRESSION_INTERDITE'
    throw err
  }
  let libelle = id
  try { libelle = libelleDe(await impl.getOne(collection, id), id) } catch { /* sans libellé */ }
  const motif = options.motif || (await demanderMotif({ collection, id, libelle }))
  if (!motif) throw new SuppressionAnnulee()
  const resultat = await supprimerSansMotif(collection, id)
  import('./audit')
    .then(({ audit }) => audit(String(collection).split('_')[0], 'SUPPRESSION', `${libelle} (${collection}) : motif : ${motif}`, { collection, id, libelle, motif }))
    .catch(() => {})
  return resultat
}
export const claimOnce = protegerEcriture('claimOnce', impl.claimOnce)
export const updateAtomic = protegerEcriture('updateAtomic', impl.updateAtomic)

// Garde-fou de développement : si une nouvelle fonction d'écriture est ajoutée à
// l'implémentation sans être protégée ici, on le signale au lieu de le découvrir
// lors d'un audit.
if (import.meta.env.DEV) {
  ECRITURES.forEach((n) => {
    if (typeof impl[n] !== 'function') console.warn(`[db] fonction d'écriture attendue absente : ${n}`)
  })
}

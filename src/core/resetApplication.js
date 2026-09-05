// Réinitialisation complète de l'application — supprime TOUTES les données
// métier de TOUS les modules (fonction technique sensible, réservée au
// super-administrateur, cf. Paramètres → Zone de danger).
//
// Liste ⚠️ MAINTENUE À LA MAIN : dérivée par recherche exhaustive de tous les
// appels getAll/addItem/setItem/... dans src/ (voir historique de ce fichier).
// Si un module ajoute une nouvelle collection, il faut l'ajouter ici, sinon
// elle survivrait à une réinitialisation.
import { getAll, removeItem } from './db'

export const COLLECTIONS_A_REINITIALISER = [
  // ── Cœur de la plateforme ──────────────────────────────────────────────
  'users', 'users_secret', 'notifications', 'notif_prefs', 'push_subs',
  'audit_global', 'sector_besoins', 'vues_volets',
  // ── E-DÉPENSES ──────────────────────────────────────────────────────────
  'depense_depenses', 'depense_budgets', 'depense_banque', 'depense_params',
  'depense_revenus_manuels', 'depense_pau_remboursements',
  'depense_alertes_dashboard_fermees', 'depense_purge_log',
  // ── MAXI AGRO ───────────────────────────────────────────────────────────
  'agro_demandes', 'agro_factures', 'agro_inventaires', 'agro_sante', 'agro_vaccins', 'agro_banque',
  // ── MAXI LOGISTIQUE ─────────────────────────────────────────────────────
  'logistique_clients', 'logistique_demandes', 'logistique_factures',
  'logistique_fournisseurs', 'logistique_inventaires', 'logistique_prestations',
  'logistique_retours', 'logistique_banque',
  // ── E-BRIQUETERIE (code module : evenementiel) ─────────────────────────
  'evenementiel_clients', 'evenementiel_demandes', 'evenementiel_factures',
  'evenementiel_inventaires', 'evenementiel_materiels', 'evenementiel_productions',
  'evenementiel_transferts', 'evenementiel_transports', 'evenementiel_ventes',
  // ── E-GARDERIE ──────────────────────────────────────────────────────────
  'garderie_enfants', 'garderie_incidents', 'garderie_journaliers', 'garderie_menus',
  'garderie_nutrition', 'garderie_paiements', 'garderie_personnel', 'garderie_presences',
  'garderie_repas', 'garderie_soins', 'garderie_taches', 'garderie_vaccinations', 'garderie_banque',
  // ── E-FONCIER ───────────────────────────────────────────────────────────
  'foncier_dossiers', 'foncier_pieces',
  // ── E-G.PRO ─────────────────────────────────────────────────────────────
  'projets', 'projet_besoins', 'projet_commentaires', 'projet_depenses',
  'projet_depenses_notes', 'projet_magasins', 'projet_materiels', 'projet_params',
  'projet_prestataires_masques', 'projet_propositions', 'projet_taches',
  'projet_versements_client', 'projet_alertes_dashboard_fermees',
  'projet_alertes_notif', 'projet_purge_log',
  // ── MAXI-GYM ────────────────────────────────────────────────────────────
  'gym_abonnements', 'gym_clients', 'gym_coachs', 'gym_factures', 'gym_forfaits', 'gym_params',
  'gym_pointages_coach', 'gym_presences', 'gym_seances', 'gym_banque',
  // ── Ressources humaines ─────────────────────────────────────────────────
  'rh_employes', 'rh_presences',
  // ── E-VOYAGE ────────────────────────────────────────────────────────────
  'voyage_articles', 'voyage_depenses', 'voyage_voyages'
]

// Collections d'identité : on y préserve UNIQUEMENT le compte de la personne
// qui déclenche la réinitialisation (pour ne pas se retrouver déconnecté et
// sans aucun moyen de se reconnecter à une application désormais vide).
const COLLECTIONS_IDENTITE = new Set(['users', 'users_secret'])

/**
 * Supprime toutes les données de toutes les collections listées ci-dessus,
 * à l'exception du compte `keepUserId` dans `users` / `users_secret`.
 *
 * @param {object} opts
 * @param {string} opts.keepUserId - uid/login du compte à préserver.
 * @param {(info: {collection: string, index: number, total: number, removed: number}) => void} [opts.onProgress]
 * @returns {Promise<{collection: string, removed: number}[]>}
 */
export async function reinitialiserApplication({ keepUserId, onProgress }) {
  if (!keepUserId) throw new Error('keepUserId requis — impossible de réinitialiser sans savoir quel compte préserver.')
  const total = COLLECTIONS_A_REINITIALISER.length
  const resultats = []

  for (let index = 0; index < total; index++) {
    const collection = COLLECTIONS_A_REINITIALISER[index]
    let removed = 0
    try {
      const lignes = await getAll(collection)
      const aSupprimer = COLLECTIONS_IDENTITE.has(collection)
        ? lignes.filter((l) => l.id !== keepUserId)
        : lignes
      for (const ligne of aSupprimer) {
        await removeItem(collection, ligne.id)
        removed++
      }
    } catch (e) {
      console.error(`[resetApplication] échec sur la collection "${collection}" :`, e)
    }
    resultats.push({ collection, removed })
    onProgress?.({ collection, index: index + 1, total, removed })
  }
  return resultats
}

// Workflow d'autorisation à DEUX niveaux, commun à tous les modules
// (Maxi Agro, Logistique, Briqueterie).
//
//   en_attente → (approbateur)  approuve_n1 → (certificateur) certifie
//                                    ↘ refuse ↙
//
// L'effet métier (décompte de stock, vente autorisée…) ne s'applique qu'à la
// CERTIFICATION (statut `certifie`). Un certificateur peut approuver et certifier
// en une seule action depuis `en_attente`.

export const STATUTS_DEMANDE = {
  en_attente:  { label: '⏳ En attente', short: 'En attente', tone: 'warning' },
  approuve_n1: { label: '🟡 Approuvé — à certifier', short: 'À certifier', tone: 'info' },
  certifie:    { label: '✅ Certifié', short: 'Certifié', tone: 'success' },
  refuse:      { label: '❌ Refusé', short: 'Refusé', tone: 'danger' }
}

// Normalise un statut hérité vers le nouveau modèle (compatibilité ascendante) :
//  - `approuve` / `autorisee` (ancien « approuvé » ou « 3/3 ») → `certifie`
//  - `partiel` (ancien « 1 ou 2 autorités sur 3 ») → `approuve_n1`
export function normaliserStatut(s) {
  if (s === 'approuve' || s === 'autorisee') return 'certifie'
  if (s === 'partiel') return 'approuve_n1'
  return s || 'en_attente'
}

export const estCertifie = (s) => normaliserStatut(s) === 'certifie'
export const estFinal = (s) => ['certifie', 'refuse'].includes(normaliserStatut(s))

// Suppression d'une demande : tant qu'elle n'est PAS certifiée, son auteur (ou un
// approbateur) peut la retirer — le brouillon lié redevient alors modifiable.
// Une fois CERTIFIÉE, la suppression est fermée : le stock est sorti et la
// facture compte dans le chiffre d'affaires. Seule une demande de correctif
// permet alors de la reprendre (cf. shared/demandes/correctif).
export function peutSupprimerDemande(statut, { isAuteur = false, canManage = false } = {}) {
  if (estCertifie(statut)) return false
  return isAuteur || canManage
}

// Statuts « à traiter » — pour les badges de menu et les compteurs.
export const STATUTS_ACTIFS = ['en_attente', 'approuve_n1', 'partiel']
export const estActif = (s) => STATUTS_ACTIFS.includes(s)

// Actions disponibles pour l'utilisateur courant selon le statut et ses droits.
// `canManage` = approbateur (1er niveau) · `canCertify` = certificateur (2e niveau).
export function actionsDemande(statut, { canManage = false, canCertify = false } = {}) {
  const s = normaliserStatut(statut)
  const actions = []
  if (s === 'en_attente') {
    if (canCertify) {
      actions.push({ id: 'certifier', label: 'Approuver & certifier', tone: 'success', statut: 'certifie' })
    } else if (canManage) {
      actions.push({ id: 'approuver', label: 'Approuver (1er niveau)', tone: 'success', statut: 'approuve_n1' })
    }
    if (canManage || canCertify) {
      actions.push({ id: 'refuser', label: 'Refuser', tone: 'danger', statut: 'refuse' })
    }
  } else if (s === 'approuve_n1') {
    if (canCertify) {
      actions.push({ id: 'certifier', label: 'Certifier', tone: 'success', statut: 'certifie' })
      actions.push({ id: 'refuser', label: 'Refuser', tone: 'danger', statut: 'refuse' })
    }
  }
  return actions
}

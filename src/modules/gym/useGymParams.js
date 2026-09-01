// Réglages MAXI-GYM configurables depuis le volet Paramètres (tarifs, durées,
// validité) — un document Firebase PAR SALLE (`gym_params/lome`, `gym_params/kara`,
// décision explicite du 01/09/2026 : Kara a ses propres tarifs, distincts de Lomé),
// avec repli sur les valeurs par défaut de data.js tant que rien n'a encore été
// enregistré pour cette salle.
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import {
  TARIFS_SEANCE_DEFAUT, TARIFS_ABONNEMENT_DEFAUT,
  TARIFS_SEANCE_DEFAUT_KARA, TARIFS_ABONNEMENT_DEFAUT_KARA,
  DUREE_CLASSIQUE_MIN_JOURS_DEFAUT, VALIDITE_SEANCE_HEURES_DEFAUT
} from './data'

// Ancien document unique, d'avant le passage aux réglages par salle — Lomé (seule
// salle existante à l'époque) y retombe tant qu'elle n'a pas son propre document
// `gym_params/lome`, pour ne perdre aucun réglage déjà en place.
const LEGACY_DOC_ID = 'config'

export function useGymParams(site = 'lome') {
  const { data: docs } = useCollection('gym_params')
  const docSite = docs.find((d) => d.id === site)
  const docLegacy = site === 'lome' ? docs.find((d) => d.id === LEGACY_DOC_ID) : null
  const doc = docSite || docLegacy || {}
  const defautsSeance     = site === 'kara' ? TARIFS_SEANCE_DEFAUT_KARA     : TARIFS_SEANCE_DEFAUT
  const defautsAbonnement = site === 'kara' ? TARIFS_ABONNEMENT_DEFAUT_KARA : TARIFS_ABONNEMENT_DEFAUT
  return {
    tarifSeanceSimple:     doc.tarifSeanceSimple     ?? defautsSeance.simple,
    tarifSeanceVip:        doc.tarifSeanceVip        ?? defautsSeance.vip,
    tarifAbonnementSimple: doc.tarifAbonnementSimple ?? defautsAbonnement.simple,
    tarifAbonnementVip:    doc.tarifAbonnementVip    ?? defautsAbonnement.vip,
    // Palier Classique à prix FIXE : `null`/absent = comportement historique (prix ET
    // durée libres à la saisie, cf. dateFinAbonnement). Un nombre = prix fixe, durée
    // fixe 1 mois comme Simple/VIP — c'est le cas par défaut à Kara.
    tarifAbonnementClassique: doc.tarifAbonnementClassique ?? defautsAbonnement.classique ?? null,
    dureeClassiqueMinJours: doc.dureeClassiqueMinJours ?? DUREE_CLASSIQUE_MIN_JOURS_DEFAUT,
    validiteSeanceHeures:   doc.validiteSeanceHeures   ?? VALIDITE_SEANCE_HEURES_DEFAUT
  }
}

export async function saveGymParams(params, user, site = 'lome') {
  await setItem('gym_params', site, { id: site, ...params, updatedAt: Date.now(), modifieParUid: user?.uid || null })
  await audit('gym', 'PARAMS_MODIFIE', `Réglages MAXI-GYM ${site === 'kara' ? 'Kara' : 'Lomé'} mis à jour`)
}

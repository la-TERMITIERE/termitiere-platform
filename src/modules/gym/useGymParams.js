// Réglages MAXI-GYM configurables depuis le volet Paramètres (tarifs, durées,
// validité) — un seul document Firebase (`gym_params/config`), avec repli sur les
// valeurs par défaut de data.js tant que rien n'a encore été enregistré.
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import {
  TARIFS_SEANCE_DEFAUT, TARIFS_ABONNEMENT_DEFAUT,
  DUREE_CLASSIQUE_MIN_JOURS_DEFAUT, VALIDITE_SEANCE_HEURES_DEFAUT
} from './data'

const DOC_ID = 'config'

export function useGymParams() {
  const { data: docs } = useCollection('gym_params')
  const doc = docs.find((d) => d.id === DOC_ID) || {}
  return {
    tarifSeanceSimple:     doc.tarifSeanceSimple     ?? TARIFS_SEANCE_DEFAUT.simple,
    tarifSeanceVip:        doc.tarifSeanceVip        ?? TARIFS_SEANCE_DEFAUT.vip,
    tarifAbonnementSimple: doc.tarifAbonnementSimple ?? TARIFS_ABONNEMENT_DEFAUT.simple,
    tarifAbonnementVip:    doc.tarifAbonnementVip    ?? TARIFS_ABONNEMENT_DEFAUT.vip,
    dureeClassiqueMinJours: doc.dureeClassiqueMinJours ?? DUREE_CLASSIQUE_MIN_JOURS_DEFAUT,
    validiteSeanceHeures:   doc.validiteSeanceHeures   ?? VALIDITE_SEANCE_HEURES_DEFAUT
  }
}

export async function saveGymParams(params, user) {
  await setItem('gym_params', DOC_ID, { id: DOC_ID, ...params, updatedAt: Date.now(), modifieParUid: user?.uid || null })
  await audit('gym', 'PARAMS_MODIFIE', 'Réglages MAXI-GYM mis à jour')
}

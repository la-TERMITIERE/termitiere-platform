// Types de congé et droits (jours par an et par employé) : réglés dans RH, Paramètres, Congés (document « conges » de rh_config).
// Les types d'origine (TYPES_CONGE) servent de base ; l'administration peut changer leur nom, leur nombre de jours, leur couleur,
// les désactiver, et en ajouter d'autres. Sans réglage, les valeurs par défaut du module s'appliquent.
import { useMemo } from 'react'
import { useCollection } from '../../hooks/useFirestore'
import { COL, DROIT_CONGE_ANNUEL, TYPES_CONGE } from './store/rhStore'

// Couleurs proposées pour un type (tons du composant Badge).
export const TONS_CONGE = [
  ['info', 'Bleu clair'], ['primary', 'Bleu'], ['success', 'Vert'], ['warning', 'Orange'],
  ['danger', 'Rouge'], ['purple', 'Violet'], ['neutral', 'Gris']
]

// Fusionne les types d'origine et les réglages enregistrés : { id: { label, droit, tone, actif, perso } }.
// `droit` = jours par an et par employé (0 = sans limite, ex. congé sans solde). Le type « annuel » reprend l'ancien réglage « droitAnnuel ».
export function fusionnerTypesConge(config) {
  const sauves = config?.types && typeof config.types === 'object' ? config.types : {}
  const out = {}
  Object.entries(TYPES_CONGE).forEach(([id, base]) => {
    const s = sauves[id] || {}
    const droitHerite = id === 'annuel' && Number(config?.droitAnnuel) > 0 ? Number(config.droitAnnuel) : base.droit
    const droit = s.droit !== undefined && s.droit !== null && s.droit !== '' ? Number(s.droit) : droitHerite
    out[id] = {
      label: s.label || base.label,
      droit: Number.isFinite(droit) && droit >= 0 ? droit : base.droit,
      tone: s.tone || base.tone,
      actif: id === 'annuel' ? true : s.actif !== false, // le congé annuel ne se désactive pas : les soldes en dépendent
      perso: false
    }
  })
  Object.entries(sauves).forEach(([id, s]) => {
    if (TYPES_CONGE[id] || !s || !String(s.label || '').trim()) return
    const droit = Number(s.droit)
    out[id] = { label: String(s.label).trim(), droit: Number.isFinite(droit) && droit >= 0 ? droit : 0, tone: s.tone || 'neutral', actif: s.actif !== false, perso: true }
  })
  return out
}

// Tous les types (actifs ou non, pour afficher d'anciennes demandes).
export function useTypesConge() {
  const { data } = useCollection(COL.config)
  const cfg = data.find((c) => c.id === 'conges')
  return useMemo(() => fusionnerTypesConge(cfg), [cfg])
}

// Droit annuel (type « congé annuel payé »).
export function useDroitAnnuel() {
  const types = useTypesConge()
  const n = Number(types.annuel?.droit)
  return Number.isFinite(n) && n > 0 ? n : DROIT_CONGE_ANNUEL
}

// Libellé d'un type, même s'il a été désactivé ou supprimé depuis.
export const libelleConge = (types, id) => types?.[id]?.label || TYPES_CONGE[id]?.label || id || '—'

// Type « Autre » : le libellé saisi à la main pour cette demande (sans droit annuel associé).
export const TYPE_AUTRE = 'autre'
// Libellé d'une demande de congé : le type précisé pour « Autre », sinon le libellé du type réglé dans les Paramètres.
export const libelleDemandeConge = (types, c) => (c?.type === TYPE_AUTRE ? (String(c.typeAutre || '').trim() || 'Autre') : libelleConge(types, c?.type))

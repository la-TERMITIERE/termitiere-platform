// Droit annuel de congé (jours par an et par employé) : réglé dans RH, Paramètres, Congés (document « conges » de rh_config).
// Sans réglage, la valeur par défaut du module (25 jours) s'applique.
import { useCollection } from '../../hooks/useFirestore'
import { COL, DROIT_CONGE_ANNUEL } from './store/rhStore'

export function useDroitAnnuel() {
  const { data } = useCollection(COL.config)
  const n = Number(data.find((c) => c.id === 'conges')?.droitAnnuel)
  return Number.isFinite(n) && n > 0 ? n : DROIT_CONGE_ANNUEL
}

// Compte bancaire — E-GARDERIE. Réservé à PAU/Assistant PAU/GE/Info (cf. BANQUE_ROLES).
import CompteBancaire from '../../shared/banque/CompteBancaire'
import { COULEUR_MODULE } from '../../utils/color'

export default function Banque() {
  return (
    <CompteBancaire moduleId="garderie" color={COULEUR_MODULE.garderie}
      titre="Compte bancaire — E-GARDERIE" secteurLabel="E-GARDERIE" />
  )
}

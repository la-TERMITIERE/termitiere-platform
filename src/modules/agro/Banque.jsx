// Compte bancaire — MAXI-AGRO. Réservé à PAU/Assistant PAU/GE/Info (cf. BANQUE_ROLES).
import CompteBancaire from '../../shared/banque/CompteBancaire'
import { COULEUR_MODULE } from '../../utils/color'

export default function Banque() {
  return (
    <CompteBancaire moduleId="agro" color={COULEUR_MODULE.agro}
      titre="Compte bancaire — MAXI-AGRO" secteurLabel="MAXI-AGRO" />
  )
}

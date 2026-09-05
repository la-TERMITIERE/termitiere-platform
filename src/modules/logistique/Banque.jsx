// Compte bancaire — MAXI LOGISTIQUE. Compte UNIQUE du secteur (hors contexte d'un
// site Lomé/Kara) — réservé à PAU/Assistant PAU/GE/Info (cf. BANQUE_ROLES).
import CompteBancaire from '../../shared/banque/CompteBancaire'
import { COULEUR_MODULE } from '../../utils/color'

export default function Banque() {
  return (
    <CompteBancaire moduleId="logistique" color={COULEUR_MODULE.logistique}
      titre="Compte bancaire — MAXI LOGISTIQUE" secteurLabel="MAXI LOGISTIQUE" />
  )
}

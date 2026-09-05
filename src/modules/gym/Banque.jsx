// Compte bancaire — MAXI-GYM. Compte UNIQUE du secteur (hors contexte d'une salle
// Lomé/Kara) — réservé à PAU/Assistant PAU/GE/Info (cf. BANQUE_ROLES).
import CompteBancaire from '../../shared/banque/CompteBancaire'
import { COULEUR_MODULE } from '../../utils/color'

export default function Banque() {
  return (
    <CompteBancaire moduleId="gym" color={COULEUR_MODULE.gym}
      titre="Compte bancaire — MAXI-GYM" secteurLabel="MAXI-GYM" />
  )
}

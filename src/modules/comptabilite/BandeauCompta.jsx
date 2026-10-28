// Bandeau de tête des volets de la COMPTABILITÉ : le bandeau commun (shared/ui/BandeauVolet) en orange.
import BandeauVolet from '../../shared/ui/BandeauVolet'
import { COULEUR_MODULE } from '../../utils/color'

export { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from '../../shared/ui/BandeauVolet'

export default function BandeauCompta(props) {
  const { couleur, ...reste } = props
  return <BandeauVolet {...reste} couleur={couleur || COULEUR_MODULE.comptabilite || '#ea580c'} />
}

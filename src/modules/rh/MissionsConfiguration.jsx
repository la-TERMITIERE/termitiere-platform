// RH — Configuration des missions (Missions & Frais). Barèmes d'indemnités/plafonds.
import { Settings } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import CrudList from './CrudList'

export default function MissionsConfiguration() {
  return (
    <CrudList collection="rh_bareme_missions" icon={Settings} sousModule="Missions & Frais"
      titre="Configuration des missions" sousTitre="Barème d'indemnités journalières et plafonds de remboursement." boutonLabel="Nouveau barème"
      emptyText="Aucun barème défini."
      vide={() => ({ typeFrais: '', indemniteJour: 0, plafond: 0 })}
      colonnes={[
        { key: 'typeFrais', label: 'Type de frais', strong: true },
        { key: 'indemniteJour', label: 'Indemnité / jour', align: 'right', render: (r) => r.indemniteJour ? formatMoney(r.indemniteJour) : '—' },
        { key: 'plafond', label: 'Plafond', align: 'right', render: (r) => r.plafond ? formatMoney(r.plafond) : '—' }
      ]}
      champs={[
        { key: 'typeFrais', label: 'Type de frais (ex. Hébergement, Transport)', required: true },
        { key: 'indemniteJour', label: 'Indemnité journalière (XOF)', type: 'number' },
        { key: 'plafond', label: 'Plafond de remboursement (XOF)', type: 'number' }
      ]} />
  )
}

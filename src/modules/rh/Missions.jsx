// RH — Missions & frais (Missions & Frais).
import { Plane } from 'lucide-react'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import CrudList from './CrudList'
import { STATUTS_MISSION, COL } from './store/rhStore'

export default function Missions() {
  return (
    <CrudList collection={COL.missions} icon={Plane} sousModule="Missions & Frais"
      titre="Missions & frais" sousTitre="Ordres de mission et notes de frais." boutonLabel="Nouvel ordre de mission"
      emptyText="Aucune mission enregistrée."
      vide={() => ({ employeId: '', objet: '', destination: '', dateDebut: '', dateFin: '', montantFrais: 0, statut: 'demandee' })}
      colonnes={[
        { key: 'employeNom', label: 'Employé', strong: true },
        { key: 'objet', label: 'Objet' },
        { key: 'destination', label: 'Destination' },
        { key: 'dateDebut', label: 'Période', render: (r) => r.dateDebut ? `${formatDateShort(r.dateDebut)}${r.dateFin ? ' → ' + formatDateShort(r.dateFin) : ''}` : '—' },
        { key: 'montantFrais', label: 'Frais', align: 'right', render: (r) => r.montantFrais ? formatMoney(r.montantFrais) : '—' },
        { key: 'statut', label: 'Statut', badge: (v) => STATUTS_MISSION[v] }
      ]}
      champs={[
        { key: 'employeId', label: 'Employé', type: 'employe', required: true },
        { key: 'objet', label: 'Objet de la mission', required: true },
        { key: 'destination', label: 'Destination' },
        { key: 'dateDebut', label: 'Du', type: 'date' },
        { key: 'dateFin', label: 'Au', type: 'date' },
        { key: 'montantFrais', label: 'Montant des frais (XOF)', type: 'number' },
        { key: 'statut', label: 'Statut', type: 'select', options: Object.entries(STATUTS_MISSION).map(([value, o]) => ({ value, label: o.label })) }
      ]} />
  )
}

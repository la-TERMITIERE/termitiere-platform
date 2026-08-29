// RH — Diplômes & badges (Collaborateurs & Contrats).
import { Tag } from 'lucide-react'
import { formatDateShort } from '../../utils/formatters'
import CrudList from './CrudList'
import { COL } from './store/rhStore'

const TYPES = [{ value: 'diplome', label: 'Diplôme' }, { value: 'certification', label: 'Certification' }, { value: 'badge', label: 'Badge de compétence' }, { value: 'habilitation', label: 'Habilitation' }]

export default function TitresBadges() {
  return (
    <CrudList collection={COL.documents} icon={Tag} sousModule="Collaborateurs & Contrats"
      titre="Diplômes & badges" sousTitre="Diplômes, certifications et badges de compétence des collaborateurs." boutonLabel="Ajouter un titre"
      emptyText="Aucun diplôme ou badge enregistré."
      vide={() => ({ employeId: '', intitule: '', type: 'diplome', organisme: '', dateObtention: '' })}
      colonnes={[
        { key: 'employeNom', label: 'Employé', strong: true },
        { key: 'intitule', label: 'Intitulé' },
        { key: 'type', label: 'Type', render: (r) => TYPES.find((t) => t.value === r.type)?.label || r.type },
        { key: 'organisme', label: 'Organisme' },
        { key: 'dateObtention', label: 'Obtenu le', render: (r) => r.dateObtention ? formatDateShort(r.dateObtention) : '—' }
      ]}
      champs={[
        { key: 'employeId', label: 'Employé', type: 'employe', required: true },
        { key: 'intitule', label: 'Intitulé', required: true },
        { key: 'type', label: 'Type', type: 'select', options: TYPES },
        { key: 'organisme', label: 'Organisme délivrant' },
        { key: 'dateObtention', label: "Date d'obtention", type: 'date' }
      ]} />
  )
}

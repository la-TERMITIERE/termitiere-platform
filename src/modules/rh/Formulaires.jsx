// RH — Formulaires & candidature (Talent & Développement).
import { ClipboardList } from 'lucide-react'
import { formatDateShort } from '../../utils/formatters'
import CrudList from './CrudList'
import { ETAPES_PIPELINE, COL } from './store/rhStore'

const tone = (v) => ({ 'Recruté': 'success', 'Rejeté': 'danger', 'Entretien': 'warning', 'Offre': 'info' }[v] || 'neutral')

export default function Formulaires() {
  return (
    <CrudList collection={COL.candidatures} icon={ClipboardList} sousModule="Talent & Développement"
      titre="Formulaires & candidature" sousTitre="Candidatures reçues et suivi du pipeline de recrutement." boutonLabel="Nouvelle candidature"
      emptyText="Aucune candidature reçue."
      vide={() => ({ candidat: '', poste: '', contact: '', etape: 'Candidature', date: '' })}
      colonnes={[
        { key: 'candidat', label: 'Candidat', strong: true },
        { key: 'poste', label: 'Poste visé' },
        { key: 'contact', label: 'Contact' },
        { key: 'date', label: 'Reçue le', render: (r) => r.date ? formatDateShort(r.date) : '—' },
        { key: 'etape', label: 'Étape', badge: (v) => ({ tone: tone(v), label: v }) }
      ]}
      champs={[
        { key: 'candidat', label: 'Nom du candidat', required: true },
        { key: 'poste', label: 'Poste visé' },
        { key: 'contact', label: 'Téléphone / Email' },
        { key: 'date', label: 'Date de réception', type: 'date' },
        { key: 'etape', label: 'Étape du pipeline', type: 'select', options: ETAPES_PIPELINE }
      ]} />
  )
}

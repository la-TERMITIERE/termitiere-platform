// RH — Formations (Talent & Développement).
import { BookOpen } from 'lucide-react'
import { formatDateShort } from '../../utils/formatters'
import CrudList from './CrudList'
import { STATUTS_FORMATION, COL } from './store/rhStore'

export default function Formations() {
  return (
    <CrudList collection={COL.formations} icon={BookOpen} sousModule="Talent & Développement"
      titre="Formations" sousTitre="Plan de formation et suivi des sessions." boutonLabel="Nouvelle formation"
      emptyText="Aucune formation planifiée."
      vide={() => ({ titre: '', formateur: '', dateDebut: '', statut: 'planifiee', cout: 0, description: '' })}
      colonnes={[
        { key: 'titre', label: 'Formation', strong: true },
        { key: 'formateur', label: 'Formateur / Organisme' },
        { key: 'dateDebut', label: 'Date', render: (r) => r.dateDebut ? formatDateShort(r.dateDebut) : '—' },
        { key: 'statut', label: 'Statut', badge: (v) => STATUTS_FORMATION[v] },
        { key: 'cout', label: 'Coût (XOF)', align: 'right', render: (r) => (r.cout || 0).toLocaleString('fr-FR') }
      ]}
      champs={[
        { key: 'titre', label: 'Intitulé', required: true },
        { key: 'formateur', label: 'Formateur / Organisme' },
        { key: 'dateDebut', label: 'Date de début', type: 'date' },
        { key: 'statut', label: 'Statut', type: 'select', options: Object.entries(STATUTS_FORMATION).map(([value, o]) => ({ value, label: o.label })) },
        { key: 'cout', label: 'Coût (XOF)', type: 'number' },
        { key: 'description', label: 'Description / objectifs', type: 'textarea' }
      ]} />
  )
}

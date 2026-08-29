// RH — Évaluations (Talent & Développement).
import { Gauge } from 'lucide-react'
import CrudList from './CrudList'
import { COL } from './store/rhStore'

const NOTES = [
  { value: 'A', label: 'A — Excellent' }, { value: 'B', label: 'B — Bon' },
  { value: 'C', label: 'C — Satisfaisant' }, { value: 'D', label: 'D — À améliorer' }
]
const toneNote = (v) => ({ A: 'success', B: 'info', C: 'warning', D: 'danger' }[v] || 'neutral')

export default function Evaluations() {
  return (
    <CrudList collection={COL.evaluations} icon={Gauge} sousModule="Talent & Développement"
      titre="Évaluations" sousTitre="Campagnes d'évaluation et entretiens annuels." boutonLabel="Nouvelle évaluation"
      emptyText="Aucune évaluation enregistrée."
      vide={() => ({ employeId: '', periode: String(new Date().getFullYear()), note: 'B', objectifs: '', statut: 'planifiee' })}
      colonnes={[
        { key: 'employeNom', label: 'Employé', strong: true },
        { key: 'periode', label: 'Période' },
        { key: 'note', label: 'Note', badge: (v) => ({ tone: toneNote(v), label: v }) },
        { key: 'objectifs', label: 'Objectifs', render: (r) => r.objectifs ? (r.objectifs.length > 40 ? r.objectifs.slice(0, 40) + '…' : r.objectifs) : '—' }
      ]}
      champs={[
        { key: 'employeId', label: 'Employé', type: 'employe', required: true },
        { key: 'periode', label: 'Période (année/trimestre)' },
        { key: 'note', label: 'Appréciation globale', type: 'select', options: NOTES },
        { key: 'objectifs', label: 'Objectifs & commentaires', type: 'textarea' }
      ]} />
  )
}

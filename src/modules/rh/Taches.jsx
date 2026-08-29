// RH — Tâches d'équipe (Vie d'Équipe).
import { ListChecks } from 'lucide-react'
import { formatDateShort } from '../../utils/formatters'
import CrudList from './CrudList'
import { COL } from './store/rhStore'

const STATUTS = [{ value: 'a_faire', label: 'À faire' }, { value: 'en_cours', label: 'En cours' }, { value: 'termine', label: 'Terminé' }]
const tone = (v) => ({ a_faire: 'neutral', en_cours: 'warning', termine: 'success' }[v] || 'neutral')
const PRIO = [{ value: 'basse', label: 'Basse' }, { value: 'normale', label: 'Normale' }, { value: 'haute', label: 'Haute' }]

export default function Taches() {
  return (
    <CrudList collection={COL.taches} icon={ListChecks} sousModule="Vie d'Équipe"
      titre="Tâches d'équipe" sousTitre="Suivi des tâches et petits projets d'équipe." boutonLabel="Nouvelle tâche"
      emptyText="Aucune tâche."
      vide={() => ({ titre: '', assigneId: '', echeance: '', priorite: 'normale', statut: 'a_faire' })}
      colonnes={[
        { key: 'titre', label: 'Tâche', strong: true },
        { key: 'assigneNom', label: 'Assignée à', render: (r, ctx) => r.assigneNom || ctx.employes.find((e) => e.id === r.assigneId)?.nom || '—' },
        { key: 'echeance', label: 'Échéance', render: (r) => r.echeance ? formatDateShort(r.echeance) : '—' },
        { key: 'priorite', label: 'Priorité' },
        { key: 'statut', label: 'Statut', badge: (v) => ({ tone: tone(v), label: STATUTS.find((s) => s.value === v)?.label || v }) }
      ]}
      champs={[
        { key: 'titre', label: 'Intitulé', required: true },
        { key: 'assigneId', label: 'Assignée à', type: 'employe' },
        { key: 'echeance', label: 'Échéance', type: 'date' },
        { key: 'priorite', label: 'Priorité', type: 'select', options: PRIO },
        { key: 'statut', label: 'Statut', type: 'select', options: STATUTS }
      ]} />
  )
}

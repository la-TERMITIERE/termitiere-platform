// RH — Recrutement & Offres (Talent & Développement).
import { Send } from 'lucide-react'
import { formatDateShort } from '../../utils/formatters'
import CrudList from './CrudList'
import { STATUTS_OFFRE, COL } from './store/rhStore'

export default function Recrutement() {
  return (
    <CrudList collection={COL.recrutements} icon={Send} sousModule="Talent & Développement"
      titre="Recrutement & Offres" sousTitre="Publiez des offres et suivez le pipeline de candidatures." boutonLabel="Nouvelle offre"
      emptyText="Aucune offre publiée."
      vide={() => ({ poste: '', departement: '', type: 'cdi', nbPostes: 1, dateLimite: '', statut: 'brouillon' })}
      colonnes={[
        { key: 'poste', label: 'Poste', strong: true },
        { key: 'departement', label: 'Département' },
        { key: 'nbPostes', label: 'Postes', align: 'right' },
        { key: 'dateLimite', label: 'Date limite', render: (r) => r.dateLimite ? formatDateShort(r.dateLimite) : '—' },
        { key: 'statut', label: 'Statut', badge: (v) => STATUTS_OFFRE[v] }
      ]}
      champs={[
        { key: 'poste', label: 'Intitulé du poste', required: true, placeholder: "Ex. Comptable, Responsable d'élevage" },
        { key: 'departement', label: 'Département', type: 'departement' },
        { key: 'type', label: 'Type de contrat', type: 'boutons', options: [{ value: 'cdi', label: 'CDI' }, { value: 'cdd', label: 'CDD' }, { value: 'stage', label: 'Stage' }] },
        { key: 'nbPostes', label: 'Nombre de postes', type: 'number', placeholder: "Ex. 1" },
        { key: 'dateLimite', label: 'Date limite de candidature', type: 'date' },
        { key: 'statut', label: 'Statut', type: 'boutons', options: Object.entries(STATUTS_OFFRE).map(([value, o]) => ({ value, label: o.label })) }
      ]} />
  )
}

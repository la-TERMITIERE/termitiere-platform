// RH — Formulaires & candidature (Talent & Développement).
import { useMemo } from 'react'
import { ClipboardList } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { formatDateShort } from '../../utils/formatters'
import CrudList from './CrudList'
import { ETAPES_PIPELINE, COL } from './store/rhStore'

const tone = (v) => ({ 'Recruté': 'success', 'Rejeté': 'danger', 'Entretien': 'warning', 'Offre': 'info' }[v] || 'neutral')

export default function Formulaires() {
  // Les postes visés proposés : les intitulés des offres déjà créées dans Recrutement, plus « Autre poste » pour un poste hors offre (candidature spontanée).
  const { data: offres } = useCollection(COL.recrutements)
  const postesOffres = useMemo(() => [...new Set(offres.map((o) => (o.poste || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [offres])
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
        { key: 'candidat', label: 'Nom du candidat', required: true, placeholder: "Nom et prénom du candidat" },
        { key: 'poste', label: 'Poste visé', type: 'choix', options: postesOffres, autre: 'Autre poste', placeholder: "Ex. Comptable, Coach sportif",
          vide: "Aucune offre créée : touchez Autre poste pour écrire le poste." },
        { key: 'contact', label: 'Téléphone / Email', placeholder: "Ex. 90 00 00 00 ou nom@email.com" },
        { key: 'date', label: 'Date de réception', type: 'date' },
        { key: 'etape', label: 'Étape du pipeline', type: 'boutons', options: ETAPES_PIPELINE.map((e) => ({ value: e, label: e })) }
      ]} />
  )
}

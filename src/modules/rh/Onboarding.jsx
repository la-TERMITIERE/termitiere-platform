// RH — Onboarding / Offboarding (Collaborateurs & Contrats).
import { Repeat } from 'lucide-react'
import CrudList from './CrudList'
import { COL } from './store/rhStore'

const TYPES = [{ value: 'onboarding', label: 'Onboarding (intégration)' }, { value: 'offboarding', label: 'Offboarding (départ)' }]
const STATUTS = [{ value: 'a_faire', label: 'À faire' }, { value: 'en_cours', label: 'En cours' }, { value: 'fait', label: 'Fait' }]
const tone = (v) => ({ a_faire: 'neutral', en_cours: 'warning', fait: 'success' }[v] || 'neutral')

export default function Onboarding() {
  return (
    <CrudList collection={COL.onboarding} icon={Repeat} sousModule="Collaborateurs & Contrats"
      titre="Onboarding / Offboarding" sousTitre="Parcours d'intégration des nouveaux et de départ des sortants." boutonLabel="Nouvelle étape"
      emptyText="Aucune étape d'intégration/départ."
      vide={() => ({ employeId: '', type: 'onboarding', etape: '', responsable: '', statut: 'a_faire' })}
      colonnes={[
        { key: 'employeNom', label: 'Employé', strong: true },
        { key: 'type', label: 'Parcours', render: (r) => TYPES.find((t) => t.value === r.type)?.label || r.type },
        { key: 'etape', label: 'Étape' },
        { key: 'responsable', label: 'Responsable' },
        { key: 'statut', label: 'Statut', badge: (v) => ({ tone: tone(v), label: STATUTS.find((s) => s.value === v)?.label || v }) }
      ]}
      champs={[
        { key: 'employeId', label: 'Employé', type: 'employe', required: true },
        { key: 'type', label: 'Parcours', type: 'select', options: TYPES },
        { key: 'etape', label: 'Étape (ex. Remise du matériel)', required: true },
        { key: 'responsable', label: 'Responsable' },
        { key: 'statut', label: 'Statut', type: 'select', options: STATUTS }
      ]} />
  )
}

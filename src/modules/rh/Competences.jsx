// RH — Compétences & GPEC (Talent & Développement).
import { TrendingUp } from 'lucide-react'
import CrudList from './CrudList'
import { NIVEAUX_COMPETENCE, COL } from './store/rhStore'

const toneNiveau = (v) => ({ 'Débutant': 'neutral', 'Intermédiaire': 'info', 'Confirmé': 'warning', 'Expert': 'success' }[v] || 'neutral')

export default function Competences() {
  return (
    <CrudList collection={COL.competences} icon={TrendingUp} sousModule="Talent & Développement"
      titre="Compétences & GPEC" sousTitre="Cartographie des compétences et gestion prévisionnelle des emplois." boutonLabel="Ajouter une compétence"
      emptyText="Aucune compétence cartographiée."
      vide={() => ({ employeId: '', competence: '', niveau: 'Intermédiaire', cible: 'Confirmé' })}
      colonnes={[
        { key: 'employeNom', label: 'Employé', strong: true },
        { key: 'competence', label: 'Compétence' },
        { key: 'niveau', label: 'Niveau actuel', badge: (v) => ({ tone: toneNiveau(v), label: v }) },
        { key: 'cible', label: 'Niveau cible' }
      ]}
      champs={[
        { key: 'employeId', label: 'Employé', type: 'employe', required: true },
        { key: 'competence', label: 'Compétence', required: true },
        { key: 'niveau', label: 'Niveau actuel', type: 'select', options: NIVEAUX_COMPETENCE },
        { key: 'cible', label: 'Niveau cible (GPEC)', type: 'select', options: NIVEAUX_COMPETENCE }
      ]} />
  )
}

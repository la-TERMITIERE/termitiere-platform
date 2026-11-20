// RH : Évaluations (Talent & Développement). Une évaluation est le bilan du travail d'un employé sur une période : une grille de critères
// notés de 1 à 5, dont la moyenne donne l'appréciation globale (A à D), puis les objectifs et commentaires. Le statut dit si l'entretien est
// encore à faire (planifiée) ou fait (réalisée).
import { Gauge } from 'lucide-react'
import CrudList from './CrudList'
import { COL } from './store/rhStore'
import { moyenneCriteres, lettreDeMoyenne, formatMoyenne, periodeParDefaut, periodeDepuisTexte, libellePeriodeEval } from './rhui'

export const CRITERES_EVALUATION = [
  { id: 'qualite', label: 'Qualité du travail' },
  { id: 'objectifs', label: 'Atteinte des objectifs' },
  { id: 'ponctualite', label: 'Ponctualité et assiduité' },
  { id: 'equipe', label: "Esprit d'équipe" },
  { id: 'initiative', label: 'Initiative et autonomie' },
  { id: 'communication', label: 'Communication et respect des consignes' }
]
const NOTES = [
  { value: 'A', label: 'A : Excellent' }, { value: 'B', label: 'B : Bon' },
  { value: 'C', label: 'C : Satisfaisant' }, { value: 'D', label: 'D : À améliorer' }
]
const STATUTS = { planifiee: { label: 'Planifiée', tone: 'warning' }, realisee: { label: 'Réalisée', tone: 'success' } }
const toneNote = (v) => ({ A: 'success', B: 'info', C: 'warning', D: 'danger' }[v] || 'neutral')

// Moyenne des critères notés, et lettre qui en découle : enregistrées avec l'évaluation (la lettre peut ensuite être ajustée à la main).
const calculer = (criteres) => {
  const m = moyenneCriteres(criteres, CRITERES_EVALUATION)
  return m == null ? { moyenne: 0 } : { moyenne: Math.round(m * 10) / 10, note: lettreDeMoyenne(m) }
}

export default function Evaluations() {
  return (
    <CrudList collection={COL.evaluations} icon={Gauge} sousModule="Talent & Développement"
      titre="Évaluations" sousTitre="Notez le travail de chaque employé : critères, moyenne et objectifs." boutonLabel="Nouvelle évaluation"
      emptyText="Aucune évaluation enregistrée."
      vide={() => ({ employeId: '', periodeDef: periodeParDefaut(), periode: String(new Date().getFullYear()), criteres: {}, moyenne: 0, note: 'B', objectifs: '', statut: 'realisee' })}
      colonnes={[
        { key: 'employeNom', label: 'Employé', strong: true },
        { key: 'periode', label: 'Période' },
        { key: 'moyenne', label: 'Moyenne', align: 'right', render: (r) => (r.moyenne ? `${formatMoyenne(Number(r.moyenne))} / 5` : '-') },
        { key: 'note', label: 'Note', badge: (v) => ({ tone: toneNote(v), label: v }) },
        { key: 'statut', label: 'Statut', badge: (v) => STATUTS[v || 'realisee'] },
        { key: 'objectifs', label: 'Objectifs', render: (r) => r.objectifs ? (r.objectifs.length > 40 ? r.objectifs.slice(0, 40) + '…' : r.objectifs) : '-' }
      ]}
      champs={[
        { key: 'employeId', label: 'Employé', type: 'employe', required: true, placeholder: "Choisissez l'employé concerné" },
        // `periodeDef` garde le choix (mois, trimestre ou année) ; `periode` en est le libellé lisible, affiché dans le tableau et lu par le tableau de bord RH.
        { key: 'periodeDef', label: 'Période évaluée', type: 'periode', defaut: (m) => periodeDepuisTexte(m?.periode), calculer: (v) => ({ periode: libellePeriodeEval(v) }) },
        { key: 'statut', label: 'Statut de l\'entretien', type: 'boutons', options: Object.entries(STATUTS).map(([value, o]) => ({ value, label: o.label })) },
        { key: 'criteres', label: 'Critères (de 1 à 5)', type: 'criteres', criteres: CRITERES_EVALUATION, calculer },
        { key: 'note', label: 'Appréciation globale', type: 'select', options: NOTES },
        { key: 'objectifs', label: 'Objectifs & commentaires', type: 'textarea', placeholder: "Objectifs fixés, points forts, axes d'amélioration…" }
      ]} />
  )
}

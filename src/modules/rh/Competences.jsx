// RH : Compétences & GPEC (Talent & Développement). Chaque compétence d'un employé a un niveau actuel et un niveau cible ; la colonne « Écart » compare
// les deux. La colonne « Formation » relie l'écart aux Formations : formation prévue, ou bouton « Planifier » qui ouvre une formation déjà remplie
// (compétence, niveau visé, participants). Quand la formation est terminée, les niveaux se mettent à jour (cf. Formations).
import { TrendingUp, Gauge, CheckCircle2, AlertTriangle, Users, BookOpen, CalendarPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CrudList from './CrudList'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { formatDateShort } from '../../utils/formatters'
import { NIVEAUX_COMPETENCE, STATUTS_FORMATION, COL } from './store/rhStore'
import { ecartCompetence, formationPrevue, ligneSansFormation, indexNiveau } from './competencesFormations'

const toneNiveau = (v) => ({ 'Débutant': 'neutral', 'Intermédiaire': 'info', 'Confirmé': 'warning', 'Expert': 'success' }[v] || 'neutral')
const etatEcart = (e) => (e === null ? null
  : e === 0 ? { label: 'À niveau', tone: 'success' }
    : e < 0 ? { label: 'Au-dessus de la cible', tone: 'info' }
      : { label: `Manque ${e} niveau${e > 1 ? 'x' : ''}`, tone: e === 1 ? 'warning' : 'danger' })

export default function Competences() {
  const navigate = useNavigate()
  const { data: formations } = useCollection(COL.formations)
  const { data: toutes } = useCollection(COL.competences)

  // Ouvre Formations avec une formation déjà remplie : la compétence, le niveau visé et tous ceux qui ont le même écart sans formation prévue.
  function planifier(ligne) {
    const concernees = ligneSansFormation(toutes, formations, ligne)
    const vise = concernees.reduce((m, c) => (indexNiveau(c.cible) > indexNiveau(m) ? c.cible : m), ligne.cible)
    navigate('/rh/formations', { state: { nouvelleFormation: {
      titre: `Formation : ${ligne.competence}`, competence: ligne.competence, niveauVise: vise, statut: 'planifiee',
      participants: [...new Set(concernees.map((c) => c.employeId).concat(ligne.employeId))],
      description: `Combler l'écart en « ${ligne.competence} » (${concernees.length || 1} employé(s)).`
    } } })
  }

  return (
    <CrudList collection={COL.competences} icon={TrendingUp} sousModule="Talent & Développement"
      titre="Compétences & GPEC" sousTitre="Cartographie des compétences et gestion prévisionnelle des emplois." boutonLabel="Ajouter une compétence"
      emptyText="Aucune compétence cartographiée."
      vide={() => ({ employeId: '', competence: '', niveau: 'Intermédiaire', cible: 'Confirmé' })}
      stats={(lignes) => {
        const avecEcart = lignes.filter((r) => (ecartCompetence(r) ?? 0) > 0)
        const aNiveau = lignes.filter((r) => ecartCompetence(r) !== null && ecartCompetence(r) <= 0).length
        const sansFormation = avecEcart.filter((r) => !formationPrevue(formations, r)).length
        const personnes = new Set(avecEcart.map((r) => r.employeId)).size
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard title="Compétences suivies" value={lignes.length} accent="#0284c7" icon={Gauge} />
            <StatCard title="À niveau" value={aNiveau} accent="#16a34a" icon={CheckCircle2} />
            <StatCard title="À former" value={avecEcart.length} sub={`${sansFormation} sans formation prévue`} accent="#f59e0b" icon={AlertTriangle} />
            <StatCard title="Employés concernés" value={personnes} sub="avec au moins un écart" accent="#7c3aed" icon={Users} />
          </div>
        )
      }}
      colonnes={[
        { key: 'employeNom', label: 'Employé', strong: true },
        { key: 'competence', label: 'Compétence' },
        { key: 'niveau', label: 'Niveau actuel', badge: (v) => ({ tone: toneNiveau(v), label: v }) },
        { key: 'cible', label: 'Niveau cible' },
        { key: 'ecart', label: 'Écart', render: (r) => { const e = etatEcart(ecartCompetence(r)); return e ? <Badge tone={e.tone}>{e.label}</Badge> : '-' } },
        { key: 'formation', label: 'Formation', render: (r) => {
          const f = formationPrevue(formations, r)
          if (f) return <span title={f.titre}><Badge tone={STATUTS_FORMATION[f.statut]?.tone || 'info'}>{STATUTS_FORMATION[f.statut]?.label || 'Prévue'}{f.dateDebut ? ` · ${formatDateShort(f.dateDebut)}` : ''}</Badge></span>
          if ((ecartCompetence(r) ?? 0) > 0) {
            return (
              <button type="button" onClick={(e) => { e.stopPropagation(); planifier(r) }}
                className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-gradient-to-b from-white/90 to-amber-50/70 px-2.5 py-1 text-xs font-bold text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_6px_12px_-8px_rgba(245,158,11,0.7)] backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-95">
                <CalendarPlus size={13} aria-hidden="true" /> Planifier
              </button>
            )
          }
          return '-'
        } }
      ]}
      tuilesDetail={(r) => {
        const e = etatEcart(ecartCompetence(r)); const f = formationPrevue(formations, r)
        return [
          ...(e ? [{ icone: Gauge, label: 'Écart avec la cible', valeur: e.label, couleur: e.tone === 'success' ? '#16a34a' : e.tone === 'info' ? '#0284c7' : e.tone === 'warning' ? '#f59e0b' : '#dc2626' }] : []),
          ...(f ? [{ icone: BookOpen, label: 'Formation prévue', valeur: `${f.titre} : ${STATUTS_FORMATION[f.statut]?.label || ''}${f.dateDebut ? `, le ${formatDateShort(f.dateDebut)}` : ''}`, large: true, couleur: '#16a34a' }] : [])
        ]
      }}
      actionsLigne={(r, fermer) => ((ecartCompetence(r) ?? 0) > 0 && !formationPrevue(formations, r) ? [{ label: 'Planifier une formation', icone: CalendarPlus, tone: 'succes', onClick: () => { fermer(); planifier(r) } }] : [])}
      champs={[
        { key: 'employeId', label: 'Employé', type: 'employe', required: true, placeholder: "Choisissez l'employé concerné" },
        { key: 'competence', label: 'Compétence', required: true, placeholder: "Ex. Soudure, Gestion de stock, Soins vétérinaires" },
        { key: 'niveau', label: 'Niveau actuel', type: 'boutons', options: NIVEAUX_COMPETENCE.map((n) => ({ value: n, label: n })) },
        { key: 'cible', label: 'Niveau cible (GPEC)', type: 'boutons', options: NIVEAUX_COMPETENCE.map((n) => ({ value: n, label: n })) }
      ]} />
  )
}

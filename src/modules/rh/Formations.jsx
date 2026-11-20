// RH : Formations (Talent & Développement). Une formation peut viser une compétence et un niveau à atteindre (lien avec Compétences & GPEC) :
// quand elle passe à « Terminée », l'application propose de monter le niveau des participants, ce qui fait disparaître leur écart.
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, TrendingUp, ArrowRight, Check } from 'lucide-react'
import { formatDateShort } from '../../utils/formatters'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem } from '../../core/db'
import { toast } from '../../core/notifications'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { glassModalProps, icone3D, avatarGradient } from '../../utils/color'
import CrudList from './CrudList'
import { STATUTS_FORMATION, NIVEAUX_COMPETENCE, COL } from './store/rhStore'
import { niveauxAMonter } from './competencesFormations'

export default function Formations() {
  const { data: competences } = useCollection(COL.competences)
  const { data: employes } = useCollection(COL.employes)
  const location = useLocation()
  const navigate = useNavigate()
  const [proposition, setProposition] = useState(null) // { formation, montees, creations }
  const [enCours, setEnCours] = useState(false)
  // Compétences déjà cartographiées, proposées en boutons : on les choisit plutôt que de les retaper (le lien se fait par le nom).
  const nomsCompetences = useMemo(() => [...new Set(competences.map((c) => String(c.competence || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [competences])

  // Formation passée à « Terminée » : on propose de monter les participants au niveau visé (une seule fois par formation).
  async function apresSauvegarde(formation, avant) {
    if (formation.statut !== 'terminee' || avant?.statut === 'terminee' || !formation.competence || !formation.niveauVise) return
    const p = niveauxAMonter(formation, competences, employes)
    if (p.montees.length || p.creations.length) setProposition({ formation, ...p })
  }
  async function appliquer() {
    setEnCours(true)
    try {
      const { formation, montees, creations } = proposition
      await Promise.all([
        ...montees.map((m) => updateItem(COL.competences, m.ligne.id, { niveau: m.vers, majParFormation: formation.id || '' })),
        ...creations.map((c) => addItem(COL.competences, { employeId: c.employeId, employeNom: c.employeNom, competence: formation.competence, niveau: c.vers, cible: c.vers, majParFormation: formation.id || '' }))
      ])
      toast.success(`${montees.length + creations.length} niveau(x) mis à jour dans Compétences ✓`)
      setProposition(null)
    } finally { setEnCours(false) }
  }

  const nouvelle = location.state?.nouvelleFormation || null
  return (
    <>
      <CrudList collection={COL.formations} icon={BookOpen} sousModule="Talent & Développement"
        titre="Formations" sousTitre="Plan de formation et suivi des sessions." boutonLabel="Nouvelle formation"
        emptyText="Aucune formation planifiée."
        vide={() => ({ titre: '', formateur: '', competence: '', niveauVise: '', participants: [], dateDebut: '', statut: 'planifiee', cout: 0, description: '' })}
        ouvertureInitiale={nouvelle} onOuvertureFaite={() => navigate(location.pathname, { replace: true, state: null })}
        apresSauvegarde={apresSauvegarde}
        colonnes={[
          { key: 'titre', label: 'Formation', strong: true },
          { key: 'competence', label: 'Compétence visée', render: (r) => (r.competence ? `${r.competence}${r.niveauVise ? ` → ${r.niveauVise}` : ''}` : '-') },
          { key: 'formateur', label: 'Formateur / Organisme' },
          { key: 'participants', label: 'Participants', render: (r) => (r.participants?.includes('*') ? 'Tout le personnel' : r.participants?.length ? `${r.participants.length} employé(s)` : '-') },
          { key: 'dateDebut', label: 'Date', render: (r) => r.dateDebut ? formatDateShort(r.dateDebut) : '-' },
          { key: 'statut', label: 'Statut', badge: (v) => STATUTS_FORMATION[v] },
          { key: 'cout', label: 'Coût (XOF)', align: 'right', render: (r) => (r.cout || 0).toLocaleString('fr-FR') }
        ]}
        champs={[
          { key: 'titre', label: 'Intitulé', required: true, placeholder: "Ex. Sécurité au travail, Relation client" },
          { key: 'competence', label: 'Compétence visée', type: 'choix', options: nomsCompetences, autre: 'Autre compétence', placeholder: 'Nom de la compétence', vide: 'Aucune compétence cartographiée : touchez Autre compétence pour la nommer.' },
          { key: 'niveauVise', label: 'Niveau visé à la fin', type: 'boutons', options: NIVEAUX_COMPETENCE.map((n) => ({ value: n, label: n })) },
          { key: 'formateur', label: 'Formateur / Organisme', placeholder: "Nom du formateur ou de l'organisme" },
          { key: 'participants', label: 'Participants (qui est formé)', type: 'employes' },
          { key: 'dateDebut', label: 'Date de début', type: 'date' },
          { key: 'statut', label: 'Statut', type: 'select', options: Object.entries(STATUTS_FORMATION).map(([value, o]) => ({ value, label: o.label })) },
          { key: 'cout', label: 'Coût (XOF)', type: 'number', placeholder: "Ex. 75000" },
          { key: 'description', label: 'Description / objectifs', type: 'textarea', placeholder: "Objectifs et contenu de la formation" }
        ]} />

      {/* Formation terminée : proposition de monter les niveaux des participants dans Compétences. */}
      <Modal open={!!proposition} onClose={() => setProposition(null)} size="lg" title="Mettre à jour les compétences" {...glassModalProps('#0284c7')}
        footer={<>
          <Button variant="ghost" onClick={() => setProposition(null)}>Plus tard</Button>
          <Button onClick={appliquer} loading={enCours} style={{ backgroundColor: '#16a34a' }}><Check size={16} /> Mettre à jour les niveaux</Button>
        </>}>
        {proposition && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={icone3D('#0284c7')}><TrendingUp size={22} /></span>
              <div className="min-w-0">
                <p className="text-base font-extrabold text-gray-800">Formation « {proposition.formation.titre} » terminée</p>
                <p className="text-sm text-gray-600">Compétence « {proposition.formation.competence} » : passer les participants au niveau <strong>{proposition.formation.niveauVise}</strong> ?</p>
              </div>
            </div>
            <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
              {proposition.montees.map((m) => (
                <li key={m.ligne.id} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/70 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: avatarGradient(m.ligne.employeNom) }} aria-hidden="true">{(m.ligne.employeNom || '?').charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{m.ligne.employeNom}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-gray-600">{m.de} <ArrowRight size={13} aria-hidden="true" /> <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">{m.vers}</span></span>
                </li>
              ))}
              {proposition.creations.map((c) => (
                <li key={c.employeId} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/70 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: avatarGradient(c.employeNom) }} aria-hidden="true">{(c.employeNom || '?').charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{c.employeNom}</span>
                  <span className="shrink-0 text-xs font-bold text-gray-600">compétence ajoutée : <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">{c.vers}</span></span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-500">Vous pouvez aussi le faire plus tard, ligne par ligne, dans Compétences & GPEC.</p>
          </div>
        )}
      </Modal>
    </>
  )
}

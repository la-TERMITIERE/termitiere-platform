// Volet BTP — vue consolidée réservée à l'administration : tous les chantiers
// (projets du secteur MAXI BAT — construction/aménagement), leurs tâches, ET les
// dépenses de chantier (E-DÉPENSES, secteur BAT) réunis au même endroit, au lieu
// d'être éparpillés entre E-G.Pro et E-DÉPENSES.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HardHat, FolderKanban, ListChecks, ChevronRight, AlertTriangle, Pencil, Trash2, Wallet, Info, Scale } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { useAuthStore } from '../../core/auth'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import RecettesDepenses from '../depense/RecettesDepenses'
import Depenses from './Depenses'
import DetailProjetModal from './DetailProjetModal'
import { updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { SECTEURS } from '../depense/data'
import { projetsVisibles, scopeParProjets, secteurEffectif, projetEnRetard } from './logic'
import { STATUTS_PROJET, TYPES_PROJET } from './data'

const SECTEUR_BTP = 'bat'

// Confirmé explicitement par la direction : ces projets n'ont jamais eu de secteur
// fixé et étaient donc classés BTP par erreur (déduction automatique depuis leur
// type « Aménagement ») — ils relèvent en réalité de MAXI-AGRO. Correction ciblée
// et automatique, le temps que la reclassification manuelle (panneau ci-dessous)
// couvre tout nouveau cas similaire.
const CORRECTIONS_CONNUES = {
  'cloture en bambou': 'agro',
  'champ de manioc de bagbe': 'agro'
}
const normaliserNom = (s) => (s || '').trim().toLowerCase()
  .normalize('NFD').replace(new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g'), '')

// Types de projet légitimement BTP — le seul cas où « déduire BAT du type » est fiable.
const TYPES_BTP = ['construction', 'amenagement']

// Un projet est « suspect » dans deux cas, qui couvrent aussi bien l'oubli que
// l'erreur de saisie explicite :
//   1. Secteur JAMAIS fixé (`!p.secteurId`) → hérite d'un secteur déduit du TYPE
//      (cf. SECTEUR_PAR_TYPE_PROJET), qui peut être faux (« Aménagement » → BAT
//      par défaut, même pour une clôture ou un champ qui relèvent de MAXI-AGRO).
//   2. Secteur qui pointe vers BAT (explicitement OU par déduction) alors que le
//      TYPE du projet n'a rien de BTP (agricole, élevage, commercial…) — ce cas
//      couvre aussi un `secteurId` EXPLICITEMENT mal renseigné (ex. « bat » posé
//      par erreur sur un projet agricole), que le cas 1 seul ne détecterait pas —
//      c'est exactement ce qui faisait apparaître des dépenses MAXI-AGRO en BTP.
function ProjetsAmbigus({ projets }) {
  const [enregistrement, setEnregistrement] = useState(null) // id du projet en cours de sauvegarde
  const corriges = useRef(new Set()) // évite de retraiter le même projet plusieurs fois

  const ambigus = useMemo(() => {
    return projets
      .map((p) => {
        const secteur = secteurEffectif(p)
        if (!p.secteurId) return { p, secteur, raison: 'secteur_absent' }
        if (secteur?.id === SECTEUR_BTP && !TYPES_BTP.includes(p.type)) return { p, secteur, raison: 'type_incoherent' }
        // Cas symétrique du précédent : un TYPE clairement BTP (construction/aménagement)
        // mais un secteur qui pointe explicitement ailleurs — un chantier saisi avec le
        // mauvais secteur choisi à la main disparaît sinon complètement de ce volet BTP,
        // sans qu'aucun des deux cas ci-dessus ne le détecte (secteurId EST renseigné, et
        // il n'est PAS classé BAT).
        if (TYPES_BTP.includes(p.type) && secteur?.id !== SECTEUR_BTP) return { p, secteur, raison: 'type_btp_secteur_autre' }
        return null
      })
      .filter(Boolean)
      .sort((a, b) => (b.p.createdAt || 0) - (a.p.createdAt || 0))
  }, [projets])

  // Corrige automatiquement les cas déjà confirmés ci-dessus, dès qu'ils apparaissent
  // dans les données réelles — pas besoin de cliquer manuellement pour ceux-là.
  useEffect(() => {
    ambigus.forEach(({ p }) => {
      const secteurConnu = CORRECTIONS_CONNUES[normaliserNom(p.nom)]
      if (secteurConnu && !corriges.current.has(p.id)) {
        corriges.current.add(p.id)
        updateItem('projets', p.id, { secteurId: secteurConnu, updatedAt: Date.now() })
          .then(() => {
            const secteur = SECTEURS.find((s) => s.id === secteurConnu)
            audit('projet', 'projet_modifie', `${p.nom} — secteur corrigé automatiquement en ${secteur?.label || secteurConnu} (confirmé par la direction)`)
            toast.success(`« ${p.nom} » reclassé en ${secteur?.label || secteurConnu} ✓`)
          })
      }
    })
  }, [ambigus])

  async function reclasser(p, secteurId) {
    if (!secteurId || enregistrement) return
    setEnregistrement(p.id)
    try {
      await updateItem('projets', p.id, { secteurId, updatedAt: Date.now() })
      const secteur = SECTEURS.find((s) => s.id === secteurId)
      await audit('projet', 'projet_modifie', `${p.nom} — secteur reclassé explicitement en ${secteur?.label || secteurId}`)
      toast.success(`« ${p.nom} » reclassé en ${secteur?.label || secteurId} ✓`)
    } finally {
      setEnregistrement(null)
    }
  }

  if (ambigus.length === 0) return null

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={18} className="text-amber-600" />
        <h3 className="text-base font-bold text-amber-900">Projets à reclasser ({ambigus.length})</h3>
      </div>
      <p className="mb-3 text-xs text-amber-700">
        Trois cas signalés ici : un secteur jamais fixé explicitement (déduit automatiquement du type,
        potentiellement faux), un projet classé BTP dont le TYPE n'a rien de BTP (ex. agricole/élevage) —
        qui révèle un secteur mal renseigné À LA MAIN, comme les dépenses MAXI-AGRO qui remontaient à tort
        dans les dépenses BTP — ou l'inverse : un TYPE clairement BTP (construction/aménagement) classé
        dans un autre secteur, qui le rend invisible du volet Chantiers ci-dessous. Choisis le bon secteur
        pour chacun.
      </p>
      <div className="space-y-2">
        {ambigus.map(({ p, secteur, raison }) => {
          const type = TYPES_PROJET.find((t) => t.id === p.type)
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-100 bg-white p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-800">{p.nom}</p>
                <p className="text-[11px] text-gray-400">
                  Type : {type?.label || p.type || '—'} · actuellement classé dans <strong>{secteur?.label}</strong>
                  {raison === 'type_incoherent'
                    ? <span className="ml-1 font-semibold text-red-500">— incohérent avec ce type</span>
                    : raison === 'type_btp_secteur_autre'
                      ? <span className="ml-1 font-semibold text-red-500">— type BTP mais absent du volet Chantiers</span>
                      : <span className="ml-1">(déduit par défaut, jamais fixé)</span>}
                </p>
              </div>
              <select
                defaultValue=""
                disabled={enregistrement === p.id}
                onChange={(e) => reclasser(p, e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
              >
                <option value="" disabled>— Choisir le vrai secteur —</option>
                {SECTEURS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ONGLETS = [
  { id: 'chantiers', label: 'Chantiers', icon: FolderKanban },
  { id: 'depenses',  label: 'Dépenses',  icon: Wallet },
  // Reprend l'écran « Revenus & Budget » d'E-DÉPENSES, désormais retiré de là-bas pour
  // MAXI BAT — géré exclusivement ici (réservé à l'administration), avec les mêmes
  // fonctionnalités qu'E-DÉPENSES offrait (allocation du budget, revenu manuel).
  { id: 'budget',    label: 'Revenus & Budget', icon: Scale }
]

export default function Btp() {
  const navigate = useNavigate()
  const { user, role } = useAuthStore()
  const [onglet, setOnglet] = useState('chantiers')
  const [detailProjet, setDetailProjet] = useState(null)
  const { data: projetsTous } = useCollection('projets')
  const { data: tachesTous }  = useCollection('projet_taches')
  const { data: notificationsTous } = useCollection('notifications')
  const { data: depensesProjetTous } = useCollection('projet_depenses')
  const { data: depenseDepensesTous } = useCollection('depense_depenses')

  async function supprimerChantier(p) {
    if (!window.confirm(`Supprimer le projet "${p.nom}" ?`)) return
    await removeItem('projets', p.id)
    // Les notifications d'alerte (retard, budget dépassé…) référencent ce projet —
    // un projet supprimé ne doit plus en laisser derrière lui (même logique que Projets.jsx).
    const notifsLiees = notificationsTous.filter((n) => n.projetId === p.id)
    await Promise.all(notifsLiees.map((n) => removeItem('notifications', n.id)))
    await audit('projet', 'projet_supprime', `${p.nom} (${p.id})`)
    toast.success(`« ${p.nom} » supprimé ✓`)
  }

  const projets = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])
  const projetsBtp = useMemo(
    () => projets.filter((p) => secteurEffectif(p)?.id === SECTEUR_BTP)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [projets]
  )
  const tachesBtp = useMemo(() => scopeParProjets(tachesTous, projetsBtp), [tachesTous, projetsBtp])
  const tachesActives = useMemo(() => tachesBtp.filter((t) => !['terminee', 'annulee'].includes(t.statut)), [tachesBtp])
  const chantiersEnCours = useMemo(() => projetsBtp.filter((p) => p.statut === 'en_cours'), [projetsBtp])
  const chantiersEnRetard = useMemo(() => projetsBtp.filter((p) => projetEnRetard(p)), [projetsBtp])

  return (
    <div className="space-y-6">
      <div className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.9) 0%, rgba(26,26,26,0.88) 100%)' }}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <HardHat size={26} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">BTP — Bâtiment & Travaux Publics</h2>
          <p className="text-sm text-white/80">Chantiers, tâches et dépenses réunis au même endroit — réservé à l'administration</p>
        </div>
      </div>

      {/* Barre d'onglets — Chantiers à gauche, Dépenses à droite */}
      <div className="flex gap-2 border-b border-gray-200">
        {ONGLETS.map((o) => (
          <button key={o.id} type="button" onClick={() => setOnglet(o.id)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-bold transition-colors ${
              onglet === o.id ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            <o.icon size={16} /> {o.label}
          </button>
        ))}
      </div>

      {onglet === 'chantiers' && (
        <div className="space-y-6">
          {/* Projets sans secteur explicite — à corriger en priorité, tous secteurs confondus */}
          <ProjetsAmbigus projets={projets} />

          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard title="Chantiers" value={projetsBtp.length} sub={`${chantiersEnCours.length} en cours`} icon={FolderKanban} accent="#0d9488" />
            <StatCard title="Tâches actives" value={tachesActives.length} sub={`${tachesBtp.length} au total`} icon={ListChecks} accent="#0d9488" />
            <StatCard title="Chantiers en retard" value={chantiersEnRetard.length} icon={AlertTriangle} accent={chantiersEnRetard.length > 0 ? '#dc2626' : '#94a3b8'} />
            <StatCard title="Explorer" value="→" sub="Par catégorie de tâches" icon={ListChecks} accent="#0d9488"
              onClick={() => navigate('/projet/taches/bat')} />
          </div>

          {/* Chantiers */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800">Chantiers</h3>
              <Link to="/projet/projets/bat" className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                Parcourir par catégorie de tâches <ChevronRight size={14} />
              </Link>
            </div>
            {projetsBtp.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                Aucun chantier (secteur MAXI BAT) enregistré pour l'instant.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {projetsBtp.map((p) => {
                  const statut = STATUTS_PROJET[p.statut] || STATUTS_PROJET.planification
                  const nbTaches = tachesBtp.filter((t) => t.projetId === p.id).length
                  return (
                    <Link key={p.id} to={`/projet/projets/${SECTEUR_BTP}/${p.id}`}
                      className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: '#0d9488' }} />
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: '#0d9488' }}>
                        <HardHat size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-gray-900">{p.nom}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone={statut.tone}>{statut.label}</Badge>
                          {projetEnRetard(p) && <Badge tone="danger">⏰ En retard</Badge>}
                          <span className="text-xs text-gray-400">{nbTaches} tâche{nbTaches > 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                        <button onClick={() => setDetailProjet(p)}
                          title="Voir les détails (budget / dépenses)" className="rounded-lg border border-gray-200 bg-gray-50 p-1.5 text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-100">
                          <Info size={15} />
                        </button>
                        <button onClick={() => navigate('/projet/projets/liste', { state: { openEditProjetId: p.id } })}
                          title="Modifier" className="rounded-lg border border-teal-200 bg-teal-50 p-1.5 text-teal-600 transition-colors hover:border-teal-300 hover:bg-teal-100">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => supprimerChantier(p)}
                          title="Supprimer" className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100">
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <ChevronRight size={18} className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-1" />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {onglet === 'depenses' && (
        <div className="space-y-6">
          {/* Dépenses détaillées des chantiers (par tâche/prestataire) — reprend l'écran
              « Dépenses » d'E-G.Pro, cantonné au BTP. Retirée de l'onglet Dépenses général
              (cf. index.jsx → DepensesRoute) pour ne vivre qu'ici désormais. */}
          <div>
            <h3 className="mb-3 text-base font-bold text-gray-800">Dépenses des chantiers (par tâche / prestataire)</h3>
            <Depenses secteurSeul={SECTEUR_BTP} />
          </div>
        </div>
      )}

      {onglet === 'budget' && (
        <div>
          {/* MAXI BAT n'apparaît plus dans « Revenus & Budget » d'E-DÉPENSES (cf.
              RecettesDepenses.jsx → secteursAffiches) : ce même écran, avec toutes ses
              fonctionnalités (pas de `masquerRevenu`), vit désormais uniquement ici —
              allocation du budget et ajout de revenu manuel inclus. */}
          <RecettesDepenses secteurId={SECTEUR_BTP} />
        </div>
      )}

      {detailProjet && (
        <DetailProjetModal projet={detailProjet} depensesProjetTous={depensesProjetTous} taches={tachesTous}
          depenseDepensesTous={depenseDepensesTous} onClose={() => setDetailProjet(null)} icon={HardHat} />
      )}
    </div>
  )
}

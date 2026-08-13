// Détail budget/dépenses/solde d'UN projet — ouvert via le bouton Info sur sa carte
// (volet BTP, et volet Projets pour tous les secteurs). Fond en glassmorphism teinté de
// la couleur du secteur du projet (cf. SECTEURS), liste des dépenses individuelles avec
// filtre par catégorie. Composant partagé pour ne pas dupliquer cette logique par volet.
import { useState, useMemo } from 'react'
import { FolderKanban, Wallet, TrendingDown, Scale } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { secteurEffectif, avancementProjet } from './logic'
import { CATEGORIES_DEPENSE_PROJET as CATEGORIES, STATUTS_PROJET, TYPES_PROJET, PRIORITES, uniteSuperficie } from './data'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { teinterHex } from '../../utils/color'

// `taches` (optionnel) : TOUTES les tâches (tous projets confondus) — filtrées ici sur
// ce projet, pour l'avancement (cf. avancementProjet) ; sans elles, l'avancement retombe
// sur le taux de consommation du budget (même règle que la carte projet).
export default function DetailProjetModal({ projet, depensesProjetTous, depenseDepensesTous, taches = [], onClose, icon: Icon = FolderKanban }) {
  const [filtreCategorie, setFiltreCategorie] = useState('')

  const secteur = secteurEffectif(projet)
  const c = secteur?.color || '#0d9488'
  const budget = Number(projet.budget) || 0

  // Même logique que projet/Depenses.jsx : dépenses saisies directement sur ce projet
  // + celles créées côté E-DÉPENSES à la validation d'un besoin (source de vérité E-DÉPENSES).
  const toutesDepenses = useMemo(() => {
    const directes = (depensesProjetTous || []).filter((d) => d.projetId === projet.id)
    const besoins = (depenseDepensesTous || [])
      .filter((d) => d.source === 'besoin' && d.projetId === projet.id)
      .map((d) => ({
        id: `besoin_${d.id}`, projetId: d.projetId, montant: d.montant, date: d.date,
        categorie: 'sous_traitance', description: d.description || d.noteOrigine || ''
      }))
    // Tri par date la plus récente d'abord — comparaison numérique (pas .localeCompare)
    // car certaines dépenses plus anciennes stockent `date` en timestamp plutôt qu'en
    // chaîne 'YYYY-MM-DD' ; .localeCompare plante sur ces entrées.
    return [...directes, ...besoins].sort((a, b) => (b.date || 0) - (a.date || 0))
  }, [depensesProjetTous, depenseDepensesTous, projet.id])

  const total = toutesDepenses.reduce((s, d) => s + (Number(d.montant) || 0), 0)
  const solde = budget - total
  const categoriesPresentes = CATEGORIES.filter((cat) => toutesDepenses.some((d) => d.categorie === cat.id))
  const depensesAffichees = filtreCategorie ? toutesDepenses.filter((d) => d.categorie === filtreCategorie) : toutesDepenses
  const catLabel = (id) => CATEGORIES.find((cat) => cat.id === id)?.label || id || '—'

  const tachesDuProjet = useMemo(() => (taches || []).filter((t) => t.projetId === projet.id), [taches, projet.id])
  const tachesTerminees = tachesDuProjet.filter((t) => t.statut === 'terminee').length
  const pctAvancement = avancementProjet(tachesDuProjet, { ...projet, depenses: total })
  const pctBudget = budget > 0 ? Math.round((total / budget) * 100) : 0
  const superficie = Number(projet.superficie) || 0
  const statut = STATUTS_PROJET[projet.statut] || STATUTS_PROJET.planification
  const priorite = PRIORITES[projet.priorite]

  return (
    <Modal open onClose={onClose} size="lg"
      overlayClassName="backdrop-blur-sm"
      overlayStyle={{ background: `linear-gradient(135deg, ${teinterHex('#1A1A1A', 0.55)}, ${teinterHex(c, 0.45)})` }}
      panelClassName="relative overflow-hidden border border-white/60 backdrop-blur-2xl"
      panelStyle={{ background: `linear-gradient(160deg, ${teinterHex('#ffffff', 0.85)}, ${teinterHex(c, 0.12)})` }}
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: c }}>
            <Icon size={15} />
          </span>
          <span>
            {projet.nom}
            <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white align-middle" style={{ background: c }}>
              {secteur?.label}
            </span>
          </span>
        </span>
      }>
      <div className="space-y-4 text-sm">
        {/* Informations générales — type, statut, priorité, responsable, client/usage
            interne, dates, superficie (projets agricoles) : tout ce que la carte de la
            liste complète montre, repris ici pour que le bouton Info suffise. */}
        <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={statut.tone}>{statut.label}</Badge>
            {priorite && <Badge tone={priorite.tone}>{priorite.label}</Badge>}
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              {TYPES_PROJET.find((t) => t.id === projet.type)?.label || projet.type}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
            {projet.pourClient !== false
              ? (projet.clientNom
                  ? <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700">🧑‍💼 Client : {projet.clientNom}</span>
                  : <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">⚠ Client à préciser</span>)
              : <span className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-700">🏢 {projet.usageInterne ? `Entreprise : ${projet.usageInterne}` : 'Projet entreprise'}</span>}
            {projet.responsable && <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">👤 {projet.responsable}</span>}
            {projet.dateDebut && <span className="rounded-full bg-gray-100 px-2 py-0.5">📅 {formatDateShort(projet.dateDebut)}{!projet.dureeIndeterminee && projet.dateFin ? ` → ${formatDateShort(projet.dateFin)}` : ''}</span>}
            {projet.dureeIndeterminee && <span className="rounded-full bg-gray-100 px-2 py-0.5 italic text-gray-400">Durée indéterminée</span>}
            {projet.type === 'agricole' && superficie > 0 && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700">🌱 {superficie} {uniteSuperficie(projet.superficieUnite)}</span>
            )}
          </div>
        </div>

        {/* Barres d'avancement — tâches (ou, sans tâche, taux de consommation du
            budget) et budget consommé (dépenses / budget alloué). */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span>Avancement{tachesDuProjet.length > 0 ? ` (${tachesTerminees}/${tachesDuProjet.length} tâches)` : ''}</span>
              <span className="font-bold" style={{ color: c }}>{pctAvancement}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200/70">
              <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, pctAvancement)}%`, background: c }} />
            </div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span>Budget consommé</span>
              <span className={`font-bold ${pctBudget >= 100 ? 'text-red-600' : ''}`} style={pctBudget >= 100 ? undefined : { color: c }}>{pctBudget}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-200/70">
              <div className="h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, pctBudget)}%`, background: pctBudget >= 100 ? '#ef4444' : pctBudget >= 80 ? '#f59e0b' : c }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><Wallet size={13} style={{ color: c }} /> Budget</span>
            <p className="mt-0.5 font-bold text-gray-800">{formatMoney(budget)}</p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><TrendingDown size={13} className="text-amber-500" /> Dépenses</span>
            <p className="mt-0.5 font-bold text-gray-800">{formatMoney(total)}</p>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-md">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500"><Scale size={13} style={{ color: solde < 0 ? '#dc2626' : c }} /> Solde</span>
            <p className={`mt-0.5 font-bold ${solde < 0 ? 'text-red-600' : ''}`} style={solde < 0 ? undefined : { color: c }}>{formatMoney(solde)}</p>
          </div>
        </div>

        {categoriesPresentes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => setFiltreCategorie('')}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                !filtreCategorie ? 'text-white' : 'border border-white/60 bg-white/60 text-gray-600 hover:bg-white'
              }`}
              style={!filtreCategorie ? { background: c } : undefined}>
              Toutes
            </button>
            {categoriesPresentes.map((cat) => (
              <button key={cat.id} onClick={() => setFiltreCategorie(cat.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  filtreCategorie === cat.id ? 'text-white' : 'border border-white/60 bg-white/60 text-gray-600 hover:bg-white'
                }`}
                style={filtreCategorie === cat.id ? { background: c } : undefined}>
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {depensesAffichees.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/60 bg-white/50 p-6 text-center text-xs text-gray-400 backdrop-blur-md">
            Aucune dépense{filtreCategorie ? ' dans cette catégorie' : ''} pour ce projet.
          </p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {depensesAffichees.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-white/60 bg-white/70 px-3 py-2 backdrop-blur-md">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-gray-800">{d.description || catLabel(d.categorie)}</p>
                  <p className="text-[11px] text-gray-400">{catLabel(d.categorie)} · {formatDateShort(d.date)}</p>
                </div>
                <span className="shrink-0 font-bold text-gray-800">{formatMoney(d.montant)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

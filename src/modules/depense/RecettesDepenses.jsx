// Recettes & Dépenses — récapitulatif mensuel par secteur.
//  • Les RECETTES sont récupérées automatiquement du système de facturation de chaque
//    module (garderie, agro, logistique, briqueterie) — lecture seule, aucune saisie ici.
//  • Les DÉPENSES du secteur peuvent être ajoutées directement depuis cet écran, en plus
//    de celles reprises automatiquement d'E-G.Pro et de la Briqueterie.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Plus, TrendingUp, TrendingDown, Scale, Eye, Paperclip, Filter, History } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isReadOnlyRole } from '../../core/roles'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { genId, todayStr, formatDateShort, formatDateTime } from '../../utils/formatters'
import { ouvrirPiece } from '../../utils/fichiers'
import { SECTEURS, MOIS_LABELS, CATEGORIES_DEPENSE, NATURES_FLUX, natureFluxDefaut, STATUTS_DECAISSEMENT } from './data'
import { budgetSecteur, depensesSecteurMois, totalDepenses, depensesProjetVersSecteurs, coutsMatieresBriqueterie } from './logic'
import { revenuSecteur, SECTEURS_AVEC_REVENU } from './revenus'

const now = new Date()
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')

const empty = (secteurId = '') => ({
  secteurId, categorie: '', montant: '', date: todayStr(), description: '', natureFlux: natureFluxDefaut
})

// Thème visuel (panneau de détail + survol) selon le secteur affiché — pour que le
// design s'accorde à la couleur du module quand cet écran est intégré ailleurs
// (MAXI-AGRO en vert, Briqueterie en violet, etc.). Sans secteur précis (vue globale
// dans E-DÉPENSES), on retombe sur l'ambre, la couleur du module.
const THEME_PAR_SECTEUR = {
  agro:         { gradient: 'bg-gradient-to-br from-green-200/85 via-green-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-green-50/40' },
  logistique:   { gradient: 'bg-gradient-to-br from-red-200/85 via-red-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-red-50/40' },
  bat:          { gradient: 'bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-teal-50/40' },
  evenementiel: { gradient: 'bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-violet-50/40' },
  garderie:     { gradient: 'bg-gradient-to-br from-orange-200/85 via-orange-100/75 to-amber-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-orange-50/40' },
  default:      { gradient: 'bg-gradient-to-br from-amber-200/85 via-amber-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-amber-50/40' }
}

// `secteurId` optionnel : quand il est fourni (vue intégrée dans un module métier comme
// MAXI-AGRO ou la Briqueterie), l'écran est restreint à ce seul secteur. Sans lui, il
// affiche tous les secteurs (vue globale dans E-DÉPENSES).
export default function RecettesDepenses({ secteurId = null }) {
  const { data: budgets }             = useCollection('depense_budgets')
  const { data: depensesReelles }     = useCollection('depense_depenses')
  const { data: depensesProjet }      = useCollection('projet_depenses')
  const { data: projetsTous }         = useCollection('projets')
  const { data: inventairesBriq }     = useCollection('evenementiel_inventaires')
  const { data: paiementsGarderie }   = useCollection('garderie_paiements')
  const { data: facturesAgro }        = useCollection('agro_factures')
  const { data: facturesLogistique }  = useCollection('logistique_factures')
  const { data: facturesEvenementiel }= useCollection('evenementiel_factures')
  const { user, role } = useAuth()
  const lectureSeule = isReadOnlyRole(role)

  const collections = { paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel }

  // Dépenses = saisies directes + E-G.Pro + Briqueterie (comme le reste du module).
  const depenses = useMemo(() => [
    ...depensesReelles,
    ...depensesProjetVersSecteurs(depensesProjet, projetsTous),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ], [depensesReelles, depensesProjet, projetsTous, inventairesBriq])

  // Secteurs affichés : un seul (vue intégrée dans un module) ou tous (vue globale).
  const secteursAffiches = useMemo(() => secteurId ? SECTEURS.filter((s) => s.id === secteurId) : SECTEURS, [secteurId])
  const theme = THEME_PAR_SECTEUR[secteurId] || THEME_PAR_SECTEUR.default

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)
  const [modal, setModal] = useState(null) // { data } pour l'ajout de dépense
  const [saving, setSaving] = useState(false)
  // Liste détaillée dépliée : en vue mono-secteur, elle est ouverte par défaut.
  const [openSecteur, setOpenSecteur] = useState(secteurId)
  // Onglet actif : « Résumé » (par secteur, mois par mois) ou « Historique » (tout, filtrable).
  const [tab, setTab] = useState('resume')
  // Filtres de l'onglet « Historique des dépenses » (toutes périodes confondues).
  const [filtreSecteurHist, setFiltreSecteurHist] = useState('')
  const [filtreResponsable, setFiltreResponsable] = useState('')
  const [detail, setDetail] = useState(null) // dépense sélectionnée dans l'historique
  // Révision du budget alloué d'un secteur — même principe que dans l'onglet Budgets :
  // on garde une trace (ancien/nouveau/motif) au lieu d'écraser silencieusement la valeur.
  const [revision, setRevision]     = useState(null) // { id, secteurId, secteurLabel, montantActuel, revisions }
  const [revMontant, setRevMontant] = useState('')
  const [revMotif, setRevMotif]     = useState('')
  const [revSaving, setRevSaving]   = useState(false)

  const changerMois = (delta) => {
    let m = mois + delta, a = annee
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMois(m); setAnnee(a)
  }

  const parSecteur = useMemo(() => secteursAffiches.map((s) => {
    const budgetId = `${s.id}_${annee}-${String(mois).padStart(2, '0')}`
    const budgetDoc = budgets.find((b) => b.id === budgetId)
    const alloue = budgetSecteur(budgets, s.id, annee, mois)
    const recette = SECTEURS_AVEC_REVENU.includes(s.id) ? revenuSecteur(collections, s.id, annee, mois) : 0
    const lignes = depensesSecteurMois(depenses, s.id, annee, mois).sort((a, b) => (a.date < b.date ? 1 : -1))
    const depense = totalDepenses(lignes)
    return {
      ...s, recette, depense, lignes, solde: recette - depense, aRevenu: SECTEURS_AVEC_REVENU.includes(s.id),
      budgetId, alloue, revisionsBudget: budgetDoc?.revisions || []
    }
  }), [secteursAffiches, budgets, depenses, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel, annee, mois])

  const totalRecette = parSecteur.reduce((s, x) => s + x.recette, 0)
  const totalDepense = parSecteur.reduce((s, x) => s + x.depense, 0)
  const soldeGlobal  = totalRecette - totalDepense

  // ── Historique des dépenses — TOUTES les dépenses, toutes périodes confondues, y
  // compris celles saisies directement dans le module E-DÉPENSES (pas seulement le
  // mois affiché en haut). Scopé au secteur du module si intégré (agro, garderie…).
  const depensesDuScope = useMemo(
    () => secteurId ? depenses.filter((d) => d.secteurId === secteurId) : depenses,
    [depenses, secteurId]
  )

  // Liste des responsables distincts (qui a enregistré la dépense) — pour le filtre.
  const responsablesDisponibles = useMemo(
    () => [...new Set(depensesDuScope.map((d) => d.enregistrePar).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [depensesDuScope]
  )

  const historique = useMemo(() => {
    let rows = depensesDuScope
    if (!secteurId && filtreSecteurHist) rows = rows.filter((d) => d.secteurId === filtreSecteurHist)
    if (filtreResponsable) rows = rows.filter((d) => d.enregistrePar === filtreResponsable)
    return [...rows].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [depensesDuScope, secteurId, filtreSecteurHist, filtreResponsable])

  const totalHistorique = historique.reduce((s, d) => s + (Number(d.montant) || 0), 0)

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  async function enregistrer() {
    const d = modal.data
    if (!d.categorie) return toast.error('Catégorie requise')
    if (!d.montant || Number(d.montant) <= 0) return toast.error('Montant requis')
    if (!d.date) return toast.error('Date requise')
    setSaving(true)
    try {
      const id = genId()
      const secteur = SECTEURS.find((s) => s.id === d.secteurId)
      await setItem('depense_depenses', id, {
        ...d, id, montant: Number(d.montant), statut: 'decaissee',
        enregistrePar: user?.nom || '—', createdAt: Date.now()
      })
      await audit('depense', 'DEPENSE_CREATE', `${secteur?.label || d.secteurId} — ${fmt(d.montant)} FCFA (recettes & dépenses)`, { secteurId: d.secteurId, categorie: d.categorie, montant: Number(d.montant) })
      toast.success('Dépense ajoutée ✓')
      setModal(null)
    } finally { setSaving(false) }
  }

  const ouvrirRevision = (s) => {
    setRevision({ id: s.budgetId, secteurId: s.id, secteurLabel: s.label, montantActuel: s.alloue, revisions: s.revisionsBudget })
    setRevMontant(String(s.alloue || ''))
    setRevMotif('')
  }

  const confirmerRevision = async () => {
    if (!revision) return
    const nouveau = Number(revMontant)
    if (revMontant === '' || nouveau < 0) return toast.error('Montant requis')
    if (!revMotif.trim()) return toast.error('Motif requis')
    setRevSaving(true)
    try {
      const ancien = revision.montantActuel
      const entry = { id: genId(), ancien, nouveau, motif: revMotif.trim(), date: Date.now(), auteur: user?.nom || user?.login || '—' }
      const revisions = [...revision.revisions, entry]
      await setItem('depense_budgets', revision.id, {
        id: revision.id, secteurId: revision.secteurId, annee, mois, montant: nouveau, revisions, updatedAt: Date.now()
      })
      await audit('depense', 'BUDGET_REVISE', `${revision.secteurLabel} — ${fmt(ancien)} → ${fmt(nouveau)} FCFA (${revMotif.trim()})`, { secteurId: revision.secteurId, annee, mois, ancien, nouveau })
      toast.success('Budget révisé ✓')
      setRevision(null)
    } finally {
      setRevSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Bascule Résumé / Historique — deux volets distincts du même écran */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-amber-100 bg-amber-50/60 p-1">
        <button onClick={() => setTab('resume')}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${tab === 'resume' ? 'bg-white text-amber-800 shadow-sm' : 'text-amber-700/70 hover:text-amber-800'}`}>
          📊 Résumé par secteur
        </button>
        <button onClick={() => setTab('historique')}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${tab === 'historique' ? 'bg-white text-amber-800 shadow-sm' : 'text-amber-700/70 hover:text-amber-800'}`}>
          🕐 Historique des dépenses
        </button>
      </div>

      {tab === 'resume' && (
      <>
      {/* Navigation mois */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => changerMois(-1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronLeft size={16} /></button>
        <span className="text-lg font-extrabold text-gray-800">{MOIS_LABELS[mois - 1]} {annee}</span>
        <button onClick={() => changerMois(1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronRight size={16} /></button>
      </div>

      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
        Les <strong>recettes</strong> sont récupérées automatiquement des factures de chaque module (garderie, agro, logistique, briqueterie). Les <strong>dépenses</strong> peuvent être ajoutées ici par secteur — en plus de celles reprises d'E-G.Pro et de la Briqueterie.
      </div>

      {/* KPI globaux */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Recettes totales" value={`${fmt(totalRecette)} FCFA`} icon={TrendingUp} accent="#059669" />
        <StatCard title="Dépenses totales" value={`${fmt(totalDepense)} FCFA`} icon={TrendingDown} accent="#dc2626" />
        <StatCard title="Solde global" value={`${fmt(soldeGlobal)} FCFA`} sub={soldeGlobal >= 0 ? 'Excédent' : 'Déficit'}
          icon={Scale} accent={soldeGlobal >= 0 ? '#059669' : '#dc2626'} valueColor={soldeGlobal >= 0 ? '#059669' : '#dc2626'} />
      </div>

      {/* Par secteur */}
      <div className="space-y-2.5">
        {parSecteur.map((s) => {
          const ouvert = openSecteur === s.id
          return (
          <div key={s.id} className="overflow-hidden rounded-2xl border-l-4 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-gray-100" style={{ borderLeftColor: s.color }}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              {/* Cliquer sur cette zone déplie la liste détaillée des dépenses du secteur */}
              <button onClick={() => setOpenSecteur(ouvert ? null : s.id)} className="flex min-w-[150px] items-center gap-2 text-left" disabled={s.lignes.length === 0}>
                <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform ${ouvert ? 'rotate-180' : ''} ${s.lignes.length === 0 ? 'opacity-0' : ''}`} />
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="font-bold text-gray-800">{s.label}</span>
                {s.lignes.length > 0 && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">{s.lignes.length}</span>}
              </button>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="text-gray-500">Recettes {s.aRevenu
                  ? <b className="text-green-700">{fmt(s.recette)}</b>
                  : <span className="text-gray-300">— non suivi</span>}</span>
                <span className="text-gray-500">Dépenses <b className="text-amber-600">{fmt(s.depense)}</b></span>
                <span className="text-gray-500">Solde <b className={s.solde >= 0 ? 'text-green-700' : 'text-red-600'}>{s.solde >= 0 ? '+' : ''}{fmt(s.solde)}</b></span>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {s.aRevenu && (
                  <Badge tone={s.solde >= 0 ? 'success' : 'danger'}>{s.solde >= 0 ? 'Excédent' : 'Déficit'}</Badge>
                )}
                {!lectureSeule && (
                  <Button size="sm" variant="outline" onClick={() => setModal({ data: empty(s.id) })}>
                    <Plus size={14} /> Dépense
                  </Button>
                )}
              </div>
            </div>

            {/* Budget alloué pour le mois — peut être revu ou complété à tout moment ;
                cliquer affiche le détail (formulaire + historique des révisions). */}
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-2">
              <span className="text-[10px] font-semibold uppercase text-gray-400">Budget alloué</span>
              <span className="text-sm font-bold text-gray-700">
                {s.alloue > 0 ? `${fmt(s.alloue)} FCFA` : <span className="font-normal text-gray-300">Non défini</span>}
              </span>
              {!lectureSeule && (
                <button onClick={() => ouvrirRevision(s)}
                  title={s.alloue > 0 ? "Réviser ce budget (revoir ou ajouter une somme)" : "Allouer un budget à ce secteur"}
                  className="rounded-lg border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-700 shadow-sm transition-all duration-200 hover:bg-amber-50 hover:shadow-[0_0_10px_1px_rgba(180,83,9,0.45)]">
                  {s.alloue > 0 ? '🔄 Réviser' : '+ Allouer'}
                </button>
              )}
              {s.revisionsBudget.length > 0 && (
                <button onClick={() => ouvrirRevision(s)} title="Voir l'historique des révisions"
                  className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-gray-500 shadow-sm hover:bg-gray-100">
                  <History size={11} /> {s.revisionsBudget.length}
                </button>
              )}
            </div>

            {/* Liste détaillée des dépenses du secteur (dépliable) — lignes-cartes
                cliquables, comme l'onglet Historique : cliquer ouvre le détail. */}
            {ouvert && s.lignes.length > 0 && (
              <div className="space-y-1.5 border-t border-gray-100 bg-gray-50/60 px-3 py-2.5">
                {s.lignes.map((d) => (
                  <div key={d.id} onClick={() => setDetail(d)}
                    className={`group flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-gray-100 transition-shadow hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1)] ${theme.hover}`}>
                    <span className="whitespace-nowrap text-xs font-medium text-gray-500">{formatDateShort(d.date)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-700">{d.description || '—'}</p>
                      <span className="mt-0.5 inline-block rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{d.categorie || '—'}</span>
                    </div>
                    <span className="whitespace-nowrap text-[11px]">
                      {d.source === 'projet' ? <span className="font-semibold text-teal-600">E-G.Pro</span>
                        : d.source === 'briqueterie' ? <span className="font-semibold text-violet-600">Briqueterie</span>
                        : <span className="text-gray-400">Saisie</span>}
                    </span>
                    <span className="whitespace-nowrap text-sm font-extrabold text-gray-900">{fmt(d.montant)} <span className="text-[10px] font-semibold text-gray-400">FCFA</span></span>
                    <Eye size={13} className="shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
                  </div>
                ))}
              </div>
            )}
          </div>
          )
        })}
      </div>
      </>
      )}

      {tab === 'historique' && (
      /* Historique des dépenses — toutes les dépenses, toutes périodes confondues,
         y compris celles saisies directement dans le module E-DÉPENSES. Cliquer sur
         une ligne ouvre son détail, comme dans les autres volets de l'application. */
      <div className="space-y-3">
        {/* Barre de filtres */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3">
          <Filter size={15} className="shrink-0 text-amber-600" />
          {!secteurId && (
            <select value={filtreSecteurHist} onChange={(e) => setFiltreSecteurHist(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-300">
              <option value="">Tous les secteurs</option>
              {SECTEURS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          )}
          <select value={filtreResponsable} onChange={(e) => setFiltreResponsable(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-300">
            <option value="">Tous les responsables</option>
            {responsablesDisponibles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="rounded-full bg-white px-2.5 py-1 font-bold text-gray-500 shadow-sm">{historique.length} dépense{historique.length > 1 ? 's' : ''}</span>
            <span className="rounded-full bg-white px-2.5 py-1 font-bold text-amber-700 shadow-sm">{fmt(totalHistorique)} FCFA</span>
          </div>
        </div>

        {/* Liste — lignes-cartes cliquables (comme le reste du module) */}
        {historique.length === 0 ? (
          <Card>
            <p className="py-10 text-center text-sm text-gray-400">Aucune dépense ne correspond à ces filtres.</p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-sm">
              <tbody>
                {historique.map((d) => {
                  const sect = SECTEURS.find((s) => s.id === d.secteurId)
                  const sectColor = sect?.color || '#64748b'
                  return (
                    <tr key={d.id} onClick={() => setDetail(d)}
                      className={`group cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-gray-100 transition-shadow hover:shadow-[0_6px_16px_-6px_rgba(0,0,0,0.12)] ${theme.hover}`}>
                      <td className="rounded-l-2xl border-l-[3px] bg-white px-4 py-2.5 align-middle" style={{ borderColor: sectColor }}>
                        <p className="whitespace-nowrap text-xs font-semibold text-gray-500">{formatDateShort(d.date)}</p>
                        {!secteurId && (
                          <span className="mt-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: sectColor + '18', color: sectColor }}>
                            {sect?.label || d.secteurId}
                          </span>
                        )}
                      </td>
                      <td className="bg-white px-4 py-2.5 align-middle">
                        <p className="line-clamp-1 max-w-[280px] font-medium text-gray-700">{d.description || '—'}</p>
                        <span className="mt-0.5 inline-block rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{d.categorie || '—'}</span>
                      </td>
                      <td className="bg-white px-4 py-2.5 align-middle text-xs text-gray-500">✍️ <span className="font-semibold text-gray-600">{d.enregistrePar || '—'}</span></td>
                      <td className="whitespace-nowrap bg-white px-4 py-2.5 text-right align-middle">
                        <span className="text-sm font-extrabold text-gray-900">{fmt(d.montant)}</span>
                        <span className="ml-0.5 text-[10px] font-semibold text-gray-400">FCFA</span>
                      </td>
                      <td className="whitespace-nowrap rounded-r-2xl bg-white px-4 py-2.5 text-right align-middle text-[11px]">
                        {d.source === 'projet' ? <span className="font-semibold text-teal-600">E-G.Pro</span>
                          : d.source === 'briqueterie' ? <span className="font-semibold text-violet-600">Briqueterie</span>
                          : <span className="text-gray-400">Saisie</span>}
                        <Eye size={13} className="ml-2 inline text-gray-300 transition-colors group-hover:text-gray-500" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Modal ajout dépense */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="sm" title="Ajouter une dépense"
        panelClassName={theme.gradient}
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={enregistrer} loading={saving}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            {/* Secteur concerné */}
            <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-white px-3 py-2.5 text-sm">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: SECTEURS.find((s) => s.id === modal.data.secteurId)?.color }} />
              <span className="text-gray-500">Secteur :</span>
              <span className="font-bold text-gray-800">{SECTEURS.find((s) => s.id === modal.data.secteurId)?.label}</span>
            </div>

            {/* Détails de la dépense */}
            <div className="rounded-xl border border-amber-100 bg-white p-3 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">💰 Détails de la dépense</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Date</label>
                  <input type="date" value={modal.data.date} onChange={(e) => set('date', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Montant (FCFA) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" value={modal.data.montant} onChange={(e) => set('montant', e.target.value)}
                    placeholder="0" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Catégorie <span className="text-red-500">*</span></label>
                <select value={modal.data.categorie} onChange={(e) => set('categorie', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300">
                  <option value="">— Choisir —</option>
                  {CATEGORIES_DEPENSE.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Description</label>
                <input value={modal.data.description} onChange={(e) => set('description', e.target.value)}
                  placeholder="Ex : achat de fournitures" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
            </div>

            {/* Classification */}
            <div className="rounded-xl border border-amber-100 bg-white p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">📊 Classification</p>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Nature de flux</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(NATURES_FLUX).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => set('natureFlux', k)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${modal.data.natureFlux === k ? 'border-amber-400 bg-white text-amber-800' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
                    title={v.desc}>
                    {modal.data.natureFlux === k ? '✓ ' : ''}{v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Détail d'une dépense de l'historique — même principe que dans les autres volets */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="md" title="Détail de la dépense"
        panelClassName={theme.gradient}
        footer={<Button variant="outline" onClick={() => setDetail(null)}>Fermer</Button>}>
        {detail && (() => {
          const sect = SECTEURS.find((s) => s.id === detail.secteurId)
          const statut = STATUTS_DECAISSEMENT[detail.statut] || STATUTS_DECAISSEMENT.decaissee
          const nature = NATURES_FLUX[detail.natureFlux || natureFluxDefaut]
          const depuisProjet = detail.source === 'projet'
          const depuisBriqueterie = detail.source === 'briqueterie'
          return (
            <div className="space-y-3 text-sm">
              {/* En-tête : montant + statut */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-3xl font-black leading-none text-gray-900">
                      {fmt(detail.montant)}<span className="ml-1 text-sm font-bold text-gray-400">FCFA</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={nature.tone}>{nature.label}</Badge>
                      {depuisProjet && <Badge tone="info">🔗 Depuis E-G.Pro</Badge>}
                      {depuisBriqueterie && <Badge tone="info">🔗 Coût matières Briqueterie</Badge>}
                    </div>
                  </div>
                  <Badge tone={statut.tone}>{statut.label}</Badge>
                </div>
              </div>

              {/* Infos clés en tuiles */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Date</p>
                  <p className="mt-0.5 font-bold text-gray-800">{formatDateShort(detail.date)}</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Secteur</p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-bold text-gray-800">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: sect?.color || '#64748b' }} />
                    {sect?.label || detail.secteurId}
                  </p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Catégorie</p>
                  <p className="mt-0.5 font-bold text-gray-800">{detail.categorie || '—'}</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Origine</p>
                  <p className="mt-0.5 font-bold text-gray-800">
                    {depuisProjet ? 'E-G.Pro' : depuisBriqueterie ? 'Briqueterie' : 'Saisie directe'}
                  </p>
                </div>
              </div>

              {/* Projet / tâche (dépenses récupérées d'E-G.Pro) */}
              {depuisProjet && (detail.projetNom || detail.tacheTitre) && (
                <div className="rounded-2xl border-l-4 border-teal-400 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600">📋 Projet concerné</p>
                  <p className="mt-1 font-bold text-gray-800">{detail.projetNom || '—'}</p>
                  {detail.tacheTitre && <p className="mt-1 text-gray-600">🔧 <span className="font-medium">{detail.tacheTitre}</span></p>}
                  {detail.noteOrigine && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs italic text-gray-600">« {detail.noteOrigine} »</p>}
                </div>
              )}

              {/* Description (dépenses saisies directement) */}
              {!depuisProjet && (
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Description</p>
                  <p className="mt-1 font-medium text-gray-700">{detail.description || '—'}</p>
                </div>
              )}

              {/* Traçabilité */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Traçabilité</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                    ✍️ {detail.enregistrePar || '—'}
                  </span>
                  {detail.beneficiaireNom && (
                    <>
                      <span className="text-gray-300">→</span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800">
                        👤 {detail.beneficiaireNom}{detail.beneficiaireFonction ? ` · ${detail.beneficiaireFonction}` : ''}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {detail.piece && (
                <button onClick={() => ouvrirPiece(detail.piece)} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-primary shadow-sm hover:bg-primary/5">
                  <Paperclip size={14} /> Voir le justificatif
                </button>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* Révision du budget alloué d'un secteur */}
      <Modal open={!!revision} onClose={() => setRevision(null)} size="sm"
        title={revision ? `Réviser le budget — ${revision.secteurLabel}` : 'Réviser le budget'}
        panelClassName={theme.gradient}>
        {revision && (
          <div className="space-y-4">
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-gray-400">Budget actuel</p>
                  <p className="text-sm font-bold text-gray-700">{fmt(revision.montantActuel)} FCFA</p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Nouveau montant (FCFA)</label>
                  <input type="number" min="0" value={revMontant} onChange={(e) => setRevMontant(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="0" />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Motif de la révision</label>
                <input value={revMotif} onChange={(e) => setRevMotif(e.target.value)}
                  placeholder="ex : Ajustement suite à hausse des prix, apport supplémentaire du PAU…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={confirmerRevision} loading={revSaving}>Confirmer la révision</Button>
              </div>
            </div>

            {revision.revisions.length > 0 && (
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-gray-400"><History size={12} /> Historique des révisions</p>
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {[...revision.revisions].reverse().map((r) => (
                    <div key={r.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs">
                      <p className="font-semibold text-gray-700">{fmt(r.ancien)} → {fmt(r.nouveau)} FCFA</p>
                      <p className="mt-0.5 text-gray-600">{r.motif}</p>
                      <p className="mt-0.5 text-[10px] text-gray-400">par {r.auteur || '—'} · {formatDateTime(r.date)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

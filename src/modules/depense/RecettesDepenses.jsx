// Bilan par secteur — vue financière mensuelle complète, par secteur.
// Fusion des anciens écrans « Budgets » et « Recettes & Dépenses » :
//  • RECETTES récupérées automatiquement des factures de chaque module (lecture seule) ;
//  • DÉPENSES du secteur (saisies dans E-DÉPENSES + reprises d'E-G.Pro et Briqueterie) ;
//  • SOLDE (recette − dépense), BUDGET alloué (avec révision tracée) + reste & % consommé.
// La SAISIE des dépenses reste dans l'écran « Dépenses » ; ici on pilote le bilan.
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Scale, Eye, Paperclip, History, Wallet, Plus, Trash2 } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isReadOnlyRole, FULL_ACCESS_ROLES, depenseRoleEffectif } from '../../core/roles'
import { setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { genId, formatDateShort, formatDateTime, todayStr } from '../../utils/formatters'
import { ouvrirPiece } from '../../utils/fichiers'
import { SECTEURS, MOIS_LABELS, NATURES_FLUX, natureFluxDefaut, STATUTS_DECAISSEMENT } from './data'
import { budgetSecteur, depensesSecteurMois, totalDepenses, statutBudget, depensesProjetVersSecteurs, coutsMatieresBriqueterie, revenuPauSecteurMois, versementsClientVersSecteurs, revenuClientSecteurMois, revenuManuelSecteurMois } from './logic'
import { revenuSecteur, SECTEURS_AVEC_REVENU } from './revenus'

const now = new Date()
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')

// Thème visuel (panneau de détail + survol) selon le secteur affiché — pour que le
// design s'accorde à la couleur du module quand cet écran est intégré ailleurs.
const THEME_PAR_SECTEUR = {
  agro:         { gradient: 'bg-gradient-to-br from-green-200/85 via-green-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-green-50/40' },
  logistique:   { gradient: 'bg-gradient-to-br from-red-200/85 via-red-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-red-50/40' },
  bat:          { gradient: 'bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-teal-50/40' },
  evenementiel: { gradient: 'bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-violet-50/40' },
  garderie:     { gradient: 'bg-gradient-to-br from-orange-200/85 via-orange-100/75 to-amber-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-orange-50/40' },
  default:      { gradient: 'bg-gradient-to-br from-amber-200/85 via-amber-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200', hover: 'hover:bg-amber-50/40' }
}

const badgePct = (statut) => statut.key === 'depasse' ? 'bg-red-100 text-red-700'
  : statut.key === 'attention' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
const barColor = (statut) => statut.key === 'depasse' ? 'bg-red-500'
  : statut.key === 'attention' ? 'bg-amber-500' : 'bg-teal-500'

// `secteurId` optionnel : quand il est fourni (vue intégrée dans un module métier), l'écran
// est restreint à ce seul secteur. Sans lui, il affiche tous les secteurs (E-DÉPENSES).
// `masquerRevenu` : vue « Dépense » pure pour les modules intégrés — cache les revenus/solde
// et rend le budget en lecture seule (l'allocation ne se fait que depuis E-DÉPENSES).
export default function RecettesDepenses({ secteurId = null, masquerRevenu = false }) {
  const { data: budgets }             = useCollection('depense_budgets')
  const { data: depensesReelles }     = useCollection('depense_depenses')
  const { data: depensesProjet }      = useCollection('projet_depenses')
  const { data: projetsTous }         = useCollection('projets')
  const { data: versementsClientTous }= useCollection('projet_versements_client')
  const { data: revenusManuelsTous }  = useCollection('depense_revenus_manuels')
  const { data: inventairesBriq }     = useCollection('evenementiel_inventaires')
  const { data: paiementsGarderie }   = useCollection('garderie_paiements')
  const { data: facturesAgro }        = useCollection('agro_factures')
  const { data: facturesLogistique }  = useCollection('logistique_factures')
  const { data: facturesEvenementiel }= useCollection('evenementiel_factures')
  const { user, role: roleReel } = useAuth()
  // Écran partagé : embarqué dans d'autres modules via `secteurId` (leur onglet
  // « Dépense »), où la restriction E-DÉPENSES ne s'applique pas. Seule l'instance
  // standalone d'E-DÉPENSES (« Revenus & Budget », sans secteurId) ramène
  // super_admin/admin/directeur au niveau agent (cf. depenseRoleEffectif).
  const role = secteurId ? roleReel : depenseRoleEffectif(roleReel)
  const lectureSeule = isReadOnlyRole(role)

  const collections = { paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel }

  // Dépenses = saisies directes + E-G.Pro + Briqueterie (comme le reste du module).
  const depenses = useMemo(() => [
    ...depensesReelles,
    ...depensesProjetVersSecteurs(depensesProjet, projetsTous),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ], [depensesReelles, depensesProjet, projetsTous, inventairesBriq])

  // Versements clients des projets E-G.Pro, routés par secteur — comptés en revenu.
  const versementsClientRoutes = useMemo(() => versementsClientVersSecteurs(versementsClientTous, projetsTous),
    [versementsClientTous, projetsTous])

  const secteursAffiches = useMemo(() => secteurId ? SECTEURS.filter((s) => s.id === secteurId) : SECTEURS, [secteurId])
  const theme = THEME_PAR_SECTEUR[secteurId] || THEME_PAR_SECTEUR.default

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)
  const [detail, setDetail] = useState(null) // dépense sélectionnée (détail lecture seule)
  const [secteurDetail, setSecteurDetail] = useState(null) // secteur sélectionné (détail financier)
  // Révision du budget alloué d'un secteur — garde une trace (ancien/nouveau/motif).
  const [revision, setRevision]     = useState(null)
  const [revMontant, setRevMontant] = useState('')
  const [revMotif, setRevMotif]     = useState('')
  const [revSaving, setRevSaving]   = useState(false)
  // Ajout manuel d'un revenu — pour les secteurs sans facturation automatique
  // (Hors secteur, MAXI BAT) : { secteurId, montant, date, description }.
  const [ajoutRevenu, setAjoutRevenu] = useState(null)
  const [revenuSaving, setRevenuSaving] = useState(false)

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
    const recette = revenuSecteur(collections, s.id, annee, mois, depenses, versementsClientRoutes, revenusManuelsTous)
    const apportPau = revenuPauSecteurMois(depenses, s.id, annee, mois)
    const versementsClient = revenuClientSecteurMois(versementsClientRoutes, s.id, annee, mois)
    const revenuManuel = revenuManuelSecteurMois(revenusManuelsTous, s.id, annee, mois)
    const revenusManuelsDuMois = revenusManuelsTous
      .filter((r) => r.secteurId === s.id && (r.date || '').startsWith(`${annee}-${String(mois).padStart(2, '0')}`))
      .sort((a, b) => (b.date || 0) - (a.date || 0))
    const lignes = depensesSecteurMois(depenses, s.id, annee, mois).sort((a, b) => (a.date < b.date ? 1 : -1))
    const depense = totalDepenses(lignes)
    const pct = alloue > 0 ? Math.round((depense / alloue) * 100) : (depense > 0 ? 100 : 0)
    return {
      ...s, recette, apportPau, versementsClient, revenuManuel, revenusManuelsDuMois, depense, lignes, solde: recette - depense,
      budgetId, alloue, reste: alloue - depense, pct, statut: statutBudget(pct), revisionsBudget: budgetDoc?.revisions || []
    }
  }), [secteursAffiches, budgets, depenses, versementsClientRoutes, revenusManuelsTous, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel, annee, mois])

  // Ouverture directe du détail d'un secteur depuis l'alerte du Dashboard (clic sur une
  // carte secteur « à surveiller ») — évite de devoir le rechercher dans la liste.
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (location.state?.annee && location.state?.mois) { setAnnee(location.state.annee); setMois(location.state.mois) }
  }, [location.state])
  useEffect(() => {
    const id = location.state?.openSecteurId
    if (!id) return
    // Attend que le mois demandé soit bien appliqué (effet ci-dessus) avant d'ouvrir,
    // pour que le détail affiché corresponde au bon mois plutôt qu'au mois par défaut.
    const { annee: wantAnnee, mois: wantMois } = location.state
    if ((wantAnnee && wantAnnee !== annee) || (wantMois && wantMois !== mois)) return
    const s = parSecteur.find((x) => x.id === id)
    if (s) setSecteurDetail(s)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state, parSecteur, annee, mois])

  const totalRecette = parSecteur.reduce((s, x) => s + x.recette, 0)
  const totalDepense = parSecteur.reduce((s, x) => s + x.depense, 0)
  const soldeGlobal  = totalRecette - totalDepense
  const totalAlloue  = parSecteur.reduce((s, x) => s + x.alloue, 0)
  const totalReste   = totalAlloue - totalDepense

  const ouvrirRevision = (s) => {
    setRevision({ id: s.budgetId, secteurId: s.id, secteurLabel: s.label, montantActuel: s.alloue, revisions: s.revisionsBudget })
    setRevMontant(String(s.alloue || ''))
    setRevMotif('')
  }

  const confirmerRevision = async () => {
    if (!revision) return
    const nouveau = Number(revMontant)
    if (revMontant === '' || nouveau < 0) return toast.error('Montant requis')
    // Première allocation (aucun budget encore) → pas de motif exigé. Révision d'un
    // budget existant → motif obligatoire (traçabilité du changement).
    const estAllocation = revision.montantActuel === 0
    if (!estAllocation && !revMotif.trim()) return toast.error('Motif de révision requis')
    const motif = revMotif.trim() || 'Allocation initiale'
    setRevSaving(true)
    try {
      const ancien = revision.montantActuel
      const entry = { id: genId(), ancien, nouveau, motif, date: Date.now(), auteur: user?.nom || user?.login || '—' }
      const revisions = [...revision.revisions, entry]
      await setItem('depense_budgets', revision.id, {
        id: revision.id, secteurId: revision.secteurId, annee, mois, montant: nouveau, revisions, updatedAt: Date.now()
      })
      await audit('depense', estAllocation ? 'BUDGET_ALLOUE' : 'BUDGET_REVISE',
        estAllocation
          ? `${revision.secteurLabel} — budget alloué ${fmt(nouveau)} FCFA`
          : `${revision.secteurLabel} — ${fmt(ancien)} → ${fmt(nouveau)} FCFA (${motif})`,
        { secteurId: revision.secteurId, annee, mois, ancien, nouveau })
      // Réservé à l'administration : montant alloué/révisé pour un secteur.
      await notify({
        type: 'info',
        title: estAllocation ? `💰 Budget alloué — ${revision.secteurLabel}` : `🔄 Budget révisé — ${revision.secteurLabel}`,
        body: estAllocation ? `${fmt(nouveau)} FCFA alloués pour ${MOIS_LABELS[mois - 1]} ${annee}.` : `${fmt(ancien)} → ${fmt(nouveau)} FCFA — ${motif}`,
        module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid,
        link: '/depense/recettes-depenses', state: { openSecteurId: revision.secteurId, annee, mois }
      }).catch(() => {})
      toast.success(estAllocation ? 'Budget alloué ✓' : 'Budget révisé ✓')
      setRevision(null)
    } finally {
      setRevSaving(false)
    }
  }

  // Suppression du budget alloué d'un secteur pour le mois → retour à « Non défini ».
  const supprimerBudget = async () => {
    if (!revision) return
    if (!window.confirm(`Supprimer le budget alloué de ${revision.secteurLabel} pour ${MOIS_LABELS[mois - 1]} ${annee} ?\nLe secteur repassera à « Non défini » (l'historique des révisions sera perdu).`)) return
    setRevSaving(true)
    try {
      await removeItem('depense_budgets', revision.id)
      await audit('depense', 'BUDGET_SUPPRIME', `${revision.secteurLabel} — budget supprimé (${MOIS_LABELS[mois - 1]} ${annee})`, { secteurId: revision.secteurId, annee, mois })
      toast.success('Budget supprimé ✓')
      setRevision(null)
    } finally {
      setRevSaving(false)
    }
  }

  // Ajout manuel d'un revenu — réservé aux secteurs sans facturation automatique
  // (Hors secteur, MAXI BAT) ; le secteur se choisit dans le formulaire.
  const secteursSansRevenuAuto = useMemo(() => SECTEURS.filter((s) => !SECTEURS_AVEC_REVENU.includes(s.id)), [])
  const ouvrirAjoutRevenu = () => setAjoutRevenu({ secteurId: secteursSansRevenuAuto[0]?.id || '', montant: '', date: todayStr(), description: '' })

  const confirmerAjoutRevenu = async () => {
    if (!ajoutRevenu) return
    const montant = Number(ajoutRevenu.montant)
    if (!ajoutRevenu.secteurId) return toast.error('Secteur requis')
    if (!ajoutRevenu.montant || montant <= 0) return toast.error('Montant requis')
    if (!ajoutRevenu.date) return toast.error('Date requise')
    const secteurLabel = SECTEURS.find((s) => s.id === ajoutRevenu.secteurId)?.label || ajoutRevenu.secteurId
    setRevenuSaving(true)
    try {
      const id = genId()
      await setItem('depense_revenus_manuels', id, {
        id, secteurId: ajoutRevenu.secteurId, montant,
        date: ajoutRevenu.date, description: ajoutRevenu.description.trim(),
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
      })
      await audit('depense', 'REVENU_MANUEL_AJOUTE', `${secteurLabel} — ${fmt(montant)} FCFA${ajoutRevenu.description ? ' — ' + ajoutRevenu.description.trim() : ''}`, { secteurId: ajoutRevenu.secteurId, montant })
      toast.success('Revenu ajouté ✓')
      setAjoutRevenu(null)
    } finally {
      setRevenuSaving(false)
    }
  }

  const supprimerRevenuManuel = async (r) => {
    if (!window.confirm(`Supprimer ce revenu de ${fmt(r.montant)} FCFA ?`)) return
    await removeItem('depense_revenus_manuels', r.id)
    await audit('depense', 'REVENU_MANUEL_SUPPRIME', `${fmt(r.montant)} FCFA`, { secteurId: r.secteurId })
  }

  return (
    <div className="space-y-5">
      {/* Navigation mois */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => changerMois(-1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronLeft size={16} /></button>
        <span className="text-lg font-extrabold text-gray-800">{MOIS_LABELS[mois - 1]} {annee}</span>
        <button onClick={() => changerMois(1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronRight size={16} /></button>
        {!masquerRevenu && !lectureSeule && (
          <Button onClick={ouvrirAjoutRevenu} size="sm" className="ml-auto"><Plus size={14} className="mr-1" />Ajouter un revenu</Button>
        )}
      </div>

      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
        {masquerRevenu
          ? <>Suivi des <strong>dépenses</strong> de ce secteur face au <strong>budget alloué</strong> depuis E-DÉPENSES (reste & % consommé). L'allocation du budget se fait uniquement dans E-DÉPENSES ; la <strong>saisie</strong> des dépenses se fait dans l'écran <strong>Dépenses</strong>.</>
          : <>Bilan financier par secteur : les <strong>revenus</strong> (factures des modules + apports du PAU comptés en revenu) croisés aux <strong>dépenses</strong> donnent le <strong>solde</strong>, comparé au <strong>budget alloué</strong> (reste & % consommé). La <strong>saisie</strong> des dépenses se fait dans l'écran <strong>Dépenses</strong>.</>}
      </div>

      {/* KPI globaux */}
      <div className={`grid gap-3 sm:grid-cols-2 ${masquerRevenu ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        {!masquerRevenu && <StatCard title="Revenus totaux" value={`${fmt(totalRecette)} FCFA`} icon={TrendingUp} accent="#059669" />}
        <StatCard title="Dépenses totales" value={`${fmt(totalDepense)} FCFA`} icon={TrendingDown} accent="#dc2626" />
        {!masquerRevenu && (
          <StatCard title="Solde global" value={`${fmt(soldeGlobal)} FCFA`} sub={soldeGlobal >= 0 ? 'Excédent' : 'Déficit'}
            icon={Scale} accent={soldeGlobal >= 0 ? '#059669' : '#dc2626'} valueColor={soldeGlobal >= 0 ? '#059669' : '#dc2626'} />
        )}
        <StatCard title="Budget alloué" value={`${fmt(totalAlloue)} FCFA`}
          sub={totalReste < 0 ? '⚠ Budget dépassé' : `Reste ${fmt(totalReste)} FCFA`}
          icon={Wallet} accent={totalReste < 0 ? '#dc2626' : '#B45309'} valueColor={totalReste < 0 ? '#dc2626' : undefined} />
        {masquerRevenu && (
          <StatCard title="Reste" value={`${fmt(totalReste)} FCFA`} sub={totalReste < 0 ? '⚠ Budget dépassé' : undefined}
            icon={Scale} accent={totalReste < 0 ? '#dc2626' : '#0d9488'} valueColor={totalReste < 0 ? '#dc2626' : undefined} />
        )}
      </div>

      {/* Par secteur */}
      <div className="space-y-2.5">
        {parSecteur.map((s) => (
          <div key={s.id} className="overflow-hidden rounded-2xl border-l-4 bg-white/80 shadow-[0_16px_38px_-18px_rgba(26,26,26,0.20)] ring-1 ring-gray-100 backdrop-blur-xl backdrop-saturate-150 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_52px_-18px_rgba(26,26,26,0.30)]" style={{ borderLeftColor: s.color }}>
            {/* Toute la ligne est cliquable → détail financier du secteur */}
            <button onClick={() => setSecteurDetail(s)}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-gray-50/40">
              <div className="flex min-w-[150px] items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="font-bold text-gray-800">{s.label}</span>
                {s.lignes.length > 0 && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">{s.lignes.length}</span>}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {!masquerRevenu && <span className="text-gray-500">Revenus <b className="text-green-700">{fmt(s.recette)}</b></span>}
                <span className="text-gray-500">Dépenses <b className="text-amber-600">{fmt(s.depense)}</b></span>
                {!masquerRevenu && <span className="text-gray-500">Solde <b className={s.solde >= 0 ? 'text-green-700' : 'text-red-600'}>{s.solde >= 0 ? '+' : ''}{fmt(s.solde)}</b></span>}
              </div>

              <div className="ml-auto flex items-center gap-2">
                {!masquerRevenu && <Badge tone={s.solde >= 0 ? 'success' : 'danger'}>{s.solde >= 0 ? 'Excédent' : 'Déficit'}</Badge>}
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            </button>

            {/* Budget alloué + consommation (fusion de l'ancien écran Budgets) */}
            <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase text-gray-400">Budget</span>
                <span className="text-sm font-bold text-gray-700">
                  {s.alloue > 0 ? `${fmt(s.alloue)} FCFA` : <span className="font-normal text-gray-300">Non défini</span>}
                </span>
                {!lectureSeule && !masquerRevenu && (
                  s.alloue > 0 ? (
                    <button onClick={() => ouvrirRevision(s)} title="Réviser ce budget (revoir ou ajouter une somme)"
                      className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm transition-all duration-200 hover:bg-amber-50 hover:shadow-[0_0_10px_1px_rgba(180,83,9,0.45)]">
                      🔄 Réviser
                    </button>
                  ) : (
                    <button onClick={() => ouvrirRevision(s)} title="Allouer un budget à ce secteur"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold text-white shadow-[0_4px_12px_-2px_rgba(180,83,9,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-[0_7px_18px_-4px_rgba(180,83,9,0.7)]">
                      <span className="text-sm leading-none">＋</span> Allouer un budget
                    </button>
                  )
                )}
                {!masquerRevenu && s.revisionsBudget.length > 0 && (
                  <button onClick={() => ouvrirRevision(s)} title="Voir l'historique des révisions"
                    className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-gray-500 shadow-sm hover:bg-gray-100">
                    <History size={11} /> {s.revisionsBudget.length}
                  </button>
                )}
                {s.alloue > 0 && (
                  <span className="ml-auto flex items-center gap-3 text-xs">
                    <span className="text-gray-500">Reste <b className={s.reste < 0 ? 'text-red-600' : 'text-green-600'}>{fmt(s.reste)}</b></span>
                    <span className={`rounded-full px-2 py-0.5 font-bold ${badgePct(s.statut)}`}>{s.pct}%</span>
                  </span>
                )}
              </div>
              {s.alloue > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-1.5 rounded-full transition-all ${barColor(s.statut)}`} style={{ width: `${Math.min(100, s.pct)}%` }} />
                </div>
              )}
            </div>

            {/* Revenu manuel — indication seule ; l'ajout se fait via le bouton en haut de l'écran */}
            {!masquerRevenu && !SECTEURS_AVEC_REVENU.includes(s.id) && s.revenuManuel > 0 && (
              <div className="border-t border-gray-100 bg-violet-50/40 px-4 py-2">
                <span className="text-[11px] text-violet-600">✍️ dont {fmt(s.revenuManuel)} FCFA saisis manuellement ce mois</span>
              </div>
            )}

          </div>
        ))}
      </div>

      {/* Détail d'une dépense — lecture seule */}
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

              {depuisProjet && (detail.projetNom || detail.tacheTitre) && (
                <div className="rounded-2xl border-l-4 border-teal-400 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600">📋 Projet concerné</p>
                  <p className="mt-1 font-bold text-gray-800">{detail.projetNom || '—'}</p>
                  {detail.tacheTitre && <p className="mt-1 text-gray-600">🔧 <span className="font-medium">{detail.tacheTitre}</span></p>}
                  {detail.noteOrigine && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs italic text-gray-600">« {detail.noteOrigine} »</p>}
                </div>
              )}

              {!depuisProjet && (
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Description</p>
                  <p className="mt-1 font-medium text-gray-700">{detail.description || '—'}</p>
                </div>
              )}

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

      {/* Détail financier d'un secteur — récapitulatif complet du mois */}
      <Modal open={!!secteurDetail} onClose={() => setSecteurDetail(null)} size="md"
        title={secteurDetail ? `Détail financier — ${secteurDetail.label} · ${MOIS_LABELS[mois - 1]} ${annee}` : 'Détail'}
        panelClassName={theme.gradient}
        footer={<Button variant="outline" onClick={() => setSecteurDetail(null)}>Fermer</Button>}>
        {secteurDetail && (
          <div className="space-y-3 text-sm">
            {/* Solde (ou dépensé, en vue « Dépense » seule) en tête */}
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: secteurDetail.color }} />
                <span className="font-bold text-gray-800">{secteurDetail.label}</span>
                {!masquerRevenu && <Badge tone={secteurDetail.solde >= 0 ? 'success' : 'danger'}>{secteurDetail.solde >= 0 ? 'Excédent' : 'Déficit'}</Badge>}
              </div>
              {masquerRevenu ? (
                <>
                  <p className="mt-2 text-3xl font-black leading-none text-amber-600">
                    {fmt(secteurDetail.depense)}<span className="ml-1 text-sm font-bold text-gray-400">FCFA</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">Dépensé ce mois</p>
                </>
              ) : (
                <>
                  <p className={`mt-2 text-3xl font-black leading-none ${secteurDetail.solde >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {secteurDetail.solde >= 0 ? '+' : ''}{fmt(secteurDetail.solde)}<span className="ml-1 text-sm font-bold text-gray-400">FCFA</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">Solde du mois (revenus − dépenses)</p>
                </>
              )}
            </div>

            {/* Tuiles chiffrées */}
            <div className="grid grid-cols-2 gap-2">
              {!masquerRevenu && (
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Revenus</p>
                  <p className="mt-0.5 font-bold text-green-700">{fmt(secteurDetail.recette)} FCFA</p>
                  {secteurDetail.apportPau > 0 && (
                    <p className="mt-0.5 text-[10px] text-violet-600">💜 dont {fmt(secteurDetail.apportPau)} FCFA d'apport du PAU</p>
                  )}
                  {secteurDetail.versementsClient > 0 && (
                    <p className="mt-0.5 text-[10px] text-teal-600">🧑‍💼 dont {fmt(secteurDetail.versementsClient)} FCFA reçus de clients (projets)</p>
                  )}
                  {secteurDetail.revenuManuel > 0 && (
                    <p className="mt-0.5 text-[10px] text-violet-600">✍️ dont {fmt(secteurDetail.revenuManuel)} FCFA saisis manuellement</p>
                  )}
                </div>
              )}
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Dépenses</p>
                <p className="mt-0.5 font-bold text-amber-600">{fmt(secteurDetail.depense)} FCFA</p>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Budget alloué</p>
                <p className="mt-0.5 font-bold text-gray-800">{secteurDetail.alloue > 0 ? `${fmt(secteurDetail.alloue)} FCFA` : <span className="font-normal text-gray-300">Non défini</span>}</p>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Reste sur budget</p>
                <p className={`mt-0.5 font-bold ${secteurDetail.reste < 0 ? 'text-red-600' : 'text-green-600'}`}>{secteurDetail.alloue > 0 ? `${fmt(secteurDetail.reste)} FCFA` : '—'}</p>
              </div>
            </div>

            {/* Consommation du budget */}
            {secteurDetail.alloue > 0 && (
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Consommation du budget</span>
                  <span className={`rounded-full px-2 py-0.5 font-bold ${badgePct(secteurDetail.statut)}`}>{secteurDetail.pct}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-2 rounded-full ${barColor(secteurDetail.statut)}`} style={{ width: `${Math.min(100, secteurDetail.pct)}%` }} />
                </div>
              </div>
            )}

            {/* Revenus manuels du mois — ajout/suppression directs */}
            {!masquerRevenu && secteurDetail.revenusManuelsDuMois?.length > 0 && (
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Revenus saisis manuellement ({secteurDetail.revenusManuelsDuMois.length})</p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {secteurDetail.revenusManuelsDuMois.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 rounded-lg bg-violet-50/60 px-2.5 py-1.5 text-xs">
                      <span className="whitespace-nowrap text-gray-500">{formatDateShort(r.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-gray-700">{r.description || '—'}</span>
                      <span className="whitespace-nowrap font-bold text-violet-700">{fmt(r.montant)}</span>
                      {!lectureSeule && (
                        <button onClick={() => supprimerRevenuManuel(r)} title="Supprimer"
                          className="shrink-0 rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={12} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Liste des dépenses du mois — clic → détail de la dépense */}
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Dépenses du mois ({secteurDetail.lignes.length})</p>
              {secteurDetail.lignes.length === 0 ? (
                <p className="py-2 text-center text-xs text-gray-400">Aucune dépense enregistrée ce mois.</p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {secteurDetail.lignes.map((d) => (
                    <div key={d.id} onClick={() => { setSecteurDetail(null); setDetail(d) }}
                      className={`group flex cursor-pointer items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs transition-colors ${theme.hover}`}>
                      <span className="whitespace-nowrap text-gray-500">{formatDateShort(d.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-gray-700">{d.description || '—'}</span>
                      <span className="whitespace-nowrap font-bold text-gray-900">{fmt(d.montant)}</span>
                      <Eye size={12} className="shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Allocation (1ère fois) ou Révision (budget existant) du budget d'un secteur */}
      <Modal open={!!revision} onClose={() => setRevision(null)} size="sm"
        title={revision ? `${revision.montantActuel > 0 ? 'Réviser' : 'Allouer'} le budget — ${revision.secteurLabel}` : 'Budget'}
        panelClassName={theme.gradient}>
        {revision && (() => {
          const estAllocation = revision.montantActuel === 0
          return (
          <div className="space-y-4">
            <div className="rounded-xl bg-white p-3 shadow-sm">
              {estAllocation ? (
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Montant à allouer (FCFA)</label>
                  <input type="number" min="0" value={revMontant} onChange={(e) => setRevMontant(e.target.value)} autoFocus
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="0" />
                  <p className="mt-1 text-[11px] text-gray-400">Première allocation du mois — aucun motif requis.</p>
                </div>
              ) : (
                <>
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
                </>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                {revision.montantActuel > 0 && !lectureSeule
                  ? <Button size="sm" variant="danger" onClick={supprimerBudget} loading={revSaving}>🗑️ Supprimer le budget</Button>
                  : <span />}
                <Button size="sm" onClick={confirmerRevision} loading={revSaving}>{estAllocation ? 'Allouer' : 'Confirmer la révision'}</Button>
              </div>
            </div>

            {revision.revisions.length > 0 && (
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-gray-400"><History size={12} /> Historique des allocations & révisions</p>
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
          )
        })()}
      </Modal>

      {/* Ajout manuel d'un revenu */}
      <Modal open={!!ajoutRevenu} onClose={() => setAjoutRevenu(null)} size="sm"
        title="Ajouter un revenu"
        panelClassName={theme.gradient}>
        {ajoutRevenu && (
          <div className="space-y-3">
            <div className="rounded-xl bg-white p-3 shadow-sm space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Secteur</label>
                <select value={ajoutRevenu.secteurId} onChange={(e) => setAjoutRevenu((r) => ({ ...r, secteurId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-300">
                  {secteursSansRevenuAuto.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-gray-400">Réservé aux secteurs sans facturation automatique — les autres ont déjà leur revenu calculé depuis leurs factures.</p>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Montant (FCFA)</label>
                <input type="number" min="0" autoFocus value={ajoutRevenu.montant}
                  onChange={(e) => setAjoutRevenu((r) => ({ ...r, montant: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-300" placeholder="0" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Date</label>
                <input type="date" value={ajoutRevenu.date}
                  onChange={(e) => setAjoutRevenu((r) => ({ ...r, date: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Description <span className="font-normal text-gray-400">(optionnel)</span></label>
                <input value={ajoutRevenu.description}
                  onChange={(e) => setAjoutRevenu((r) => ({ ...r, description: e.target.value }))}
                  placeholder="ex : Subvention reçue, vente ponctuelle, remboursement…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAjoutRevenu(null)}>Annuler</Button>
              <Button onClick={confirmerAjoutRevenu} loading={revenuSaving}>Ajouter</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

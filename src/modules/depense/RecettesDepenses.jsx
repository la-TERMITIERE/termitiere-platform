// Bilan par secteur — vue financière mensuelle complète, par secteur.
// Fusion des anciens écrans « Budgets » et « Recettes & Dépenses » :
//  • RECETTES récupérées automatiquement des factures de chaque module (lecture seule) ;
//  • DÉPENSES du secteur (saisies dans E-DÉPENSES + reprises d'E-G.Pro et Briqueterie) ;
//  • SOLDE (recette − dépense), BUDGET alloué (avec révision tracée) + reste & % consommé.
// La SAISIE des dépenses reste dans l'écran « Dépenses » ; ici on pilote le bilan.
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, TrendingDown, Scale, Eye, Paperclip, History, Wallet, Plus, Trash2, Send, CheckCircle2 } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isReadOnlyRole, FULL_ACCESS_ROLES, depenseRoleEffectif } from '../../core/roles'
import { setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { genId, formatDateShort, formatDateTime, todayStr } from '../../utils/formatters'
import { ouvrirPiece } from '../../utils/fichiers'
import { teinterHex, shadeHex } from '../../utils/color'
import { SECTEURS, LOGISTIQUE_SITES, MOIS_LABELS, NATURES_FLUX, natureFluxDefaut, CATEGORIES_DEPENSE, STATUTS_DECAISSEMENT } from './data'
import { budgetSecteur, budgetDocSecteur, depensesHorsProjetSecteurMois, depensesEntrepriseSecteurMois, totalDepenses, statutBudget, coutsMatieresBriqueterie, versementsClientVersSecteurs, revenuClientSecteurMois, revenuManuelSecteurMois, secteursEtSites, libelleSecteurSite } from './logic'
import { revenuSecteur, SECTEURS_AVEC_REVENU } from './revenus'
import { soumettreNouvelleDepense } from './depenseActions'

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

// Secteurs avec une équipe identifiable (via `user.modules`) capable de confirmer la
// réception d'un budget — les autres (MAXI BAT, Caisse commune) gardent l'allocation
// instantanée d'avant, faute de destinataire clair pour la validation.
const SECTEURS_AVEC_VALIDATION = ['agro', 'logistique', 'evenementiel', 'garderie']
const ROUTE_FINANCES_PAR_SECTEUR = {
  agro: '/agro/finances', logistique: '/logistique/finances',
  evenementiel: '/evenementiel/finances', garderie: '/garderie/finances'
}

// `secteurId` optionnel : quand il est fourni (vue intégrée dans un module métier), l'écran
// est restreint à ce seul secteur. Sans lui, il affiche tous les secteurs (E-DÉPENSES).
// `site` optionnel : uniquement pour secteurId="logistique" — restreint en plus au site
// courant (Lomé/Kara, fourni par la route /logistique/:site/finances) ; les dépenses
// créées depuis cette vue sont automatiquement taguées à ce site, sans le redemander.
// `masquerRevenu` : vue « Dépense » pure pour les modules intégrés — cache les revenus/solde
// et rend le budget en lecture seule (l'allocation ne se fait que depuis E-DÉPENSES).
export default function RecettesDepenses({ secteurId = null, site = null, masquerRevenu = false }) {
  const { data: budgets }             = useCollection('depense_budgets')
  const { data: depensesReelles }     = useCollection('depense_depenses')
  const { data: projetsTous }         = useCollection('projets')
  const { data: versementsClientTous }= useCollection('projet_versements_client')
  const { data: revenusManuelsTous }  = useCollection('depense_revenus_manuels')
  const { data: inventairesBriq }     = useCollection('evenementiel_inventaires')
  const { data: paiementsGarderie }   = useCollection('garderie_paiements')
  const { data: facturesAgro }        = useCollection('agro_factures')
  const { data: facturesLogistique }  = useCollection('logistique_factures')
  const { data: facturesEvenementiel }= useCollection('evenementiel_factures')
  const { data: usersTous }           = useCollection('users')
  const { user, role: roleReel } = useAuth()
  // Écran partagé : embarqué dans d'autres modules via `secteurId` (leur onglet
  // « Dépense »), où la restriction E-DÉPENSES ne s'applique pas. Seule l'instance
  // standalone d'E-DÉPENSES (« Revenus & Budget », sans secteurId) ramène
  // super_admin/admin/directeur au niveau agent (cf. depenseRoleEffectif).
  const role = secteurId ? roleReel : depenseRoleEffectif(roleReel)
  const lectureSeule = isReadOnlyRole(role)

  const collections = { paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel }

  // Dépenses = saisies directes + Briqueterie. Tout ce qui vient d'E-G.Pro (repérable à
  // son `projetId`) n'apparaît plus ici — ça ne se consulte que depuis E-G.Pro lui-même.
  const depenses = useMemo(() => [
    ...depensesReelles.filter((d) => !d.projetId),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ], [depensesReelles, inventairesBriq])

  // Versements clients des projets E-G.Pro, routés par secteur — comptés en revenu.
  const versementsClientRoutes = useMemo(() => versementsClientVersSecteurs(versementsClientTous, projetsTous),
    [versementsClientTous, projetsTous])

  // MAXI BAT (chantiers) apparaît aussi dans la vue standalone d'E-DÉPENSES — comme
  // les autres secteurs, il reçoit un montant alloué en début de mois. Son bilan
  // détaillé (recettes/dépenses/budget) reste par ailleurs consultable depuis le
  // volet BTP d'E-G.Pro, qui embarque ce même écran avec `secteurId="bat"` : les deux
  // vues partagent le même budget en base, ce n'est qu'un second point d'accès.
  const secteursAffiches = useMemo(() => {
    if (secteurId) {
      const s = SECTEURS.find((x) => x.id === secteurId)
      if (!s) return []
      if (secteurId === 'logistique') {
        const siteEffectif = site || 'lome'
        const siteLbl = LOGISTIQUE_SITES.find((x) => x.id === siteEffectif)?.label || siteEffectif
        return [{ ...s, secteurId: 'logistique', site: siteEffectif, label: `${s.label} — ${siteLbl}` }]
      }
      return [{ ...s, secteurId, site: null }]
    }
    return secteursEtSites(false)
  }, [secteurId, site])
  const theme = THEME_PAR_SECTEUR[secteurId] || THEME_PAR_SECTEUR.default
  // En-tête : couleur du secteur embarqué, ou ambre par défaut pour la vue
  // standalone d'E-DÉPENSES (tous secteurs confondus, pas de couleur unique).
  const headerColor = secteurId ? (SECTEURS.find((s) => s.id === secteurId)?.color || '#B45309') : '#B45309'
  const headerTitre = secteurId ? (masquerRevenu ? 'Dépenses' : 'Recettes & Dépenses') : 'Budget'
  const headerSousTitre = secteurId
    ? `${secteursAffiches[0]?.label || ''} — bilan financier mensuel`
    : 'Bilan financier consolidé — tous les secteurs'

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)
  const [detail, setDetail] = useState(null) // dépense sélectionnée (détail lecture seule)
  const [secteurDetail, setSecteurDetail] = useState(null) // secteur sélectionné (détail financier)
  // Révision du budget alloué d'un secteur — garde une trace (ancien/nouveau/motif/date).
  // `revDate` : jour réel de l'apport (modifiable — permet de dater rétroactivement un
  // apport saisi après coup), plutôt que de toujours estampiller l'instant de la saisie.
  const [revision, setRevision]     = useState(null)
  const [revMontant, setRevMontant] = useState('')
  const [revMotif, setRevMotif]     = useState('')
  const [revDate, setRevDate]       = useState(todayStr())
  const [revSaving, setRevSaving]   = useState(false)
  // Ajout d'une dépense depuis le volet Dépense d'un secteur métier (agro,
  // logistique…) — même circuit d'autorisation que l'écran E-DÉPENSES, sans quitter
  // le module (cf. bouton « Ajouter une dépense » dans la nav mois ci-dessous).
  const [nouvelleDepense, setNouvelleDepense] = useState(null)
  const [depenseSaving, setDepenseSaving] = useState(false)
  // Onglet de la vue standalone (« Budget », sans secteurId) : bilan par secteur, ou
  // journal consolidé de tous les apports/ajouts de budget (tous secteurs confondus).
  const [ongletBudget, setOngletBudget] = useState('secteurs')
  const [secteurAjoutChoisi, setSecteurAjoutChoisi] = useState('')
  const [triApportsDesc, setTriApportsDesc] = useState(true) // tri par date de l'onglet « Apports & ajouts » : true = plus récent d'abord

  const changerMois = (delta) => {
    let m = mois + delta, a = annee
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMois(m); setAnnee(a)
  }

  const parSecteur = useMemo(() => secteursAffiches.map((s) => {
    const budgetDoc = budgetDocSecteur(budgets, s.secteurId, annee, mois, s.site)
    // Cible le document RÉEL déjà existant (y compris l'ancien document Logistique non
    // tagué, pour Kara — cf. budgetDocSecteur) ; sans lui, un nouvel id tagué au site
    // est généré pour la toute première allocation.
    const budgetId = budgetDoc?.id || (s.site ? `${s.secteurId}_${s.site}_${annee}-${String(mois).padStart(2, '0')}` : `${s.secteurId}_${annee}-${String(mois).padStart(2, '0')}`)
    const alloue = budgetSecteur(budgets, s.secteurId, annee, mois, s.site)
    const recette = revenuSecteur(collections, s.secteurId, annee, mois, versementsClientRoutes, revenusManuelsTous, s.site)
    const versementsClient = revenuClientSecteurMois(versementsClientRoutes, s.secteurId, annee, mois, s.site)
    const revenuManuel = revenuManuelSecteurMois(revenusManuelsTous, s.secteurId, annee, mois, s.site)
    const revenusManuelsDuMois = revenusManuelsTous
      .filter((r) => r.secteurId === s.secteurId && (r.date || '').startsWith(`${annee}-${String(mois).padStart(2, '0')}`))
      .sort((a, b) => (b.date || 0) - (a.date || 0))
    // « Dépenses »/« Solde » de ce secteur : les dépenses de projet (E-G.Pro) n'arrivent
    // déjà plus jusqu'ici (filtrées en amont sur `projetId`, cf. `depenses` ci-dessus) —
    // depensesHorsProjetSecteurMois reste un garde-fou pour d'éventuelles anciennes
    // entrées `source: 'projet'` historiques.
    const lignes = depensesHorsProjetSecteurMois(depenses, s.secteurId, annee, mois, s.site).sort((a, b) => (a.date < b.date ? 1 : -1))
    const depense = totalDepenses(lignes)
    // Pour la CAISSE COMMUNE (secteurId `divers`) uniquement : cette liste inclut, en
    // plus de ses propres dépenses, celles d'AUTRES secteurs marquées « payée depuis la
    // caisse commune » (cf. Depenses.jsx → financePar, et depensesEntrepriseSecteurMois)
    // — isolées ci-dessous pour les afficher dans son détail (cf. secteurDetail).
    const consommationBudget = depensesEntrepriseSecteurMois(depenses, s.secteurId, annee, mois, s.site)
    const depenseBudget = totalDepenses(consommationBudget)
    const financeesAilleurs = s.secteurId === 'divers'
      ? consommationBudget.filter((d) => d.secteurId !== 'divers').sort((a, b) => (a.date < b.date ? 1 : -1))
      : []
    const pct = alloue > 0 ? Math.round((depenseBudget / alloue) * 100) : (depenseBudget > 0 ? 100 : 0)
    return {
      // `solde` (recette - dépense) reste calculé pour la fiche détail du secteur ;
      // `soldeAlloue` (alloué - dépense) est celui affiché en résumé sur la carte —
      // ces secteurs reçoivent une enveloppe mensuelle plutôt que de facturer leurs
      // propres clients, c'est donc l'ALLOUÉ, pas le revenu, la référence naturelle.
      ...s, recette, versementsClient, revenuManuel, revenusManuelsDuMois, depense, lignes, financeesAilleurs, solde: recette - depense, soldeAlloue: alloue - depense,
      budgetId, alloue, reste: alloue - depenseBudget, pct, statut: statutBudget(pct), revisionsBudget: budgetDoc?.revisions || [],
      // Proposition de budget en attente de confirmation par le secteur (cf. confirmerRevision).
      montantPropose: budgetDoc?.statutValidation === 'en_attente' ? budgetDoc.montantPropose : null,
      proposeParText: budgetDoc?.proposeParText || null, motifPropose: budgetDoc?.motifPropose || null
    }
  }), [secteursAffiches, budgets, depenses, versementsClientRoutes, revenusManuelsTous, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel, annee, mois])

  // Journal consolidé de tous les apports/ajouts de budget du mois, tous secteurs (+
  // sites) confondus — onglet « Apports & ajouts » de la vue standalone. Chaque révision
  // porte déjà `ancien`/`nouveau`/`motif`/`auteur`/`date` (cf. confirmerRevision) ; on y
  // rattache juste le secteur d'origine pour l'affichage.
  const apportsTous = useMemo(() => {
    const out = []
    parSecteur.forEach((s) => {
      (s.revisionsBudget || []).forEach((r) => {
        out.push({ ...r, secteurId: s.secteurId, secteurLabel: s.label, secteurColor: s.color })
      })
    })
    return out.sort((a, b) => triApportsDesc ? (b.date || 0) - (a.date || 0) : (a.date || 0) - (b.date || 0))
  }, [parSecteur, triApportsDesc])

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

  const totalDepense = parSecteur.reduce((s, x) => s + x.depense, 0)
  const totalAlloue  = parSecteur.reduce((s, x) => s + x.alloue, 0)
  // Solde global = alloué - dépenses : ces secteurs reçoivent une enveloppe mensuelle
  // plutôt que de facturer leurs propres clients (cf. `soldeAlloue` par secteur ci-dessous).
  const totalReste   = totalAlloue - totalDepense

  // CAISSE COMMUNE (secteur `divers`) : pas de « révision » (on ne redéfinit pas le
  // total) mais un « ajout » cumulatif — chaque apport de la direction s'additionne au
  // montant déjà présent, plutôt que d'exiger de recalculer et ressaisir le nouveau total.
  const ouvrirRevision = (s) => {
    setRevision({ id: s.budgetId, secteurId: s.secteurId, site: s.site, secteurLabel: s.label, montantActuel: s.alloue, revisions: s.revisionsBudget })
    setRevMontant(s.secteurId === 'divers' ? '' : String(s.alloue || ''))
    setRevMotif('')
    setRevDate(todayStr())
  }

  // Uids des membres du secteur (via `user.modules`) — destinataires de la demande de
  // confirmation de réception d'un budget alloué/révisé.
  const uidsDuSecteur = (sId) => usersTous.filter((u) => (u.modules || []).includes(sId)).map((u) => u.uid).filter(Boolean)

  const confirmerRevision = async () => {
    if (!revision) return
    const estCaisseCommune = revision.secteurId === 'divers'
    if (revMontant === '' || Number(revMontant) < 0) return toast.error('Montant requis')
    if (!revDate) return toast.error('Date requise')
    // CAISSE COMMUNE : le montant saisi s'AJOUTE au total déjà présent (pas de
    // remplacement) — aucun motif exigé, chaque apport de la direction est cumulatif.
    // Autres secteurs : première allocation (aucun budget encore) → pas de motif exigé ;
    // révision d'un budget existant → motif obligatoire (traçabilité du changement).
    const nouveau = estCaisseCommune ? revision.montantActuel + Number(revMontant) : Number(revMontant)
    const estAllocation = revision.montantActuel === 0
    if (!estCaisseCommune && !estAllocation && !revMotif.trim()) return toast.error('Motif de révision requis')
    const motif = revMotif.trim() || (estCaisseCommune ? 'Apport à la caisse commune' : 'Allocation initiale')
    // Jour réel de l'apport (modifiable, cf. revDate) — heure fixée à l'instant présent
    // pour départager plusieurs apports le même jour dans l'historique (tri chronologique).
    const dateEntry = new Date(`${revDate}T00:00:00`)
    dateEntry.setHours(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())
    const dateMs = dateEntry.getTime()
    setRevSaving(true)
    try {
      const ancien = revision.montantActuel

      // Secteurs avec équipe identifiable : le montant n'est pas appliqué tout de suite —
      // il reste « proposé » jusqu'à ce que le secteur confirme l'avoir reçu (cf.
      // validerReceptionBudget). Les autres (MAXI BAT, Caisse commune) gardent l'ancien
      // comportement instantané, faute de destinataire clair pour valider.
      if (SECTEURS_AVEC_VALIDATION.includes(revision.secteurId)) {
        await setItem('depense_budgets', revision.id, {
          id: revision.id, secteurId: revision.secteurId, site: revision.site || null, annee, mois, montant: ancien, revisions: revision.revisions,
          montantPropose: nouveau, motifPropose: motif, statutValidation: 'en_attente',
          proposeParText: user?.nom || user?.login || '—', proposeParUid: user?.uid || null, proposeLe: Date.now(),
          updatedAt: Date.now()
        })
        await audit('depense', estAllocation ? 'BUDGET_PROPOSE' : 'BUDGET_REVISION_PROPOSEE',
          `${revision.secteurLabel} — ${fmt(nouveau)} FCFA proposés, en attente de confirmation`,
          { secteurId: revision.secteurId, annee, mois, ancien, nouveau })
        // Le secteur (pas l'administration) doit confirmer la réception avant que le
        // montant ne compte comme « Budget alloué » dans les KPI.
        const destinataires = uidsDuSecteur(revision.secteurId)
        if (destinataires.length) {
          await notify({
            type: 'demande',
            title: `💰 Budget proposé — ${revision.secteurLabel}`,
            body: `${fmt(nouveau)} FCFA pour ${MOIS_LABELS[mois - 1]} ${annee} — confirmez la réception pour l'activer.`,
            module: 'depense', forUsers: destinataires, excludeUid: user?.uid,
            link: revision.secteurId === 'logistique' && revision.site ? `/logistique/${revision.site}/finances` : (ROUTE_FINANCES_PAR_SECTEUR[revision.secteurId] || '/depense/recettes-depenses')
          }).catch(() => {})
        }
        toast.success('Budget proposé — en attente de confirmation du secteur ✓')
        setRevision(null)
        return
      }

      const entry = { id: genId(), ancien, nouveau, motif, date: dateMs, auteur: user?.nom || user?.login || '—' }
      const revisions = [...revision.revisions, entry]
      await setItem('depense_budgets', revision.id, {
        id: revision.id, secteurId: revision.secteurId, site: revision.site || null, annee, mois, montant: nouveau, revisions, updatedAt: Date.now()
      })
      const actionAudit = estCaisseCommune ? 'BUDGET_AJOUTE' : (estAllocation ? 'BUDGET_ALLOUE' : 'BUDGET_REVISE')
      const libelleAudit = estCaisseCommune
        ? `${revision.secteurLabel} — +${fmt(nouveau - ancien)} FCFA ajoutés (total ${fmt(nouveau)} FCFA)${motif ? ' — ' + motif : ''}`
        : estAllocation
          ? `${revision.secteurLabel} — budget alloué ${fmt(nouveau)} FCFA`
          : `${revision.secteurLabel} — ${fmt(ancien)} → ${fmt(nouveau)} FCFA (${motif})`
      await audit('depense', actionAudit, libelleAudit, { secteurId: revision.secteurId, annee, mois, ancien, nouveau })
      // Réservé à l'administration : montant alloué/révisé/ajouté pour un secteur.
      await notify({
        type: 'info',
        title: estCaisseCommune ? `➕ Caisse commune — ${revision.secteurLabel}` : (estAllocation ? `💰 Budget alloué — ${revision.secteurLabel}` : `🔄 Budget révisé — ${revision.secteurLabel}`),
        body: estCaisseCommune
          ? `+${fmt(nouveau - ancien)} FCFA ajoutés — nouveau total ${fmt(nouveau)} FCFA.`
          : estAllocation ? `${fmt(nouveau)} FCFA alloués pour ${MOIS_LABELS[mois - 1]} ${annee}.` : `${fmt(ancien)} → ${fmt(nouveau)} FCFA — ${motif}`,
        module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid,
        link: '/depense/recettes-depenses', state: { openSecteurId: revision.secteurId, annee, mois }
      }).catch(() => {})
      toast.success(estCaisseCommune ? 'Ajouté à la caisse commune ✓' : (estAllocation ? 'Budget alloué ✓' : 'Budget révisé ✓'))
      setRevision(null)
    } finally {
      setRevSaving(false)
    }
  }

  // Le secteur confirme avoir reçu le budget proposé → il devient enfin le montant
  // actif (compté dans « Budget alloué » partout : KPI, alertes de dépassement…).
  const [validationBusy, setValidationBusy] = useState(null) // budgetId en cours
  async function validerReceptionBudget(s) {
    if (validationBusy) return
    setValidationBusy(s.budgetId)
    try {
      const ancien = s.alloue
      const nouveau = s.montantPropose
      const entry = {
        id: genId(), ancien, nouveau, motif: `${s.motifPropose || 'Allocation'} — confirmé reçu`,
        date: Date.now(), auteur: user?.nom || user?.login || '—'
      }
      const revisions = [...s.revisionsBudget, entry]
      await setItem('depense_budgets', s.budgetId, {
        id: s.budgetId, secteurId: s.secteurId, site: s.site || null, annee, mois, montant: nouveau, revisions,
        montantPropose: null, motifPropose: null, statutValidation: null, updatedAt: Date.now()
      })
      await audit('depense', 'BUDGET_RECEPTION_CONFIRMEE', `${s.label} — ${fmt(nouveau)} FCFA confirmés reçus`, { secteurId: s.secteurId, site: s.site || null, annee, mois, ancien, nouveau })
      await notify({
        type: 'success', title: `✅ Budget confirmé reçu — ${s.label}`,
        body: `${fmt(nouveau)} FCFA confirmés par ${user?.nom || user?.login || '—'} pour ${MOIS_LABELS[mois - 1]} ${annee}.`,
        module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid,
        link: '/depense/recettes-depenses', state: { openSecteurId: s.id, annee, mois }
      }).catch(() => {})
      toast.success('Réception confirmée ✓')
    } finally {
      setValidationBusy(null)
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

  const ouvrirNouvelleDepense = () => setNouvelleDepense({
    categorie: '', montant: '', date: todayStr(), description: '',
    beneficiaireNom: '', beneficiaireTelephone: '',
    natureFlux: natureFluxDefaut, sourceFinancement: 'entreprise', financePar: '', imprevue: false
  })

  const confirmerNouvelleDepense = async () => {
    if (!nouvelleDepense || !secteurId) return
    if (!nouvelleDepense.categorie) return toast.error('Catégorie requise')
    if (!nouvelleDepense.montant || Number(nouvelleDepense.montant) <= 0) return toast.error('Montant requis')
    if (!nouvelleDepense.date) return toast.error('Date requise')
    if (!nouvelleDepense.description || !nouvelleDepense.description.trim()) return toast.error('Description requise — précisez le motif de la dépense')
    if (!nouvelleDepense.beneficiaireNom || !nouvelleDepense.beneficiaireNom.trim()) return toast.error('Bénéficiaire requis — identifiez qui reçoit la somme')
    setDepenseSaving(true)
    try {
      const { statutInitial } = await soumettreNouvelleDepense({ ...nouvelleDepense, secteurId, site: secteurId === 'logistique' ? (site || 'lome') : undefined }, { user, budgets, depenses })
      toast.success(statutInitial === 'en_attente' ? 'Demande de décaissement soumise — en attente d\'autorisation ✓' : 'Dépense enregistrée ✓')
      setNouvelleDepense(null)
    } finally {
      setDepenseSaving(false)
    }
  }

  const supprimerRevenuManuel = async (r) => {
    if (!window.confirm(`Supprimer ce revenu de ${fmt(r.montant)} FCFA ?`)) return
    await removeItem('depense_revenus_manuels', r.id)
    await audit('depense', 'REVENU_MANUEL_SUPPRIME', `${fmt(r.montant)} FCFA`, { secteurId: r.secteurId })
  }

  return (
    <div className="space-y-5">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_8px_20px_-8px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: `linear-gradient(135deg, ${teinterHex(headerColor, 0.85)} 0%, ${teinterHex(shadeHex(headerColor, -35), 0.85)} 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: headerColor, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Scale size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">{headerTitre}</h2>
          <p className="text-sm text-white/80">{headerSousTitre}</p>
        </div>
      </div>

      {/* Onglets — uniquement sur la vue standalone (pas quand embarqué dans un module
          métier via secteurId, qui n'a pas de vue consolidée tous-secteurs). */}
      {!secteurId && (
        <div className="flex gap-2 border-b border-gray-200">
          <button onClick={() => setOngletBudget('secteurs')}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${ongletBudget === 'secteurs' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            Par secteur
          </button>
          <button onClick={() => setOngletBudget('apports')}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${ongletBudget === 'apports' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            Apports & ajouts{apportsTous.length > 0 ? ` (${apportsTous.length})` : ''}
          </button>
        </div>
      )}

      {/* Navigation mois */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => changerMois(-1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronLeft size={16} /></button>
        <span className="text-lg font-extrabold text-gray-800">{MOIS_LABELS[mois - 1]} {annee}</span>
        <button onClick={() => changerMois(1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronRight size={16} /></button>
        {/* Vue « Dépense » d'un module métier (agro, logistique…) : saisir une dépense
            de ce secteur sans quitter le module, ni dépendre d'un accès à E-DÉPENSES
            (que ces rôles n'ont pas forcément) — même circuit d'autorisation, embarqué
            directement ici (cf. confirmerNouvelleDepense → depenseActions.js). */}
        {masquerRevenu && secteurId && !lectureSeule && (
          <Button onClick={ouvrirNouvelleDepense} size="sm" className="ml-auto"><Plus size={14} className="mr-1" />Ajouter une dépense</Button>
        )}
      </div>

      {ongletBudget !== 'secteurs' ? (
      <div className="space-y-3">
        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
          Tous les apports/ajouts de budget du mois, tous secteurs confondus — historique consolidé. Choisis un secteur ci-dessous pour ajouter une somme directement, sans passer par sa carte.
        </div>
        {!lectureSeule && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/80 p-3 shadow-[0_16px_38px_-18px_rgba(26,26,26,0.20)] ring-1 ring-gray-100 backdrop-blur-xl backdrop-saturate-150">
            <span className="text-xs font-semibold text-gray-500">Ajouter une somme à :</span>
            <Select className="w-auto" value={secteurAjoutChoisi} onChange={(e) => {
              const id = e.target.value
              setSecteurAjoutChoisi(id)
              const s = parSecteur.find((x) => x.id === id)
              if (s) ouvrirRevision(s)
              setSecteurAjoutChoisi('')
            }}>
              <option value="">— Choisir un secteur —</option>
              {parSecteur.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </div>
        )}
        {apportsTous.length > 0 && (
          <button onClick={() => setTriApportsDesc((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-amber-700">
            <History size={12} /> Trié par date {triApportsDesc ? '(plus récent d\'abord)' : '(plus ancien d\'abord)'} — inverser
          </button>
        )}
        {apportsTous.length === 0 ? (
          <div className="rounded-2xl bg-white/80 py-10 text-center text-sm text-gray-400 shadow-[0_16px_38px_-18px_rgba(26,26,26,0.20)] ring-1 ring-gray-100">
            Aucun apport ni ajout de budget ce mois-ci.
          </div>
        ) : (
          <div className="space-y-2">
            {apportsTous.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-l-4 bg-white/80 px-4 py-2.5 shadow-[0_16px_38px_-18px_rgba(26,26,26,0.20)] ring-1 ring-gray-100 backdrop-blur-xl backdrop-saturate-150" style={{ borderLeftColor: r.secteurColor }}>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: r.secteurColor + '1a', color: r.secteurColor }}>{r.secteurLabel}</span>
                <span className="font-bold text-gray-800">
                  {r.secteurId === 'divers' ? `+${fmt(r.nouveau - r.ancien)} FCFA (total ${fmt(r.nouveau)})` : `${fmt(r.ancien)} → ${fmt(r.nouveau)} FCFA`}
                </span>
                {r.motif && <span className="text-xs text-gray-500">{r.motif}</span>}
                <span className="ml-auto text-[11px] text-gray-400">{r.auteur || '—'} · {formatDateTime(r.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      ) : (<>
      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
        {masquerRevenu
          ? <>Suivi des <strong>dépenses</strong> de ce secteur face au <strong>budget alloué</strong> depuis E-DÉPENSES (reste & % consommé). L'allocation du budget se fait uniquement dans E-DÉPENSES ; la <strong>saisie</strong> des dépenses se fait dans l'écran <strong>Dépenses</strong>.</>
          : <>Bilan financier par secteur : chaque secteur reçoit un <strong>montant alloué</strong> en début de mois, comparé à ses <strong>dépenses</strong> pour donner le <strong>solde</strong> restant. La <strong>saisie</strong> des dépenses se fait dans l'écran <strong>Dépenses</strong>.</>}
      </div>

      {/* KPI globaux */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Dépenses totales" value={`${fmt(totalDepense)} FCFA`} icon={TrendingDown} accent="#dc2626" />
        {!masquerRevenu && (
          <StatCard title="Solde global" value={`${fmt(totalReste)} FCFA`} sub={totalReste >= 0 ? 'Excédent' : 'Déficit'}
            icon={Scale} accent={totalReste >= 0 ? '#059669' : '#dc2626'} valueColor={totalReste >= 0 ? '#059669' : '#dc2626'} />
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
                {/* Le pilotage se fait contre le MONTANT ALLOUÉ (somme donnée au secteur en
                    début de mois), pas contre un « revenu » calculé — les secteurs ici ne
                    facturent pas leurs propres clients, ils reçoivent une enveloppe à dépenser. */}
                {!masquerRevenu && <span className="text-gray-500">Alloué <b className="text-green-700">{fmt(s.alloue)}</b></span>}
                <span className="text-gray-500">Dépenses <b className="text-amber-600">{fmt(s.depense)}</b></span>
                {!masquerRevenu && <span className="text-gray-500">Solde <b className={s.soldeAlloue >= 0 ? 'text-green-700' : 'text-red-600'}>{s.soldeAlloue >= 0 ? '+' : ''}{fmt(s.soldeAlloue)}</b></span>}
              </div>

              <div className="ml-auto flex items-center gap-2">
                {!masquerRevenu && <Badge tone={s.soldeAlloue >= 0 ? 'success' : 'danger'}>{s.soldeAlloue >= 0 ? 'Excédent' : 'Déficit'}</Badge>}
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
                  s.secteurId === 'divers' ? (
                    <button onClick={() => ouvrirRevision(s)} title="Ajouter une somme à la caisse commune (s'additionne au total déjà présent)"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold text-white shadow-[0_4px_12px_-2px_rgba(180,83,9,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-600 hover:shadow-[0_7px_18px_-4px_rgba(180,83,9,0.7)]">
                      <span className="text-sm leading-none">＋</span> Ajouter un apport
                    </button>
                  ) : s.alloue > 0 ? (
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

            {/* Budget proposé, en attente de confirmation par le secteur — tant que ce
                n'est pas confirmé, « Budget » ci-dessus reste sur l'ancien montant actif. */}
            {s.montantPropose != null && (
              <div className="border-t border-amber-100 bg-amber-50/70 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Send size={13} className="shrink-0 text-amber-600" />
                  <span className="text-xs text-amber-800">
                    <b>{fmt(s.montantPropose)} FCFA</b> proposés par {s.proposeParText}
                    {s.motifPropose ? ` — ${s.motifPropose}` : ''} · en attente de confirmation de réception
                  </span>
                  {!lectureSeule && (
                    <button onClick={() => validerReceptionBudget(s)} disabled={validationBusy === s.budgetId}
                      className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-60">
                      <CheckCircle2 size={13} /> {validationBusy === s.budgetId ? 'Confirmation…' : 'Confirmer la réception'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Revenu manuel — indication seule ; l'ajout se fait via le bouton en haut de l'écran */}
            {!masquerRevenu && !SECTEURS_AVEC_REVENU.includes(s.id) && s.revenuManuel > 0 && (
              <div className="border-t border-gray-100 bg-violet-50/40 px-4 py-2">
                <span className="text-[11px] text-violet-600">✍️ dont {fmt(s.revenuManuel)} FCFA saisis manuellement ce mois</span>
              </div>
            )}

          </div>
        ))}
      </div>
      </>)}

      {/* Détail d'une dépense — lecture seule */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="md" title="Détail de la dépense"
        panelClassName={theme.gradient}
        footer={<Button variant="outline" onClick={() => setDetail(null)}>Fermer</Button>}>
        {detail && (() => {
          const sect = SECTEURS.find((s) => s.id === detail.secteurId)
          const statut = STATUTS_DECAISSEMENT[detail.statut] || STATUTS_DECAISSEMENT.decaissee
          const nature = NATURES_FLUX[detail.natureFlux || natureFluxDefaut]
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
                    {libelleSecteurSite(sect, detail)}
                  </p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Catégorie</p>
                  <p className="mt-0.5 font-bold text-gray-800">{detail.categorie || '—'}</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Origine</p>
                  <p className="mt-0.5 font-bold text-gray-800">
                    {depuisBriqueterie ? 'Briqueterie' : 'Saisie directe'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Description</p>
                <p className="mt-1 font-medium text-gray-700">{detail.description || '—'}</p>
              </div>

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

            {/* CAISSE COMMUNE uniquement : dépenses d'AUTRES secteurs marquées « payée
                depuis la caisse commune » — consomment son budget mais restent listées
                sous leur secteur d'origine ci-dessus (cf. Depenses.jsx → financePar). */}
            {secteurDetail.secteurId === 'divers' && secteurDetail.financeesAilleurs.length > 0 && (
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                  💰 Financées depuis ici, pour d'autres secteurs ({secteurDetail.financeesAilleurs.length})
                </p>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {secteurDetail.financeesAilleurs.map((d) => {
                    const secteurOrigine = SECTEURS.find((s) => s.id === d.secteurId)
                    return (
                      <div key={d.id} onClick={() => { setSecteurDetail(null); setDetail(d) }}
                        className="group flex cursor-pointer items-center gap-2 rounded-lg bg-violet-50/50 px-2.5 py-1.5 text-xs transition-colors hover:bg-violet-100/60">
                        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: (secteurOrigine?.color || '#64748b') + '1a', color: secteurOrigine?.color || '#64748b' }}>
                          {secteurOrigine?.label || d.secteurId}
                        </span>
                        <span className="whitespace-nowrap text-gray-500">{formatDateShort(d.date)}</span>
                        <span className="min-w-0 flex-1 truncate text-gray-700">{d.description || '—'}</span>
                        <span className="whitespace-nowrap font-bold text-gray-900">{fmt(d.montant)}</span>
                        <Eye size={12} className="shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Allocation (1ère fois) / Révision (budget existant) / Ajout cumulatif (Caisse commune) */}
      <Modal open={!!revision} onClose={() => setRevision(null)} size="sm"
        title={revision ? (revision.secteurId === 'divers' ? `Ajouter un apport — ${revision.secteurLabel}` : `${revision.montantActuel > 0 ? 'Réviser' : 'Allouer'} le budget — ${revision.secteurLabel}`) : 'Budget'}
        panelClassName={theme.gradient}>
        {revision && (() => {
          const estAllocation = revision.montantActuel === 0
          const estCaisseCommune = revision.secteurId === 'divers'
          const requiertValidation = SECTEURS_AVEC_VALIDATION.includes(revision.secteurId)
          return (
          <div className="space-y-4">
            {requiertValidation && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                <Send size={12} className="mr-1 inline" /> Ce montant sera envoyé au secteur pour confirmation — il ne comptera
                comme « Budget alloué » qu'une fois la réception confirmée.
              </div>
            )}
            <div className="rounded-xl bg-white p-3 shadow-sm">
              {estCaisseCommune ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase text-gray-400">Montant déjà présent</p>
                  <p className="mb-2 text-sm font-bold text-gray-700">{fmt(revision.montantActuel)} FCFA</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Montant à ajouter (FCFA)</label>
                      <input type="number" min="0" value={revMontant} onChange={(e) => setRevMontant(e.target.value)} autoFocus
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="0" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Date</label>
                      <input type="date" value={revDate} onChange={(e) => setRevDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300" />
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">
                    S'ADDITIONNE au montant déjà présent — pas de remplacement.
                    {Number(revMontant) > 0 ? ` Nouveau total : ${fmt(revision.montantActuel + Number(revMontant))} FCFA.` : ''}
                  </p>
                  <div className="mt-2">
                    <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Motif <span className="font-normal normal-case text-gray-400">(optionnel)</span></label>
                    <input value={revMotif} onChange={(e) => setRevMotif(e.target.value)}
                      placeholder="ex : apport de la direction, virement reçu…"
                      className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                </div>
              ) : estAllocation ? (
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Montant à allouer (FCFA)</label>
                      <input type="number" min="0" value={revMontant} onChange={(e) => setRevMontant(e.target.value)} autoFocus
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="0" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Date</label>
                      <input type="date" value={revDate} onChange={(e) => setRevDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300" />
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">Première allocation du mois — aucun motif requis.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-gray-400">Budget actuel</p>
                      <p className="text-sm font-bold text-gray-700">{fmt(revision.montantActuel)} FCFA</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Nouveau montant (FCFA)</label>
                      <input type="number" min="0" value={revMontant} onChange={(e) => setRevMontant(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="0" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Date</label>
                      <input type="date" value={revDate} onChange={(e) => setRevDate(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300" />
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
                <Button size="sm" onClick={confirmerRevision} loading={revSaving}>
                  {requiertValidation ? 'Envoyer au secteur' : (estCaisseCommune ? 'Ajouter un apport' : (estAllocation ? 'Allouer' : 'Confirmer la révision'))}
                </Button>
              </div>
            </div>

            {revision.revisions.length > 0 && (
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-gray-400"><History size={12} /> {estCaisseCommune ? 'Historique des ajouts' : 'Historique des allocations & révisions'}</p>
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {[...revision.revisions].reverse().map((r) => (
                    <div key={r.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs">
                      <p className="font-semibold text-gray-700">
                        {estCaisseCommune ? `+${fmt(r.nouveau - r.ancien)} FCFA (total ${fmt(r.nouveau)})` : `${fmt(r.ancien)} → ${fmt(r.nouveau)} FCFA`}
                      </p>
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

      {/* Ajout d'une dépense depuis le volet Dépense d'un secteur métier — même circuit
          d'autorisation qu'E-DÉPENSES (imprévue / budget restant → demande PAU, sinon
          décaissée immédiatement), cf. confirmerNouvelleDepense. */}
      <Modal open={!!nouvelleDepense} onClose={() => setNouvelleDepense(null)} size="sm"
        title="Ajouter une dépense"
        panelClassName={theme.gradient}>
        {nouvelleDepense && (
          <div className="space-y-3">
            <div className="rounded-xl bg-white p-3 shadow-sm space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Catégorie</label>
                <select value={nouvelleDepense.categorie} onChange={(e) => setNouvelleDepense((d) => ({ ...d, categorie: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300">
                  <option value="">— Choisir —</option>
                  {CATEGORIES_DEPENSE.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Montant (FCFA)</label>
                <input type="number" min="0" autoFocus value={nouvelleDepense.montant}
                  onChange={(e) => setNouvelleDepense((d) => ({ ...d, montant: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="0" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Date</label>
                <input type="date" value={nouvelleDepense.date}
                  onChange={(e) => setNouvelleDepense((d) => ({ ...d, date: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Description <span className="text-red-500">*</span></label>
                <input value={nouvelleDepense.description}
                  onChange={(e) => setNouvelleDepense((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Décrivez précisément la dépense : quoi, pourquoi, pour qui…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Bénéficiaire <span className="text-red-500">*</span></label>
                  <input value={nouvelleDepense.beneficiaireNom}
                    onChange={(e) => setNouvelleDepense((d) => ({ ...d, beneficiaireNom: e.target.value }))}
                    placeholder="Qui reçoit l'argent…"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Téléphone <span className="font-normal text-gray-400">(optionnel)</span></label>
                  <input value={nouvelleDepense.beneficiaireTelephone}
                    onChange={(e) => setNouvelleDepense((d) => ({ ...d, beneficiaireTelephone: e.target.value }))}
                    placeholder="ex : 90 00 00 00"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
              </div>
              <label className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-2 text-xs text-gray-700">
                <input type="checkbox" className="mt-0.5" checked={nouvelleDepense.financePar === 'caisse_commune'}
                  onChange={(e) => setNouvelleDepense((d) => ({ ...d, financePar: e.target.checked ? 'caisse_commune' : '' }))} />
                <span>
                  💰 Payée depuis la <strong>Caisse commune</strong>
                  <span className="block text-[11px] text-gray-500">Ne consomme pas le budget de ce secteur — réduit celui de la Caisse commune à la place.</span>
                </span>
              </label>
              <p className="text-[11px] text-gray-400">
                Devient une <strong>demande envoyée au PAU</strong> si elle dépasse le budget restant du
                secteur ce mois-ci ; sinon elle est décaissée immédiatement.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setNouvelleDepense(null)}>Annuler</Button>
              <Button onClick={confirmerNouvelleDepense} loading={depenseSaving}>Enregistrer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// Liste des dépenses — saisie, filtres, justificatif.
import { useMemo, useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Landmark, Search, FilePen, Trash2, Paperclip, Eye, ChevronDown, Receipt, Layers, FileSpreadsheet, Wallet, Building2, PiggyBank, Check, AlertTriangle, FileCheck2, Undo2, CalendarDays, FileText, UserRound, PenLine, Banknote, ShieldCheck, Tag, ArrowLeftRight, Phone, CreditCard, ClipboardList, Wrench, MapPin, Briefcase, X, Save, Sparkles, MessageSquareText, Send } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import ChampRecherche from '../../shared/ui/ChampRecherche'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import Compteur from '../../shared/ui/Compteur'
import BoutonVerre from '../../shared/ui/BoutonVerre'
import NouvelleDemandeModal from './NouvelleDemandeModal'
import ChampBeneficiaire from './ChampBeneficiaire'
import PillTabs from '../../shared/ui/PillTabs'
import BandeauVolet, { ChampBande, CLASSE_CHAMP_BANDE } from '../../shared/ui/BandeauVolet'
import { iconeCategorie, iconeLigne, COULEUR_DOTATION } from '../comptabilite/iconesCaisse'
import { construireLignesCaisse, journalPeriode, bornesPeriode } from '../comptabilite/journalCalculs'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, setItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, formatDateShort, formatMoney } from '../../utils/formatters'
import { glassModalProps, icone3D } from '../../utils/color'
import { ouvrirPiece } from '../../utils/fichiers'
import { exportRapportExcel } from '../../utils/excelReport'
import { SECTEURS, LOGISTIQUE_SITES, CATEGORIES_DEPENSE, STATUTS_DECAISSEMENT, NATURES_FLUX, natureFluxDefaut, MODES_PAIEMENT, MOIS_LABELS } from './data'
import { budgetSecteur, depensesEntrepriseSecteurMois, totalDepenses, statutBudget, coutsMatieresBriqueterie, libelleSecteurSite, siteLogistiqueDe, visibleDansEDepenses, secteursEtSites, seuilsBudgetDe } from './logic'
import { financementSiege, raisonAutorisation as raisonAutorisationPartagee, soumettreNouvelleDepense as soumettreNouvelleDepensePartagee } from './depenseActions'
import { isFullAccessRole, FULL_ACCESS_ROLES, isReadOnlyRole, depenseRoleEffectif } from '../../core/roles'
import { marquerVoletVu } from '../../shared/nouveautes'

// Origine d'une dépense — d'où vient la ligne (saisie directe ou récupérée d'un autre module).
// Tableau des dépenses : mêmes en-têtes fixes, lignes teintées et pied de totaux que le journal de la Caisse (Comptabilité).
const TH = 'sticky top-0 z-10 bg-amber-50 shadow-[0_1px_0_rgba(180,83,9,0.25)] dark:bg-gray-800 px-3 py-2.5'
const TF = 'sticky bottom-0 z-10 bg-amber-50 px-3 py-2.5 shadow-[0_-1px_0_rgba(180,83,9,0.25)] dark:bg-gray-800'

const SOURCE_INFO = {
  retour_reliquat: { label: 'Retour de fonds', tone: 'success' },
  besoin:      { label: 'Besoin validé', tone: 'info' },
  briqueterie: { label: 'Briqueterie', tone: 'neutral' }
}
// Le secteur central (id `divers`) s'appelle « Caisse courante » dans les budgets ; à la saisie et au tri on le présente comme le Siège.
const libelleChoixSecteur = (s) => (s.id === 'divers' ? 'SIÈGE (Caisse courante)' : s.label)
// Provenance des fonds d'une dépense : celle enregistrée, sinon déduite pour les anciennes dépenses (payée depuis la Caisse courante ou
// rattachée au Siège → le Siège ; sinon le secteur finançait lui-même). Aucune donnée n'est réécrite : c'est un simple affichage.
// Une dépense est « affectée » quand sa destination et son origine ont été renseignées (à la saisie ou après coup par un agent).
// Les dépenses reprises d'un autre module (besoins, Briqueterie, projets) tiennent leur secteur de leur module : elles sont hors suivi.
// Origine des fonds : il n'y en a que deux, la Caisse courante (Siège) ou la Banque.
const ORIGINES_FONDS = [{ id: 'divers', label: 'Caisse courante' }, { id: 'banque', label: 'Banque' }]
const origineValide = (id) => ORIGINES_FONDS.some((o) => o.id === id)
const libelleOrigine = (id) => ORIGINES_FONDS.find((o) => o.id === id)?.label || ''
// Secteurs qui ont leur propre volet Dépenses dans un module ; les autres (Siège, Communication, Autre) restent dans E-DÉPENSES.
const SECTEURS_AVEC_VOLET = ['agro', 'logistique', 'evenementiel', 'garderie', 'gym', 'bat']
const estAffectee = (d) => origineValide(d.origineFonds) || !!d.affecteeLe
const affecteurDe = (d) => d.affecteePar || (origineValide(d.origineFonds) ? d.enregistrePar : '') || ''
const origineDe = (d) => (origineValide(d.origineFonds) ? d.origineFonds : ((d.financePar === 'caisse_commune' || d.secteurId === 'divers') ? 'divers' : ''))
const infoSource = (d) => SOURCE_INFO[d.source] || { label: 'Saisie E-DÉPENSES', tone: 'neutral' }

// Glassmorphism — bandeau de filtres (recherche, mois, secteur, catégorie, nature
// du flux, financement) : panneau en verre dépoli neutre (plus de fond
// ambre/orange ni d'ombres « pâte à modeler ») — flou + translucidité, bordure
// claire fine. En PC, les filtres restent sur une même ligne (flex-wrap) ; ils
// passent à la ligne un par un dès que la largeur manque (mobile/tablette
// étroite). `CLAY_FIELD` s'utilise sur des <input>/<select> BRUTS (pas
// .input-base, pour ne pas avoir à lutter contre sa bordure/son rayon par-dessus).
const CLAY_PANEL = 'relative flex flex-wrap items-end gap-3 rounded-[28px] border border-white/60 bg-white/55 p-4 shadow-[0_18px_38px_-18px_rgba(26,26,26,0.28),inset_0_1px_0_0_rgba(255,255,255,0.6)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-white/[0.04]'
const CLAY_LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-amber-800/70 dark:text-amber-200/60'
const CLAY_FIELD = 'w-full appearance-none rounded-2xl border border-white/60 bg-white/70 px-3.5 py-2.5 text-sm font-semibold text-gray-700 shadow-[0_2px_10px_-4px_rgba(26,26,26,0.12)] outline-none backdrop-blur-md transition-all duration-200 hover:bg-white/85 focus:bg-white/90 focus:ring-2 focus:ring-amber-400/50 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:hover:bg-white/10'

// Pastille Oui/Non glassmorphism (flou + fond translucide au repos, dégradé plein +
// halo lumineux une fois active) — réutilisée pour tous les couples Oui/Non du
// formulaire. `active` au sens strict (=== true / === false) : cliquer sur la
// pastille déjà active l'annule (l'appelant repasse alors la valeur à `null`,
// aucune des deux pastilles n'est active) plutôt que de forcer un choix.
function pillToggleClass(active, tone) {
  const plein = tone === 'green'
    ? 'bg-gradient-to-br from-green-400 to-emerald-600 shadow-[0_6px_20px_-4px_rgba(34,197,94,0.65),inset_0_1px_0_0_rgba(255,255,255,0.5)]'
    : 'bg-gradient-to-br from-red-400 to-rose-600 shadow-[0_6px_20px_-4px_rgba(239,68,68,0.65),inset_0_1px_0_0_rgba(255,255,255,0.5)]'
  const repos = tone === 'green'
    ? 'hover:border-green-300/70 hover:text-green-700 hover:bg-green-50/50'
    : 'hover:border-red-300/70 hover:text-red-700 hover:bg-red-50/50'
  return `inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold backdrop-blur-md transition-all duration-200 ${active
    ? `scale-105 text-white ${plein}`
    : `border border-white/60 bg-white/30 text-gray-500 hover:scale-105 hover:shadow-sm ${repos}`}`
}

// ── Formulaire d'une dépense : blocs de verre, étiquettes à icône 3D, pastilles de choix ──
function EtiqD({ icone: Icone, couleur = '#B45309', children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D(couleur)}><Icone size={13} /></span>
      {children}
    </span>
  )
}
function TitreBloc({ icone: Icone, couleur, children, droite }) {
  return (
    <p className="mb-2.5 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-amber-800">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Icone size={14} /></span>
      {children}{droite}
    </p>
  )
}
const BLOC = 'df-bloc rounded-3xl border border-white/60 bg-white/35 p-3.5 shadow-[0_14px_30px_-18px_rgba(120,53,15,0.45),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-xl'
const chipChoix = (actif) => `group relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border px-3 py-1.5 text-xs font-extrabold backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${actif ? 'border-white/60 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-[0_10px_20px_-10px_rgba(180,83,9,0.8),inset_0_1px_0_rgba(255,255,255,0.5)]' : 'border-white/70 bg-white/60 text-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] hover:bg-white/85'}`

const empty = () => ({
  // Par défaut : Siège (Caisse courante) — la dépense « ordinaire », sans secteur
  // particulier. L'utilisateur bascule sur « Oui » s'il veut désigner un secteur.
  secteurId: '', origineFonds: '', site: '', categorie: '', montant: '', date: todayStr(),
  description: '', imprevue: false, modePaiement: 'espece',
  natureFlux: natureFluxDefaut, sourceFinancement: 'entreprise', financePar: '',
  // « Cette dépense concerne-t-elle un secteur ? » (n'a de sens que pour une
  // dépense Caisse courante) — Non par défaut. concerneAutreSecteur ne pilote que
  // l'affichage du sélecteur ; secteursConcernes (0 ou 1 élément) est la seule
  // donnée réellement utilisée au tri.
  concerneAutreSecteur: false, secteursConcernes: [],
  // « Justificatif requis (Reçus) ? » — Oui par défaut : l'auteur de la dépense doit
  // en principe rapporter un reçu. `justificatifRecu` se confirme ensuite depuis la
  // liste (bande) une fois la dépense décaissée — cf. bouton dédié + alerte Dashboard.
  justificatifRequis: true, justificatifRecu: false,
  beneficiaireType: 'interne', beneficiaireUid: '', beneficiaireNom: '', beneficiaireFonction: '', beneficiaireTelephone: ''
})

export default function Depenses() {
  const { user, role: roleReel } = useAuth()
  // super_admin/admin/directeur sont traités comme un agent dans E-DÉPENSES (cf.
  // depenseRoleEffectif) — seuls pau, ge et info gardent l'accès complet ici.
  const role = depenseRoleEffectif(roleReel)
  const isAdmin = isFullAccessRole(role)
  const lectureSeule = isReadOnlyRole(role)
  // L'agent n'a accès qu'aux dépenses du mois en cours et du mois précédent (même
  // fenêtre glissante de 2 mois que pour E-G.Pro, cf. projet/Depenses.jsx).
  const restreintMoisCourant = role === 'agent'
  const moisCourantStr    = todayStr().slice(0, 7)
  const moisPrecedentStr  = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
  const { data: depensesReelles } = useCollection('depense_depenses')
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: users }   = useCollection('users')
  const { data: depenseParams } = useCollection('depense_params')
  // Seuils d'alerte configurables en Paramètres — cf. Dashboard.jsx.
  const seuils = useMemo(() => seuilsBudgetDe(depenseParams), [depenseParams])

  // Tout ce qui vient d'E-G.Pro (versements, besoins de projet validés — repérables à
  // leur `projetId`, cf. projet/Besoins.jsx) n'apparaît plus ici : ça ne se consulte
  // que depuis E-G.Pro lui-même (onglet Dépenses), lui compris le suivi de l'apport/
  // dette PAU et son bouton « Rembourser ». Seul reste inclus en lecture seule le coût
  // matières Briqueterie. Les dépenses de chantier (secteur BAT) gérées depuis E-G.Pro
  // restent exclues — sauf celles saisies directement ici (cf. visibleDansEDepenses).
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  const depenses = useMemo(
    () => [
      ...depensesReelles.filter((d) => !d.projetId),
      ...coutsMatieresBriqueterie(inventairesBriq)
    ].filter(visibleDansEDepenses),
    [depensesReelles, inventairesBriq]
  )
  useEffect(() => { marquerVoletVu(user?.uid, 'depenseDepenses') }, [user?.uid])

  const [recherche, setRecherche] = useState('')
  const [filtreAffectation, setFiltreAffectation] = useState('') // '' | 'a_affecter' | 'affectees'
  const [tri, setTri] = useState('date_desc') // tri de la liste : date, montant, secteur ou catégorie
  const [filtreSecteur, setFiltreSecteur] = useState('')
  // Sous-filtre site — n'a de sens que pour MAXI LOGISTIQUE (budget/dépenses séparés
  // par site, cf. LOGISTIQUE_SITES). Réinitialisé si on change de secteur.
  const [filtreSite, setFiltreSite] = useState('')
  const [filtreCategorie, setFiltreCategorie] = useState('')
  const [filtreNature, setFiltreNature] = useState('')
  const [filtreFinancement, setFiltreFinancement] = useState('') // '' | 'caisse_commune'
  // Période : Jour / Mois / Année / Plage, en menu déroulant (comme dans les autres volets). Mois par défaut.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState(todayStr().slice(0, 7))
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')
  const [modal, setModal] = useState(null)
  const [lot, setLot] = useState(null)            // ajout multiple : tableau de lignes, ou null si fermé
  const [savingLot, setSavingLot] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [demandeOuverte, setDemandeOuverte] = useState(false) // fenêtre « Nouvelle demande » (onglet Faire une demande)
  const [retourModal, setRetourModal] = useState(null) // retour de reliquat : { d, montant, date, motif }
  const [retourSaving, setRetourSaving] = useState(false)
  const [motifSuppression, setMotifSuppression] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // La fenêtre de détail est indexée par id (pas par snapshot) : ainsi, si un chef de
  // projet modifie la dépense dans E-G.Pro pendant qu'elle est ouverte ici, le détail
  // se met à jour tout seul (la liste `depenses` est en temps réel).
  const detail = detailId ? depenses.find((d) => d.id === detailId) || null : null

  // Ouverture directe du détail d'une dépense depuis une notification — évite de
  // devoir la rechercher dans la liste. `filtreMois` seul (sans openDepenseId) sert
  // quand plusieurs dépenses sont concernées à la fois (ex. dépenses récurrentes
  // reconduites) : la liste s'ouvre déjà filtrée sur le bon mois.
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const { openDepenseId, filtreMois: moisVoulu, openCreateSecteurId } = location.state || {}
    if (!openDepenseId && !moisVoulu && !openCreateSecteurId) return
    if (openDepenseId) setDetailId(openDepenseId)
    if (moisVoulu) { setModePeriode('mois'); setFiltreMois(moisVoulu) }
    // Bouton « Ajouter une dépense » depuis le volet Dépense d'un secteur (agro,
    // logistique…) — ouvre directement le formulaire, secteur déjà pré-rempli.
    if (openCreateSecteurId) setModal({ data: { ...empty(), secteurId: openCreateSecteurId }, isNew: true })
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state])

  // ── Retours de reliquat ──────────────────────────────────────────────────────────────────────
  // Un retour de fonds est enregistré comme une dépense de montant NÉGATIF (source `retour_reliquat`, lien `retourDe`), de même
  // secteur et de même financement que la dépense d'origine : partout où l'on additionne les dépenses (budget, solde, Caisse,
  // report automatique), le reliquat revenu s'en déduit donc tout seul. Dans la Caisse, il apparaît comme une entrée.
  const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR')
  const retoursParDepense = useMemo(() => {
    const m = new Map()
    depenses.forEach((r) => { if (r.source === 'retour_reliquat' && r.retourDe) m.set(r.retourDe, (m.get(r.retourDe) || 0) + Math.abs(Number(r.montant) || 0)) })
    return m
  }, [depenses])
  const resteRetournable = (d) => Math.max(0, (Number(d.montant) || 0) - (retoursParDepense.get(d.id) || 0))
  const peutRetourner = (d) => !lectureSeule && d.source !== 'retour_reliquat' && d.source !== 'briqueterie' && d.source !== 'projet'
    && (d.statut === 'decaissee' || !d.statut) && (d.sourceFinancement || 'entreprise') !== 'pau' && resteRetournable(d) > 0
  function ouvrirRetour(d) {
    setDetailId(null)
    setRetourModal({ d, montant: '', date: todayStr(), motif: `Reliquat de : ${d.description || d.categorie || 'dépense'}` })
  }
  async function enregistrerRetour() {
    if (!retourModal || retourSaving) return
    const { d, montant, date, motif } = retourModal
    const m = Number(montant)
    const reste = resteRetournable(d)
    if (!(m > 0)) return toast.error('Montant requis')
    if (m > reste) return toast.error(`Le retour ne peut pas dépasser le reste à retourner (${fmtN(reste)} FCFA)`)
    if (!motif.trim()) return toast.error('Le motif est obligatoire')
    if (!date) return toast.error('Date requise')
    setRetourSaving(true)
    try {
      await addItem('depense_depenses', {
        date, secteurId: d.secteurId, site: d.site || null, categorie: d.categorie || '', montant: -m,
        description: `Retour de reliquat : ${d.description || d.categorie || 'dépense'}`, motif: motif.trim(),
        source: 'retour_reliquat', retourDe: d.id, statut: 'decaissee',
        natureFlux: d.natureFlux || natureFluxDefaut, sourceFinancement: d.sourceFinancement || 'entreprise', financePar: d.financePar || '',
        secteursConcernes: d.secteursConcernes || [], modePaiement: d.modePaiement || 'espece',
        justificatifRequis: false, justificatifRecu: false, beneficiaireNom: '', beneficiaireType: 'interne',
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
      })
      await audit('depense', 'RETOUR_RELIQUAT', `${fmtN(m)} FCFA retournés : ${d.description || d.categorie || 'dépense'} (${motif.trim()})`, { depenseId: d.id, secteurId: d.secteurId, montant: m, date })
      toast.success('Reliquat retourné ✓')
      setRetourModal(null)
    } catch (e) {
      toast.error(e?.message || 'Le retour n\'a pas pu être enregistré')
    } finally {
      setRetourSaving(false)
    }
  }

  const liste = useMemo(() => {
    let rows = [...depenses]
    // Une dépense filtre sur son secteur PRINCIPAL, mais aussi sur les « autres
    // secteurs concernés » (cf. secteursConcernes) — ex. une charge payée depuis
    // la Caisse courante qui profite en réalité à plusieurs secteurs à la fois.
    if (filtreSecteur) rows = rows.filter((d) => d.secteurId === filtreSecteur || (d.secteursConcernes || []).includes(filtreSecteur))
    // Le sous-filtre par site ne s'applique qu'aux lignes RATTACHÉES à Logistique
    // (site connu) — une ligne d'un autre secteur qui ne fait que « concerner »
    // Logistique en plus n'a pas de site propre, donc reste visible quel que soit
    // le site choisi.
    if (filtreSecteur === 'logistique' && filtreSite) rows = rows.filter((d) => d.secteurId !== 'logistique' || siteLogistiqueDe(d) === filtreSite)
    if (filtreCategorie) rows = rows.filter((d) => d.categorie === filtreCategorie)
    if (filtreAffectation) rows = rows.filter((d) => !d.source && (filtreAffectation === 'affectees' ? estAffectee(d) : !estAffectee(d)))
    if (filtreNature)    rows = rows.filter((d) => (d.natureFlux || natureFluxDefaut) === filtreNature)
    if (filtreFinancement === 'caisse_commune') rows = rows.filter((d) => d.financePar === 'caisse_commune')
    if (modePeriode === 'mois' && filtreMois) rows = rows.filter((d) => (d.date || '').startsWith(filtreMois))
    else if (modePeriode === 'jour' && filtreJour) rows = rows.filter((d) => d.date === filtreJour)
    else if (modePeriode === 'annee' && filtreAnnee) rows = rows.filter((d) => (d.date || '').startsWith(filtreAnnee))
    else if (modePeriode === 'plage' && (filtreDebut || filtreFin)) rows = rows.filter((d) => (!filtreDebut || d.date >= filtreDebut) && (!filtreFin || d.date <= filtreFin))
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((d) => (d.description || '').toLowerCase().includes(q))
    }
    if (restreintMoisCourant) {
      rows = rows.filter((d) => {
        const m = (d.date || '').slice(0, 7)
        // Un agent ne voit que le mois courant et le précédent, SAUF les dépenses pas encore affectées : il doit pouvoir remonter dans
        // les mois passés pour les corriger (destination et origine des fonds).
        return m === moisCourantStr || m === moisPrecedentStr || (!d.source && !estAffectee(d))
      })
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [depenses, filtreAffectation, filtreSecteur, filtreSite, filtreCategorie, filtreNature, filtreFinancement, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin, recherche, restreintMoisCourant, moisCourantStr, moisPrecedentStr])

  // Avancement de l'affectation sur toutes les dépenses saisies dans E-DÉPENSES : combien sont faites, par qui, combien restent.
  const suiviAffectation = useMemo(() => {
    const saisies = depenses.filter((d) => !d.source)
    const faites = saisies.filter(estAffectee)
    const parAgent = new Map()
    faites.forEach((d) => { const n = affecteurDe(d) || 'Inconnu'; parAgent.set(n, (parAgent.get(n) || 0) + 1) })
    return { total: saisies.length, faites: faites.length, reste: saisies.length - faites.length, parAgent: [...parAgent.entries()].sort((x, y) => y[1] - x[1]) }
  }, [depenses])
  // Tout est affecté : le bandeau disparaît, et le filtre « À affecter » (devenu vide) est levé tout seul.
  useEffect(() => { if (suiviAffectation.reste === 0 && filtreAffectation === 'a_affecter') setFiltreAffectation('') }, [suiviAffectation.reste, filtreAffectation])

  const totalListe = liste.reduce((s, d) => s + (Number(d.montant) || 0), 0)

  // KPI budget alloué — mois de référence : celui du filtre « Mois » s'il est posé,
  // sinon le mois courant (le filtre peut être vidé pour voir « Toutes périodes »,
  // mais un budget alloué n'a de sens que rapporté à UN mois précis).
  const [anneeKpi, moisKpi] = useMemo(() => {
    // Mois de référence du budget : celui de la période choisie (jour, mois, année en cours ou passée, début de plage).
    const auj = todayStr().slice(0, 7)
    let m = auj
    if (modePeriode === 'mois') m = filtreMois || auj
    else if (modePeriode === 'jour') m = filtreJour ? filtreJour.slice(0, 7) : auj
    else if (modePeriode === 'annee') m = filtreAnnee ? (filtreAnnee === auj.slice(0, 4) ? auj : `${filtreAnnee}-12`) : auj
    else m = (filtreDebut || filtreFin || '').slice(0, 7) || auj
    const [a, mo] = m.split('-').map(Number)
    return [a, mo]
  }, [modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])
  const periodeTexte = modePeriode === 'mois' ? filtreMois : modePeriode === 'jour' ? filtreJour : modePeriode === 'annee' ? filtreAnnee : [filtreDebut, filtreFin].filter(Boolean).join('_au_')

  // Budget alloué total, tous secteurs métier confondus (hors Caisse courante, comptée
  // séparément ci-dessous) — Logistique compte ses deux sites (Lomé + Kara).
  const budgetAutresSecteurs = useMemo(
    () => secteursEtSites(false)
      .filter((s) => s.secteurId !== 'divers')
      .reduce((sum, s) => sum + budgetSecteur(budgets, s.secteurId, anneeKpi, moisKpi, s.site), 0),
    [budgets, anneeKpi, moisKpi]
  )
  const depenseAutresSecteurs = useMemo(
    () => secteursEtSites(false)
      .filter((s) => s.secteurId !== 'divers')
      .reduce((sum, s) => sum + totalDepenses(depensesEntrepriseSecteurMois(depenses, s.secteurId, anneeKpi, moisKpi, s.site)), 0),
    [depenses, anneeKpi, moisKpi]
  )
  const budgetCaisseCommune = useMemo(() => budgetSecteur(budgets, 'divers', anneeKpi, moisKpi), [budgets, anneeKpi, moisKpi])
  const depenseCaisseCommune = useMemo(
    () => totalDepenses(depensesEntrepriseSecteurMois(depenses, 'divers', anneeKpi, moisKpi)),
    [depenses, anneeKpi, moisKpi]
  )
  // Caisse courante : les mêmes lignes que la page Caisse (dotations, retours), pour voir les dotations dans la liste.
  const lignesCaisse = useMemo(
    () => construireLignesCaisse({ depenses: depensesReelles, coutsMatieres: coutsMatieresBriqueterie(inventairesBriq), budgets }),
    [depensesReelles, inventairesBriq, budgets]
  )
  // Solde initial du mois de référence = reste du dernier jour du mois précédent (même calcul que la page Caisse).
  const caisseMois = useMemo(() => {
    const m = `${anneeKpi}-${String(moisKpi).padStart(2, '0')}`
    const j = journalPeriode(lignesCaisse, bornesPeriode('mois', { mois: m }), { mensuel: true })
    const veille = new Date(anneeKpi, moisKpi - 1, 0)
    return { initial: j.soldeInitial, final: j.soldeFinal, veille: `${String(veille.getDate()).padStart(2, '0')}/${String(veille.getMonth() + 1).padStart(2, '0')}/${veille.getFullYear()}` }
  }, [lignesCaisse, anneeKpi, moisKpi])
  // Dotations de la période affichée (les reports du mois précédent sont le solde initial, pas des dotations).
  const dotationsListe = useMemo(() => {
    if ((filtreSecteur && filtreSecteur !== 'divers') || filtreCategorie || filtreNature) return []
    const q = recherche.trim().toLowerCase()
    return lignesCaisse.filter((l) => l.type === 'dotation' && !l.report && l.entree > 0).filter((l) => {
      const dt = l.date
      if (modePeriode === 'mois' && filtreMois) { if (!dt.startsWith(filtreMois)) return false }
      else if (modePeriode === 'jour' && filtreJour) { if (dt !== filtreJour) return false }
      else if (modePeriode === 'annee' && filtreAnnee) { if (!dt.startsWith(filtreAnnee)) return false }
      else if (modePeriode === 'plage' && (filtreDebut || filtreFin)) { if ((filtreDebut && dt < filtreDebut) || (filtreFin && dt > filtreFin)) return false }
      if (restreintMoisCourant) { const m = dt.slice(0, 7); if (m !== moisCourantStr && m !== moisPrecedentStr) return false }
      return !q || (l.designation || '').toLowerCase().includes(q)
    })
  }, [lignesCaisse, filtreSecteur, filtreCategorie, filtreNature, recherche, modePeriode, filtreMois, filtreJour, filtreAnnee, filtreDebut, filtreFin, restreintMoisCourant, moisCourantStr, moisPrecedentStr])
  // Tri choisi dans la bande : par date, les dotations restent mêlées aux dépenses ; par montant, secteur ou catégorie, seules les
  // dépenses sont classées (les dotations n'ont ni secteur ni catégorie).
  const lignesTable = useMemo(() => {
    const deps = liste.map((d) => ({ kind: 'dep', d, date: d.date, id: d.id }))
    const parDate = (sens) => [...dotationsListe.map((l) => ({ kind: 'dot', l, date: l.date, id: l.id })), ...deps]
      .sort((x, y) => (x.date === y.date ? (x.kind === 'dot' ? -1 : 0) - (y.kind === 'dot' ? -1 : 0) : (x.date < y.date ? 1 : -1) * sens))
    if (tri === 'date_desc') return parDate(1)
    if (tri === 'date_asc') return parDate(-1)
    const m = (it) => Number(it.d.montant) || 0
    const secteurDe = (it) => libelleSecteurSite(SECTEURS.find((s) => s.id === it.d.secteurId), it.d)
    const cmp = {
      montant_desc: (x, y) => m(y) - m(x),
      montant_asc: (x, y) => m(x) - m(y),
      secteur: (x, y) => secteurDe(x).localeCompare(secteurDe(y), 'fr') || (x.date < y.date ? 1 : -1),
      categorie: (x, y) => (x.d.categorie || '').localeCompare(y.d.categorie || '', 'fr') || (x.date < y.date ? 1 : -1)
    }[tri]
    return deps.sort(cmp)
  }, [dotationsListe, liste, tri])
  // Ligne « solde initial » en tête : seulement pour un mois précis et pour la caisse courante (ou tous les secteurs).
  const afficherSoldeInitial = tri === 'date_desc' && modePeriode === 'mois' && !!filtreMois && (!filtreSecteur || filtreSecteur === 'divers') && !filtreCategorie && !filtreNature && !recherche.trim()
  const resteAutresSecteurs = budgetAutresSecteurs - depenseAutresSecteurs
  const resteCaisseCommune  = budgetCaisseCommune - depenseCaisseCommune

  // Export Excel — reprend le format du carnet papier : Date, Libellé, Montant,
  // Nom de l'agréeur (bénéficiaire — celui à qui la somme est destinée, avec son
  // numéro s'il est connu via son compte utilisateur), Source (de financement).
  // Exporte exactement la liste affichée à l'écran (mêmes filtres, même restriction
  // de mois pour l'agent).
  function exportExcel() {
    const rows = liste.map((d) => {
      const secteur = SECTEURS.find((s) => s.id === d.secteurId)
      let agreeur = d.beneficiaireNom || ''
      if (d.beneficiaireUid) {
        const u = users.find((x) => x.uid === d.beneficiaireUid)
        if (u?.telephone) agreeur = agreeur ? `${agreeur} (${u.telephone})` : u.telephone
      }
      return {
        date: formatDateShort(d.date),
        libelle: d.description || CATEGORIES_DEPENSE.find((c) => c.id === d.categorie)?.label || d.categorie || '—',
        montant: Number(d.montant) || 0,
        agreeur: agreeur || '—',
        secteur: libelleSecteurSite(secteur, d),
        origine: libelleOrigine(origineDe(d)) || 'Non renseignée',
        autresSecteurs: (d.secteursConcernes || []).map((id) => SECTEURS.find((s) => s.id === id)?.label || id).join(', ') || '—',
        financement: d.financePar === 'caisse_commune' ? 'Caisse courante' : 'Secteur'
      }
    })
    exportRapportExcel({
      filename: `depenses-${periodeTexte || 'toutes'}.xlsx`,
      sections: [{
        id: 'depenses', name: 'Dépenses', title: 'Extraction des dépenses',
        subtitle: periodeTexte ? `Période : ${periodeTexte.replace('_au_', ' au ')}` : 'Toutes périodes',
        columns: [
          { key: 'date', label: 'Date', width: 14 },
          { key: 'libelle', label: 'Libellé', width: 30 },
          { key: 'montant', label: 'Montant', width: 16, type: 'money' },
          { key: 'agreeur', label: "Nom de l'agréeur", width: 26 },
          { key: 'secteur', label: 'Secteur (destination)', width: 22 },
          { key: 'origine', label: 'Origine des fonds', width: 20 },
          { key: 'autresSecteurs', label: 'Autres secteurs concernés', width: 26 },
          { key: 'financement', label: 'Financement', width: 16 }
        ],
        rows,
        totals: { __label: 'TOTAL', montant: rows.reduce((s, r) => s + r.montant, 0) }
      }]
    })
  }

  // Suggestions de catégories : catégories prédéfinies + celles déjà saisies par les
  // utilisateurs. `.trim()` avant regroupement : une catégorie saisie avec un espace
  // en trop (ex. « Autre  ») ne doit pas apparaître comme un doublon de « Autre ».
  const categorieSuggestions = useMemo(() => {
    const saisies = depenses.map((d) => (d.categorie || '').trim()).filter(Boolean)
    return [...new Set([...CATEGORIES_DEPENSE.map((c) => c.label), ...saisies])].sort()
  }, [depenses])

  const categoriesPresentes = useMemo(
    () => [...new Set(depenses.map((d) => (d.categorie || '').trim()).filter(Boolean))].sort(),
    [depenses]
  )

  function openCreate() { setModal({ data: empty(), isNew: true }) }
  function openEdit(d)  { setModal({ data: { ...empty(), ...d, origineFonds: origineValide(d.origineFonds) ? d.origineFonds : '', secteurId: (origineValide(d.origineFonds) || d.affecteeLe || d.secteurId !== 'divers') ? d.secteurId : '', concerneAutreSecteur: (d.secteursConcernes || []).length > 0 }, isNew: false, id: d.id }) }

  // ── Ajout multiple (lot) ──
  const ligneVide = () => ({ secteurId: '', origineFonds: 'divers', site: '', categorie: '', montant: '', date: todayStr(), description: '', natureFlux: natureFluxDefaut, sourceFinancement: 'entreprise', financePar: '', imprevue: false })
  function openLot() { setLot([ligneVide(), ligneVide(), ligneVide()]) }
  const setLigne = (i, k, v) => setLot((rows) => rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)))
  const ajouterLigne = () => setLot((rows) => [...rows, ligneVide()])
  const retirerLigne = (i) => setLot((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows))
  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  // Confirme que le justificatif (reçu) demandé à la saisie a bien été rapporté par
  // le bénéficiaire — fait taire l'alerte correspondante sur le Dashboard (secrétaire,
  // info, assistant PAU). Mise à jour ciblée (updateItem), pas de remplacement complet.
  async function confirmerJustificatif(d) {
    await updateItem('depense_depenses', d.id, {
      justificatifRecu: true, justificatifRecuLe: Date.now(), justificatifRecuPar: user?.nom || user?.login || '—'
    })
    await audit('depense', 'JUSTIFICATIF_CONFIRME', `${d.beneficiaireNom || '—'} : ${formatMoney(Number(d.montant) || 0)}`)
    toast.success('Justificatif confirmé reçu ✓')
  }

  // Raison pour laquelle une dépense (E-DÉPENSES uniquement — E-G.Pro a son propre
  // circuit via les besoins) devient une demande d'autorisation, ou null si aucune.
  // Utilisée pour l'indication en direct dans le formulaire, avant même d'enregistrer.
  const raisonAutorisation = (d) => raisonAutorisationPartagee(d, { budgets, depenses })

  // Crée une nouvelle dépense en appliquant le circuit d'autorisation (partagé avec
  // RecettesDepenses.jsx → bouton « Ajouter une dépense » de chaque secteur métier).
  const soumettreNouvelleDepense = (d) => soumettreNouvelleDepensePartagee(d, { user, budgets, depenses, seuils })

  async function handleSave() {
    if (saving) return
    const d = modal.data
    if (!d.secteurId) return toast.error('Destination requise : choisissez le secteur que la somme va servir')
    if (!origineValide(d.origineFonds)) return toast.error('Origine des fonds requise : Caisse courante ou Banque')
    if (d.secteurId === 'autre' && !(d.secteurAutre || '').trim()) return toast.error('Précisez le nom du secteur')
    if (d.secteurId === 'logistique' && !d.site) return toast.error('Site requis (Lomé ou Kara)')
    if (!d.categorie) return toast.error('Catégorie requise')
    if (!d.montant || Number(d.montant) <= 0) return toast.error('Montant requis')
    if (!d.date) return toast.error('Date requise')
    if (!d.description || !d.description.trim()) return toast.error('Description requise : précisez le motif de la dépense')
    if (!d.beneficiaireNom || !d.beneficiaireNom.trim()) return toast.error('Bénéficiaire requis : identifiez qui reçoit la somme')

    setSaving(true)
    try {
      if (modal.isNew) {
        const { statutInitial } = await soumettreNouvelleDepense(d)
        toast.success(
          statutInitial === 'en_attente'
            ? 'Demande de décaissement soumise : en attente d\'autorisation ✓'
            : 'Dépense enregistrée ✓'
        )
      } else {
        const secteur = SECTEURS.find((s) => s.id === d.secteurId)
        // On note qui a renseigné la destination et l'origine (suivi de l'affectation des anciennes dépenses).
        const avant = depenses.find((x) => x.id === modal.id)
        const change = !avant || !estAffectee(avant) || avant.secteurId !== d.secteurId || avant.origineFonds !== d.origineFonds
        await setItem('depense_depenses', modal.id, {
          ...d, financePar: financementSiege(d), id: modal.id,
          ...(change ? { affecteePar: user?.nom || user?.login || '—', affecteeParUid: user?.uid || null, affecteeLe: Date.now() } : {})
        })
        await audit('depense', 'DEPENSE_EDIT', `${libelleSecteurSite(secteur, d)} : ${Number(d.montant).toLocaleString('fr-FR')} FCFA`)
        toast.success('Dépense mise à jour ✓')
        await alerterSiDepassement({ ...d, id: modal.id }, secteur)
      }
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  // Ajout multiple (lot) : enregistre plusieurs dépenses d'un seul coup. Chaque ligne
  // complète suit le même circuit (décaissée ou demande PAU selon le montant/imprévu).
  async function enregistrerLot() {
    if (savingLot) return
    const valides = (lot || []).filter((r) => r.secteurId && (r.secteurId !== 'logistique' || r.site) && r.categorie && Number(r.montant) > 0 && r.date)
    if (valides.length === 0) return toast.error('Aucune ligne complète à enregistrer (secteur, site pour Logistique, catégorie, montant, date)')
    setSavingLot(true)
    try {
      let nbDemandes = 0
      for (const r of valides) {
        const { statutInitial } = await soumettreNouvelleDepense(r)
        if (statutInitial === 'en_attente') nbDemandes++
      }
      toast.success(`${valides.length} dépense(s) enregistrée(s)${nbDemandes ? ` · ${nbDemandes} demande(s) envoyée(s) au PAU` : ''} ✓`)
      setLot(null)
    } finally {
      setSavingLot(false)
    }
  }

  // Notifie les rôles financiers si le secteur atteint 80%+ de son budget mensuel.
  async function alerterSiDepassement(d, secteur) {
    const [annee, mois] = (d.date || '').split('-').map(Number)
    if (!annee || !mois) return
    const alloue = budgetSecteur(budgets, d.secteurId, annee, mois, d.site)
    if (alloue <= 0) return
    const depenseTotal = totalDepenses(depensesEntrepriseSecteurMois([...depenses.filter((x) => x.id !== d.id), d], d.secteurId, annee, mois, d.site))
    const pct = Math.round((depenseTotal / alloue) * 100)
    const statut = statutBudget(pct, seuils)
    if (statut.key === 'ok') return
    const libelle = libelleSecteurSite(secteur, d)
    await notify({
      type: statut.key === 'depasse' ? 'danger' : 'warning',
      title: statut.key === 'depasse' ? `🔴 Budget dépassé : ${libelle}` : `🟠 Budget en alerte : ${libelle}`,
      body: `${pct}% du budget consommé (${depenseTotal.toLocaleString('fr-FR')} / ${alloue.toLocaleString('fr-FR')} FCFA)`,
      module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid, link: '/depense'
    })
  }

  function fermerSuppression() {
    setToDelete(null)
    setMotifSuppression('')
  }

  async function handleDelete() {
    if (!toDelete || deleting) return
    // Garde-fou : une ligne « pont Briqueterie » n'a pas de document réel dans
    // depense_depenses — rien à supprimer ici, elle se pilote depuis le Stock Briqueterie.
    if (toDelete.source === 'briqueterie') { fermerSuppression(); return }
    // Le motif est OBLIGATOIRE : une suppression de dépense doit toujours être
    // justifiée et tracée (cf. audit ci-dessous → volet Journal et Historique).
    const motif = motifSuppression.trim()
    if (!motif) return toast.error('Indiquez le motif de la suppression')
    setDeleting(true)
    const target = toDelete
    try {
      const secteur = SECTEURS.find((s) => s.id === target.secteurId)
      // Les dépenses de projet (E-G.Pro) n'apparaissent plus dans cette liste (cf.
      // `depenses` ci-dessus) — plus besoin de gérer leur suppression croisée ici,
      // elle se fait uniquement depuis E-G.Pro.
      // Tombstone : la dépense quitte la liste active mais reste consultable EN DÉTAIL
      // dans l'Historique (avec qui/quand/pourquoi). Collection dédiée → aucun risque
      // qu'une dépense supprimée réapparaisse dans un calcul de budget ou une liste.
      await setItem('depense_depenses_supprimees', target.id, {
        ...target, id: target.id,
        supprimeePar: user?.nom || user?.login || '—', supprimeeParUid: user?.uid || null,
        supprimeeLe: Date.now(), motifSuppression: motif
      })
      await removeItem('depense_depenses', target.id)
      await audit('depense', 'DEPENSE_DELETE',
        `${secteur?.label || target.secteurId} : ${formatMoney(Number(target.montant) || 0)}${target.categorie ? ` · ${target.categorie}` : ''}${target.description ? ` : ${target.description}` : ''} · Motif : ${motif}`,
        { secteurId: target.secteurId, montant: Number(target.montant) || 0, categorie: target.categorie || null, date: target.date || null, motifSuppression: motif }
      )
      toast.success('Dépense supprimée ✓')
      fermerSuppression()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <style>{`
        @keyframes dp-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes dp-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes dp-halo { 0%, 100% { box-shadow: 0 12px 22px -10px rgba(180,83,9,0.7), 0 0 0 0 rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.5); } 50% { box-shadow: 0 12px 22px -10px rgba(180,83,9,0.7), 0 0 0 9px rgba(251,191,36,0), inset 0 1px 0 rgba(255,255,255,0.5); } }
        .dp-ligne { animation: dp-entree 0.4s ease-out backwards; }
        .dp-icone { animation: dp-flotte 3.2s ease-in-out infinite; }
        .df-bloc { animation: dp-entree 0.4s ease-out backwards; }
        .df-bloc:nth-child(2) { animation-delay: 0.06s; } .df-bloc:nth-child(3) { animation-delay: 0.12s; } .df-bloc:nth-child(4) { animation-delay: 0.18s; } .df-bloc:nth-child(5) { animation-delay: 0.24s; }
      `}</style>

      {/* Bande du volet : tous les filtres (recherche, mois, secteur, site, catégorie, nature, financement) y sont réunis. */}
      <BandeauVolet couleur="#B45309" icone={Receipt} titre="Dépenses"
        sous={`${liste.length} dépense(s) · ${totalListe.toLocaleString('fr-FR')} FCFA : saisie, filtres et justificatifs de tous les secteurs.`}>
        <ChampRecherche variant="glass" className="!w-52" value={recherche} onChange={setRecherche} placeholder="Rechercher une description…" />
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour} valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut} valeurFin={filtreFin} onFinChange={setFiltreFin} />
        <ChampBande label="Secteur">
          <select value={filtreSecteur} onChange={(e) => { setFiltreSecteur(e.target.value); setFiltreSite('') }} className={`${CLASSE_CHAMP_BANDE} w-36`}>
            <option value="">Tous les secteurs</option>
            {SECTEURS.map((s) => <option key={s.id} value={s.id}>{libelleChoixSecteur(s)}</option>)}
          </select>
        </ChampBande>
        {filtreSecteur === 'logistique' && (
          <ChampBande label="Site">
            <select value={filtreSite} onChange={(e) => setFiltreSite(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-28`}>
              <option value="">Lomé + Kara</option>
              {LOGISTIQUE_SITES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </ChampBande>
        )}
        <ChampBande label="Affectation">
          <select value={filtreAffectation} onChange={(e) => setFiltreAffectation(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-32`}>
            <option value="">Toutes</option>
            <option value="a_affecter">À affecter</option>
            <option value="affectees">Affectées</option>
          </select>
        </ChampBande>
        <ChampBande label="Trier par">
          <select value={tri} onChange={(e) => setTri(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-40`}>
            <option value="date_desc">Date : récentes d'abord</option>
            <option value="date_asc">Date : anciennes d'abord</option>
            <option value="montant_desc">Montant : du plus grand</option>
            <option value="montant_asc">Montant : du plus petit</option>
            <option value="secteur">Secteur (A à Z)</option>
            <option value="categorie">Catégorie (A à Z)</option>
          </select>
        </ChampBande>
        <ChampBande label="Nature du flux">
          <select value={filtreNature} onChange={(e) => setFiltreNature(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-32`}>
            <option value="">Toutes</option>
            {Object.entries(NATURES_FLUX).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </ChampBande>
      </BandeauVolet>

      {/* Actions sous la bande : export, ajout multiple, nouvelle dépense (animée). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Onglets : la liste des dépenses, et « Faire une demande » (ouvre la demande de décaissement, envoyée au PAU, à la GE, à l'Info et à la direction). */}
        <PillTabs taille="sm" active="depenses" accent="#B45309" onChange={(id) => { if (id === 'demande') setDemandeOuverte(true) }}
          tabs={[{ id: 'depenses', label: 'Dépenses', icone: Receipt }, ...(lectureSeule ? [] : [{ id: 'demande', label: 'Faire une demande', icone: Send, accent: '#0d9488' }])]} />
        <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={exportExcel} disabled={liste.length === 0}><FileSpreadsheet size={16} /> Export Excel</Button>
        {!lectureSeule && <Button variant="outline" onClick={openLot}><Layers size={16} /> Ajout multiple</Button>}
        {!lectureSeule && (
          <BoutonVerre icone={Receipt} animation="recu" badgePlus onClick={openCreate}>Ajouter une dépense</BoutonVerre>
        )}
        </div>
      </div>
      <NouvelleDemandeModal open={demandeOuverte} onClose={() => setDemandeOuverte(false)} />

      {/* KPI — récap de la liste affichée + budget alloué (mois du filtre, ou mois
          courant si aucun filtre de mois n'est posé), autres secteurs vs Caisse courante. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Total dépenses (liste affichée)" value={`${totalListe.toLocaleString('fr-FR')} FCFA`}
          sub={`${liste.length} dépense(s)`} icon={Receipt} accent="#B45309" />
        <StatCard title="Budget alloué : autres secteurs" value={`${budgetAutresSecteurs.toLocaleString('fr-FR')} FCFA`}
          sub={`Dépensé ${depenseAutresSecteurs.toLocaleString('fr-FR')} FCFA · Reste ${resteAutresSecteurs.toLocaleString('fr-FR')} FCFA`}
          icon={Building2} accent={resteAutresSecteurs < 0 ? '#dc2626' : '#0d9488'} valueColor={resteAutresSecteurs < 0 ? '#dc2626' : undefined} />
        <StatCard title="Budget alloué : Caisse courante" value={`${budgetCaisseCommune.toLocaleString('fr-FR')} FCFA`}
          sub={`Dépensé ${depenseCaisseCommune.toLocaleString('fr-FR')} FCFA · Reste ${resteCaisseCommune.toLocaleString('fr-FR')} FCFA`}
          icon={PiggyBank} accent={resteCaisseCommune < 0 ? '#dc2626' : '#7c3aed'} valueColor={resteCaisseCommune < 0 ? '#dc2626' : undefined} />
      </div>

      {suiviAffectation.total > 0 && suiviAffectation.reste > 0 && (
        <div className="rounded-2xl border border-white/70 bg-white/60 p-3 shadow-[0_10px_24px_-16px_rgba(180,83,9,0.5)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={icone3D('#B45309')}><Building2 size={14} /></span>
            <p className="text-sm font-extrabold text-gray-800">Affectation des dépenses aux secteurs : {suiviAffectation.faites} sur {suiviAffectation.total} faites</p>
            <button type="button" onClick={() => {
              const activer = filtreAffectation !== 'a_affecter'
              setFiltreAffectation(activer ? 'a_affecter' : '')
              // Les dépenses restantes peuvent dater de mois passés : on lève le filtre de mois pour toutes les voir (et on le remet à la fin).
              setModePeriode('mois'); setFiltreMois(activer ? '' : todayStr().slice(0, 7))
            }}
              className="ml-auto rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-100">
              {filtreAffectation === 'a_affecter' ? 'Tout afficher' : `Voir les ${suiviAffectation.reste} restantes`}
            </button>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200/70">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-700" style={{ width: `${Math.round((suiviAffectation.faites / suiviAffectation.total) * 100)}%` }} />
          </div>
          {suiviAffectation.parAgent.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suiviAffectation.parAgent.map(([nom, n]) => (
                <span key={nom} className="rounded-full border border-white/80 bg-white/70 px-2 py-0.5 text-[10px] font-bold text-gray-600">{nom} : {n}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {lignesTable.length === 0 && !afficherSoldeInitial ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <Receipt size={34} className="opacity-30" />
            <p className="text-sm">Aucune dépense trouvée.</p>
          </div>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="max-h-[66vh] overflow-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className={TH}>Date</th><th className={TH}>Désignation</th><th className={TH}>Secteur</th><th className={TH}>Bénéficiaire</th>
                  <th className={`${TH} text-right`}>Montant</th><th className={TH}>Statut</th><th className={`${TH} !right-0 z-20`} style={{ position: 'sticky' }} />
                </tr>
              </thead>
              <tbody>
                {afficherSoldeInitial && (
                  <tr className="bg-gray-50 font-extrabold dark:bg-white/5">
                    <td colSpan={4} className="px-3 py-2 text-center text-xs uppercase tracking-wide text-gray-700 dark:text-gray-200">
                      Solde initial de la caisse au 1er {MOIS_LABELS[moisKpi - 1]?.toLowerCase()} {anneeKpi} <span className="font-semibold normal-case text-gray-400">(reste au {caisseMois.veille})</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-900 dark:text-gray-50">{fmtN(caisseMois.initial)}</td>
                    <td colSpan={2} />
                  </tr>
                )}
                {lignesTable.map((it, idx) => {
                  const memeJourLigne = tri.startsWith('date') && idx > 0 && lignesTable[idx - 1].date === it.date
                  if (it.kind === 'dot') {
                    const l = it.l
                    const { icone: IcD, couleur: cD, libelle } = iconeLigne(l)
                    const sD = SECTEURS.find((x) => x.id === 'divers')
                    return (
                      <tr key={it.id} style={{ background: `${COULEUR_DOTATION}1c`, animationDelay: `${Math.min(idx, 14) * 30}ms` }}
                        className={`dp-ligne border-t border-gray-100 dark:border-white/10 ${memeJourLigne ? '' : 'border-t-gray-300 dark:border-t-white/25'}`}>
                        <td className="whitespace-nowrap px-3 py-2 align-top text-xs font-extrabold text-gray-700 dark:text-gray-200">{memeJourLigne ? '' : formatDateShort(l.date)}</td>
                        <td className="px-3 py-2 align-top">
                          <span className="flex items-start gap-2">
                            <span title={libelle} className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D(cD)}><IcD size={12} /></span>
                            <span className="min-w-0">
                              <span className="mb-0.5 block text-[9px] font-extrabold uppercase tracking-wider" style={{ color: cD }}>{libelle}</span>
                              <span className="block max-w-[340px] break-words font-semibold uppercase text-gray-800 dark:text-gray-100">{l.designation}</span>
                            </span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-top text-xs font-extrabold uppercase" style={{ color: sD?.color || '#7c3aed' }}>Caisse courante</td>
                        <td className="px-3 py-2 align-top text-[11px] uppercase text-gray-600">{l.operateur || ':'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right align-top font-extrabold text-green-700">+{fmtN(l.entree)}</td>
                        <td className="px-3 py-2 align-top"><Badge tone="success">Dotation</Badge></td>
                        <td className="sticky right-0 z-[5] px-2 py-2" style={{ background: `linear-gradient(${COULEUR_DOTATION}1c, ${COULEUR_DOTATION}1c), #fff` }} />
                      </tr>
                    )
                  }
                  const d = it.d
                  const estRetour = d.source === 'retour_reliquat'
                  const IconeCat = estRetour ? Undo2 : iconeCategorie(d.categorie)
                  const dejaRetourne = retoursParDepense.get(d.id) || 0
                  const secteur = SECTEURS.find((s) => s.id === d.secteurId)
                  const secteurColor = secteur?.color || '#64748b'
                  const statut = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.decaissee
                  const nature = NATURES_FLUX[d.natureFlux || natureFluxDefaut]
                  const avecOrigine = d.source === 'besoin' // motif à afficher
                  const importe = !!d.source // dépense reprise d'un autre module (besoin, Briqueterie) : non modifiable ici
                  // Modifier une dépense déjà décaissée (ex. corriger la case « Payée depuis
                  // la Caisse courante » après coup) : admin, mais aussi secrétaire — pour
                  // qu'elle puisse réparer une erreur de saisie sans attendre un admin. La
                  // SUPPRESSION, elle, reste réservée à l'admin (action plus irréversible).
                  const modifiable = !importe && (isAdmin || role === 'secretaire' || role === 'agent' || d.statut === 'en_attente' || !d.statut)
                  const supprimable = !importe && (isAdmin || d.statut === 'en_attente' || !d.statut)
                  // Justificatif à confirmer : dépense décaissée (l'argent est réellement
                  // sorti), justificatif marqué requis à la saisie, pas encore confirmé reçu.
                  const justificatifAConfirmer = d.justificatifRequis && !d.justificatifRecu && (d.statut === 'decaissee' || !d.statut)
                  const memeJour = memeJourLigne
                  const titre = avecOrigine ? (d.projetNom || d.description || '—') : (d.description || '—')
                  return (
                    <tr key={d.id} onClick={() => setDetailId(d.id)} style={{ background: `${secteurColor}1c`, animationDelay: `${Math.min(idx, 14) * 30}ms` }}
                      className={`dp-ligne cursor-pointer border-t border-gray-100 transition-colors hover:brightness-95 dark:border-white/10 ${memeJour ? '' : 'border-t-gray-300 dark:border-t-white/25'}`}>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-xs font-extrabold text-gray-700 dark:text-gray-200">{memeJour ? '' : formatDateShort(d.date)}</td>

                      {/* Désignation : petite icône 3D de catégorie, description, puces discrètes */}
                      <td className="px-3 py-2 align-top">
                        <span className="flex items-start gap-2">
                          <span title={estRetour ? 'Retour de reliquat' : (d.categorie || 'Dépense')} className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D(estRetour ? '#16a34a' : secteurColor)}><IconeCat size={12} /></span>
                          <span className="min-w-0">
                            <span className="block max-w-[340px] break-words font-semibold uppercase text-gray-800 dark:text-gray-100">{titre}</span>
                            {avecOrigine && d.tacheTitre && <span className="block max-w-[340px] truncate text-[11px] normal-case text-gray-500">{d.tacheTitre}</span>}
                            <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold">
                              {d.categorie && <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-gray-500">{d.categorie}</span>}
                              <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-gray-500">{nature.label}</span>
                              {d.financePar === 'caisse_commune' && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-700">Caisse courante</span>}
                              {dejaRetourne > 0 && <span className="inline-flex items-center gap-0.5 rounded-md bg-green-100 px-1.5 py-0.5 text-green-700"><Undo2 size={9} /> {fmtN(dejaRetourne)} retournés</span>}
                              {(d.secteursConcernes || []).length > 0 && (
                                <span title={`Concerne aussi : ${d.secteursConcernes.map((id) => SECTEURS.find((s) => s.id === id)?.label || id).join(', ')}`} className="rounded-md bg-sky-100 px-1.5 py-0.5 text-sky-700">+{d.secteursConcernes.length} secteur{d.secteursConcernes.length > 1 ? 's' : ''}</span>
                              )}
                            </span>
                          </span>
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-3 py-2 align-top text-xs font-extrabold uppercase" style={{ color: secteurColor }}>
                        {libelleSecteurSite(secteur, d)}
                        {!importe && (estAffectee(d)
                          ? <span className="mt-0.5 block text-[9px] font-bold normal-case tracking-normal text-emerald-600">✓ affectée{affecteurDe(d) ? ` par ${affecteurDe(d)}` : ''}</span>
                          : <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold normal-case tracking-normal text-amber-700">À affecter</span>)}
                        {!importe && origineDe(d) && (
                          <span className="mt-0.5 block text-[9px] font-bold normal-case tracking-normal text-gray-400">depuis {origineDe(d) === 'banque' ? 'la banque' : 'la caisse courante'}</span>
                        )}
                      </td>

                      {/* Bénéficiaire : qui a payé → qui a reçu */}
                      <td className="px-3 py-2 align-top text-[11px] text-gray-600">
                        <span className="block uppercase">{d.enregistrePar || '—'}</span>
                        {d.beneficiaireNom && (
                          <span className="block text-gray-500">→ <span className="font-semibold uppercase text-gray-700">{d.beneficiaireNom}</span>
                            {d.beneficiaireFonction ? ` · ${d.beneficiaireFonction}` : ''}{d.beneficiaireTelephone ? ` · ☎ ${d.beneficiaireTelephone}` : ''}
                            <span className="ml-1 text-[10px] text-gray-400">{d.beneficiaireUid ? (d.recuConfirme ? '· reçu confirmé' : d.statut === 'decaissee' ? '· à confirmer' : '') : '· externe'}</span>
                          </span>
                        )}
                      </td>

                      <td className={`whitespace-nowrap px-3 py-2 text-right align-top font-extrabold ${estRetour ? 'text-green-700' : 'text-red-600'}`}>
                        {estRetour ? '+' : ''}{Math.abs(Number(d.montant) || 0).toLocaleString('fr-FR')}
                      </td>

                      {/* Statut + justificatif */}
                      <td className="px-3 py-2 align-top">
                        <Badge tone={statut.tone}>{statut.label}</Badge>
                        {d.justificatifRequis && (
                          justificatifAConfirmer ? (
                            <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-red-600"><AlertTriangle size={10} /> justif. attendu</span>
                          ) : d.justificatifRecu ? (
                            <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-green-600"><FileCheck2 size={10} /> justif. reçu</span>
                          ) : null
                        )}
                        {d.piece && (
                          <button onClick={(e) => { e.stopPropagation(); ouvrirPiece(d.piece) }} title="Voir le justificatif"
                            className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"><Paperclip size={10} /> justif.</button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="sticky right-0 z-[5] px-2 py-2 align-top shadow-[-8px_0_10px_-8px_rgba(0,0,0,0.25)]" style={{ background: `linear-gradient(${secteurColor}1c, ${secteurColor}1c), #fff` }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setDetailId(d.id)} title="Voir les détails" className="rounded-lg border border-gray-200 bg-white p-1 text-gray-500 shadow-sm hover:text-gray-800"><Eye size={14} /></button>
                          {peutRetourner(d) && (
                            <button onClick={() => ouvrirRetour(d)} title="Retourner le reliquat à la caisse" className="rounded-lg border border-green-200 bg-white p-1 text-green-600 shadow-sm hover:bg-green-50"><Undo2 size={14} /></button>
                          )}
                          {modifiable && (
                            <button onClick={() => openEdit(d)} title="Modifier" className="rounded-lg border border-gray-200 bg-white p-1 text-primary shadow-sm hover:bg-gray-50"><FilePen size={14} /></button>
                          )}
                          {justificatifAConfirmer && !lectureSeule && (
                            <button onClick={() => confirmerJustificatif(d)} title="Confirmer que le justificatif (reçu) a été rapporté"
                              className="rounded-lg border border-green-200 bg-white p-1 text-green-600 shadow-sm hover:bg-green-50"><FileCheck2 size={14} /></button>
                          )}
                          {supprimable && (
                            <button onClick={() => setToDelete(d)} title="Supprimer" className="rounded-lg border border-red-200 bg-white p-1 text-red-500 shadow-sm hover:bg-red-50"><Trash2 size={14} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className={`${TF} text-xs font-extrabold uppercase tracking-wide text-gray-700 dark:text-gray-200`}>Total : {liste.length} ligne(s)</td>
                  <td className={`${TF} whitespace-nowrap text-right font-black text-red-600`}>{totalListe.toLocaleString('fr-FR')}</td>
                  <td colSpan={2} className={`${TF} !right-0 z-20`} style={{ position: 'sticky' }} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Modal création / édition */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        {...glassModalProps('#B45309')}
        title={modal?.isNew ? 'Ajouter une dépense' : 'Modifier la dépense'}
        footer={<>
          <Button variant="outline" onClick={() => setModal(null)} disabled={saving}><X size={15} /> Annuler</Button>
          <BoutonVerre icone={Save} onClick={handleSave} loading={saving}>{modal?.isNew ? 'Enregistrer' : 'Mettre à jour'}</BoutonVerre>
        </>}>
        {modal && (
          <div className="space-y-3">
            {/* Héro en verre : icône 3D du reçu qui flotte. */}
            <div className="relative overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(180,83,9,0.7),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl"
              style={{ background: 'linear-gradient(135deg, #D9822B 0%, #B45309 50%, #7c2d12 130%)', animation: 'dp-entree 0.35s ease-out both' }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
              <div className="relative flex items-center gap-3.5">
                <span className="dp-icone flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),inset_0_-3px_5px_rgba(0,0,0,0.2),0_10px_20px_-8px_rgba(0,0,0,0.5)] backdrop-blur-sm">
                  <Receipt size={26} />
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-extrabold leading-tight">{modal.isNew ? 'Nouvelle dépense' : 'Modifier la dépense'}</p>
                  <p className="text-sm text-white/85">Secteur, catégorie, montant, bénéficiaire : tout est enregistré et tracé.</p>
                </div>
              </div>
            </div>

            {/* Détails de la dépense */}
            <div className={BLOC}>
              <TitreBloc icone={Banknote} couleur="#B45309">Détails de la dépense</TitreBloc>
              {/* Secteur EN PREMIER, CAISSE COURANTE par défaut : c'est elle qui alimente
                  les dépenses par défaut — y compris, via « Autres secteurs concernés »
                  ci-dessous, celles qui profitent en réalité à d'autres secteurs. Choisir
                  un secteur précis, c'est décider que la dépense est prélevée sur la
                  somme qui LUI est allouée (son propre budget). */}
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label={<EtiqD icone={PiggyBank} couleur="#7c3aed">Origine des fonds *</EtiqD>}
                  hint="D'où part l'argent : de la Caisse courante ou de la Banque.">
                  <div className="flex flex-wrap gap-1.5">
                    {[{ id: 'divers', label: 'Caisse courante', icone: PiggyBank, couleur: '#7c3aed' }, { id: 'banque', label: 'Banque', icone: Landmark, couleur: '#0369a1' }].map((o) => {
                      const actif = modal.data.origineFonds === o.id
                      return (
                        <button key={o.id} type="button" aria-pressed={actif} onClick={() => set('origineFonds', actif ? '' : o.id)} title={actif ? 'Cliquer pour annuler ce choix' : undefined}
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border py-1 pl-1 pr-3 text-[11px] font-extrabold backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-95 ${actif ? 'border-white/70 text-white shadow-md' : 'text-gray-700 hover:brightness-95'}`}
                          style={actif ? { background: `linear-gradient(135deg, ${o.couleur}, ${o.couleur}cc)`, boxShadow: `0 8px 16px -8px ${o.couleur}` } : { background: `linear-gradient(135deg, #ffffffee 0%, ${o.couleur}2e 100%)`, borderColor: `${o.couleur}55` }}>
                          <span className="flex h-5 w-5 items-center justify-center rounded-full" style={actif ? { background: 'rgba(255,255,255,0.28)', color: '#fff' } : icone3D(o.couleur)}>
                            {actif ? <Check size={10} strokeWidth={3.5} /> : <o.icone size={10} />}
                          </span>
                          {o.label}
                        </button>
                      )
                    })}
                  </div>
                </FormGroup>
                <FormGroup label={<EtiqD icone={Tag} couleur="#0ea5e9">Catégorie *</EtiqD>}>
                  <ChampAutocomplete
                    value={modal.data.categorie}
                    onChange={(v) => set('categorie', v)}
                    suggestions={categorieSuggestions}
                    maxSuggestions={categorieSuggestions.length}
                    placeholder="Saisir ou choisir une catégorie…"
                    accent="amber"
                  />
                </FormGroup>
                {/* Destination : tous les secteurs en boutons ; la dépense apparaît dans le volet Dépense du secteur choisi. */}
                <FormGroup className="col-span-2" label={<EtiqD icone={Building2} couleur="#B45309">Destination de la somme *</EtiqD>}
                  hint={!modal.data.secteurId
                    ? 'Aucune destination choisie : cliquez sur un secteur (un second clic annule le choix).'
                    : !SECTEURS_AVEC_VOLET.includes(modal.data.secteurId)
                    ? 'Cette destination n\'a pas de volet Dépenses propre : la dépense reste seulement dans E-DÉPENSES. Un second clic annule le choix.'
                    : `Elle apparaît dans E-DÉPENSES et dans le volet Dépense de ${SECTEURS.find((s) => s.id === modal.data.secteurId)?.label || 'ce secteur'}.`}>
                  <div className="flex flex-wrap gap-1">
                    {SECTEURS.map((sct) => {
                      const actif = modal.data.secteurId === sct.id
                      return (
                        <button key={sct.id} type="button" onClick={() => { set('secteurId', actif ? '' : sct.id); if (actif || sct.id !== 'logistique') set('site', ''); if (actif || sct.id !== 'autre') set('secteurAutre', '') }} aria-pressed={actif} title={actif ? 'Cliquer pour annuler ce choix' : undefined}
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border py-0.5 pl-0.5 pr-2 text-[10px] font-extrabold backdrop-blur-md transition-all hover:-translate-y-0.5 active:scale-95 ${sct.id === 'autre' ? 'border-dashed border-2' : ''} ${actif ? 'border-white/70 text-white shadow-md' : 'text-gray-700 hover:brightness-95'}`}
                          style={actif ? { background: `linear-gradient(135deg, ${sct.color}, ${sct.color}cc)`, boxShadow: `0 8px 16px -8px ${sct.color}` } : sct.id === 'autre' ? { background: 'transparent', borderColor: `${sct.color}99` } : { background: `linear-gradient(135deg, #ffffffee 0%, ${sct.color}2e 100%)`, borderColor: `${sct.color}55` }}>
                          <span className="flex h-4 w-4 items-center justify-center rounded-full" style={actif ? { background: 'rgba(255,255,255,0.28)', color: '#fff' } : sct.id === 'autre' ? { background: 'transparent', color: sct.color, border: `1.5px dashed ${sct.color}` } : icone3D(sct.color)}>
                            {actif ? <Check size={9} strokeWidth={3.5} /> : sct.id === 'autre' ? <Plus size={9} strokeWidth={3} /> : <Building2 size={8} />}
                          </span>
                          {sct.id === 'divers' ? 'SIÈGE' : sct.id === 'autre' ? 'Autre secteur…' : sct.label}
                        </button>
                      )
                    })}
                  </div>
                  {modal.data.secteurId === 'autre' && (
                    <div className="mt-2 max-w-sm">
                      <Input value={modal.data.secteurAutre || ''} onChange={(e) => set('secteurAutre', e.target.value)} placeholder="Nom du secteur *" />
                    </div>
                  )}
                  {modal.data.secteurId === 'gym' && (
                    <div className="mt-2 max-w-[12rem]">
                      <Select value={modal.data.site || ''} onChange={(e) => set('site', e.target.value)}>
                        <option value="">Salle (facultatif)</option>
                        {LOGISTIQUE_SITES.map((st) => <option key={st.id} value={st.id}>Salle de {st.label}</option>)}
                      </Select>
                    </div>
                  )}
                  {modal.data.secteurId === 'logistique' && (
                    <div className="mt-2 max-w-[12rem]">
                      <Select value={modal.data.site} onChange={(e) => set('site', e.target.value)}>
                        <option value="">Site : choisir *</option>
                        {LOGISTIQUE_SITES.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
                      </Select>
                    </div>
                  )}
                </FormGroup>
                <FormGroup label={<EtiqD icone={Banknote} couleur="#16a34a">Montant (FCFA) *</EtiqD>}>
                  <Input type="number" min="0" value={modal.data.montant} onChange={(e) => set('montant', e.target.value)} placeholder="ex: 50000" />
                </FormGroup>
                <FormGroup label={<EtiqD icone={CalendarDays} couleur="#f59e0b">Date *</EtiqD>}>
                  <Input type="date" value={modal.data.date} onChange={(e) => set('date', e.target.value)} />
                </FormGroup>
              </div>
              <FormGroup label={<EtiqD icone={FileText} couleur="#475569">Description</EtiqD>} required className="mt-1">
                <textarea
                  className="w-full rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm outline-none backdrop-blur-md focus:ring-2 focus:ring-amber-300"
                  rows={2} value={modal.data.description} onChange={(e) => set('description', e.target.value)}
                  placeholder="Décrivez précisément la dépense : quoi, pourquoi, pour qui, dans quel contexte…"
                />
              </FormGroup>
              {!!modal.data.secteurId && origineValide(modal.data.origineFonds) && (
                <div className="mt-2 flex items-start gap-2 rounded-2xl border border-violet-200/70 bg-violet-50/60 px-3 py-2 text-sm text-gray-700 backdrop-blur-md">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D('#7c3aed')}><PiggyBank size={13} /></span>
                  <span>
                    La somme quitte <strong>{modal.data.origineFonds === 'banque' ? 'la Banque' : 'la Caisse courante'}</strong> pour <strong>{modal.data.secteurId === 'divers' ? 'le Siège' : (modal.data.secteurId === 'autre' && modal.data.secteurAutre ? modal.data.secteurAutre : (SECTEURS.find((x) => x.id === modal.data.secteurId)?.label || 'ce secteur'))}</strong>
                    <span className="block text-xs text-gray-500">{modal.data.origineFonds === 'banque' ? 'Payée par la banque : elle ne touche pas la Caisse courante.' : 'Elle est prélevée sur la Caisse courante et rattachée au secteur de destination.'}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Classification comptable */}
            <div className={`${BLOC} space-y-3`}>
              <TitreBloc icone={ArrowLeftRight} couleur="#14b8a6">Classification</TitreBloc>
              <FormGroup label={<EtiqD icone={ArrowLeftRight} couleur="#14b8a6">Nature du flux</EtiqD>} hint="Sert au calcul du solde de trésorerie (voir l'onglet Flux de trésorerie).">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(NATURES_FLUX).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set('natureFlux', k)}
                      className={chipChoix(modal.data.natureFlux === k)}
                      title={v.desc}>
                      {modal.data.natureFlux === k && (
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-amber-600"><Check size={9} strokeWidth={3} /></span>
                      )}
                      {v.label}
                    </button>
                  ))}
                </div>
              </FormGroup>
              {modal.isNew && (() => {
                const raison = raisonAutorisation(modal.data)
                return raison ? (
                  <p className="flex items-start gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">
                    💰 Cette dépense sera envoyée en demande d'autorisation au PAU : {raison}.
                  </p>
                ) : null
              })()}
              <FormGroup label={<EtiqD icone={Wallet} couleur="#16a34a">Mode de paiement</EtiqD>}>
                <div className="flex flex-wrap gap-2">
                  {MODES_PAIEMENT.map((m) => (
                    <button key={m.id} type="button" onClick={() => set('modePaiement', m.id)}
                      className={chipChoix(modal.data.modePaiement === m.id)}>
                      {modal.data.modePaiement === m.id && (
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-amber-600"><Check size={9} strokeWidth={3} /></span>
                      )}
                      {m.label}
                    </button>
                  ))}
                </div>
              </FormGroup>
            </div>

            {/* Bénéficiaire */}
            <div className={BLOC}>
              <TitreBloc icone={UserRound} couleur="#7c3aed" droite={<><span className="text-red-500">*</span> <span className="font-medium normal-case text-amber-600">: qui reçoit l'argent</span></>}>Bénéficiaire</TitreBloc>
              <div className="mb-2 flex gap-2">
                <button type="button"
                  onClick={() => { set('beneficiaireType', 'interne'); set('beneficiaireUid', ''); set('beneficiaireNom', ''); set('beneficiaireFonction', ''); set('beneficiaireTelephone', '') }}
                  className={`${chipChoix(modal.data.beneficiaireType !== 'externe')} flex-1 justify-center rounded-2xl`}>
                  {modal.data.beneficiaireType !== 'externe' && (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white text-amber-600"><Check size={9} strokeWidth={3} /></span>
                  )}
                  Membre de l'entreprise
                </button>
                <button type="button"
                  onClick={() => { set('beneficiaireType', 'externe'); set('beneficiaireUid', ''); set('beneficiaireNom', ''); set('beneficiaireFonction', ''); set('beneficiaireTelephone', '') }}
                  className={`${chipChoix(modal.data.beneficiaireType === 'externe')} flex-1 justify-center rounded-2xl`}>
                  {modal.data.beneficiaireType === 'externe' && (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white text-amber-600"><Check size={9} strokeWidth={3} /></span>
                  )}
                  Externe (fournisseur, prestataire…)
                </button>
              </div>

              {/* Empilé, jamais en grille : la modale (max-w-lg, ~512px) reste plus
                  étroite que le seuil `sm:` (640px) qui déclenche les colonnes — les
                  3 champs ne tiennent jamais côte à côte sans tronquer, même sur grand
                  écran, puisque `sm:` se base sur la largeur de l'ÉCRAN, pas de la
                  modale. En 1 colonne, chaque libellé (dont l'astérisque *) reste
                  toujours sur une seule ligne. */}
              {modal.data.beneficiaireType === 'externe' ? (
                <div className="grid gap-3">
                  <FormGroup label={<EtiqD icone={UserRound} couleur="#7c3aed">Nom de la personne</EtiqD>} required>
                    <Input value={modal.data.beneficiaireNom} onChange={(e) => set('beneficiaireNom', e.target.value)} placeholder="ex: Kofi Adjovi" />
                  </FormGroup>
                  <FormGroup label={<EtiqD icone={Briefcase} couleur="#64748b">Profession / fonction</EtiqD>}>
                    <Input value={modal.data.beneficiaireFonction} onChange={(e) => set('beneficiaireFonction', e.target.value)} placeholder="ex: Maçon" />
                  </FormGroup>
                  <FormGroup label={<EtiqD icone={Phone} couleur="#16a34a">Contact (téléphone)</EtiqD>}>
                    <Input value={modal.data.beneficiaireTelephone} onChange={(e) => set('beneficiaireTelephone', e.target.value)} placeholder="ex: 90 00 00 00" />
                  </FormGroup>
                </div>
              ) : (
                <div className="grid gap-3">
                  <FormGroup label={<EtiqD icone={UserRound} couleur="#7c3aed">Nom du bénéficiaire</EtiqD>} required>
                    <ChampBeneficiaire
                      value={modal.data.beneficiaireNom}
                      onChange={(v) => { set('beneficiaireNom', v); set('beneficiaireUid', '') }}
                      onSelectUser={(u) => { set('beneficiaireUid', u.uid); set('beneficiaireNom', u.nom || ''); set('beneficiaireFonction', u.poste || ''); set('beneficiaireTelephone', u.telephone || '') }}
                      users={users}
                    />
                  </FormGroup>
                  <FormGroup label={<EtiqD icone={Briefcase} couleur="#64748b">Fonction (optionnel)</EtiqD>}>
                    <Input value={modal.data.beneficiaireFonction} onChange={(e) => set('beneficiaireFonction', e.target.value)} placeholder="ex: Comptable" />
                  </FormGroup>
                  <FormGroup label={<EtiqD icone={Phone} couleur="#16a34a">Contact (téléphone)</EtiqD>}>
                    <Input value={modal.data.beneficiaireTelephone} onChange={(e) => set('beneficiaireTelephone', e.target.value)} placeholder="ex: 90 00 00 00" />
                  </FormGroup>
                </div>
              )}
            </div>

            {/* Justificatif requis ? — Oui/Non, pas d'upload : le justificatif (reçu) reste
                physique, rapporté par le bénéficiaire. Sa réception se confirme APRÈS coup,
                depuis la liste (bande) une fois la dépense décaissée. Tant qu'il est marqué
                requis et non confirmé reçu, une alerte reste active sur le Dashboard
                (secrétaire, info, assistant PAU). */}
            <div className={BLOC}>
              <TitreBloc icone={FileCheck2} couleur="#ea580c">Un reçu sera-t-il rapporté pour cette dépense ?</TitreBloc>
              <div className="flex items-center gap-2">
                <button type="button"
                  onClick={() => set('justificatifRequis', modal.data.justificatifRequis === true ? null : true)}
                  className={pillToggleClass(modal.data.justificatifRequis === true, 'green')}>
                  ✅ Oui
                </button>
                <button type="button"
                  onClick={() => set('justificatifRequis', modal.data.justificatifRequis === false ? null : false)}
                  className={pillToggleClass(modal.data.justificatifRequis === false, 'red')}>
                  ❌ Non
                </button>
              </div>
              {modal.data.justificatifRequis === true && (
                <p className="mt-2 text-xs text-gray-500">Le bénéficiaire devra rapporter un reçu : sinon une alerte reste active sur le Dashboard jusqu'à confirmation.</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal ajout multiple (lot) */}
      <Modal open={!!lot} onClose={() => setLot(null)} size="xl" title="Ajouter plusieurs dépenses d'un coup"
        footer={lot && (() => {
          const completes = lot.filter((r) => r.secteurId && r.categorie && Number(r.montant) > 0 && r.date)
          const totalLot = completes.reduce((s, r) => s + Number(r.montant), 0)
          return (
            <>
              <span className="mr-auto text-xs text-gray-500">
                {completes.length} ligne(s) prête(s) · <strong className="text-gray-800">{totalLot.toLocaleString('fr-FR')} FCFA</strong>
              </span>
              <Button variant="outline" onClick={() => setLot(null)} disabled={savingLot}>Annuler</Button>
              <Button onClick={enregistrerLot} loading={savingLot} disabled={completes.length === 0}>Enregistrer tout</Button>
            </>
          )
        })()}>
        {lot && (
          <div className="space-y-3">
            <p className="rounded-xl border border-amber-200/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
              Renseignez chaque ligne (secteur, catégorie, montant, date). Les lignes incomplètes sont ignorées. Une ligne devient une <strong>demande envoyée au PAU</strong> si elle dépasse le budget restant du secteur ce mois-ci ; sinon elle est décaissée immédiatement.
            </p>

            <div className="hidden gap-2 px-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 sm:grid sm:grid-cols-12">
              <span className="sm:col-span-2">Secteur</span>
              <span className="sm:col-span-2">Catégorie</span>
              <span className="sm:col-span-2">Montant</span>
              <span className="sm:col-span-2">Date</span>
              <span className="sm:col-span-2">Description</span>
              <span className="sm:col-span-1">Caisse</span>
              <span className="sm:col-span-1" />
            </div>

            <div className="space-y-2">
              {lot.map((r, i) => {
                const raison = raisonAutorisation(r)
                return (
                  <div key={i} className="grid grid-cols-2 items-center gap-2 rounded-xl border border-gray-100 bg-white p-2 sm:grid-cols-12">
                    <div className="space-y-1 sm:col-span-2">
                      <Select value={r.secteurId} onChange={(e) => setLigne(i, 'secteurId', e.target.value)}>
                        <option value="">Secteur</option>
                        {SECTEURS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </Select>
                      {r.secteurId === 'logistique' && (
                        <Select value={r.site} onChange={(e) => setLigne(i, 'site', e.target.value)}>
                          <option value="">Site</option>
                          {LOGISTIQUE_SITES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </Select>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <Select value={r.categorie} onChange={(e) => setLigne(i, 'categorie', e.target.value)}>
                        <option value="">Catégorie</option>
                        {CATEGORIES_DEPENSE.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Input type="number" min="0" value={r.montant} onChange={(e) => setLigne(i, 'montant', e.target.value)} placeholder="0" />
                      {raison && <span className="mt-0.5 block text-[10px] font-semibold text-violet-600">→ demande PAU</span>}
                    </div>
                    <div className="sm:col-span-2">
                      <Input type="date" value={r.date} onChange={(e) => setLigne(i, 'date', e.target.value)} />
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                      <Input value={r.description} onChange={(e) => setLigne(i, 'description', e.target.value)} placeholder="(optionnel)" />
                    </div>
                    <div className="flex items-center justify-center sm:col-span-1">
                      {r.secteurId && r.secteurId !== 'divers' && (
                        <span title="Prélevée sur le Siège (Caisse courante), rattachée à ce secteur" className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D('#7c3aed')}><PiggyBank size={12} /></span>
                      )}
                    </div>
                    <div className="col-span-2 flex justify-end sm:col-span-1 sm:justify-center">
                      <button type="button" onClick={() => retirerLigne(i)} disabled={lot.length <= 1}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Retirer la ligne">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <Button variant="outline" onClick={ajouterLigne}><Plus size={16} /> Ajouter une ligne</Button>
          </div>
        )}
      </Modal>

      {/* Modal confirmation suppression — motif OBLIGATOIRE, tracé dans le Journal. */}
      <Modal open={!!toDelete} onClose={fermerSuppression} size="sm" title="Supprimer cette dépense ?"
        {...glassModalProps('#dc2626')}
        footer={<>
          <Button variant="outline" onClick={fermerSuppression} disabled={deleting}>Annuler</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting} disabled={!motifSuppression.trim()}>
            <Trash2 size={14} className="mr-1" /> Supprimer
          </Button>
        </>}>
        {toDelete && (() => {
          const secteurLbl = SECTEURS.find((s) => s.id === toDelete.secteurId)?.label || toDelete.secteurId
          return (
            <div className="space-y-4">
              {/* Bandeau d'alerte rouge — même recette que les autres fenêtres du module. */}
              <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_8px_20px_-8px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.35)]"
                style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.9) 0%, rgba(127,29,29,0.9) 100%)' }}>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: '#dc2626', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55' }}>
                  <AlertTriangle size={22} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold leading-tight">{formatMoney(Number(toDelete.montant) || 0)}</p>
                  <p className="truncate text-sm text-white/85">{secteurLbl} · {formatDateShort(toDelete.date)}{toDelete.categorie ? ` · ${toDelete.categorie}` : ''}</p>
                </div>
              </div>

              {toDelete.description && (
                <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">📝 {toDelete.description}</p>
              )}

              <p className="text-sm text-gray-600">
                Cette action est <span className="font-semibold text-red-600">irréversible</span>. Le motif ci-dessous
                sera enregistré dans le <span className="font-semibold">Journal et Historique</span>.
              </p>

              <FormGroup label="Motif de la suppression" required>
                <textarea
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  rows={3} autoFocus
                  value={motifSuppression}
                  onChange={(e) => setMotifSuppression(e.target.value)}
                  placeholder="ex : doublon, erreur de saisie, dépense annulée par le fournisseur…" />
              </FormGroup>
            </div>
          )
        })()}
      </Modal>

      {/* Modal détail (lecture seule) — utile surtout pour les dépenses récupérées d'un besoin validé.
          Design « verre » : héro dégradé avec icône 3D de la catégorie, tuiles bento à icônes 3D, entrée en cascade. */}
      <Modal open={!!detail} onClose={() => setDetailId(null)} size="md" title="Détail de la dépense"
        {...glassModalProps('#B45309')}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {detail && detail.source !== 'briqueterie' && (isAdmin || detail.statut === 'en_attente' || !detail.statut) ? (
              <Button variant="danger" onClick={() => { const d = detail; setDetailId(null); setToDelete(d) }}>
                <Trash2 size={14} /> Supprimer
              </Button>
            ) : <span />}
            <Button variant="outline" onClick={() => setDetailId(null)}>Fermer</Button>
          </div>
        }>
        {detail && (() => {
          const avecOrigine = detail.source === 'besoin'
          const origine = infoSource(detail)
          const secteur = SECTEURS.find((s) => s.id === detail.secteurId)
          const couleur = secteur?.color || '#B45309'
          const statut = STATUTS_DECAISSEMENT[detail.statut] || STATUTS_DECAISSEMENT.decaissee
          const nature = NATURES_FLUX[detail.natureFlux || natureFluxDefaut]
          const IconeCat = iconeCategorie(detail.categorie)
          const autres = (detail.secteursConcernes || []).map((id) => SECTEURS.find((s) => s.id === id)?.label || id).join(', ')
          const tuiles = [
            { icone: CalendarDays, couleur: '#f59e0b', titre: 'Date', valeur: formatDateShort(detail.date) },
            { icone: Building2, couleur, titre: 'Secteur', valeur: libelleSecteurSite(secteur, detail) },
            ...(autres ? [{ icone: Layers, couleur: '#8b5cf6', titre: 'Concerne aussi', valeur: autres }] : []),
            { icone: IconeCat, couleur: '#0ea5e9', titre: 'Catégorie', valeur: detail.categorie || '—' },
            { icone: ArrowLeftRight, couleur: '#14b8a6', titre: 'Nature de flux', valeur: nature.label },
            { icone: Banknote, couleur: '#16a34a', titre: 'Mode de paiement', valeur: MODES_PAIEMENT.find((m) => m.id === detail.modePaiement)?.label || '—' },
            { icone: Tag, couleur: '#64748b', titre: 'Origine', valeur: origine.label }
          ]
          const entree = (i) => ({ animation: `dd-entree 0.4s ease-out ${i * 0.06}s both` })
          const tuile = 'relative overflow-hidden rounded-2xl border border-white/70 bg-white/65 p-3 shadow-[0_10px_24px_-16px_rgba(26,26,26,0.35),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl'
          return (
            <div className="space-y-3 text-sm">
              <style>{`
                @keyframes dd-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
                @keyframes dd-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
                @keyframes dd-reflet { 0% { transform: translateX(-120%) skewX(-12deg); } 100% { transform: translateX(520%) skewX(-12deg); } }
              `}</style>

              {/* Héro : icône 3D de la catégorie, montant qui s'anime, statut et nature. */}
              <div className="relative overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(180,83,9,0.7),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl"
                style={{ background: 'linear-gradient(135deg, #D9822B 0%, #B45309 50%, #7c2d12 130%)', animation: 'dd-entree 0.35s ease-out both' }}>
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-white/25 blur-md" style={{ animation: 'dd-reflet 5s ease-in-out 1s infinite' }} />
                <div className="relative flex items-start gap-3.5">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),inset_0_-3px_5px_rgba(0,0,0,0.2),0_10px_20px_-8px_rgba(0,0,0,0.5)] backdrop-blur-sm"
                    style={{ animation: 'dd-flotte 3s ease-in-out infinite' }}>
                    <IconeCat size={26} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-bold text-white/90">{avecOrigine ? (detail.projetNom || detail.description) : (detail.description || detail.categorie || 'Dépense')}</p>
                    <p className="text-3xl font-black leading-tight">
                      {detail.source === 'retour_reliquat' ? '+' : ''}<Compteur valeur={Math.abs(Number(detail.montant) || 0)} format={(n) => Math.round(n).toLocaleString('fr-FR')} />
                      <span className="ml-1 text-sm font-bold text-white/75">FCFA</span>
                    </p>
                  </div>
                </div>
                <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone={statut.tone}>{statut.label}</Badge>
                  <Badge tone={nature.tone}>{nature.label}</Badge>
                  {detail.financePar === 'caisse_commune' && <Badge tone="warning">Caisse courante</Badge>}
                  {!detail.source && (estAffectee(detail)
                    ? <Badge tone="success">{`Affectée${affecteurDe(detail) ? ` par ${affecteurDe(detail)}` : ''}${detail.affecteeLe ? ` le ${new Date(detail.affecteeLe).toLocaleDateString('fr-FR')}` : ''}`}</Badge>
                    : <Badge tone="warning">À affecter</Badge>)}
                  {origineDe(detail) && <Badge tone="info">Origine : {libelleOrigine(origineDe(detail))}</Badge>}
                </div>
              </div>

              {/* Bento : les informations clés, chacune dans sa tuile de verre à icône 3D. */}
              <div className="grid grid-cols-2 gap-2.5">
                {tuiles.map((t, i) => {
                  const Ic = t.icone
                  return (
                    <div key={t.titre} className={`${tuile} flex items-center gap-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/85`} style={entree(i + 1)}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(t.couleur)}><Ic size={16} /></span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-wide text-gray-400">{t.titre}</p>
                        <p className="break-words text-sm font-extrabold leading-tight text-gray-800">{t.valeur}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Motif (dépenses issues d'un besoin de secteur validé) */}
              {avecOrigine && (detail.projetNom || detail.tacheTitre) && (
                <div className={tuile} style={entree(9)}>
                  <p className="mb-1.5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-teal-700">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D('#0d9488')}><ClipboardList size={14} /></span>{origine.label}
                  </p>
                  <p className="font-extrabold text-gray-800">{detail.projetNom || '—'}</p>
                  {detail.tacheTitre && <p className="mt-1 flex items-center gap-1.5 text-gray-600"><Wrench size={13} className="text-teal-600" /> <span className="font-medium">{detail.tacheTitre}</span></p>}
                  {detail.noteOrigine && <p className="mt-2 rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-xs italic text-gray-600">« {detail.noteOrigine} »</p>}
                </div>
              )}

              {/* Description (dépenses saisies directement dans E-DÉPENSES) */}
              {!avecOrigine && (
                <div className={tuile} style={entree(9)}>
                  <p className="mb-1.5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-gray-400">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D('#475569')}><FileText size={14} /></span>Description
                  </p>
                  <p className="font-semibold text-gray-700">{detail.description || '—'}</p>
                </div>
              )}

              {/* Traçabilité : qui a payé → qui a reçu */}
              <div className={tuile} style={entree(10)}>
                <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-gray-400">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D('#7c3aed')}><PenLine size={14} /></span>Traçabilité
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1.5 text-xs font-bold text-amber-800 backdrop-blur-md">
                    <PenLine size={12} /> {detail.enregistrePar || '—'}
                  </span>
                  {detail.beneficiaireNom && (
                    <>
                      <span className="text-gray-300">→</span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50/80 px-3 py-1.5 text-xs font-bold text-teal-800 backdrop-blur-md">
                        <UserRound size={12} /> {detail.beneficiaireNom}{detail.beneficiaireFonction ? ` · ${detail.beneficiaireFonction}` : ''}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  {detail.beneficiaireTelephone && <span className="inline-flex items-center gap-1"><Phone size={12} /> {detail.beneficiaireTelephone}</span>}
                  {detail.typePaiement && <span className="inline-flex items-center gap-1"><CreditCard size={12} /> {detail.typePaiement === 'avance' ? 'Tranche / avance' : 'Somme totale'}</span>}
                </div>
              </div>

              {(() => {
                const faits = depenses.filter((r) => r.source === 'retour_reliquat' && r.retourDe === detail.id)
                if (!faits.length && !peutRetourner(detail)) return null
                return (
                  <div className={tuile} style={entree(11)}>
                    <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-gray-400">
                      <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D('#16a34a')}><Undo2 size={14} /></span>Reliquat retourné
                    </p>
                    {faits.length > 0 ? (
                      <div className="space-y-1.5">
                        {faits.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/80 bg-white/70 px-3 py-1.5 text-xs">
                            <span className="text-gray-600">{formatDateShort(r.date)} · {r.enregistrePar || '—'}</span>
                            <span className="font-extrabold text-green-700">+{fmtN(Math.abs(Number(r.montant) || 0))} FCFA</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-gray-500">Aucun retour pour le moment.</p>}
                    {peutRetourner(detail) && (
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-gray-500">Reste à retourner : <strong className="text-gray-800">{fmtN(resteRetournable(detail))} FCFA</strong></span>
                        <BoutonVerre variante="vert" icone={Undo2} onClick={() => ouvrirRetour(detail)}>Retourner le reliquat</BoutonVerre>
                      </div>
                    )}
                  </div>
                )
              })()}

              {detail.piece && (
                <button onClick={() => ouvrirPiece(detail.piece)}
                  className="group inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/70 px-3.5 py-2 text-xs font-extrabold text-amber-800 shadow-[0_8px_18px_-10px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/90" style={entree(11)}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={icone3D('#B45309')}><Paperclip size={14} /></span>
                  Voir le justificatif
                  <Eye size={14} className="transition-transform group-hover:scale-110" />
                </button>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* Retour d'un reliquat à la caisse (ou au budget du secteur) : la somme revient, la dépense garde son historique. */}
      <Modal open={!!retourModal} onClose={() => setRetourModal(null)} size="md" title="Retourner le reliquat"
        {...glassModalProps('#16a34a')}
        footer={<>
          <Button variant="outline" onClick={() => setRetourModal(null)} disabled={retourSaving}><X size={15} /> Annuler</Button>
          <BoutonVerre variante="vert" icone={Undo2} onClick={enregistrerRetour} loading={retourSaving}
            disabled={!retourModal || !(Number(retourModal.montant) > 0) || !retourModal.motif.trim()}>Enregistrer le retour</BoutonVerre>
        </>}>
        {retourModal && (() => {
          const { d } = retourModal
          const reste = resteRetournable(d)
          const m = Number(retourModal.montant) || 0
          const versCaisse = d.financePar === 'caisse_commune' || d.secteurId === 'divers'
          const secteur = SECTEURS.find((x) => x.id === d.secteurId)
          const tuile = 'relative rounded-2xl border border-white/70 bg-white/65 p-3 shadow-[0_10px_24px_-16px_rgba(26,26,26,0.35),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl'
          const etiq = (Ic, couleur, texte) => (
            <label className="mb-1.5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D(couleur)}><Ic size={13} /></span>{texte}
            </label>
          )
          return (
            <div className="space-y-3 text-sm">
              <div className="relative overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(22,163,74,0.7),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl"
                style={{ background: 'linear-gradient(135deg, #4ade80 0%, #16a34a 55%, #14532d 130%)' }}>
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
                <div className="relative flex items-center gap-3.5">
                  <span className="dp-icone flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),inset_0_-3px_5px_rgba(0,0,0,0.2),0_10px_20px_-8px_rgba(0,0,0,0.5)] backdrop-blur-sm"><Undo2 size={26} /></span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-bold text-white/90">{d.description || d.categorie || 'Dépense'}</p>
                    <p className="text-xs text-white/80">{libelleSecteurSite(secteur, d)} · {formatDateShort(d.date)}</p>
                    <p className="text-lg font-black leading-tight">{fmtN(d.montant)} <span className="text-xs font-bold text-white/75">FCFA dépensés</span></p>
                  </div>
                </div>
                <p className="relative mt-3 inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/20 px-3 py-1.5 text-xs font-bold backdrop-blur-md">
                  Reste à retourner : {fmtN(reste)} FCFA{(retoursParDepense.get(d.id) || 0) > 0 ? ` (déjà retourné : ${fmtN(retoursParDepense.get(d.id))})` : ''}
                </p>
              </div>

              <div className={tuile}>
                {etiq(Banknote, '#16a34a', 'Montant retourné (FCFA) *')}
                <div className="flex items-center gap-2">
                  <input type="number" min="0" max={reste} value={retourModal.montant} autoFocus
                    onChange={(e) => setRetourModal((x) => ({ ...x, montant: e.target.value }))} placeholder="0"
                    className="min-w-0 flex-1 rounded-xl border border-white/70 bg-white/85 px-3 py-2 text-xl font-black outline-none focus:ring-2 focus:ring-green-300" />
                  <button type="button" onClick={() => setRetourModal((x) => ({ ...x, montant: String(reste) }))}
                    className="shrink-0 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-extrabold text-green-700 transition-all hover:-translate-y-0.5 hover:bg-green-100 active:scale-95">Tout le reste</button>
                </div>
              </div>
              <div className={tuile}>
                {etiq(MessageSquareText, '#475569', 'Motif *')}
                <input value={retourModal.motif} onChange={(e) => setRetourModal((x) => ({ ...x, motif: e.target.value }))}
                  className="w-full rounded-xl border border-white/70 bg-white/85 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-300" />
              </div>
              <div className={tuile}>
                {etiq(CalendarDays, '#7c3aed', 'Date du retour')}
                <input type="date" value={retourModal.date} onChange={(e) => setRetourModal((x) => ({ ...x, date: e.target.value }))}
                  className="w-full rounded-xl border border-white/70 bg-white/85 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-green-300" />
              </div>

              <div className="rounded-2xl border border-green-200/80 bg-green-50/80 p-3 text-xs font-semibold text-green-900 backdrop-blur-md">
                {versCaisse
                  ? <>Le retour revient à la <strong>caisse courante</strong> : {m > 0 ? `+${fmtN(m)} FCFA` : 'le montant'} dans le journal de la Caisse, et le budget de la caisse remonte d'autant.</>
                  : <>Le retour revient au <strong>budget de {secteur?.label || 'ce secteur'}</strong> : ses dépenses baissent de {m > 0 ? `${fmtN(m)} FCFA` : 'ce montant'}.</>}
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

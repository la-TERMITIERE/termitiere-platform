// Liste des dépenses — saisie, filtres, justificatif.
import { useMemo, useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, Search, FilePen, Trash2, Paperclip, Eye, ChevronDown, Receipt, Layers, FileSpreadsheet, Wallet, Building2, PiggyBank, Check, AlertTriangle } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, formatDateShort, formatMoney } from '../../utils/formatters'
import { glassModalProps } from '../../utils/color'
import { lireFichier, ouvrirPiece, formatTaille } from '../../utils/fichiers'
import { exportRapportExcel } from '../../utils/excelReport'
import { SECTEURS, LOGISTIQUE_SITES, CATEGORIES_DEPENSE, STATUTS_DECAISSEMENT, NATURES_FLUX, natureFluxDefaut, MODES_PAIEMENT } from './data'
import { budgetSecteur, depensesEntrepriseSecteurMois, totalDepenses, statutBudget, coutsMatieresBriqueterie, libelleSecteurSite, siteLogistiqueDe, visibleDansEDepenses, secteursEtSites, seuilsBudgetDe } from './logic'
import { raisonAutorisation as raisonAutorisationPartagee, soumettreNouvelleDepense as soumettreNouvelleDepensePartagee } from './depenseActions'
import { isFullAccessRole, FULL_ACCESS_ROLES, isReadOnlyRole, depenseRoleEffectif } from '../../core/roles'
import { marquerVoletVu } from '../../shared/nouveautes'

// Origine d'une dépense — d'où vient la ligne (saisie directe ou récupérée d'un autre module).
const SOURCE_INFO = {
  besoin:      { label: 'Besoin validé', tone: 'info' },
  briqueterie: { label: 'Briqueterie', tone: 'neutral' }
}
const infoSource = (d) => SOURCE_INFO[d.source] || { label: 'Saisie E-DÉPENSES', tone: 'neutral' }

// Claymorphism — bandeau de filtres (recherche, mois, secteur, catégorie, nature
// du flux, financement) : panneau « pâte à modeler » chaleureux (ton E-DÉPENSES,
// #B45309), champs en relief doux avec ombre portée + reflet clair, sans bordure
// dure. `CLAY_FIELD` s'utilise sur des <input>/<select> BRUTS (pas .input-base,
// pour ne pas avoir à lutter contre sa bordure/son rayon par-dessus).
const CLAY_PANEL = 'relative flex flex-wrap items-end gap-3 rounded-[28px] bg-gradient-to-br from-amber-50 via-orange-50/70 to-white p-4 shadow-[0_18px_38px_-18px_rgba(180,83,9,0.32),0_6px_16px_-8px_rgba(180,83,9,0.16),inset_0_1px_0_0_rgba(255,255,255,0.9)] ring-1 ring-white/70 dark:from-[#241d14] dark:via-[#1f1a14] dark:to-[#1d2226] dark:shadow-[0_18px_38px_-18px_rgba(0,0,0,0.55)] dark:ring-white/10'
const CLAY_LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-amber-800/70 dark:text-amber-200/60'
const CLAY_FIELD = 'w-full appearance-none rounded-2xl border-0 bg-gradient-to-br from-white to-amber-50/90 px-3.5 py-2.5 text-sm font-semibold text-gray-700 shadow-[5px_5px_12px_-4px_rgba(180,83,9,0.22),-4px_-4px_10px_-6px_rgba(255,255,255,0.95)] outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[6px_6px_16px_-4px_rgba(180,83,9,0.3),-4px_-4px_10px_-6px_rgba(255,255,255,0.95)] focus:-translate-y-0.5 focus:shadow-[6px_6px_16px_-4px_rgba(180,83,9,0.3),-4px_-4px_10px_-6px_rgba(255,255,255,0.95)] focus:ring-2 focus:ring-amber-400/60 dark:from-[#2a2118] dark:to-[#221b12] dark:text-gray-100 dark:shadow-[5px_5px_12px_-4px_rgba(0,0,0,0.5),-4px_-4px_10px_-6px_rgba(255,255,255,0.04)]'

const empty = () => ({
  // Par défaut : Siège (Caisse commune) — la dépense « ordinaire », sans secteur
  // particulier. L'utilisateur bascule sur « Oui » s'il veut désigner un secteur.
  secteurId: 'divers', site: '', categorie: '', montant: '', date: todayStr(),
  description: '', piece: null, imprevue: false, modePaiement: 'espece',
  natureFlux: natureFluxDefaut, sourceFinancement: 'entreprise', financePar: '',
  // « Cette dépense concerne-t-elle un secteur ? » (n'a de sens que pour une
  // dépense Caisse commune) — Non par défaut. concerneAutreSecteur ne pilote que
  // l'affichage du sélecteur ; secteursConcernes (0 ou 1 élément) est la seule
  // donnée réellement utilisée au tri.
  concerneAutreSecteur: false, secteursConcernes: [],
  beneficiaireType: 'interne', beneficiaireUid: '', beneficiaireNom: '', beneficiaireFonction: '', beneficiaireTelephone: ''
})

// ── Champ bénéficiaire (membre de l'entreprise) : saisie libre + suggestions ──
function ChampBeneficiaire({ value, onChange, onSelectUser, users }) {
  const [open, setOpen]     = useState(false)
  const [filtre, setFiltre] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const suggestions = useMemo(() => {
    const q = filtre.toLowerCase()
    return users.filter((u) => u.actif !== false && (u.nom || u.login || '').toLowerCase().includes(q)).slice(0, 10)
  }, [users, filtre])

  const choisir = (u) => { onSelectUser(u); setFiltre(''); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-1">
        <input
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Nom du bénéficiaire…"
          value={open ? filtre : value}
          onChange={(e) => { setFiltre(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-gray-200 px-2 text-gray-400 hover:text-primary"><ChevronDown size={14} /></button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          {!suggestions.length
            ? <p className="px-3 py-2 text-xs text-gray-400">Aucun utilisateur — votre saisie sera utilisée.</p>
            : <ul className="max-h-48 overflow-y-auto py-1">
                {suggestions.map((u) => (
                  <li key={u.uid}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-primary/10"
                    onMouseDown={(e) => { e.preventDefault(); choisir(u) }}>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary-dark">
                      {(u.nom || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">{u.nom}</p>
                      {u.poste && <p className="text-[10px] text-gray-400">{u.poste}</p>}
                    </div>
                  </li>
                ))}
              </ul>
          }
        </div>
      )}
    </div>
  )
}

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
  const [filtreSecteur, setFiltreSecteur] = useState('')
  // Sous-filtre site — n'a de sens que pour MAXI LOGISTIQUE (budget/dépenses séparés
  // par site, cf. LOGISTIQUE_SITES). Réinitialisé si on change de secteur.
  const [filtreSite, setFiltreSite] = useState('')
  const [filtreCategorie, setFiltreCategorie] = useState('')
  const [filtreNature, setFiltreNature] = useState('')
  const [filtreFinancement, setFiltreFinancement] = useState('') // '' | 'caisse_commune'
  const [filtreMois, setFiltreMois] = useState(todayStr().slice(0, 7))
  const [modal, setModal] = useState(null)
  const [lot, setLot] = useState(null)            // ajout multiple : tableau de lignes, ou null si fermé
  const [savingLot, setSavingLot] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [motifSuppression, setMotifSuppression] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)

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
    if (moisVoulu) setFiltreMois(moisVoulu)
    // Bouton « Ajouter une dépense » depuis le volet Dépense d'un secteur (agro,
    // logistique…) — ouvre directement le formulaire, secteur déjà pré-rempli.
    if (openCreateSecteurId) setModal({ data: { ...empty(), secteurId: openCreateSecteurId }, isNew: true })
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state])

  const liste = useMemo(() => {
    let rows = [...depenses]
    // Une dépense filtre sur son secteur PRINCIPAL, mais aussi sur les « autres
    // secteurs concernés » (cf. secteursConcernes) — ex. une charge payée depuis
    // la Caisse commune qui profite en réalité à plusieurs secteurs à la fois.
    if (filtreSecteur) rows = rows.filter((d) => d.secteurId === filtreSecteur || (d.secteursConcernes || []).includes(filtreSecteur))
    // Le sous-filtre par site ne s'applique qu'aux lignes RATTACHÉES à Logistique
    // (site connu) — une ligne d'un autre secteur qui ne fait que « concerner »
    // Logistique en plus n'a pas de site propre, donc reste visible quel que soit
    // le site choisi.
    if (filtreSecteur === 'logistique' && filtreSite) rows = rows.filter((d) => d.secteurId !== 'logistique' || siteLogistiqueDe(d) === filtreSite)
    if (filtreCategorie) rows = rows.filter((d) => d.categorie === filtreCategorie)
    if (filtreNature)    rows = rows.filter((d) => (d.natureFlux || natureFluxDefaut) === filtreNature)
    if (filtreFinancement === 'caisse_commune') rows = rows.filter((d) => d.financePar === 'caisse_commune')
    if (filtreMois)      rows = rows.filter((d) => (d.date || '').startsWith(filtreMois))
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((d) => (d.description || '').toLowerCase().includes(q))
    }
    if (restreintMoisCourant) {
      rows = rows.filter((d) => {
        const m = (d.date || '').slice(0, 7)
        return m === moisCourantStr || m === moisPrecedentStr
      })
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [depenses, filtreSecteur, filtreSite, filtreCategorie, filtreNature, filtreFinancement, filtreMois, recherche, restreintMoisCourant, moisCourantStr, moisPrecedentStr])

  const totalListe = liste.reduce((s, d) => s + (Number(d.montant) || 0), 0)

  // KPI budget alloué — mois de référence : celui du filtre « Mois » s'il est posé,
  // sinon le mois courant (le filtre peut être vidé pour voir « Toutes périodes »,
  // mais un budget alloué n'a de sens que rapporté à UN mois précis).
  const [anneeKpi, moisKpi] = useMemo(() => {
    const m = filtreMois || todayStr().slice(0, 7)
    const [a, mo] = m.split('-').map(Number)
    return [a, mo]
  }, [filtreMois])

  // Budget alloué total, tous secteurs métier confondus (hors Caisse commune, comptée
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
        autresSecteurs: (d.secteursConcernes || []).map((id) => SECTEURS.find((s) => s.id === id)?.label || id).join(', ') || '—',
        financement: d.financePar === 'caisse_commune' ? 'Caisse commune' : 'Secteur'
      }
    })
    exportRapportExcel({
      filename: `depenses-${filtreMois || 'toutes'}.xlsx`,
      sections: [{
        id: 'depenses', name: 'Dépenses', title: 'Extraction des dépenses',
        subtitle: filtreMois ? `Période : ${filtreMois}` : 'Toutes périodes',
        columns: [
          { key: 'date', label: 'Date', width: 14 },
          { key: 'libelle', label: 'Libellé', width: 30 },
          { key: 'montant', label: 'Montant', width: 16, type: 'money' },
          { key: 'agreeur', label: "Nom de l'agréeur", width: 26 },
          { key: 'secteur', label: 'Secteur', width: 20 },
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
  function openEdit(d)  { setModal({ data: { ...empty(), ...d, concerneAutreSecteur: (d.secteursConcernes || []).length > 0 }, isNew: false, id: d.id }) }

  // ── Ajout multiple (lot) ──
  const ligneVide = () => ({ secteurId: '', site: '', categorie: '', montant: '', date: todayStr(), description: '', natureFlux: natureFluxDefaut, sourceFinancement: 'entreprise', financePar: '', imprevue: false })
  function openLot() { setLot([ligneVide(), ligneVide(), ligneVide()]) }
  const setLigne = (i, k, v) => setLot((rows) => rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)))
  const ajouterLigne = () => setLot((rows) => [...rows, ligneVide()])
  const retirerLigne = (i) => setLot((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows))
  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  async function handlePieceChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const piece = await lireFichier(file)
      set('piece', piece)
    } catch (err) {
      toast.error(err.message || 'Fichier illisible')
    } finally {
      setUploading(false)
    }
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
    if (!d.secteurId) return toast.error('Secteur requis')
    if (d.secteurId === 'logistique' && !d.site) return toast.error('Site requis (Lomé ou Kara)')
    if (!d.categorie) return toast.error('Catégorie requise')
    if (!d.montant || Number(d.montant) <= 0) return toast.error('Montant requis')
    if (!d.date) return toast.error('Date requise')
    if (!d.description || !d.description.trim()) return toast.error('Description requise — précisez le motif de la dépense')
    if (!d.beneficiaireNom || !d.beneficiaireNom.trim()) return toast.error('Bénéficiaire requis — identifiez qui reçoit la somme')

    setSaving(true)
    try {
      if (modal.isNew) {
        const { statutInitial } = await soumettreNouvelleDepense(d)
        toast.success(
          statutInitial === 'en_attente'
            ? 'Demande de décaissement soumise — en attente d\'autorisation ✓'
            : 'Dépense enregistrée ✓'
        )
      } else {
        const secteur = SECTEURS.find((s) => s.id === d.secteurId)
        await setItem('depense_depenses', modal.id, { ...d, id: modal.id })
        await audit('depense', 'DEPENSE_EDIT', `${libelleSecteurSite(secteur, d)} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`)
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
      title: statut.key === 'depasse' ? `🔴 Budget dépassé — ${libelle}` : `🟠 Budget en alerte — ${libelle}`,
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
        `${secteur?.label || target.secteurId} — ${formatMoney(Number(target.montant) || 0)}${target.categorie ? ` · ${target.categorie}` : ''}${target.description ? ` — ${target.description}` : ''} · Motif : ${motif}`,
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
      {/* KPI — récap de la liste affichée + budget alloué (mois du filtre, ou mois
          courant si aucun filtre de mois n'est posé), autres secteurs vs Caisse commune. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Total dépenses (liste affichée)" value={`${totalListe.toLocaleString('fr-FR')} FCFA`}
          sub={`${liste.length} dépense(s)`} icon={Receipt} accent="#B45309" />
        <StatCard title="Budget alloué — autres secteurs" value={`${budgetAutresSecteurs.toLocaleString('fr-FR')} FCFA`}
          sub={`Dépensé ${depenseAutresSecteurs.toLocaleString('fr-FR')} FCFA · Reste ${resteAutresSecteurs.toLocaleString('fr-FR')} FCFA`}
          icon={Building2} accent={resteAutresSecteurs < 0 ? '#dc2626' : '#0d9488'} valueColor={resteAutresSecteurs < 0 ? '#dc2626' : undefined} />
        <StatCard title="Budget alloué — Caisse commune" value={`${budgetCaisseCommune.toLocaleString('fr-FR')} FCFA`}
          sub={`Dépensé ${depenseCaisseCommune.toLocaleString('fr-FR')} FCFA · Reste ${resteCaisseCommune.toLocaleString('fr-FR')} FCFA`}
          icon={PiggyBank} accent={resteCaisseCommune < 0 ? '#dc2626' : '#7c3aed'} valueColor={resteCaisseCommune < 0 ? '#dc2626' : undefined} />
      </div>

      <div className={CLAY_PANEL}>
        <div>
          <label className={CLAY_LABEL}>Rechercher</label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amber-700/50 dark:text-amber-200/40" />
            <input
              className={`${CLAY_FIELD} pl-8`}
              placeholder="Rechercher une description…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className={CLAY_LABEL}>Mois</label>
          <input type="month" value={filtreMois} onChange={(e) => setFiltreMois(e.target.value)}
            min={restreintMoisCourant ? moisPrecedentStr : undefined}
            max={restreintMoisCourant ? moisCourantStr : undefined}
            className={CLAY_FIELD} />
        </div>
        <div>
          <label className={CLAY_LABEL}>Secteur</label>
          <div className="relative">
            <select value={filtreSecteur} onChange={(e) => { setFiltreSecteur(e.target.value); setFiltreSite('') }} className={`${CLAY_FIELD} pr-9`}>
              <option value="">Tous les secteurs</option>
              {SECTEURS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-amber-700/50 dark:text-amber-200/40" />
          </div>
        </div>
        {filtreSecteur === 'logistique' && (
          <div>
            <label className={CLAY_LABEL}>Site</label>
            <div className="relative">
              <select value={filtreSite} onChange={(e) => setFiltreSite(e.target.value)} className={`${CLAY_FIELD} pr-9`}>
                <option value="">Lomé + Kara</option>
                {LOGISTIQUE_SITES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-amber-700/50 dark:text-amber-200/40" />
            </div>
          </div>
        )}
        <div>
          <label className={CLAY_LABEL}>Catégorie</label>
          <div className="relative">
            <select value={filtreCategorie} onChange={(e) => setFiltreCategorie(e.target.value)} className={`${CLAY_FIELD} pr-9`}>
              <option value="">Toutes</option>
              {categoriesPresentes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-amber-700/50 dark:text-amber-200/40" />
          </div>
        </div>
        <div>
          <label className={CLAY_LABEL}>Nature du flux</label>
          <div className="relative">
            <select value={filtreNature} onChange={(e) => setFiltreNature(e.target.value)} className={`${CLAY_FIELD} pr-9`}>
              <option value="">Toutes</option>
              {Object.entries(NATURES_FLUX).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-amber-700/50 dark:text-amber-200/40" />
          </div>
        </div>
        <div>
          <label className={CLAY_LABEL}>Financement</label>
          <div className="relative">
            <select value={filtreFinancement} onChange={(e) => setFiltreFinancement(e.target.value)} className={`${CLAY_FIELD} pr-9`}>
              <option value="">Tous</option>
              <option value="caisse_commune">💰 Caisse commune uniquement</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-amber-700/50 dark:text-amber-200/40" />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs font-semibold text-amber-800/60 dark:text-amber-200/50">{liste.length} dépense(s) · {totalListe.toLocaleString('fr-FR')} FCFA</span>
          <Button variant="outline" onClick={exportExcel} disabled={liste.length === 0}><FileSpreadsheet size={16} /> Export Excel</Button>
          {!lectureSeule && <Button variant="outline" onClick={openLot}><Layers size={16} /> Ajout multiple</Button>}
          {!lectureSeule && <Button onClick={openCreate}><Plus size={16} /> Ajouter une dépense</Button>}
        </div>
      </div>

      {liste.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
            <Receipt size={34} className="opacity-30" />
            <p className="text-sm">Aucune dépense trouvée.</p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-separate border-spacing-y-2.5 text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th className="px-4 pb-1 text-left font-bold">Date & secteur</th>
                <th className="px-4 pb-1 text-left font-bold">Dépense</th>
                <th className="px-4 pb-1 text-left font-bold">Bénéficiaire</th>
                <th className="px-4 pb-1 text-right font-bold">Montant</th>
                <th className="px-4 pb-1 text-center font-bold">Statut</th>
                <th className="px-4 pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((d) => {
                const secteur = SECTEURS.find((s) => s.id === d.secteurId)
                const secteurColor = secteur?.color || '#64748b'
                const statut = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.decaissee
                const nature = NATURES_FLUX[d.natureFlux || natureFluxDefaut]
                const avecOrigine = d.source === 'besoin' // motif à afficher
                const origine = infoSource(d)
                const importe = !!d.source // dépense reprise d'un autre module (besoin, Briqueterie) : non modifiable ici
                // Modifier une dépense déjà décaissée (ex. corriger la case « Payée depuis
                // la Caisse commune » après coup) : admin, mais aussi secrétaire — pour
                // qu'elle puisse réparer une erreur de saisie sans attendre un admin. La
                // SUPPRESSION, elle, reste réservée à l'admin (action plus irréversible).
                const modifiable = !importe && (isAdmin || role === 'secretaire' || d.statut === 'en_attente' || !d.statut)
                const supprimable = !importe && (isAdmin || d.statut === 'en_attente' || !d.statut)
                const cell = 'bg-white py-3 align-middle transition-colors group-hover:bg-amber-50/40'
                return (
                  <tr key={d.id} onClick={() => setDetailId(d.id)}
                    className="group cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-gray-100 transition-shadow hover:shadow-[0_6px_18px_-6px_rgba(180,83,9,0.18)] hover:ring-amber-200">
                    {/* Date & secteur — accent coloré du secteur à gauche */}
                    <td className={`${cell} rounded-l-2xl border-l-[3px] px-4`} style={{ borderColor: secteurColor }}>
                      <p className="whitespace-nowrap text-xs font-semibold text-gray-700">{formatDateShort(d.date)}</p>
                      <span className="mt-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: secteurColor + '1a', color: secteurColor }}>
                        {libelleSecteurSite(secteur, d)}
                      </span>
                    </td>

                    {/* Dépense : description + catégorie/nature/origine */}
                    <td className={`${cell} px-4`}>
                      {avecOrigine ? (
                        <>
                          <p className="line-clamp-2 max-w-[320px] font-semibold text-gray-800">{d.projetNom || d.description || '—'}</p>
                          {d.tacheTitre && <p className="mt-0.5 line-clamp-1 max-w-[320px] text-xs text-gray-500">🔧 {d.tacheTitre}</p>}
                        </>
                      ) : (
                        <p className="line-clamp-2 max-w-[320px] font-medium text-gray-700">{d.description || '—'}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{d.categorie || '—'}</span>
                        <Badge tone={nature.tone}>{nature.label}</Badge>
                        <Badge tone={origine.tone}>{origine.label}</Badge>
                        {d.financePar === 'caisse_commune' && <Badge tone="warning">💰 Caisse commune</Badge>}
                        {(d.secteursConcernes || []).length > 0 && (
                          <span title={`Concerne aussi : ${d.secteursConcernes.map((id) => SECTEURS.find((s) => s.id === id)?.label || id).join(', ')}`}>
                            <Badge tone="info">+{d.secteursConcernes.length} secteur{d.secteursConcernes.length > 1 ? 's' : ''}</Badge>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Bénéficiaire : qui a payé → qui a reçu */}
                    <td className={`${cell} px-4`}>
                      <div className="space-y-1 text-[11px]">
                        <p className="text-gray-400">✍️ <span className="font-semibold text-gray-600">{d.enregistrePar || '—'}</span></p>
                        {d.beneficiaireNom ? (
                          <p className="text-gray-400">
                            → 👤 <span className="font-semibold text-gray-700">{d.beneficiaireNom}</span>
                            {d.beneficiaireFonction ? <span className="text-gray-400"> · {d.beneficiaireFonction}</span> : ''}
                            {d.beneficiaireTelephone ? <span className="text-gray-400"> · ☎ {d.beneficiaireTelephone}</span> : ''}
                            <span className="ml-1 text-[10px] text-gray-400">
                              {d.beneficiaireUid
                                ? (d.recuConfirme ? '✅ reçu confirmé' : d.statut === 'decaissee' ? '⏳ à confirmer' : '')
                                : '· externe'}
                            </span>
                          </p>
                        ) : <p className="text-gray-300">—</p>}
                      </div>
                    </td>

                    {/* Montant */}
                    <td className={`${cell} whitespace-nowrap px-4 text-right`}>
                      <span className="text-base font-extrabold text-gray-900">{Number(d.montant).toLocaleString('fr-FR')}</span>
                      <span className="ml-0.5 text-[10px] font-semibold text-gray-400">FCFA</span>
                    </td>

                    {/* Statut + justificatif */}
                    <td className={`${cell} px-4 text-center`}>
                      <Badge tone={statut.tone}>{statut.label}</Badge>
                      {d.piece && (
                        <button onClick={(e) => { e.stopPropagation(); ouvrirPiece(d.piece) }} title="Voir le justificatif"
                          className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20">
                          <Paperclip size={11} /> justif.
                        </button>
                      )}
                      {!d.piece && avecOrigine && d.noteOrigine && (
                        <p className="mx-auto mt-1 line-clamp-2 max-w-[150px] text-[10px] italic text-gray-400">{d.noteOrigine}</p>
                      )}
                    </td>

                    {/* Actions */}
                    <td className={`${cell} rounded-r-2xl px-3`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => setDetailId(d.id)} title="Voir les détails" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Eye size={15} /></button>
                        {modifiable && (
                          <button onClick={() => openEdit(d)} title="Modifier" className="rounded-lg p-1.5 text-primary hover:bg-primary/10"><FilePen size={15} /></button>
                        )}
                        {supprimable && (
                          <button onClick={() => setToDelete(d)} title="Supprimer" className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal création / édition */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        panelClassName="bg-gradient-to-br from-amber-200/85 via-amber-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200"
        title={modal?.isNew ? 'Ajouter une dépense' : 'Modifier la dépense'}
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={handleSave} loading={saving}>{modal?.isNew ? 'Enregistrer' : 'Mettre à jour'}</Button></>}>
        {modal && (
          <div className="space-y-3">
            {/* Détails de la dépense */}
            <div className="rounded-xl border border-amber-100 bg-white p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">💰 Détails de la dépense</p>
              {/* Secteur EN PREMIER, CAISSE COMMUNE par défaut : c'est elle qui alimente
                  les dépenses par défaut — y compris, via « Autres secteurs concernés »
                  ci-dessous, celles qui profitent en réalité à d'autres secteurs. Choisir
                  un secteur précis, c'est décider que la dépense est prélevée sur la
                  somme qui LUI est allouée (son propre budget). */}
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Secteur *" hint="CAISSE COMMUNE (par défaut) : dépense financée par le fonds commun. Un autre secteur : prélevée sur son propre budget alloué.">
                  <Select value={modal.data.secteurId} onChange={(e) => set('secteurId', e.target.value)}>
                    {SECTEURS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Select>
                </FormGroup>
                {modal.data.secteurId === 'logistique' && (
                  <FormGroup label="Site *" hint="Budget alloué séparément par site.">
                    <Select value={modal.data.site} onChange={(e) => set('site', e.target.value)}>
                      <option value="">— Choisir —</option>
                      {LOGISTIQUE_SITES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </Select>
                  </FormGroup>
                )}
                <FormGroup label="Catégorie *">
                  <ChampAutocomplete
                    value={modal.data.categorie}
                    onChange={(v) => set('categorie', v)}
                    suggestions={categorieSuggestions}
                    maxSuggestions={categorieSuggestions.length}
                    placeholder="Saisir ou choisir une catégorie…"
                    accent="amber"
                  />
                </FormGroup>
                <FormGroup label="Montant (FCFA) *">
                  <Input type="number" min="0" value={modal.data.montant} onChange={(e) => set('montant', e.target.value)} placeholder="ex: 50000" />
                </FormGroup>
                <FormGroup label="Date *">
                  <Input type="date" value={modal.data.date} onChange={(e) => set('date', e.target.value)} />
                </FormGroup>
              </div>
              <FormGroup label="Description" required className="mt-1">
                <textarea
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  rows={2} value={modal.data.description} onChange={(e) => set('description', e.target.value)}
                  placeholder="Décrivez précisément la dépense : quoi, pourquoi, pour qui, dans quel contexte…"
                />
              </FormGroup>
              {modal.data.secteurId && modal.data.secteurId !== 'divers' && (
                <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm text-gray-700">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-400/30"
                    checked={modal.data.financePar === 'caisse_commune'}
                    onChange={(e) => set('financePar', e.target.checked ? 'caisse_commune' : '')} />
                  <span>
                    💰 Payée depuis la <strong>Caisse commune</strong>
                    <span className="block text-xs text-gray-500">Reste affichée sous ce secteur, mais ne consomme pas son budget — c'est le budget de la Caisse commune qui est réduit à la place.</span>
                  </span>
                </label>
              )}
              {/* Une dépense Caisse commune peut, EN PLUS, concerner un secteur précis
                  (ex. profite en réalité à ce secteur-là) — n'a de sens QUE pour la
                  Caisse commune : dès qu'un secteur précis est choisi ci-dessus, la
                  dépense est déjà prélevée sur SON budget, pas besoin de le redire.
                  Non par défaut. Le montant n'est de toute façon compté qu'une fois
                  (sur la Caisse commune) ; ceci ne sert qu'au tri : la dépense
                  apparaîtra AUSSI quand on filtrera sur ce secteur. */}
              {modal.data.secteurId === 'divers' && (
                <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2">
                  <p className="mb-1.5 text-sm font-semibold text-gray-700">Cette dépense concerne-t-elle un secteur ? <span className="font-normal text-gray-400">(optionnel)</span></p>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => set('concerneAutreSecteur', true)}
                      className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ${modal.data.concerneAutreSecteur
                        ? 'scale-105 bg-green-500 text-white shadow-[0_4px_14px_-2px_rgba(34,197,94,0.6)]'
                        : 'border border-gray-200 bg-white text-gray-400 hover:scale-105 hover:border-green-300 hover:text-green-600 hover:shadow-sm'}`}>
                      ✅ Oui
                    </button>
                    <button type="button" onClick={() => { set('concerneAutreSecteur', false); set('secteursConcernes', []) }}
                      className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ${!modal.data.concerneAutreSecteur
                        ? 'scale-105 bg-red-500 text-white shadow-[0_4px_14px_-2px_rgba(239,68,68,0.6)]'
                        : 'border border-gray-200 bg-white text-gray-400 hover:scale-105 hover:border-red-300 hover:text-red-600 hover:shadow-sm'}`}>
                      ❌ Non
                    </button>
                  </div>
                  {modal.data.concerneAutreSecteur && (
                    <FormGroup label="Secteur concerné" className="mt-2" hint="Cette dépense apparaîtra aussi quand on filtrera sur ce secteur — le montant reste compté une seule fois, sur la Caisse commune.">
                      <Select value={(modal.data.secteursConcernes || [])[0] || ''} onChange={(e) => set('secteursConcernes', e.target.value ? [e.target.value] : [])}>
                        <option value="">— Choisir —</option>
                        {SECTEURS.filter((s) => s.id !== 'divers').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </Select>
                    </FormGroup>
                  )}
                </div>
              )}
            </div>

            {/* Classification comptable */}
            <div className="rounded-xl border border-amber-100 bg-white p-3 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-700">📊 Classification</p>
              <FormGroup label="Nature du flux" hint="Sert au calcul du solde de trésorerie (voir l'onglet Flux de trésorerie).">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(NATURES_FLUX).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => set('natureFlux', k)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${modal.data.natureFlux === k ? 'border-amber-400 bg-amber-50 text-amber-900 shadow-[0_2px_8px_-2px_rgba(217,119,6,0.35)]' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}
                      title={v.desc}>
                      {modal.data.natureFlux === k && (
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white"><Check size={9} strokeWidth={3} /></span>
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
                    💰 Cette dépense sera envoyée en demande d'autorisation au PAU — {raison}.
                  </p>
                ) : null
              })()}
              <FormGroup label="Mode de paiement">
                <div className="flex flex-wrap gap-2">
                  {MODES_PAIEMENT.map((m) => (
                    <button key={m.id} type="button" onClick={() => set('modePaiement', m.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${modal.data.modePaiement === m.id ? 'border-amber-400 bg-amber-50 text-amber-900 shadow-[0_2px_8px_-2px_rgba(217,119,6,0.35)]' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}>
                      {modal.data.modePaiement === m.id && (
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white"><Check size={9} strokeWidth={3} /></span>
                      )}
                      {m.label}
                    </button>
                  ))}
                </div>
              </FormGroup>
            </div>

            {/* Bénéficiaire */}
            <div className="rounded-xl border border-amber-100 bg-white p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">👤 Bénéficiaire <span className="text-red-500">*</span> <span className="font-medium normal-case text-amber-500">— qui reçoit l'argent</span></p>
              <div className="mb-2 flex gap-2">
                <button type="button"
                  onClick={() => { set('beneficiaireType', 'interne'); set('beneficiaireUid', ''); set('beneficiaireNom', ''); set('beneficiaireFonction', ''); set('beneficiaireTelephone', '') }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${modal.data.beneficiaireType !== 'externe' ? 'border-amber-400 bg-amber-50 text-amber-900 shadow-[0_2px_8px_-2px_rgba(217,119,6,0.35)]' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}>
                  {modal.data.beneficiaireType !== 'externe' && (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white"><Check size={9} strokeWidth={3} /></span>
                  )}
                  Membre de l'entreprise
                </button>
                <button type="button"
                  onClick={() => { set('beneficiaireType', 'externe'); set('beneficiaireUid', ''); set('beneficiaireNom', ''); set('beneficiaireFonction', ''); set('beneficiaireTelephone', '') }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${modal.data.beneficiaireType === 'externe' ? 'border-amber-400 bg-amber-50 text-amber-900 shadow-[0_2px_8px_-2px_rgba(217,119,6,0.35)]' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}>
                  {modal.data.beneficiaireType === 'externe' && (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white"><Check size={9} strokeWidth={3} /></span>
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
                  <FormGroup label="Nom de la personne" required>
                    <Input value={modal.data.beneficiaireNom} onChange={(e) => set('beneficiaireNom', e.target.value)} placeholder="ex: Kofi Adjovi" />
                  </FormGroup>
                  <FormGroup label="Profession / fonction">
                    <Input value={modal.data.beneficiaireFonction} onChange={(e) => set('beneficiaireFonction', e.target.value)} placeholder="ex: Maçon" />
                  </FormGroup>
                  <FormGroup label="Contact (téléphone)">
                    <Input value={modal.data.beneficiaireTelephone} onChange={(e) => set('beneficiaireTelephone', e.target.value)} placeholder="ex: 90 00 00 00" />
                  </FormGroup>
                </div>
              ) : (
                <div className="grid gap-3">
                  <FormGroup label="Nom du bénéficiaire" required>
                    <ChampBeneficiaire
                      value={modal.data.beneficiaireNom}
                      onChange={(v) => { set('beneficiaireNom', v); set('beneficiaireUid', '') }}
                      onSelectUser={(u) => { set('beneficiaireUid', u.uid); set('beneficiaireNom', u.nom || ''); set('beneficiaireFonction', u.poste || ''); set('beneficiaireTelephone', u.telephone || '') }}
                      users={users}
                    />
                  </FormGroup>
                  <FormGroup label="Fonction (optionnel)">
                    <Input value={modal.data.beneficiaireFonction} onChange={(e) => set('beneficiaireFonction', e.target.value)} placeholder="ex: Comptable" />
                  </FormGroup>
                  <FormGroup label="Contact (téléphone)">
                    <Input value={modal.data.beneficiaireTelephone} onChange={(e) => set('beneficiaireTelephone', e.target.value)} placeholder="ex: 90 00 00 00" />
                  </FormGroup>
                </div>
              )}
            </div>

            {/* Justificatif */}
            <div className="rounded-xl border border-amber-100 bg-white p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">📎 Justificatif <span className="font-medium normal-case text-amber-500">(photo, PDF, Excel…, optionnel)</span></p>
              {modal.data.piece ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-gray-700"><Paperclip size={14} /> {modal.data.piece.nom} <span className="text-xs text-gray-400">({formatTaille(modal.data.piece.taille)})</span></span>
                  <button onClick={() => set('piece', null)} className="text-xs text-red-500 hover:underline">Retirer</button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-amber-300 bg-white px-3 py-3 text-sm text-gray-500 hover:bg-amber-50">
                  <Paperclip size={16} /> {uploading ? 'Chargement…' : 'Ajouter un justificatif'}
                  <input type="file" accept="image/*,application/pdf,.xlsx,.xls,.csv,.doc,.docx" className="hidden" onChange={handlePieceChange} disabled={uploading} />
                </label>
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
                        <option value="">— Secteur —</option>
                        {SECTEURS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </Select>
                      {r.secteurId === 'logistique' && (
                        <Select value={r.site} onChange={(e) => setLigne(i, 'site', e.target.value)}>
                          <option value="">— Site —</option>
                          {LOGISTIQUE_SITES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </Select>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <Select value={r.categorie} onChange={(e) => setLigne(i, 'categorie', e.target.value)}>
                        <option value="">— Catégorie —</option>
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
                        <input type="checkbox" title="💰 Payée depuis la Caisse commune — ne consomme pas le budget de ce secteur"
                          checked={r.financePar === 'caisse_commune'}
                          onChange={(e) => setLigne(i, 'financePar', e.target.checked ? 'caisse_commune' : '')} />
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

      {/* Modal détail (lecture seule) — utile surtout pour les dépenses récupérées d'un besoin validé */}
      <Modal open={!!detail} onClose={() => setDetailId(null)} size="md" title="Détail de la dépense"
        panelClassName="bg-gradient-to-br from-amber-200/85 via-amber-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200"
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
          const statut = STATUTS_DECAISSEMENT[detail.statut] || STATUTS_DECAISSEMENT.decaissee
          const nature = NATURES_FLUX[detail.natureFlux || natureFluxDefaut]
          const chips = [
            { label: 'Date', value: formatDateShort(detail.date) },
            { label: 'Secteur', value: libelleSecteurSite(secteur, detail) },
            ...((detail.secteursConcernes || []).length > 0
              ? [{ label: 'Concerne aussi', value: detail.secteursConcernes.map((id) => SECTEURS.find((s) => s.id === id)?.label || id).join(', ') }]
              : []),
            { label: 'Catégorie', value: detail.categorie || '—' },
            { label: 'Nature de flux', value: nature.label },
            { label: 'Mode de paiement', value: MODES_PAIEMENT.find((m) => m.id === detail.modePaiement)?.label || '—' },
            { label: 'Origine', value: origine.label }
          ]
          return (
            <div className="space-y-3 text-sm">
              {/* En-tête : montant + statut */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-3xl font-black leading-none text-gray-900">
                      {Number(detail.montant).toLocaleString('fr-FR')}
                      <span className="ml-1 text-sm font-bold text-gray-400">FCFA</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={nature.tone}>{nature.label}</Badge>
                      {detail.financePar === 'caisse_commune' && <Badge tone="warning">💰 Caisse commune</Badge>}
                    </div>
                  </div>
                  <Badge tone={statut.tone}>{statut.label}</Badge>
                </div>
              </div>

              {/* Informations clés en tuiles */}
              <div className="grid grid-cols-2 gap-2">
                {chips.map((c) => (
                  <div key={c.label} className="rounded-xl bg-white p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{c.label}</p>
                    <p className="mt-0.5 font-bold text-gray-800">{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Motif (dépenses issues d'un besoin de secteur validé) */}
              {avecOrigine && (detail.projetNom || detail.tacheTitre) && (
                <div className="rounded-2xl border-l-4 border-teal-400 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600">📋 {origine.label}</p>
                  <p className="mt-1 font-bold text-gray-800">{detail.projetNom || '—'}</p>
                  {detail.tacheTitre && <p className="mt-1 flex items-center gap-1 text-gray-600">🔧 <span className="font-medium">{detail.tacheTitre}</span></p>}
                  {detail.noteOrigine && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs italic text-gray-600">« {detail.noteOrigine} »</p>}
                </div>
              )}

              {/* Description (dépenses saisies directement dans E-DÉPENSES) */}
              {!avecOrigine && (
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Description</p>
                  <p className="mt-1 font-medium text-gray-700">{detail.description || '—'}</p>
                </div>
              )}

              {/* Traçabilité : qui a payé → qui a reçu */}
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
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  {detail.beneficiaireTelephone && <span>☎ {detail.beneficiaireTelephone}</span>}
                  {detail.typePaiement && <span>💳 {detail.typePaiement === 'avance' ? 'Tranche / avance' : 'Somme totale'}</span>}
                </div>
              </div>

              {detail.piece && (
                <button onClick={() => ouvrirPiece(detail.piece)} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-primary shadow-sm hover:bg-primary/5">
                  <Eye size={14} /> Voir le justificatif
                </button>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

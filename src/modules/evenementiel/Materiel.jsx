// Matériel & Matériaux Briqueterie — suivi de l'outillage, des véhicules, du gros
// équipement et des matériaux/consommables du site (ciment, sable, gravillon,
// essence, pièces détachées…). Volet INDÉPENDANT du Stock briques (production/recette,
// cf. StockBriques.jsx) — sa propre collection, son propre stock, aucun lien entre les
// deux. Même écran que celui d'E-G.Pro (src/modules/projet/Materiel.jsx).
//
// Les consommables (ciment, sable, gravillon, essence…) ont un stock NUMÉRIQUE : chaque
// entrée (livraison) augmente le stock, chaque sortie (utilisation) le diminue. Le stock
// actuel = somme des entrées − somme des sorties (jamais négatif).
//
// Le réapprovisionnement (besoin) reste saisi À LA MAIN par la personne concernée, dans
// le volet Besoins du secteur (cf. src/shared/besoins/SectorBesoins.jsx) — volontairement
// PAS créé automatiquement d'ici, même quand un matériau tombe à 0.
//
// Location de matériel (outillage, véhicules, gros équipement) : la demande créée ici
// suit EXACTEMENT le même circuit d'autorisation à deux niveaux (approbation puis
// certification) que les sorties de briques — cf. Demandes.jsx, onglet « Location
// matériel », même workflow partagé (src/shared/workflow.js), mêmes rôles approbateurs.
import { useState, useMemo, useEffect } from 'react'
import { Plus, Pencil, Trash2, Wrench, CheckCircle2, AlertTriangle, XCircle, RotateCcw, PlusCircle, MinusCircle, Ban, Boxes, Download, KeyRound } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import StatCard from '../../shared/ui/StatCard'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, setItem, removeItem, updateItem } from '../../core/db'
import { useAuth } from '../../hooks/useAuth'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { formatDateShort, formatDateTime, formatMoney, genNumero, nowHM, todayStr } from '../../utils/formatters'
import { marquerVoletVu } from '../../shared/nouveautes'
import { APPROVER_ROLES } from '../../core/roles'
import { useBriqueterieStore } from './store/referentielStore'

// Stock actuel d'une matière première dans Stock briques (dernier inventaire enregistré
// qui la mentionne) — utilisé UNE SEULE FOIS, pour l'import initial ci-dessous.
function stockActuelStockBriques(inventaires, matiereId) {
  const dernier = [...(inventaires || [])].filter((i) => i.matieres?.[matiereId]).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  return dernier ? Number(dernier.matieres[matiereId].fin) || 0 : 0
}

const CATEGORIES_MATERIEL = [
  { id: 'consommable',     label: 'Consommable (essence, pièces…)' },
  { id: 'outillage',       label: 'Outillage'        },
  { id: 'vehicule',        label: 'Véhicule'          },
  { id: 'gros_equipement', label: 'Gros équipement'   },
  { id: 'autre',           label: 'Autre'             }
]

const UNITES_SUGGESTIONS = ['litre', 'unité', 'kg', 'sac', 'm³', 'bidon']

const ETATS_MATERIEL = {
  bon_etat:     { label: 'Bon état',      tone: 'success' },
  a_reparer:    { label: 'À réparer',     tone: 'warning' },
  hors_service: { label: 'Hors service',  tone: 'danger'  }
}

const STATUTS_MATERIEL = {
  sur_site:  { label: 'Sur site',    tone: 'info'    },
  loue:      { label: 'En location', tone: 'warning' },
  retourne:  { label: 'Retourné',    tone: 'neutral' },
  perdu:     { label: 'Perdu',       tone: 'danger'  }
}

const VIDE = {
  nom: '', categorie: 'consommable', unite: '',
  quantiteInitiale: '', etat: 'bon_etat', dateEntree: '', note: ''
}

// Stock = somme des entrées − somme des sorties, recalculé à partir de
// l'historique des mouvements (source unique de vérité — jamais négatif).
function calculerStock(mouvements = []) {
  const total = mouvements.reduce((s, mv) => s + (mv.type === 'entree' ? Number(mv.quantite) || 0 : -(Number(mv.quantite) || 0)), 0)
  return Math.max(0, total)
}

// Total cumulé des sorties (quantité déjà utilisée/consommée) — affiché à côté du reste.
function calculerSorties(mouvements = []) {
  return mouvements.reduce((s, mv) => s + (mv.type === 'sortie' ? Number(mv.quantite) || 0 : 0), 0)
}

// Total cumulé des entrées (quantité livrée/reçue depuis le début).
function calculerEntrees(mouvements = []) {
  return mouvements.reduce((s, mv) => s + (mv.type === 'entree' ? Number(mv.quantite) || 0 : 0), 0)
}

export default function Materiel() {
  const { data: materiels } = useCollection('evenementiel_materiels')
  // Uniquement pour l'import ponctuel du stock actuel de Stock briques (cf.
  // importerDepuisStockBriques) — aucun autre usage, aucune synchronisation continue.
  const { data: inventairesBriques } = useCollection('evenementiel_inventaires')
  const matieresBriques = useBriqueterieStore((s) => s.matieres)
  // Numérotation des demandes de location (LOC-MAT-…) — même compteur que les
  // autorisations de sortie briques, cf. Demandes.jsx.
  const { data: demandesTous } = useCollection('evenementiel_demandes')
  const { user, role } = useAuth()
  // Le superviseur crée/modifie/suit le matériel, mais ne supprime rien.
  // Accès complet pour la secrétaire/l'agent, sauf la suppression (réservée).
  const peutSupprimer = !['superviseur', 'partenaire', 'secretaire', 'agent'].includes(role)
  useEffect(() => { marquerVoletVu(user?.uid, 'evenementielMateriel') }, [user?.uid])

  // Matières de Stock briques pas encore importées ici (comparaison par nom) — sert à
  // proposer l'import seulement s'il reste quelque chose à récupérer, et à ne jamais
  // créer de doublon si on reclique après un premier import.
  const [importing, setImporting] = useState(false)
  const matieresAImporter = useMemo(() => {
    const nomsExistants = new Set(materiels.map((m) => m.nom.trim().toLowerCase()))
    return matieresBriques.filter((m) => !nomsExistants.has(m.nom.trim().toLowerCase()))
  }, [matieresBriques, materiels])

  // Import PONCTUEL (une fois) du stock actuel de Stock briques comme point de départ
  // ici — ensuite, les deux stocks évoluent chacun de leur côté, sans lien (cf. en-tête
  // du fichier : ce volet est indépendant de la production/recette).
  async function importerDepuisStockBriques() {
    if (importing || !matieresAImporter.length) return
    if (!window.confirm(`Importer ${matieresAImporter.length} matière(s) depuis Stock briques avec leur stock actuel comme point de départ ?`)) return
    setImporting(true)
    try {
      const now = Date.now()
      for (const m of matieresAImporter) {
        const stock = stockActuelStockBriques(inventairesBriques, m.id)
        const mouvements = stock > 0
          ? [{ id: `mvt_${now}_${m.id}`, type: 'entree', quantite: stock, note: 'Import depuis Stock briques', date: now, auteur: user?.nom || user?.login || null }]
          : []
        await addItem('evenementiel_materiels', {
          nom: m.nom, categorie: 'consommable', unite: m.unite || '', etat: 'bon_etat',
          dateEntree: now, note: '', statut: 'sur_site', quantite: stock, mouvements, createdAt: now,
          responsable: user?.nom || user?.login || null, ajouteParUid: user?.uid || null
        })
        await audit('evenementiel', 'materiel_ajoute', `${m.nom} (import Stock briques)`)
      }
      toast.success(`${matieresAImporter.length} matière(s) importée(s) ✓`)
    } finally {
      setImporting(false)
    }
  }

  // Deux fenêtres distinctes dans ce même volet : Matériaux (consommables — ciment,
  // sable, gravillon, essence… avec KPI de stock) et Matériels (outillage, véhicules,
  // gros équipement — suivi d'état/statut). Même collection, même logique en dessous ;
  // seul l'onglet actif change ce qui est filtré et proposé à l'enregistrement.
  const [onglet, setOnglet] = useState('materiaux') // 'materiaux' | 'materiels'
  const CATEGORIES_MATERIELS_ONGLET = ['outillage', 'vehicule', 'gros_equipement', 'autre']

  const [filtreCategorie, setFiltreCateg] = useState('')
  const [filtreStatut, setFiltreStatut]   = useState('sur_site')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VIDE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [mouvement, setMouvement]   = useState(null) // { materiel, type: 'entree' | 'sortie' }
  const [mvtQte, setMvtQte]         = useState('')
  const [mvtNote, setMvtNote]       = useState('')
  const [detail, setDetail] = useState(null)
  const [locationModal, setLocationModal] = useState(null) // { materiel, locataireNom, locataireContact, dateDebut, nombreJours, prixTotal, motif }
  const [locationSaving, setLocationSaving] = useState(false)

  const liste = useMemo(() =>
    materiels
      .filter((m) => onglet === 'materiaux' ? m.categorie === 'consommable' : CATEGORIES_MATERIELS_ONGLET.includes(m.categorie))
      .filter((m) => !filtreCategorie || m.categorie === filtreCategorie)
      .filter((m) => !filtreStatut    || m.statut    === filtreStatut)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  [materiels, onglet, filtreCategorie, filtreStatut])

  const materielsOnglet = useMemo(() =>
    materiels.filter((m) => onglet === 'materiaux' ? m.categorie === 'consommable' : CATEGORIES_MATERIELS_ONGLET.includes(m.categorie)),
  [materiels, onglet])
  const compteur = (statut) => materielsOnglet.filter((m) => m.statut === statut).length
  const catLabel = (id) => CATEGORIES_MATERIEL.find((c) => c.id === id)?.label || id

  // KPI — stock actuel de chaque consommable (ciment, sable, gravillon, essence…),
  // quel qu'il soit : générés dynamiquement à partir de ce qui a été ajouté ici, pas
  // d'une liste figée de noms.
  const kpisStock = useMemo(() =>
    materiels
      .filter((m) => m.categorie === 'consommable' && m.statut === 'sur_site')
      .map((m) => ({ ...m, stock: calculerStock(m.mouvements || []) }))
      .sort((a, b) => a.nom.localeCompare(b.nom)),
  [materiels])

  const openCreate = () => { setForm({ ...VIDE, categorie: onglet === 'materiaux' ? 'consommable' : 'outillage' }); setEditing(null); setModal(true) }
  const openEdit   = (m) => {
    setForm({
      nom: m.nom || '', categorie: m.categorie || 'consommable',
      unite: m.unite || '', quantiteInitiale: '', etat: m.etat || 'bon_etat',
      dateEntree: m.dateEntree ? new Date(m.dateEntree).toISOString().slice(0, 10) : '',
      note: m.note || ''
    })
    setEditing(m); setModal(true)
  }

  const handleSave = async () => {
    if (!form.nom.trim()) return
    if (!editing && form.quantiteInitiale === '') return
    setSaving(true)
    try {
      const now = Date.now()
      const { quantiteInitiale, ...rest } = form
      const payload = {
        ...rest, nom: form.nom.trim(), unite: form.unite.trim(),
        dateEntree: form.dateEntree ? new Date(form.dateEntree).getTime() : now,
        updatedAt: now
      }
      if (editing) {
        await setItem('evenementiel_materiels', editing.id, { ...editing, ...payload })
        await audit('evenementiel', 'materiel_modifie', payload.nom)
      } else {
        const qteInit = Number(quantiteInitiale) || 0
        const mouvements = qteInit > 0
          ? [{ id: `mvt_${now}`, type: 'entree', quantite: qteInit, note: 'Stock initial', date: now, auteur: user?.nom || user?.login || null }]
          : []
        await addItem('evenementiel_materiels', {
          ...payload, statut: 'sur_site', quantite: qteInit, mouvements, createdAt: now,
          responsable: user?.nom || user?.login || null, ajouteParUid: user?.uid || null
        })
        await audit('evenementiel', 'materiel_ajoute', payload.nom)
      }
      setModal(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (m) => {
    if (!peutSupprimer) return
    if (!window.confirm(`Retirer "${m.nom}" du suivi matériel ?`)) return
    await removeItem('evenementiel_materiels', m.id)
  }

  const changerStatut = async (m, statut) => {
    await updateItem('evenementiel_materiels', m.id, { statut, updatedAt: Date.now() })
    await audit('evenementiel', 'materiel_' + statut, m.nom)
  }

  const changerEtat = async (m, etat) => {
    await updateItem('evenementiel_materiels', m.id, { etat, updatedAt: Date.now() })
  }

  // Fin de location — remet le matériel sur site et efface les infos de location en
  // cours (la demande elle-même, certifiée, reste consultable dans Demandes.jsx).
  const marquerRetourLocation = async (m) => {
    if (!window.confirm(`Marquer le retour de "${m.nom}" ? Il repasse "Sur site".`)) return
    await updateItem('evenementiel_materiels', m.id, { statut: 'sur_site', locationEnCours: null, updatedAt: Date.now() })
    await audit('evenementiel', 'materiel_retour_location', m.nom)
  }

  // ── Mouvements de stock (entrée / sortie) — ajout, correction et suppression ──
  const ouvrirMouvement = (m, type) => { setMouvement({ materiel: m, type }); setMvtQte(''); setMvtNote('') }

  const ouvrirEditionMouvement = (m, mv) => {
    setMouvement({ materiel: m, type: mv.type, edit: mv })
    setMvtQte(String(mv.quantite))
    setMvtNote(mv.note || '')
  }

  const confirmerMouvement = async () => {
    const qte = Number(mvtQte)
    if (!mouvement || !qte || qte <= 0) return
    const { materiel, type, edit } = mouvement
    const mouvementsActuels = materiel.mouvements || []
    const nouvelleEntree = { id: edit?.id || `mvt_${Date.now()}`, type, quantite: qte, note: mvtNote.trim(), date: edit?.date || Date.now(), auteur: edit?.auteur || user?.nom || user?.login || null }
    const mouvements = edit
      ? mouvementsActuels.map((mv) => mv.id === edit.id ? nouvelleEntree : mv)
      : [...mouvementsActuels, nouvelleEntree]

    // Le stock ne doit jamais devenir négatif — on vérifie le total brut (avant
    // plafonnement) pour prévenir plutôt que de masquer silencieusement l'erreur.
    const totalBrut = mouvements.reduce((s, mv) => s + (mv.type === 'entree' ? Number(mv.quantite) || 0 : -(Number(mv.quantite) || 0)), 0)
    if (totalBrut < 0) {
      toast.error(`Cette valeur ferait passer le stock sous zéro (il resterait ${totalBrut} ${materiel.unite || 'unité(s)'}).`)
      return
    }

    await updateItem('evenementiel_materiels', materiel.id, { quantite: calculerStock(mouvements), mouvements, updatedAt: Date.now() })
    await audit('evenementiel', edit ? 'materiel_mouvement_corrige' : (type === 'entree' ? 'materiel_entree' : 'materiel_sortie'), `${materiel.nom} — ${qte} ${materiel.unite || ''}`)
    setMouvement(null)
  }

  const supprimerMouvement = async (materiel, mv) => {
    if (!peutSupprimer) return
    if (!window.confirm('Supprimer ce mouvement ? Le stock sera recalculé automatiquement.')) return
    const mouvements = (materiel.mouvements || []).filter((x) => x.id !== mv.id)
    await updateItem('evenementiel_materiels', materiel.id, { quantite: calculerStock(mouvements), mouvements, updatedAt: Date.now() })
    await audit('evenementiel', 'materiel_mouvement_supprime', `${materiel.nom} — ${mv.quantite} ${materiel.unite || ''}`)
  }

  // Pour les consommables en vrac dont la quantité restante ne peut pas être estimée
  // précisément : déclaration directe "il n'y en a plus", sans saisir une quantité exacte.
  const marquerEpuise = async (m) => {
    const stockActuel = calculerStock(m.mouvements || [])
    if (stockActuel <= 0) return
    if (!window.confirm(`Déclarer "${m.nom}" comme épuisé ? Le stock sera ramené à 0.`)) return
    const mouvements = [
      ...(m.mouvements || []),
      { id: `mvt_${Date.now()}`, type: 'sortie', quantite: stockActuel, note: 'Déclaré épuisé', date: Date.now(), auteur: user?.nom || user?.login || null }
    ]
    await updateItem('evenementiel_materiels', m.id, { quantite: 0, mouvements, updatedAt: Date.now() })
    await audit('evenementiel', 'materiel_epuise', m.nom)
  }

  // ── Location de matériel — même circuit d'autorisation que les sorties de briques ──
  // La demande créée ici (type: 'location') se traite dans Demandes.jsx, onglet
  // « Location matériel » : approbation puis certification, mêmes rôles. Le matériel
  // lui-même ne passe en statut « En location » qu'à la CERTIFICATION (cf. Demandes.jsx),
  // pas à la simple soumission — comme pour le stock des briques.
  const ouvrirLocation = (m) => setLocationModal({
    materiel: m, locataireNom: '', locataireContact: '',
    dateDebut: todayStr(), nombreJours: '', prixTotal: '', motif: ''
  })

  async function soumettreLocation() {
    if (locationSaving || !locationModal) return
    const { materiel, locataireNom, locataireContact, dateDebut, nombreJours, prixTotal, motif } = locationModal
    if (!locataireNom.trim()) return toast.error('Nom du locataire requis')
    if (!dateDebut) return toast.error('Date de début requise')
    if (!nombreJours || Number(nombreJours) <= 0) return toast.error('Nombre de jours requis')
    if (!prixTotal || Number(prixTotal) <= 0) return toast.error('Prix total requis')
    setLocationSaving(true)
    try {
      const num = genNumero('LOC-MAT', demandesTous.length)
      await addItem('evenementiel_demandes', {
        type: 'location', num, date: todayStr(), heure: nowHM(),
        demandeur: user?.login, demandeurNom: user?.nom || user?.login, demandeurUid: user?.uid,
        materielId: materiel.id, materielNom: materiel.nom,
        locataireNom: locataireNom.trim(), locataireContact: locataireContact.trim(),
        dateDebut, nombreJours: Number(nombreJours), prixTotal: Number(prixTotal),
        message: motif.trim(), statut: 'en_attente'
      })
      await notify({
        type: 'demande', title: 'Location matériel — autorisation requise',
        body: `${materiel.nom} — ${nombreJours} jour(s) — ${formatMoney(Number(prixTotal))} — locataire ${locataireNom.trim()} — par ${user?.nom || user?.login}`,
        module: 'evenementiel', forRoles: [...APPROVER_ROLES, 'secretaire'], excludeUid: user?.uid, link: '/evenementiel/demandes'
      })
      await audit('evenementiel', 'LOCATION_DEMANDE', `${num} — ${materiel.nom}`)
      toast.success('Demande de location soumise — approbation puis certification requises ✓')
      setLocationModal(null)
    } finally {
      setLocationSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(124,58,237,0.35),0_8px_20px_-8px_rgba(124,58,237,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.85) 0%, rgba(76,29,149,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#7c3aed', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Wrench size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Matériel & Matériaux</h2>
          <p className="text-sm text-white/80">{compteur('sur_site')} matériel(s) sur site — Outillage, véhicules, gros équipement, consommables</p>
        </div>
      </div>

      {/* Deux fenêtres : Matériaux (consommables, avec KPI de stock) et Matériels
          (outillage/véhicules/gros équipement, suivi d'état). */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'materiaux', label: '📦 Matériaux' },
          { id: 'materiels', label: '🔧 Matériels' }
        ].map((t) => (
          <button key={t.id} onClick={() => { setOnglet(t.id); setFiltreCateg('') }}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              onglet === t.id ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Import ponctuel du stock actuel de Stock briques (ciment, sable, gravillon…) —
          disparaît une fois toutes les matières importées ; les deux stocks évoluent
          ensuite chacun de leur côté (cf. en-tête du fichier). */}
      {onglet === 'materiaux' && matieresAImporter.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
          <Download size={18} className="shrink-0 text-violet-600" />
          <p className="min-w-0 flex-1 text-sm text-violet-800">
            <strong>{matieresAImporter.length} matière(s)</strong> disponible(s) dans Stock briques ({matieresAImporter.map((m) => m.nom).join(', ')}) — récupérer leur stock actuel comme point de départ ici.
          </p>
          <Button size="sm" onClick={importerDepuisStockBriques} loading={importing}>
            <Download size={14} className="mr-1" /> Importer depuis Stock briques
          </Button>
        </div>
      )}

      {/* KPI — stock actuel de chaque matériau/consommable (ciment, sable, gravillon…),
          quel que soit son nom : générés à partir de ce qui a été ajouté ci-dessous. */}
      {onglet === 'materiaux' && kpisStock.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {kpisStock.map((m) => (
            <StatCard key={m.id} title={m.nom} value={`${m.stock} ${m.unite || ''}`}
              sub={m.stock <= 0 ? '⚠ Épuisé' : 'En stock'}
              icon={Boxes} accent={m.stock <= 0 ? '#dc2626' : '#7c3aed'}
              valueColor={m.stock <= 0 ? '#dc2626' : undefined} />
          ))}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        {onglet === 'materiels' && (
          <select className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none"
            value={filtreCategorie} onChange={(e) => setFiltreCateg(e.target.value)}>
            <option value="">Toutes catégories</option>
            {CATEGORIES_MATERIEL.filter((c) => CATEGORIES_MATERIELS_ONGLET.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/50 bg-white/50 p-1 shadow-sm backdrop-blur-sm">
          {[['', `Tous (${materielsOnglet.length})`], ...Object.entries(STATUTS_MATERIEL).map(([k, v]) => [k, `${v.label} (${compteur(k)})`])].map(([v, l]) => (
            <button key={v || 'tous'} onClick={() => setFiltreStatut(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtreStatut === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-white'}`}>
              {l}
            </button>
          ))}
        </div>
        <Button onClick={openCreate} size="sm" className="ml-auto">
          <Plus size={14} className="mr-1" />{onglet === 'materiaux' ? 'Ajouter un matériau' : 'Ajouter un matériel'}
        </Button>
      </div>

      {/* Liste */}
      {!liste.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <Wrench size={32} className="opacity-30" />
            <p className="text-sm">Aucun {onglet === 'materiaux' ? 'matériau' : 'matériel'}.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {liste.map((m) => {
            const st = STATUTS_MATERIEL[m.statut] || STATUTS_MATERIEL.sur_site
            const et = ETATS_MATERIEL[m.etat] || ETATS_MATERIEL.bon_etat
            const stock = calculerStock(m.mouvements || [])
            return (
              <Card key={m.id} className="card-hover !p-0" onClick={() => setDetail(m)}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {/* Nom + badges */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-gray-800">{m.nom}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">{catLabel(m.categorie)}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <Badge tone={et.tone}>{et.label}</Badge>
                    </div>
                  </div>

                  {/* Stock */}
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">En stock</p>
                    <p className="text-lg font-extrabold text-violet-700 leading-tight">
                      {stock} <span className="text-xs font-semibold text-gray-500">{m.unite || 'unité(s)'}</span>
                    </p>
                  </div>

                  {/* Actions de stock — toujours visibles */}
                  <div className="flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="success" onClick={() => ouvrirMouvement(m, 'entree')}>
                      <PlusCircle size={14} /> Entrée
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => ouvrirMouvement(m, 'sortie')}>
                      <MinusCircle size={14} /> Sortie
                    </Button>
                    {stock > 0 && (
                      <Button size="sm" variant="outline" onClick={() => marquerEpuise(m)} title="À utiliser quand la quantité restante ne peut pas être estimée">
                        <Ban size={14} /> Épuisé
                      </Button>
                    )}
                    {onglet === 'materiels' && m.statut === 'sur_site' && (
                      <Button size="sm" variant="outline" onClick={() => ouvrirLocation(m)} title="Demander une autorisation de location">
                        <KeyRound size={14} /> Louer
                      </Button>
                    )}
                  </div>

                  {/* Modifier / Supprimer */}
                  <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(m)} className="rounded-lg border border-violet-200 bg-violet-50 p-1.5 text-violet-600 transition-colors hover:border-violet-300 hover:bg-violet-100"><Pencil size={14} /></button>
                    {peutSupprimer && (
                      <button onClick={() => handleDelete(m)} className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Détail matériel/matériau */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Détail"
        panelClassName="bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-300/75 backdrop-blur-2xl backdrop-saturate-200">
        {detail && (() => {
          // Version à jour (les mouvements/statut/état ajoutés depuis la fiche doivent
          // apparaître immédiatement sans fermer la modale).
          const d = materiels.find((x) => x.id === detail.id) || detail
          const st = STATUTS_MATERIEL[d.statut] || STATUTS_MATERIEL.sur_site
          const et = ETATS_MATERIEL[d.etat] || ETATS_MATERIEL.bon_etat
          const mvts = [...(d.mouvements || [])].sort((a, b) => (b.date || 0) - (a.date || 0))
          const stock = calculerStock(d.mouvements || [])
          const sorti = calculerSorties(d.mouvements || [])
          const entre = calculerEntrees(d.mouvements || [])
          return (
            <div className="space-y-4">
              {/* En-tête glassmorphism — nom bien visible */}
              <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(124,58,237,0.35),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
                style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.92) 0%, rgba(76,29,149,0.88) 100%)' }}>
                <p className="font-mono text-xs text-white/70">{catLabel(d.categorie)}</p>
                <p className="mt-0.5 text-lg font-extrabold leading-snug">{d.nom}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {st.label}
                  </span>
                  <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                    {et.label}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Unité : </span><span className="font-semibold">{d.unite || 'unité(s)'}</span></div>
                <div><span className="text-gray-500">Arrivé le : </span><span className="font-semibold">{d.dateEntree ? formatDateShort(d.dateEntree) : '—'}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Suivi par : </span><span className="font-semibold">{d.responsable || '—'}{d.createdAt ? ` · ${formatDateTime(d.createdAt)}` : ''}</span></div>
              </div>

              {d.note && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-gray-500">Note</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">« {d.note} »</p>
                </div>
              )}

              {/* Location en cours — renseignée à la certification de la demande de
                  location (cf. Demandes.jsx). */}
              {d.statut === 'loue' && d.locationEnCours && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 shadow-sm">
                  <p className="mb-1.5 text-xs font-bold uppercase text-amber-700">🔑 Location en cours</p>
                  <div className="space-y-0.5 text-sm text-amber-900">
                    <p>Locataire : <b>{d.locationEnCours.locataireNom}</b>{d.locationEnCours.locataireContact ? ` · ☎ ${d.locationEnCours.locataireContact}` : ''}</p>
                    <p>Du {formatDateShort(d.locationEnCours.dateDebut)} — {d.locationEnCours.nombreJours} jour(s) — {formatMoney(d.locationEnCours.prixTotal)}</p>
                  </div>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => marquerRetourLocation(d)}>
                    <RotateCcw size={13} /> Marquer le retour — remettre sur site
                  </Button>
                </div>
              )}

              {/* Suivi du stock */}
              <div className="rounded-2xl border border-violet-100/70 bg-violet-50/60 p-3.5 shadow-sm backdrop-blur-sm">
                <p className="mb-2 text-xs font-bold uppercase text-violet-700">Suivi du stock</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-gray-500">Reçu : <b className="text-gray-700">{entre} {d.unite || 'unité(s)'}</b></span>
                  <span className="text-gray-500">Sorti : <b className="text-amber-600">{sorti} {d.unite || 'unité(s)'}</b></span>
                  <span className="text-gray-500">Reste : <b className="text-green-600">{stock} {d.unite || 'unité(s)'}</b></span>
                </div>
              </div>

              {/* Historique complet des mouvements */}
              {mvts.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Historique des mouvements</p>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto">
                    {mvts.map((mv) => (
                      <div key={mv.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <span className={mv.type === 'entree' ? 'font-semibold text-green-600' : 'font-semibold text-red-500'}>
                            {mv.type === 'entree' ? '+ ' : '− '}{mv.quantite} {d.unite || ''} {mv.note ? `— ${mv.note}` : ''}
                          </span>
                          <span className="ml-1 text-gray-400">· {formatDateShort(mv.date)} · {mv.auteur || '—'}</span>
                        </div>
                        <span className="flex shrink-0 items-center gap-1">
                          <button onClick={() => ouvrirEditionMouvement(d, mv)} title="Corriger ce mouvement"
                            className="rounded border border-violet-200 bg-violet-50 p-0.5 text-violet-600 hover:bg-violet-100"><Pencil size={11} /></button>
                          {peutSupprimer && (
                            <button onClick={() => supprimerMouvement(d, mv)} title="Supprimer ce mouvement"
                              className="rounded border border-red-200 bg-red-50 p-0.5 text-red-600 hover:bg-red-100"><Trash2 size={11} /></button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* État / statut — hors consommables */}
              {d.categorie !== 'consommable' && (
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {d.etat !== 'bon_etat' && (
                    <Button size="sm" variant="outline" onClick={() => changerEtat(d, 'bon_etat')}>
                      <CheckCircle2 size={13} /> Bon état
                    </Button>
                  )}
                  {d.etat === 'bon_etat' && (
                    <Button size="sm" variant="outline" onClick={() => changerEtat(d, 'a_reparer')}>
                      <AlertTriangle size={13} /> À réparer
                    </Button>
                  )}
                  {d.etat !== 'hors_service' && (
                    <Button size="sm" variant="outline" onClick={() => changerEtat(d, 'hors_service')}>
                      <XCircle size={13} /> Hors service
                    </Button>
                  )}
                  {d.statut === 'sur_site' ? (
                    <Button size="sm" variant="outline" onClick={() => changerStatut(d, 'retourne')}>
                      <RotateCcw size={13} /> Retourné
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => changerStatut(d, 'sur_site')}>
                      Remettre sur site
                    </Button>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
                <Button onClick={() => { setDetail(null); openEdit(d) }}>
                  <Pencil size={14} className="mr-1" />Modifier
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Modal création/édition */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier le matériel' : 'Ajouter du matériel'}
        panelClassName="bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-200/75 backdrop-blur-2xl backdrop-saturate-200">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 space-y-3 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(124,58,237,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">📋 Informations</p>
            <FormGroup label="Matériel" required>
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                placeholder="ex : Brouette, groupe électrogène, camion…"
                value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} />
            </FormGroup>
          </div>

          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 space-y-3 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(124,58,237,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">📦 Détails & stock</p>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Catégorie">
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  value={form.categorie} onChange={(e) => setForm((f) => ({ ...f, categorie: e.target.value }))}>
                  {CATEGORIES_MATERIEL.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="État">
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  value={form.etat} onChange={(e) => setForm((f) => ({ ...f, etat: e.target.value }))}>
                  {Object.entries(ETATS_MATERIEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Unité" hint="ex : litre, kg, sac">
                <ChampAutocomplete
                  value={form.unite}
                  onChange={(v) => setForm((f) => ({ ...f, unite: v }))}
                  suggestions={UNITES_SUGGESTIONS}
                  placeholder="unité"
                />
              </FormGroup>
              {!editing && (
                <FormGroup label="Quantité initiale" required hint="Stock de départ — mettre 0 si aucun stock pour l'instant">
                  <input type="number" min="0" step="any" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    placeholder="0"
                    value={form.quantiteInitiale} onChange={(e) => setForm((f) => ({ ...f, quantiteInitiale: e.target.value }))} />
                </FormGroup>
              )}
              <FormGroup label="Arrivé le" hint="Optionnel">
                <input type="date" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                  value={form.dateEntree} onChange={(e) => setForm((f) => ({ ...f, dateEntree: e.target.value }))} />
              </FormGroup>
            </div>
            {editing && (
              <p className="text-[11px] text-gray-500">Le stock se modifie via les boutons "Entrée" / "Sortie" sur la fiche, pas ici.</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(124,58,237,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <FormGroup label="Note" hint="Optionnel">
              <textarea rows={2} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </FormGroup>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.nom.trim() || (!editing && form.quantiteInitiale === '')}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal mouvement de stock (entrée / sortie / correction) */}
      <Modal open={!!mouvement} onClose={() => setMouvement(null)}
        title={
          mouvement?.edit
            ? `Corriger ce mouvement — ${mouvement?.materiel.nom}`
            : mouvement?.type === 'entree' ? `Entrée de stock — ${mouvement?.materiel.nom}` : `Sortie de stock — ${mouvement?.materiel.nom}`
        }>
        {mouvement && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Stock actuel : <b className="text-gray-700">{calculerStock(mouvement.materiel.mouvements || [])} {mouvement.materiel.unite || 'unité(s)'}</b>
            </p>
            <FormGroup label={mouvement.type === 'entree' ? 'Quantité livrée' : 'Quantité utilisée'} required>
              <input type="number" min="0" step="any" autoFocus
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                placeholder="0"
                value={mvtQte} onChange={(e) => setMvtQte(e.target.value)} />
            </FormGroup>
            <FormGroup label="Note" hint="Optionnel">
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                placeholder={mouvement.type === 'entree' ? 'ex : Achat station-service' : 'ex : Ravitaillement camion'}
                value={mvtNote} onChange={(e) => setMvtNote(e.target.value)} />
            </FormGroup>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setMouvement(null)}>Annuler</Button>
              <Button variant={mouvement.type === 'entree' ? 'success' : 'danger'} onClick={confirmerMouvement} disabled={!mvtQte || Number(mvtQte) <= 0}>
                {mouvement.edit ? 'Enregistrer la correction' : 'Confirmer'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Demande de location — soumise pour autorisation (approbation puis
          certification), traitée dans Demandes.jsx → onglet « Location matériel ». */}
      <Modal open={!!locationModal} onClose={() => setLocationModal(null)}
        title={locationModal ? `Louer — ${locationModal.materiel.nom}` : ''}
        footer={<>
          <Button variant="ghost" onClick={() => setLocationModal(null)} disabled={locationSaving}>Annuler</Button>
          <Button onClick={soumettreLocation} loading={locationSaving}>Soumettre la demande</Button>
        </>}>
        {locationModal && (
          <div className="space-y-3">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Cette demande suit le même circuit d'autorisation que les sorties de briques : approbation puis certification par la hiérarchie avant que le matériel ne parte en location.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Nom du locataire" required>
                <Input value={locationModal.locataireNom} onChange={(e) => setLocationModal((l) => ({ ...l, locataireNom: e.target.value }))} autoFocus />
              </FormGroup>
              <FormGroup label="Contact du locataire" hint="Optionnel">
                <Input value={locationModal.locataireContact} onChange={(e) => setLocationModal((l) => ({ ...l, locataireContact: e.target.value }))} placeholder="ex : +228 90 00 00 00" />
              </FormGroup>
              <FormGroup label="Date de début" required>
                <Input type="date" value={locationModal.dateDebut} onChange={(e) => setLocationModal((l) => ({ ...l, dateDebut: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Nombre de jours" required>
                <Input type="number" min="1" value={locationModal.nombreJours} onChange={(e) => setLocationModal((l) => ({ ...l, nombreJours: e.target.value }))} placeholder="ex : 3" />
              </FormGroup>
              <FormGroup label="Prix total (FCFA)" required className="col-span-2">
                <Input type="number" min="0" value={locationModal.prixTotal} onChange={(e) => setLocationModal((l) => ({ ...l, prixTotal: e.target.value }))} placeholder="ex : 15 000" />
              </FormGroup>
            </div>
            <FormGroup label="Motif / précisions" hint="Optionnel">
              <textarea rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                value={locationModal.motif} onChange={(e) => setLocationModal((l) => ({ ...l, motif: e.target.value }))} placeholder="ex : chantier client, usage prévu…" />
            </FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}

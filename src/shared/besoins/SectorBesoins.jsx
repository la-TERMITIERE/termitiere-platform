// Besoins — volet générique réutilisable pour les secteurs qui n'ont pas de notion de
// « projet » (Maxi-Agro, Maxi Logistique, E-Briqueterie, E-Garderie, E-Foncier). E-G.Pro
// garde son propre volet Besoins, rattaché aux projets (cf. ../../modules/projet/Besoins.jsx) —
// celui-ci reprend les mêmes paramètres de notification/cycle de vie, sans la logique de
// devis par ouvrage qui n'a de sens que pour un chantier.
//
// Paramètres partagés avec E-G.Pro (à garder synchronisés si l'un évolue) :
//  - notification (push + in-app) à la création, aux rôles BESOINS_NOTIF_ROLES ;
//  - relance 3×/jour tant que non résolu, cf. netlify/functions/besoins-relance.mjs
//    (qui scanne aussi la collection `sector_besoins` en plus de `projet_besoins`) ;
//  - numéro de téléphone du demandeur affiché sur chaque besoin ;
//  - masquage 24h après validation — la dépense reste consultable dans E-DÉPENSES ;
//  - réponse (observation) de l'administration envoyée en notification au demandeur.
//
// Accès : ouvert à TOUT LE MONDE (aucune restriction de rôle, ni sur la navigation ni ici)
// — seules la validation/le refus restent réservés à l'administration (`estAdmin`).
import { useState, useMemo, useEffect } from 'react'
import { Plus, Pencil, Trash2, PackagePlus, Play, CheckCircle2, XCircle, Check, X, Paperclip, Eye, MessageSquarePlus } from 'lucide-react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import FormGroup from '../forms/FormGroup'
import PiecesJointes from '../ui/PiecesJointes'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, setItem, removeItem, updateItem } from '../../core/db'
import { useAuth } from '../../hooks/useAuth'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { FULL_ACCESS_ROLES } from '../../core/roles'
import { formatDateShort, formatDateTime, genId, todayStr } from '../../utils/formatters'
import { PRIORITES } from '../../modules/projet/data'
import { SECTEURS, STATUTS_DECAISSEMENT } from '../../modules/depense/data'
import { marquerVoletVu } from '../nouveautes'

const CATEGORIES_BESOIN = [
  { id: 'main_oeuvre',   label: 'Main d\'œuvre'  },
  { id: 'materiaux',     label: 'Matériaux'       },
  { id: 'equipement',    label: 'Équipement'      },
  { id: 'financier',     label: 'Financier'       },
  { id: 'transport',     label: 'Transport'       },
  { id: 'autre',         label: 'Autre'           }
]

const RUBRIQUES_BESOIN = [
  { id: 'devis',   label: 'Devis' },
  { id: 'facture', label: 'Facture pro forma' },
  { id: 'photo',   label: 'Photo' },
  { id: 'autre',   label: 'Autre' }
]

const QUANTITE_META = {
  materiaux:    { placeholder: 'ex : 50 (sacs)' },
  equipement:   { placeholder: 'ex : 2' },
  transport:    { placeholder: 'ex : 3 (voyages)' },
  main_oeuvre:  { placeholder: 'ex : 5 (ouvriers/jours)' },
  financier:    { placeholder: 'ex : 1' },
  autre:        { placeholder: 'ex : 1' }
}

const STATUTS_BESOIN = {
  a_traiter: { label: 'À traiter', tone: 'warning' },
  en_cours:  { label: 'En cours',  tone: 'info'     },
  satisfait: { label: 'Satisfait', tone: 'success'  },
  annule:    { label: 'Annulé',    tone: 'neutral'  }
}

const VALIDATION_META = {
  en_attente: { label: '⏳ En attente de validation', tone: 'warning' },
  valide:     { label: '✅ Validé',                    tone: 'success' },
  refuse:     { label: '❌ Refusé',                    tone: 'danger'  }
}
const validationDe = (b) => b.validation || 'en_attente'
const TONE_HEX = { success: '#16a34a', danger: '#dc2626', warning: '#d97706', info: '#0284c7', neutral: '#94a3b8', purple: '#7c3aed' }

// Même liste que côté E-G.Pro (BESOINS_NOTIF_ROLES) et que netlify/functions/besoins-relance.mjs.
const BESOINS_NOTIF_ROLES = ['pau', 'ge', 'directeur', 'info', 'superviseur']
const VALIDE_MASQUE_APRES_MS = 24 * 60 * 60 * 1000

const VIDE = {
  titre: '', categorie: 'materiaux', unite: '', quantite: '', prixUnitaire: '',
  priorite: 'normale', dateSouhaitee: '', note: '', piecesEnAttente: []
}

const hexToRgb = (hex) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

export default function SectorBesoins({ secteurId }) {
  const secteur = SECTEURS.find((s) => s.id === secteurId) || { id: secteurId, label: secteurId, color: '#0d9488' }
  const rgb = hexToRgb(secteur.color)
  const badgeKey = `${secteurId}Besoins`

  const { data: besoinsToutesCollections } = useCollection('sector_besoins')
  const besoins = useMemo(() => besoinsToutesCollections.filter((b) => b.secteurId === secteurId), [besoinsToutesCollections, secteurId])
  // Décaissements liés — pour afficher en direct où en est le paiement (en attente /
  // approuvé / décaissé) sans quitter l'écran Besoins.
  const { data: depenseDepensesTous } = useCollection('depense_depenses')
  // Numéro du demandeur — affiché sur chaque besoin (liste + détail).
  const { data: usersTous } = useCollection('users')
  const telephoneDe = (uid) => usersTous.find((u) => (u.uid || u.id) === uid)?.telephone || ''
  const { user, role } = useAuth()
  const peutSupprimer = !['superviseur', 'partenaire', 'secretaire', 'agent'].includes(role)
  const estAdmin = FULL_ACCESS_ROLES.includes(role)
  useEffect(() => { marquerVoletVu(user?.uid, badgeKey) }, [user?.uid, badgeKey])

  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreValidation, setFiltreValidation] = useState('')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VIDE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [detail, setDetail] = useState(null)

  const liste = useMemo(() =>
    besoins
      .filter((b) => !filtreStatut || b.statut === filtreStatut)
      .filter((b) => !filtreValidation || validationDe(b) === filtreValidation)
      // Masque les besoins validés depuis plus de 24h — la dépense générée reste
      // consultable dans E-DÉPENSES, source de vérité.
      .filter((b) => !(validationDe(b) === 'valide' && b.valideLe && Date.now() - b.valideLe > VALIDE_MASQUE_APRES_MS))
      .sort((a, b) => {
        const ordre = { a_traiter: 0, en_cours: 1, satisfait: 2, annule: 3 }
        if (ordre[a.statut] !== ordre[b.statut]) return (ordre[a.statut] ?? 0) - (ordre[b.statut] ?? 0)
        return (b.createdAt || 0) - (a.createdAt || 0)
      }),
  [besoins, filtreStatut, filtreValidation])

  const compteur = (st) => besoins.filter((b) => b.statut === st).length
  const compteurValidation = (v) => besoins.filter((b) => validationDe(b) === v).length
  const enAttenteAffiches = useMemo(() => liste.filter((b) => validationDe(b) === 'en_attente'), [liste])

  const openCreate = () => { setForm(VIDE); setEditing(null); setModal(true) }
  const openEdit   = (b) => {
    setForm({
      titre: b.titre || '', categorie: b.categorie || 'materiaux',
      unite: b.unite || '', quantite: b.quantite ?? '', prixUnitaire: b.prixUnitaire ?? '', priorite: b.priorite || 'normale',
      dateSouhaitee: b.dateSouhaitee ? new Date(b.dateSouhaitee).toISOString().slice(0, 10) : '',
      note: b.note || ''
    })
    setEditing(b); setModal(true)
  }
  // Version live du besoin en édition — pour que la liste de pièces jointes se mette à
  // jour tout de suite après un ajout/suppression, sans fermer/rouvrir le modal.
  const editingLive = editing ? besoins.find((b) => b.id === editing.id) || editing : null

  // Tout nouveau besoin remonte à PAU/GE/directeur/info/superviseur (cf. BESOINS_NOTIF_ROLES).
  async function notifierAdmin(titre) {
    const demandeurTel = user?.telephone ? ` · ☎ ${user.telephone}` : ''
    await notify({
      type: 'info',
      title: `📦 Nouveau besoin — ${secteur.label}`,
      body: `${titre} — en attente de validation · ✍️ ${user?.nom || user?.login || '—'}${demandeurTel}`,
      module: secteurId, forRoles: BESOINS_NOTIF_ROLES, excludeUid: user?.uid, link: `/${secteurId}/besoins`
    }).catch(() => {})
  }

  const formValide = form.titre.trim() !== '' && form.quantite !== '' && Number(form.quantite) > 0

  const handleSave = async () => {
    if (!formValide) return
    setSaving(true)
    try {
      const now = Date.now()
      const quantite = Number(form.quantite) || 0
      const prixUnitaire = Number(form.prixUnitaire) || 0
      const { piecesEnAttente, ...formSansPieces } = form
      const payload = {
        ...formSansPieces,
        titre: form.titre.trim(),
        quantite, prixUnitaire, montant: quantite * prixUnitaire,
        dateSouhaitee: form.dateSouhaitee ? new Date(form.dateSouhaitee).getTime() : null,
        updatedAt: now
      }
      if (editing) {
        await setItem('sector_besoins', editing.id, { ...editing, ...payload })
        await audit(secteurId, 'besoin_modifie', payload.titre)
      } else {
        const pieces = (piecesEnAttente || []).map((p) => ({ ...p, createdAt: now, ajouteParUid: user?.uid || null }))
        await addItem('sector_besoins', {
          ...payload, secteurId, pieces, statut: 'a_traiter', validation: 'en_attente', createdAt: now,
          demandePar: user?.nom || user?.login || null, demandeParUid: user?.uid || null
        })
        await audit(secteurId, 'besoin_cree', payload.titre)
        await notifierAdmin(payload.titre)
      }
      setModal(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async (b) => {
    if (!peutSupprimer) return
    const decaissements = depenseDepensesTous.filter((d) => d.id === b.depenseId || (d.source === 'besoin' && d.besoinId === b.id))
    if (decaissements.some((d) => d.statut !== 'en_attente')) {
      toast.error('Cette demande a déjà été approuvée — elle est désormais un engagement réel dans E-DÉPENSES, impossible de la supprimer ici.')
      return
    }
    const confirmMsg = decaissements.length
      ? 'Supprimer ce besoin ? La demande de décaissement en attente dans E-DÉPENSES sera retirée aussi.'
      : 'Supprimer ce besoin ?'
    if (!window.confirm(confirmMsg)) return
    for (const d of decaissements) await removeItem('depense_depenses', d.id)
    await removeItem('sector_besoins', b.id)
    await audit(secteurId, 'besoin_supprime', b.titre)
  }

  const changerStatut = async (b, statut) => {
    await updateItem('sector_besoins', b.id, { statut, updatedAt: Date.now() })
    await audit(secteurId, 'besoin_' + statut, b.titre)
  }

  const ajouterPiece = async (b, piece) => {
    const pieces = [...(b.pieces || []), { ...piece, id: `pj_${Date.now()}`, createdAt: Date.now(), ajouteParUid: user?.uid || null }]
    await updateItem('sector_besoins', b.id, { pieces, updatedAt: Date.now() })
    await audit(secteurId, 'besoin_piece_ajoutee', `${piece.nom} → ${b.titre}`)
  }
  const retirerPiece = async (b, piece) => {
    const pieces = (b.pieces || []).filter((p) => p.id !== piece.id)
    await updateItem('sector_besoins', b.id, { pieces, updatedAt: Date.now() })
  }

  // ── Observation de l'administration — réservée à estAdmin ; visible par tous une
  // fois enregistrée. Envoie une notification (push + in-app) au demandeur d'origine.
  const [observationEdit, setObservationEdit] = useState(null)
  const enregistrerObservation = async () => {
    if (!observationEdit) return
    const valeur = observationEdit.valeur.trim()
    await updateItem('sector_besoins', observationEdit.id, {
      observationPau: valeur,
      observationParText: user?.nom || user?.login || '—', observationLe: Date.now()
    })
    const b = besoins.find((x) => x.id === observationEdit.id)
    if (b?.demandeParUid && b.demandeParUid !== user?.uid) {
      await notify({
        type: 'info', title: `💬 Réponse à votre besoin — ${b.titre}`,
        body: valeur, module: secteurId, forUsers: [b.demandeParUid], link: `/${secteurId}/besoins`
      }).catch(() => {})
    }
    setObservationEdit(null)
  }

  // ── Validation / refus — réservés à l'administration. Valider crée aussitôt une
  // demande de décaissement dans E-DÉPENSES (même circuit que toutes les dépenses).
  async function creerDemandeDecaissement(b) {
    const id = genId()
    await setItem('depense_depenses', id, {
      id,
      // `secteurId` doit exister dans SECTEURS (cf. depense/data.js) pour être suivi
      // dans les budgets/Revenus & Budget — E-FONCIER n'y figure pas encore, ses
      // décaissements sont donc routés en « Hors secteur » comme le reste sans budget dédié.
      secteurId: SECTEURS.some((s) => s.id === secteurId) ? secteurId : 'divers',
      categorie: catLabel(b.categorie),
      montant: Number(b.montant) || 0,
      date: todayStr(),
      description: [secteur.label, b.titre].filter(Boolean).join(' — '),
      noteOrigine: b.note || '',
      natureFlux: 'exploitation',
      sourceFinancement: 'entreprise',
      statut: 'en_attente',
      source: 'besoin', besoinId: b.id,
      enregistrePar: b.demandePar || user?.nom || user?.login || '—',
      enregistreParUid: b.demandeParUid || user?.uid || null,
      createdAt: Date.now()
    })
    return id
  }

  const destinatairesDecision = (b) => [...new Set([b.demandeParUid].filter((uid) => uid && uid !== user?.uid))]

  async function validerBesoin(b) {
    const depenseId = await creerDemandeDecaissement(b)
    await updateItem('sector_besoins', b.id, {
      validation: 'valide', valideParText: user?.nom || user?.login || '—', valideLe: Date.now(), depenseId
    })
    await audit(secteurId, 'besoin_valide', `${b.titre} — demande de décaissement créée (${Number(b.montant || 0).toLocaleString('fr-FR')} FCFA)`)
    const destinataires = destinatairesDecision(b)
    if (destinataires.length) {
      await notify({ type: 'success', title: '✅ Besoin validé', body: `${b.titre} — envoyé en autorisation de décaissement`, module: secteurId, forUsers: destinataires, link: `/${secteurId}/besoins` }).catch(() => {})
    }
    await notify({
      type: 'demande', title: '💰 Décaissement à traiter',
      body: `${b.titre} — ${Number(b.montant || 0).toLocaleString('fr-FR')} FCFA (besoin validé par ${user?.nom || '—'})`,
      module: 'depense', forRoles: BESOINS_NOTIF_ROLES, excludeUid: user?.uid, link: '/depense/autorisations'
    }).catch(() => {})
  }
  async function refuserBesoin(b, motif = '') {
    await updateItem('sector_besoins', b.id, { validation: 'refuse', motifRefus: motif, statut: 'annule', refuseParText: user?.nom || user?.login || '—', refuseLe: Date.now() })
    await audit(secteurId, 'besoin_refuse', `${b.titre}${motif ? ' — ' + motif : ''}`)
    const destinataires = destinatairesDecision(b)
    if (destinataires.length) {
      await notify({ type: 'refus', title: '❌ Besoin refusé', body: `${b.titre}${motif ? ' — ' + motif : ''}`, module: secteurId, forUsers: destinataires, link: `/${secteurId}/besoins` }).catch(() => {})
    }
  }
  const demanderRefus = async (b) => {
    const motif = window.prompt(`Motif du refus de « ${b.titre} » (optionnel) :`)
    if (motif === null) return
    await refuserBesoin(b, motif.trim())
  }

  async function validerTout() {
    if (!estAdmin || bulkBusy || !enAttenteAffiches.length) return
    if (!window.confirm(`Valider les ${enAttenteAffiches.length} besoin(s) affiché(s) et en attente ?`)) return
    setBulkBusy(true)
    try {
      for (const b of enAttenteAffiches) await validerBesoin(b)
      toast.success(`${enAttenteAffiches.length} besoin(s) validé(s) ✓`)
    } finally { setBulkBusy(false) }
  }
  async function refuserTout() {
    if (!estAdmin || bulkBusy || !enAttenteAffiches.length) return
    const motif = window.prompt(`Motif du refus pour les ${enAttenteAffiches.length} besoin(s) affiché(s) et en attente (optionnel) :`)
    if (motif === null) return
    if (!window.confirm(`Confirmer le refus de ${enAttenteAffiches.length} besoin(s) ?`)) return
    setBulkBusy(true)
    try {
      for (const b of enAttenteAffiches) await refuserBesoin(b, motif.trim())
      toast.success(`${enAttenteAffiches.length} besoin(s) refusé(s)`)
    } finally { setBulkBusy(false) }
  }

  const catLabel = (id) => CATEGORIES_BESOIN.find((c) => c.id === id)?.label || id
  const enAttente = besoins.filter((b) => b.statut === 'a_traiter' || b.statut === 'en_cours').length

  return (
    <div className="space-y-4">
      {/* En-tête — thème couleur du secteur */}
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: `linear-gradient(135deg, rgba(${rgb},0.9) 0%, rgba(${rgb},0.6) 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: secteur.color, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <PackagePlus size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Besoins — {secteur.label}</h2>
          <p className="text-sm text-white/80">
            {enAttente > 0 ? `${enAttente} besoin(s) à traiter` : 'Tout est pris en charge'} — matériaux, main d'œuvre, équipement
          </p>
        </div>
      </div>

      {/* Filtres + compteurs */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/50 bg-white/50 p-1 shadow-sm backdrop-blur-sm">
          {[['', `Tous (${besoins.length})`], ...Object.entries(STATUTS_BESOIN).map(([k, v]) => [k, `${v.label} (${compteur(k)})`])].map(([v, l]) => (
            <button key={v || 'tous'} onClick={() => setFiltreStatut(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtreStatut === v ? 'text-white' : 'text-gray-600 hover:bg-white'}`}
              style={filtreStatut === v ? { background: secteur.color } : undefined}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/50 bg-white/50 p-1 shadow-sm backdrop-blur-sm">
          {[['', 'Validation : toutes'], ['en_attente', `⏳ ${compteurValidation('en_attente')}`], ['valide', `✅ ${compteurValidation('valide')}`], ['refuse', `❌ ${compteurValidation('refuse')}`]].map(([v, l]) => (
            <button key={v || 'toutes'} onClick={() => setFiltreValidation(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtreValidation === v ? 'text-white' : 'text-gray-600 hover:bg-white'}`}
              style={filtreValidation === v ? { background: secteur.color } : undefined}>
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {estAdmin && enAttenteAffiches.length > 0 && (
            <>
              <Button size="sm" variant="success" onClick={validerTout} loading={bulkBusy}>
                <Check size={14} /> Valider tout ({enAttenteAffiches.length})
              </Button>
              <Button size="sm" variant="danger" onClick={refuserTout} loading={bulkBusy}>
                <X size={14} /> Refuser tout
              </Button>
            </>
          )}
          <Button onClick={openCreate} size="sm"><Plus size={14} className="mr-1" />Nouveau besoin</Button>
        </div>
      </div>

      {/* Liste */}
      {!liste.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <PackagePlus size={32} className="opacity-30" />
            <p className="text-sm">Aucun besoin.</p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2.5 text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th className="px-4 pb-1 text-left font-bold">Date</th>
                <th className="px-4 pb-1 text-left font-bold">Besoin</th>
                <th className="px-4 pb-1 text-left font-bold">Demandé par</th>
                <th className="px-4 pb-1 text-right font-bold">Montant</th>
                <th className="px-4 pb-1 text-center font-bold">Statut</th>
                <th className="px-4 pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((b) => {
                const st = STATUTS_BESOIN[b.statut] || STATUTS_BESOIN.a_traiter
                const vt = VALIDATION_META[validationDe(b)]
                const decaissement = b.depenseId ? depenseDepensesTous.find((d) => d.id === b.depenseId) : null
                const accent = TONE_HEX[vt.tone] || '#94a3b8'
                const cell = 'bg-white py-3 align-middle transition-colors group-hover:bg-gray-50'
                return (
                  <tr key={b.id} onClick={() => setDetail(b)}
                    className="group cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-gray-100 transition-shadow hover:shadow-[0_6px_18px_-6px_rgba(0,0,0,0.12)]">
                    <td className={`${cell} rounded-l-2xl border-l-[3px] px-4`} style={{ borderColor: accent }}>
                      <p className="whitespace-nowrap text-xs font-semibold text-gray-700">{b.createdAt ? formatDateShort(b.createdAt) : '—'}</p>
                    </td>
                    <td className={`${cell} px-4`}>
                      <p className={`line-clamp-2 max-w-[320px] font-semibold ${b.statut === 'satisfait' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{b.titre}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{catLabel(b.categorie)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRIORITES[b.priorite]?.tone === 'danger' ? 'bg-red-50 text-red-700' : PRIORITES[b.priorite]?.tone === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
                          {PRIORITES[b.priorite]?.label || b.priorite}
                        </span>
                        {b.pieces?.length > 0 && (
                          <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700"><Paperclip size={10} /> {b.pieces.length}</span>
                        )}
                        {b.observationPau && <span className="text-[10px] font-medium text-violet-600">🗨️ observation</span>}
                      </div>
                    </td>
                    <td className={`${cell} px-4`}>
                      <p className="text-[11px] text-gray-400">✍️ <span className="font-semibold text-gray-600">{b.demandePar || '—'}</span></p>
                      {telephoneDe(b.demandeParUid) && <p className="text-[10px] text-gray-400">☎ {telephoneDe(b.demandeParUid)}</p>}
                      {b.createdAt && <p className="text-[10px] text-gray-400">{formatDateTime(b.createdAt)}</p>}
                    </td>
                    <td className={`${cell} whitespace-nowrap px-4 text-right`}>
                      <span className="text-base font-extrabold text-gray-900">{Number(b.montant || 0).toLocaleString('fr-FR')}</span>
                      <span className="ml-0.5 text-[10px] font-semibold text-gray-400">FCFA</span>
                    </td>
                    <td className={`${cell} px-4 text-center`}>
                      <div className="flex flex-col items-center gap-1">
                        <Badge tone={vt.tone}>{vt.label}</Badge>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {decaissement && (
                          <Badge tone={(STATUTS_DECAISSEMENT[decaissement.statut] || STATUTS_DECAISSEMENT.decaissee).tone}>
                            💰 {(STATUTS_DECAISSEMENT[decaissement.statut] || STATUTS_DECAISSEMENT.decaissee).label}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className={`${cell} rounded-r-2xl px-3`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {estAdmin && validationDe(b) === 'en_attente' && (
                          <>
                            <button onClick={() => validerBesoin(b)} title="Valider"
                              className="rounded-lg border border-green-200 bg-green-50 p-1.5 text-green-600 transition-colors hover:border-green-300 hover:bg-green-100"><Check size={15} /></button>
                            <button onClick={() => demanderRefus(b)} title="Refuser"
                              className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"><X size={15} /></button>
                          </>
                        )}
                        {estAdmin && (
                          <button onClick={() => { setDetail(b); setObservationEdit({ id: b.id, valeur: b.observationPau || '' }) }}
                            title={b.observationPau ? "Modifier l'observation" : 'Ajouter une observation'}
                            className="rounded-lg border border-violet-200 bg-violet-50 p-1.5 text-violet-600 transition-colors hover:border-violet-300 hover:bg-violet-100"><MessageSquarePlus size={15} /></button>
                        )}
                        <button onClick={() => setDetail(b)} title="Voir le détail"
                          className="rounded-lg border border-gray-200 bg-gray-50 p-1.5 text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-100"><Eye size={15} /></button>
                        <button onClick={() => openEdit(b)} title="Modifier"
                          className="rounded-lg border border-gray-200 bg-gray-50 p-1.5 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-100"><Pencil size={15} /></button>
                        {peutSupprimer && (
                          <button onClick={() => handleDelete(b)} title="Supprimer"
                            className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100"><Trash2 size={15} /></button>
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

      {/* Modal création/édition */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier le besoin' : 'Nouveau besoin'}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: secteur.color }}>📋 Informations</p>
            <FormGroup label="Besoin" required hint="Ce qui manque ou doit être fourni">
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                placeholder="ex : Ciment, ouvriers supplémentaires, pièce de rechange…"
                value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))} />
            </FormGroup>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: secteur.color }}>📦 Détails & coût</p>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Catégorie">
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  value={form.categorie} onChange={(e) => setForm((f) => ({ ...f, categorie: e.target.value }))}>
                  {CATEGORIES_BESOIN.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Priorité">
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  value={form.priorite} onChange={(e) => setForm((f) => ({ ...f, priorite: e.target.value }))}>
                  {Object.entries(PRIORITES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Quantité" required>
                <input type="number" min="0" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  placeholder={QUANTITE_META[form.categorie]?.placeholder || 'ex : 1'}
                  value={form.quantite} onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Unité" hint="Optionnel">
                <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  placeholder="ex : sac, m³, unité"
                  value={form.unite} onChange={(e) => setForm((f) => ({ ...f, unite: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Prix unitaire (FCFA)">
                <input type="number" min="0" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  placeholder="ex : 2 500"
                  value={form.prixUnitaire} onChange={(e) => setForm((f) => ({ ...f, prixUnitaire: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Souhaité pour le" hint="Optionnel">
                <input type="date" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  value={form.dateSouhaitee} onChange={(e) => setForm((f) => ({ ...f, dateSouhaitee: e.target.value }))} />
              </FormGroup>
              <div className="flex flex-col justify-end">
                <p className="mb-1 text-xs font-medium text-gray-600">Montant estimé</p>
                <p className="rounded-lg px-3 py-2 text-sm font-black text-white" style={{ background: secteur.color }}>
                  {((Number(form.quantite) || 0) * (Number(form.prixUnitaire) || 0)).toLocaleString('fr-FR')} FCFA
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <FormGroup label="Note" hint="Optionnel">
              <textarea rows={2} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </FormGroup>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            {editingLive ? (
              <PiecesJointes
                pieces={editingLive.pieces || []}
                onAdd={(piece) => ajouterPiece(editingLive, piece)}
                onRemove={(piece) => retirerPiece(editingLive, piece)}
                noDelete={!peutSupprimer}
                rubriques={RUBRIQUES_BESOIN}
                label="📎 Pièces jointes (devis, facture pro forma…)"
                withLegende
              />
            ) : (
              <PiecesJointes
                pieces={form.piecesEnAttente || []}
                onAdd={(piece) => setForm((f) => ({ ...f, piecesEnAttente: [...(f.piecesEnAttente || []), { ...piece, id: `pj_${Date.now()}` }] }))}
                onRemove={(piece) => setForm((f) => ({ ...f, piecesEnAttente: (f.piecesEnAttente || []).filter((p) => p.id !== piece.id) }))}
                rubriques={RUBRIQUES_BESOIN}
                label="📎 Pièces jointes (devis, facture pro forma…)"
                withLegende
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !formValide}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Détail d'un besoin */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="md" title="Détail du besoin"
        footer={<Button variant="outline" onClick={() => setDetail(null)}>Fermer</Button>}>
        {detail && (() => {
          const b = besoins.find((x) => x.id === detail.id) || detail
          const st = STATUTS_BESOIN[b.statut] || STATUTS_BESOIN.a_traiter
          const vt = VALIDATION_META[validationDe(b)]
          const decaissement = b.depenseId ? depenseDepensesTous.find((d) => d.id === b.depenseId) : null
          return (
            <div className="space-y-3 text-sm">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className={`text-lg font-black leading-snug ${b.statut === 'satisfait' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{b.titre}</p>
                {Number(b.montant) > 0 && <p className="mt-1 text-2xl font-black" style={{ color: secteur.color }}>{Number(b.montant).toLocaleString('fr-FR')} <span className="text-sm font-bold text-gray-400">FCFA</span></p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={vt.tone}>{vt.label}</Badge>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {decaissement && (
                    <Badge tone={(STATUTS_DECAISSEMENT[decaissement.statut] || STATUTS_DECAISSEMENT.decaissee).tone}>
                      💰 {(STATUTS_DECAISSEMENT[decaissement.statut] || STATUTS_DECAISSEMENT.decaissee).label}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Catégorie</p>
                  <p className="mt-0.5 font-bold text-gray-800">{catLabel(b.categorie)}</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Quantité</p>
                  <p className="mt-0.5 font-bold text-gray-800">{b.quantite || 0}{b.unite ? ` ${b.unite}` : ''}</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Prix unitaire</p>
                  <p className="mt-0.5 font-bold text-gray-800">{Number(b.prixUnitaire || 0).toLocaleString('fr-FR')} FCFA</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Priorité</p>
                  <p className="mt-0.5 font-bold text-gray-800">{PRIORITES[b.priorite]?.label || b.priorite}</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Souhaité pour le</p>
                  <p className="mt-0.5 font-bold text-gray-800">{b.dateSouhaitee ? formatDateShort(b.dateSouhaitee) : '—'}</p>
                </div>
              </div>

              {b.note && (
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Note du demandeur</p>
                  <p className="mt-1 italic text-gray-700">« {b.note} »</p>
                </div>
              )}

              {observationEdit?.id === b.id ? (
                <div className="space-y-1.5 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">🗨️ Observation</p>
                  <textarea rows={2} autoFocus value={observationEdit.valeur}
                    onChange={(e) => setObservationEdit((o) => ({ ...o, valeur: e.target.value }))}
                    placeholder="Observation sur ce besoin…"
                    className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setObservationEdit(null)} className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-white">Annuler</button>
                    <button onClick={enregistrerObservation} className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-violet-700">Enregistrer</button>
                  </div>
                </div>
              ) : b.observationPau ? (
                <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">🗨️ Observation</p>
                  <p className="mt-1 text-violet-800">{b.observationPau}</p>
                  {estAdmin && (
                    <button onClick={() => setObservationEdit({ id: b.id, valeur: b.observationPau })} className="mt-1.5 text-xs font-semibold text-violet-500 hover:text-violet-700">Modifier</button>
                  )}
                </div>
              ) : estAdmin && (
                <button onClick={() => setObservationEdit({ id: b.id, valeur: '' })}
                  className="self-start text-xs font-semibold text-violet-500 hover:text-violet-700">🗨️ + Ajouter une observation</button>
              )}

              {validationDe(b) === 'refuse' && b.motifRefus && (
                <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-red-500">Motif du refus</p>
                  <p className="mt-1 text-red-700">{b.motifRefus}</p>
                </div>
              )}

              {estAdmin && validationDe(b) === 'en_attente' && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-violet-500">Validation</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="success" onClick={() => validerBesoin(b)}><Check size={13} /> Valider</Button>
                    <Button size="sm" variant="danger" onClick={() => demanderRefus(b)}><X size={13} /> Refuser</Button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-violet-500">
                    Valider envoie {Number(b.montant || 0).toLocaleString('fr-FR')} FCFA en autorisation de décaissement (E-DÉPENSES).
                  </p>
                </div>
              )}

              {!(validationDe(b) === 'refuse') && (
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Suivi opérationnel</p>
                  <div className="flex flex-wrap gap-2">
                    {b.statut === 'a_traiter' && (
                      <Button size="sm" variant="outline" onClick={() => changerStatut(b, 'en_cours')}>
                        <Play size={13} /> Prendre en charge
                      </Button>
                    )}
                    {(b.statut === 'a_traiter' || b.statut === 'en_cours') && (
                      <Button size="sm" variant="success" onClick={() => changerStatut(b, 'satisfait')}>
                        <CheckCircle2 size={13} /> Satisfait
                      </Button>
                    )}
                    {b.statut !== 'annule' && b.statut !== 'satisfait' && (
                      <Button size="sm" variant="danger" onClick={() => changerStatut(b, 'annule')}>
                        <XCircle size={13} /> Annuler
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => { setDetail(null); openEdit(b) }}><Pencil size={13} /> Modifier</Button>
                {peutSupprimer && (
                  <Button size="sm" variant="danger" onClick={() => { setDetail(null); handleDelete(b) }}><Trash2 size={13} /> Supprimer</Button>
                )}
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <PiecesJointes pieces={b.pieces || []} noAdd noDelete label="📎 Pièces jointes" />
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Traçabilité</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold" style={{ background: `rgba(${rgb},0.1)`, color: secteur.color }}>
                    ✍️ Demandé par {b.demandePar || '—'}{telephoneDe(b.demandeParUid) ? ` · ☎ ${telephoneDe(b.demandeParUid)}` : ''}{b.createdAt ? ` · ${formatDateTime(b.createdAt)}` : ''}
                  </span>
                  {b.valideParText && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 font-semibold text-green-800">
                      ✅ Validé par {b.valideParText}{b.valideLe ? ` · ${formatDateTime(b.valideLe)}` : ''}
                    </span>
                  )}
                  {b.refuseParText && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 font-semibold text-red-800">
                      ❌ Refusé par {b.refuseParText}{b.refuseLe ? ` · ${formatDateTime(b.refuseLe)}` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

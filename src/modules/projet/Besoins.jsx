// Besoins projet — matériaux, main d'œuvre, équipement… à faire remonter au
// responsable du projet. Chaque besoin porte une quantité, un prix unitaire et un
// montant (calculé), et suit un circuit de VALIDATION par l'administration
// (en attente → validé / refusé), distinct du suivi opérationnel (à traiter →
// en cours → satisfait / annulé).
import { useState, useMemo, useEffect } from 'react'
import { Plus, Pencil, Trash2, PackagePlus, Play, CheckCircle2, XCircle, Check, X, Layers, Paperclip, Eye, MessageSquarePlus } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import PiecesJointes from '../../shared/ui/PiecesJointes'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, setItem, removeItem, updateItem } from '../../core/db'
import { useAuth } from '../../hooks/useAuth'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { FULL_ACCESS_ROLES } from '../../core/roles'
import { formatDateShort, formatDateTime, genId, todayStr } from '../../utils/formatters'
import { PRIORITES } from './data'
import { marquerVoletVu } from './vues'
import { projetsVisibles, scopeParProjets } from './logic'
import { SECTEUR_PAR_TYPE_PROJET, natureFluxProjet } from '../depense/logic'
import { STATUTS_DECAISSEMENT } from '../depense/data'

const CATEGORIES_BESOIN = [
  { id: 'main_oeuvre',   label: 'Main d\'œuvre'  },
  { id: 'materiaux',     label: 'Matériaux'       },
  { id: 'equipement',    label: 'Équipement'      },
  { id: 'financier',     label: 'Financier'       },
  { id: 'transport',     label: 'Transport'       },
  { id: 'autre',         label: 'Autre'           }
]

// Rubriques des pièces jointes d'un besoin — devis, facture pro forma… tout ce qui
// justifie le montant demandé.
const RUBRIQUES_BESOIN = [
  { id: 'devis',   label: 'Devis' },
  { id: 'facture', label: 'Facture pro forma' },
  { id: 'photo',   label: 'Photo' },
  { id: 'autre',   label: 'Autre' }
]

// Placeholder de quantité adapté à ce qu'on saisit réellement selon la catégorie.
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

// Circuit de VALIDATION par l'administration — distinct du suivi opérationnel ci-dessus.
const VALIDATION_META = {
  en_attente: { label: '⏳ En attente de validation', tone: 'warning' },
  valide:     { label: '✅ Validé',                    tone: 'success' },
  refuse:     { label: '❌ Refusé',                    tone: 'danger'  }
}
const validationDe = (b) => b.validation || 'en_attente'
// Couleur d'accent de la ligne (bordure gauche) — reprend la teinte du badge de
// validation, même logique que la barre colorée par secteur des lignes de Dépenses.
const TONE_HEX = { success: '#16a34a', danger: '#dc2626', warning: '#d97706', info: '#0284c7', neutral: '#94a3b8', purple: '#7c3aed' }

// Rôles qui reçoivent les alertes/rappels de besoins (nouveau besoin + relance
// 3×/jour côté serveur, cf. netlify/functions/besoins-relance.mjs — à garder
// synchronisée avec cette liste). Ni super_admin ni admin : ce sont des comptes
// techniques, pas des rôles métier à solliciter sur des décisions d'achat. Le
// superviseur (lecture seule) est notifié mais ne peut pas valider/refuser
// (cf. `estAdmin` plus bas, toujours basé sur FULL_ACCESS_ROLES).
const BESOINS_NOTIF_ROLES = ['pau', 'ge', 'directeur', 'info', 'superviseur']

// Un besoin VALIDÉ quitte la liste 24h après sa validation — la dépense qu'il a
// générée reste pleinement consultable dans E-DÉPENSES (source de vérité), donc
// le garder indéfiniment ici n'apporterait rien, à part encombrer la liste des
// besoins qui nécessitent encore une action.
const VALIDE_MASQUE_APRES_MS = 24 * 60 * 60 * 1000

// Regroupement type « devis quantitatif et estimatif » : chaque besoin appartient à un
// OUVRAGE (section du devis, ex. « Cage d'escalier », « Acrotère »…) et sa catégorie le
// range dans le bloc A. Matériaux ou B. Main d'œuvre — comme sur un devis papier classique.
const BUCKET_DEVIS = (categorie) => (categorie === 'main_oeuvre' ? 'Main d\'œuvre' : 'Matériaux')

const VIDE = {
  projetId: '', tacheId: '', section: '', titre: '', categorie: 'materiaux',
  unite: '', quantite: '', prixUnitaire: '', priorite: 'normale', dateSouhaitee: '', note: '',
  piecesEnAttente: []
}
const ligneVide = () => ({ categorie: 'materiaux', titre: '', unite: '', quantite: '', prixUnitaire: '', priorite: 'normale', dateSouhaitee: '', note: '' })

export default function Besoins() {
  const { data: projetsTous } = useCollection('projets')
  const { data: tachesTous }  = useCollection('projet_taches')
  const { data: besoinsTous } = useCollection('projet_besoins')
  // Décaissements liés aux besoins validés — pour afficher en direct où en est le paiement
  // (en attente / approuvé / décaissé) sans quitter l'écran Besoins.
  const { data: depenseDepensesTous } = useCollection('depense_depenses')
  // Numéro du demandeur — affiché sur chaque besoin (liste + détail), à côté du
  // projet concerné (déjà affiché via `projet.nom`).
  const { data: usersTous } = useCollection('users')
  const telephoneDe = (uid) => usersTous.find((u) => (u.uid || u.id) === uid)?.telephone || ''
  const { user, role } = useAuth()
  // Le superviseur crée/modifie/traite les besoins, mais ne les supprime pas.
  // Accès complet pour la secrétaire/l'agent, sauf la suppression (réservée).
  const peutSupprimer = !['superviseur', 'partenaire', 'secretaire', 'agent'].includes(role)
  // Seule l'administration (accès total) peut valider/refuser un besoin.
  const estAdmin = FULL_ACCESS_ROLES.includes(role)
  useEffect(() => { marquerVoletVu(user?.uid, 'projetBesoins') }, [user?.uid])

  // Cloisonnement : un chef de projet ne voit que les besoins de ses projets.
  const projets = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])
  const besoins = useMemo(() => scopeParProjets(besoinsTous, projets), [besoinsTous, projets])

  const [filtreProjet, setFiltreProjet] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreValidation, setFiltreValidation] = useState('')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VIDE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [lot, setLot] = useState(null) // { projetId, tacheId, lignes: [...] } — ajout multiple
  const [savingLot, setSavingLot] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [detail, setDetail] = useState(null) // besoin sélectionné (détail en lecture seule)

  const liste = useMemo(() =>
    besoins
      .filter((b) => !filtreProjet || b.projetId === filtreProjet)
      .filter((b) => !filtreStatut || b.statut === filtreStatut)
      .filter((b) => !filtreValidation || validationDe(b) === filtreValidation)
      // Masque les besoins validés depuis plus de 24h (cf. VALIDE_MASQUE_APRES_MS) —
      // la dépense générée reste consultable dans E-DÉPENSES, source de vérité.
      .filter((b) => !(validationDe(b) === 'valide' && b.valideLe && Date.now() - b.valideLe > VALIDE_MASQUE_APRES_MS))
      .sort((a, b) => {
        const ordre = { a_traiter: 0, en_cours: 1, satisfait: 2, annule: 3 }
        if (ordre[a.statut] !== ordre[b.statut]) return (ordre[a.statut] ?? 0) - (ordre[b.statut] ?? 0)
        return (b.createdAt || 0) - (a.createdAt || 0)
      }),
  [besoins, filtreProjet, filtreStatut, filtreValidation])

  const compteur = (st) => besoins.filter((b) => b.statut === st).length
  const compteurValidation = (v) => besoins.filter((b) => validationDe(b) === v).length
  const enAttenteAffiches = useMemo(() => liste.filter((b) => validationDe(b) === 'en_attente'), [liste])

  // Devis du projet filtré : groupe TOUS ses besoins actifs par ouvrage (section) puis
  // par bloc A. Matériaux / B. Main d'œuvre, avec sous-totaux et total général — comme
  // un devis quantitatif et estimatif classique. Exclut les besoins refusés/annulés.
  const ORDRE_BUCKET = ['Matériaux', 'Main d\'œuvre']
  const devisProjet = useMemo(() => {
    if (!filtreProjet) return null
    const items = besoins.filter((b) => b.projetId === filtreProjet && b.statut !== 'annule' && validationDe(b) !== 'refuse')
    const parSection = {}
    for (const b of items) {
      const secLabel = b.section?.trim() || 'Sans ouvrage précisé'
      if (!parSection[secLabel]) parSection[secLabel] = {}
      const bucketLabel = BUCKET_DEVIS(b.categorie)
      if (!parSection[secLabel][bucketLabel]) parSection[secLabel][bucketLabel] = { label: bucketLabel, lignes: [], total: 0 }
      parSection[secLabel][bucketLabel].lignes.push(b)
      parSection[secLabel][bucketLabel].total += Number(b.montant) || 0
    }
    const sections = Object.entries(parSection).map(([label, buckets]) => {
      const bucketsOrdonnes = ORDRE_BUCKET.map((l) => buckets[l]).filter(Boolean)
      return { label, buckets: bucketsOrdonnes, total: bucketsOrdonnes.reduce((s, bk) => s + bk.total, 0) }
    })
    const totalGeneral = sections.reduce((s, sec) => s + sec.total, 0)
    return { sections, totalGeneral }
  }, [besoins, filtreProjet])

  const openCreate = () => { setForm({ ...VIDE, projetId: filtreProjet }); setEditing(null); setModal(true) }
  const openEdit   = (b) => {
    setForm({
      projetId: b.projetId || '', tacheId: b.tacheId || '', section: b.section || '', titre: b.titre || '', categorie: b.categorie || 'materiaux',
      unite: b.unite || '', quantite: b.quantite ?? '', prixUnitaire: b.prixUnitaire ?? '', priorite: b.priorite || 'normale',
      dateSouhaitee: b.dateSouhaitee ? new Date(b.dateSouhaitee).toISOString().slice(0, 10) : '',
      note: b.note || ''
    })
    setEditing(b); setModal(true)
  }
  // Version live du besoin en édition — pour que la liste de pièces jointes se mette à
  // jour tout de suite après un ajout/suppression, sans fermer/rouvrir le modal.
  const editingLive = editing ? besoins.find((b) => b.id === editing.id) || editing : null

  // Tâches du projet sélectionné dans le formulaire — pour rattacher le besoin à une tâche précise.
  const tachesDuProjet = useMemo(() => tachesTous.filter((t) => t.projetId === form.projetId), [tachesTous, form.projetId])
  const tachesDuLot    = useMemo(() => tachesTous.filter((t) => t.projetId === lot?.projetId), [tachesTous, lot?.projetId])
  // Sections (ouvrages) déjà utilisées sur le projet — reprises en priorité dans les suggestions,
  // pour retomber toujours sur les mêmes intitulés (« Cage d'escalier », « Acrotère »…).
  const sectionsDuProjet = useMemo(
    () => [...new Set(besoins.filter((b) => b.projetId === form.projetId && b.section).map((b) => b.section))],
    [besoins, form.projetId]
  )
  const sectionsDuLot = useMemo(
    () => [...new Set(besoins.filter((b) => b.projetId === lot?.projetId && b.section).map((b) => b.section))],
    [besoins, lot?.projetId]
  )

  // Tout nouveau besoin remonte systématiquement à PAU/GE/directeur/info/superviseur
  // (cf. BESOINS_NOTIF_ROLES), en plus du responsable du projet s'il y en a un et
  // qu'il n'est pas lui-même le créateur du besoin.
  async function notifierResponsable(projetId, titre) {
    const projet = projets.find((p) => p.id === projetId)
    if (!projet) return
    const forUsers = (projet.responsableUid && projet.responsableUid !== user?.uid) ? [projet.responsableUid] : []
    const demandeurTel = user?.telephone ? ` · ☎ ${user.telephone}` : ''
    await notify({
      type: 'info',
      title: `📦 Nouveau besoin — ${projet.nom}`,
      body: `${titre} — en attente de validation · ✍️ ${user?.nom || user?.login || '—'}${demandeurTel}`,
      module: 'projet', forRoles: BESOINS_NOTIF_ROLES, forUsers, excludeUid: user?.uid, link: '/projet/besoins'
    }).catch(() => {})
  }

  const formValide = form.titre.trim() !== '' && !!form.projetId && form.quantite !== '' && Number(form.quantite) > 0

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
        await setItem('projet_besoins', editing.id, { ...editing, ...payload })
        await audit('projet', 'besoin_modifie', payload.titre)
      } else {
        // Les pièces jointes ajoutées avant même l'enregistrement (bufferisées
        // localement, faute d'id de besoin) sont incluses directement à la création.
        const pieces = (piecesEnAttente || []).map((p) => ({ ...p, createdAt: now, ajouteParUid: user?.uid || null }))
        await addItem('projet_besoins', {
          ...payload, pieces, statut: 'a_traiter', validation: 'en_attente', createdAt: now,
          demandePar: user?.nom || user?.login || null, demandeParUid: user?.uid || null
        })
        await audit('projet', 'besoin_cree', payload.titre)
        await notifierResponsable(form.projetId, payload.titre)
      }
      setModal(false)
    } finally { setSaving(false) }
  }

  // ── Ajout multiple : le chef de projet saisit tous les besoins d'un même OUVRAGE
  // (section du devis, ex. « Cage d'escalier ») en une fois, chacun avec sa quantité,
  // son unité et son prix unitaire — comme on remplit un devis papier bloc par bloc. ──
  function openLot() { setLot({ projetId: filtreProjet || '', tacheId: '', section: '', lignes: [ligneVide(), ligneVide(), ligneVide()] }) }
  const setLigne = (i, k, v) => setLot((l) => ({ ...l, lignes: l.lignes.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)) }))
  const ajouterLigne = () => setLot((l) => ({ ...l, lignes: [...l.lignes, ligneVide()] }))
  const retirerLigne = (i) => setLot((l) => ({ ...l, lignes: l.lignes.length > 1 ? l.lignes.filter((_, idx) => idx !== i) : l.lignes }))

  async function enregistrerLot() {
    if (savingLot || !lot) return
    if (!lot.projetId) return toast.error('Projet requis')
    const valides = lot.lignes.filter((l) => l.titre.trim() && Number(l.quantite) > 0)
    if (!valides.length) return toast.error('Aucune ligne complète (titre + quantité requis)')
    setSavingLot(true)
    try {
      const now = Date.now()
      for (const l of valides) {
        const quantite = Number(l.quantite) || 0
        const prixUnitaire = Number(l.prixUnitaire) || 0
        await addItem('projet_besoins', {
          projetId: lot.projetId, tacheId: lot.tacheId || '', section: lot.section?.trim() || '',
          titre: l.titre.trim(), categorie: l.categorie, unite: l.unite || '',
          quantite, prixUnitaire, montant: quantite * prixUnitaire,
          priorite: l.priorite, dateSouhaitee: l.dateSouhaitee ? new Date(l.dateSouhaitee).getTime() : null,
          note: l.note || '', statut: 'a_traiter', validation: 'en_attente',
          demandePar: user?.nom || user?.login || null, demandeParUid: user?.uid || null, createdAt: now
        })
        await audit('projet', 'besoin_cree', l.titre.trim())
      }
      await notifierResponsable(lot.projetId, `${valides.length} nouveau(x) besoin(s)${lot.section?.trim() ? ' — ' + lot.section.trim() : ''}`)
      toast.success(`${valides.length} besoin(s) ajouté(s) ✓`)
      setLot(null)
    } finally { setSavingLot(false) }
  }

  const handleDelete = async (b) => {
    if (!peutSupprimer) return
    // Un besoin validé a créé une demande de décaissement dans E-DÉPENSES — recherchée par
    // b.depenseId (lien direct) ET par besoinId sur la dépense (lien inverse, toujours posé
    // par creerDemandeDecaissement) pour ne pas manquer les besoins créés avant que le lien
    // direct soit fiabilisé. Tant qu'elle est en_attente, elle disparaît avec le besoin. Dès
    // qu'un approbateur l'a approuvée (ou a fortiori décaissée), elle devient un engagement
    // réel — comme une dépense — et n'est plus supprimable depuis ici.
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
    await removeItem('projet_besoins', b.id)
    await audit('projet', 'besoin_supprime', b.titre)
  }

  const changerStatut = async (b, statut) => {
    await updateItem('projet_besoins', b.id, { statut, updatedAt: Date.now() })
    await audit('projet', 'besoin_' + statut, b.titre)
  }

  // ── Pièces jointes (devis, facture pro forma…) — jointes au besoin une fois créé. ──
  const ajouterPiece = async (b, piece) => {
    const pieces = [...(b.pieces || []), { ...piece, id: `pj_${Date.now()}`, createdAt: Date.now(), ajouteParUid: user?.uid || null }]
    await updateItem('projet_besoins', b.id, { pieces, updatedAt: Date.now() })
    await audit('projet', 'besoin_piece_ajoutee', `${piece.nom} → ${b.titre}`)
  }
  const retirerPiece = async (b, piece) => {
    const pieces = (b.pieces || []).filter((p) => p.id !== piece.id)
    await updateItem('projet_besoins', b.id, { pieces, updatedAt: Date.now() })
  }

  // ── Observation du PAU — comme la colonne « Observation » d'un devis papier :
  // une remarque libre du PAU sur ce besoin/article précis, distincte de la note du
  // demandeur. Réservée à l'administration ; visible par tous une fois enregistrée.
  const [observationEdit, setObservationEdit] = useState(null) // { id, valeur }
  const enregistrerObservation = async () => {
    if (!observationEdit) return
    const valeur = observationEdit.valeur.trim()
    await updateItem('projet_besoins', observationEdit.id, {
      observationPau: valeur,
      observationParText: user?.nom || user?.login || '—', observationLe: Date.now()
    })
    // Le retour va au demandeur d'origine — c'est lui qui attend une réponse.
    const b = besoins.find((x) => x.id === observationEdit.id)
    if (b?.demandeParUid && b.demandeParUid !== user?.uid) {
      await notify({
        type: 'info', title: `💬 Réponse à votre besoin — ${b.titre}`,
        body: valeur, module: 'projet', forUsers: [b.demandeParUid], link: '/projet/besoins'
      }).catch(() => {})
    }
    setObservationEdit(null)
  }

  // ── Validation / refus par l'administration — individuel ──
  // Valider un besoin crée AUSSITÔT une demande de décaissement dans E-DÉPENSES (même
  // circuit que toutes les autres dépenses : Autorisation de décaissement → secrétaire
  // approuve/décaisse). Une fois décaissée, elle apparaît naturellement partout : dans
  // E-DÉPENSES (source de vérité), dans le secteur concerné (Revenus & Budget, qui lit
  // directement depense_depenses par secteurId), et ici même dans E-G.Pro en lecture
  // seule (voir le volet Dépenses, qui reprend les dépenses `source: 'besoin'`).
  async function creerDemandeDecaissement(b) {
    const projet = projets.find((p) => p.id === b.projetId)
    const tache  = b.tacheId ? tachesTous.find((t) => t.id === b.tacheId) : null
    const id = genId()
    await setItem('depense_depenses', id, {
      id,
      secteurId: projet?.secteurId || SECTEUR_PAR_TYPE_PROJET[projet?.type] || 'divers',
      categorie: catLabel(b.categorie),
      montant: Number(b.montant) || 0,
      date: todayStr(),
      description: [projet?.nom, tache?.titre, b.titre].filter(Boolean).join(' — '),
      noteOrigine: b.note || '',
      natureFlux: natureFluxProjet(projet),
      sourceFinancement: 'entreprise',
      statut: 'en_attente',
      source: 'besoin', besoinId: b.id,
      projetId: b.projetId, projetNom: projet?.nom || '',
      tacheId: b.tacheId || '', tacheTitre: tache?.titre || '',
      // `enregistrePar` doit rester le DEMANDEUR d'origine (b.demandePar), pas la
      // personne qui valide ici — sinon E-DÉPENSES affiche systématiquement le nom
      // de l'administrateur/directeur qui a cliqué « Valider » à la place de qui a
      // réellement fait la demande. La validation elle-même reste tracée séparément
      // sur le besoin (`valideParText`/`valideLe`, cf. `validerBesoin` ci-dessous).
      enregistrePar: b.demandePar || user?.nom || user?.login || '—',
      enregistreParUid: b.demandeParUid || user?.uid || null,
      createdAt: Date.now()
    })
    return id
  }

  // Destinataires d'une décision (validation/refus) : le demandeur ET le chef de projet
  // concerné (souvent une personne différente, ex. un agent qui demande pour le compte
  // du projet) — sans doublon ni auto-notification de la personne qui valide/refuse.
  const destinatairesDecision = (b) => {
    const projet = projets.find((p) => p.id === b.projetId)
    return [...new Set([b.demandeParUid, projet?.responsableUid].filter((uid) => uid && uid !== user?.uid))]
  }

  async function validerBesoin(b) {
    const depenseId = await creerDemandeDecaissement(b)
    await updateItem('projet_besoins', b.id, {
      validation: 'valide', valideParText: user?.nom || user?.login || '—', valideLe: Date.now(), depenseId
    })
    await audit('projet', 'besoin_valide', `${b.titre} — demande de décaissement créée (${Number(b.montant || 0).toLocaleString('fr-FR')} FCFA)`)
    const destinataires = destinatairesDecision(b)
    if (destinataires.length) {
      await notify({ type: 'success', title: '✅ Besoin validé', body: `${b.titre} — envoyé en autorisation de décaissement`, module: 'projet', forUsers: destinataires, link: '/projet/besoins' }).catch(() => {})
    }
    await notify({
      type: 'demande', title: '💰 Décaissement à traiter',
      body: `${b.titre} — ${Number(b.montant || 0).toLocaleString('fr-FR')} FCFA (besoin validé par ${user?.nom || '—'})`,
      module: 'depense', forRoles: BESOINS_NOTIF_ROLES, excludeUid: user?.uid, link: '/depense/autorisations'
    }).catch(() => {})
  }
  async function refuserBesoin(b, motif = '') {
    await updateItem('projet_besoins', b.id, { validation: 'refuse', motifRefus: motif, statut: 'annule', refuseParText: user?.nom || user?.login || '—', refuseLe: Date.now() })
    await audit('projet', 'besoin_refuse', `${b.titre}${motif ? ' — ' + motif : ''}`)
    const destinataires = destinatairesDecision(b)
    if (destinataires.length) {
      await notify({ type: 'refus', title: '❌ Besoin refusé', body: `${b.titre}${motif ? ' — ' + motif : ''}`, module: 'projet', forUsers: destinataires, link: '/projet/besoins' }).catch(() => {})
    }
  }
  const demanderRefus = async (b) => {
    const motif = window.prompt(`Motif du refus de « ${b.titre} » (optionnel) :`)
    if (motif === null) return
    await refuserBesoin(b, motif.trim())
  }

  // ── Validation / refus en masse — sur la liste actuellement filtrée/affichée ──
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
      {/* En-tête */}
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),0_8px_20px_-8px_rgba(13,148,136,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.85) 0%, rgba(15,84,80,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0d9488', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <PackagePlus size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Besoins</h2>
          <p className="text-sm text-white/80">
            {enAttente > 0 ? `${enAttente} besoin(s) à traiter` : 'Tout est pris en charge'} — matériaux, main d'œuvre, équipement
          </p>
        </div>
      </div>

      {/* Filtres + compteurs */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm focus:outline-none"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/50 bg-white/50 p-1 shadow-sm backdrop-blur-sm">
          {[['', `Tous (${besoins.length})`], ...Object.entries(STATUTS_BESOIN).map(([k, v]) => [k, `${v.label} (${compteur(k)})`])].map(([v, l]) => (
            <button key={v || 'tous'} onClick={() => setFiltreStatut(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtreStatut === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-white'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/50 bg-white/50 p-1 shadow-sm backdrop-blur-sm">
          {[['', 'Validation : toutes'], ['en_attente', `⏳ ${compteurValidation('en_attente')}`], ['valide', `✅ ${compteurValidation('valide')}`], ['refuse', `❌ ${compteurValidation('refuse')}`]].map(([v, l]) => (
            <button key={v || 'toutes'} onClick={() => setFiltreValidation(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtreValidation === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-white'}`}>
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
          <Button size="sm" variant="outline" onClick={openLot}><Layers size={14} className="mr-1" />Ajout multiple</Button>
          <Button onClick={openCreate} size="sm"><Plus size={14} className="mr-1" />Nouveau besoin</Button>
        </div>
      </div>

      {/* Récapitulatif type « devis quantitatif et estimatif » — par ouvrage (section),
          avec sous-totaux Matériaux / Main d'œuvre puis total par ouvrage et total général. */}
      {filtreProjet && devisProjet && devisProjet.sections.length > 0 && (
        <Card title={`📄 Cadre du devis — ${projets.find((p) => p.id === filtreProjet)?.nom || ''}`}>
          <p className="mb-3 text-xs text-gray-500">
            Récapitulatif structuré par ouvrage, dans la logique d'un devis quantitatif et estimatif. Basé sur les besoins actifs de ce projet (hors refusés/annulés).
          </p>
          <div className="hidden gap-2 px-3 text-[10px] font-bold uppercase tracking-wide text-gray-400 sm:flex">
            <span className="w-5 shrink-0" />
            <span className="min-w-0 flex-1">Désignation</span>
            <span className="w-12 shrink-0 text-right">U</span>
            <span className="w-14 shrink-0 text-right">Qté</span>
            <span className="w-24 shrink-0 text-right">P.U. FCFA</span>
            <span className="w-28 shrink-0 text-right">Montant FCFA</span>
            <span className="w-40 shrink-0">Observation</span>
          </div>
          <div className="mt-1.5 space-y-4">
            {devisProjet.sections.map((sec) => (
              <div key={sec.label} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="bg-gray-800 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white">
                  {sec.label}
                </div>
                {sec.buckets.map((bucket) => (
                  <div key={bucket.label} className="border-t border-gray-100">
                    <div className="bg-gray-50 px-3 py-1.5 text-[11px] font-bold uppercase text-gray-500">
                      {bucket.label === 'Matériaux' ? 'A. Matériaux' : 'B. Main d\'œuvre'}
                    </div>
                    <div className="divide-y divide-gray-50">
                      {bucket.lignes.map((b, i) => {
                        const traite = b.statut === 'satisfait'
                        return (
                          <div key={b.id} className={`flex items-center gap-2 px-3 py-1.5 text-xs ${traite ? 'bg-green-50/50' : ''}`}>
                            <span className="w-5 shrink-0 text-gray-400">
                              {traite ? <CheckCircle2 size={13} className="text-green-500" title="Déjà traité" /> : i + 1}
                            </span>
                            <span className={`min-w-0 flex-1 truncate ${traite ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{b.titre}</span>
                            <span className="w-12 shrink-0 text-right text-gray-500">{b.unite || '—'}</span>
                            <span className="w-14 shrink-0 text-right text-gray-500">{b.quantite || 0}</span>
                            <span className="w-24 shrink-0 text-right text-gray-500">{Number(b.prixUnitaire || 0).toLocaleString('fr-FR')}</span>
                            <span className="w-28 shrink-0 text-right font-bold text-gray-800">{Number(b.montant || 0).toLocaleString('fr-FR')}</span>
                            <span className="w-40 shrink-0 truncate text-[11px] italic text-violet-600">{b.observationPau || ''}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-end gap-2 bg-gray-50/80 px-3 py-1.5 text-xs font-bold text-gray-600">
                      Sous-total {bucket.label} <span className="w-28 shrink-0 text-right text-gray-800">{bucket.total.toLocaleString('fr-FR')}</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-end gap-2 bg-teal-600 px-3 py-2 text-sm font-black text-white">
                  TOTAL {sec.label} <span className="ml-1">{sec.total.toLocaleString('fr-FR')} FCFA</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-gray-900 px-4 py-3 text-white">
            <span className="text-sm font-bold uppercase tracking-wide">Total général</span>
            <span className="text-xl font-black">{devisProjet.totalGeneral.toLocaleString('fr-FR')} FCFA</span>
          </div>
        </Card>
      )}

      {/* Liste — en lignes, même présentation que Dépenses (bordure de couleur à
          gauche, clic sur la ligne = détail, actions rapides à droite). Les actions
          moins fréquentes (Prendre en charge/Satisfait/Annuler, Observation du PAU)
          restent disponibles dans la fenêtre de détail, qui n'est plus en lecture
          seule — rien de ce qu'offrait la carte n'a été retiré. */}
      {!liste.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <PackagePlus size={32} className="opacity-30" />
            <p className="text-sm">Aucun besoin{filtreProjet ? ' pour ce projet' : ''}.</p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2.5 text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th className="px-4 pb-1 text-left font-bold">Date & projet</th>
                <th className="px-4 pb-1 text-left font-bold">Besoin</th>
                <th className="px-4 pb-1 text-left font-bold">Demandé par</th>
                <th className="px-4 pb-1 text-right font-bold">Montant</th>
                <th className="px-4 pb-1 text-center font-bold">Statut</th>
                <th className="px-4 pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((b) => {
                const projet = projets.find((p) => p.id === b.projetId)
                const tache  = b.tacheId ? tachesTous.find((t) => t.id === b.tacheId) : null
                const st = STATUTS_BESOIN[b.statut] || STATUTS_BESOIN.a_traiter
                const vt = VALIDATION_META[validationDe(b)]
                const refuse = validationDe(b) === 'refuse'
                const decaissement = b.depenseId ? depenseDepensesTous.find((d) => d.id === b.depenseId) : null
                const accent = TONE_HEX[vt.tone] || '#94a3b8'
                const cell = 'bg-white py-3 align-middle transition-colors group-hover:bg-teal-50/40'
                return (
                  <tr key={b.id} onClick={() => setDetail(b)}
                    className="group cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-gray-100 transition-shadow hover:shadow-[0_6px_18px_-6px_rgba(13,148,136,0.18)] hover:ring-teal-200">
                    <td className={`${cell} rounded-l-2xl border-l-[3px] px-4`} style={{ borderColor: accent }}>
                      <p className="whitespace-nowrap text-xs font-semibold text-gray-700">{b.createdAt ? formatDateShort(b.createdAt) : '—'}</p>
                      {projet && (
                        <span className="mt-1 inline-block max-w-[140px] truncate whitespace-nowrap rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700" title={projet.nom}>
                          {projet.nom}
                        </span>
                      )}
                    </td>
                    <td className={`${cell} px-4`}>
                      <p className={`line-clamp-2 max-w-[320px] font-semibold ${b.statut === 'satisfait' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{b.titre}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{catLabel(b.categorie)}</span>
                        {b.section && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">📐 {b.section}</span>}
                        {tache && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">🔧 {tache.titre}</span>}
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
                      {/* Fond teinté + bordure sur chaque icône (pas juste la couleur du
                          trait) — sinon Valider/Refuser se distinguaient à peine du reste
                          de la ligne, surtout Valider (vert clair peu contrasté). */}
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
                          className="rounded-lg border border-teal-200 bg-teal-50 p-1.5 text-teal-600 transition-colors hover:border-teal-300 hover:bg-teal-100"><Pencil size={15} /></button>
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

      {/* Modal création/édition — un seul besoin */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier le besoin' : 'Nouveau besoin'}
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-200/75 backdrop-blur-2xl backdrop-saturate-200">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 space-y-3 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">📋 Informations</p>
            <FormGroup label="Projet" required>
              <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={form.projetId} onChange={(e) => setForm((f) => ({ ...f, projetId: e.target.value, tacheId: '' }))}>
                <option value="">— Sélectionner —</option>
                {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
            </FormGroup>
            {form.projetId && (
              <FormGroup label="Tâche" hint="Optionnel — rattacher ce besoin à une tâche précise du projet">
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.tacheId} onChange={(e) => setForm((f) => ({ ...f, tacheId: e.target.value }))}>
                  <option value="">— Aucune tâche précise —</option>
                  {tachesDuProjet.map((t) => <option key={t.id} value={t.id}>{t.titre}</option>)}
                </select>
              </FormGroup>
            )}
            <FormGroup label="Besoin" required hint="Ce qui manque ou doit être fourni">
              <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="ex : Ciment, ouvriers supplémentaires, bétonnière…"
                value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))} />
            </FormGroup>
            <FormGroup label="Ouvrage / Section" hint="Optionnel — regroupe ce besoin dans le devis (ex : Cage d'escalier, Acrotère…)">
              <ChampAutocomplete value={form.section} onChange={(v) => setForm((f) => ({ ...f, section: v }))}
                suggestions={sectionsDuProjet} placeholder="ex : Cage d'escalier" accent="teal" />
            </FormGroup>
          </div>

          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 space-y-3 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">📦 Détails & coût</p>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Catégorie">
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.categorie} onChange={(e) => setForm((f) => ({ ...f, categorie: e.target.value }))}>
                  {CATEGORIES_BESOIN.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Priorité">
                <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.priorite} onChange={(e) => setForm((f) => ({ ...f, priorite: e.target.value }))}>
                  {Object.entries(PRIORITES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </FormGroup>
              <FormGroup label="Quantité" required>
                <input type="number" min="0" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder={QUANTITE_META[form.categorie]?.placeholder || 'ex : 1'}
                  value={form.quantite} onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Unité" hint="Optionnel">
                <input className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="ex : sac, m³, unité"
                  value={form.unite} onChange={(e) => setForm((f) => ({ ...f, unite: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Prix unitaire (FCFA)">
                <input type="number" min="0" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder="ex : 2 500"
                  value={form.prixUnitaire} onChange={(e) => setForm((f) => ({ ...f, prixUnitaire: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Souhaité pour le" hint="Optionnel">
                <input type="date" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  value={form.dateSouhaitee} onChange={(e) => setForm((f) => ({ ...f, dateSouhaitee: e.target.value }))} />
              </FormGroup>
              <div className="flex flex-col justify-end">
                <p className="mb-1 text-xs font-medium text-gray-600">Montant estimé</p>
                <p className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-black text-white">
                  {((Number(form.quantite) || 0) * (Number(form.prixUnitaire) || 0)).toLocaleString('fr-FR')} FCFA
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
            <FormGroup label="Note" hint="Optionnel">
              <textarea rows={2} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </FormGroup>
          </div>

          {/* Pièces jointes (devis, facture pro forma…) — bufferisées localement à la
              création (pas encore d'id de besoin), enregistrées avec lui à la sauvegarde
              (cf. handleSave). En édition, elles s'ajoutent directement en base. */}
          <div className="rounded-2xl border border-white/55 bg-white/60 p-4 backdrop-blur-md shadow-[0_10px_30px_-16px_rgba(13,148,136,0.35),inset_0_1px_0_0_rgba(255,255,255,0.55)]">
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

      {/* Modal ajout multiple — plusieurs besoins d'un même projet, par catégorie, d'un coup */}
      <Modal open={!!lot} onClose={() => setLot(null)} size="xl" title="Ajouter plusieurs besoins d'un coup"
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-200/75 backdrop-blur-2xl backdrop-saturate-200"
        footer={lot && (() => {
          const completes = lot.lignes.filter((l) => l.titre.trim() && Number(l.quantite) > 0)
          const totalLot = completes.reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0), 0)
          return (
            <>
              <span className="mr-auto text-xs text-gray-500">
                {completes.length} ligne(s) prête(s) · <strong className="text-gray-800">{totalLot.toLocaleString('fr-FR')} FCFA</strong>
              </span>
              <Button variant="outline" onClick={() => setLot(null)} disabled={savingLot}>Annuler</Button>
              <Button onClick={enregistrerLot} loading={savingLot} disabled={completes.length === 0 || !lot.projetId}>Enregistrer tout</Button>
            </>
          )
        })()}>
        {lot && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/55 bg-white/60 p-3 backdrop-blur-md">
              <div className="grid grid-cols-3 gap-3">
                <FormGroup label="Projet" required>
                  <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    value={lot.projetId} onChange={(e) => setLot((l) => ({ ...l, projetId: e.target.value, tacheId: '' }))}>
                    <option value="">— Sélectionner —</option>
                    {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                </FormGroup>
                <FormGroup label="Ouvrage / Section" hint="S'applique à toutes les lignes">
                  <ChampAutocomplete value={lot.section} onChange={(v) => setLot((l) => ({ ...l, section: v }))}
                    suggestions={sectionsDuLot} placeholder="ex : Cage d'escalier" accent="teal" />
                </FormGroup>
                <FormGroup label="Tâche" hint="Optionnel — s'applique à toutes les lignes">
                  <select className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    value={lot.tacheId} onChange={(e) => setLot((l) => ({ ...l, tacheId: e.target.value }))}>
                    <option value="">— Aucune tâche précise —</option>
                    {tachesDuLot.map((t) => <option key={t.id} value={t.id}>{t.titre}</option>)}
                  </select>
                </FormGroup>
              </div>
            </div>

            <p className="rounded-xl border border-teal-200/60 bg-teal-50/60 px-3 py-2 text-xs text-teal-800">
              Renseignez chaque besoin de cet ouvrage (catégorie, titre, unité, quantité, prix unitaire). Le montant se calcule automatiquement. Les lignes sans titre ou sans quantité sont ignorées.
            </p>

            <div className="hidden gap-2 px-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 sm:grid sm:grid-cols-12">
              <span className="sm:col-span-2">Catégorie</span>
              <span className="sm:col-span-3">Besoin</span>
              <span className="sm:col-span-1">Unité</span>
              <span className="sm:col-span-1">Qté</span>
              <span className="sm:col-span-2">Prix unitaire</span>
              <span className="sm:col-span-2">Montant</span>
              <span className="sm:col-span-1" />
            </div>

            <div className="space-y-2">
              {lot.lignes.map((l, i) => {
                const montantLigne = (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0)
                return (
                  <div key={i} className="grid grid-cols-2 items-center gap-2 rounded-xl border border-gray-100 bg-white p-2 sm:grid-cols-12">
                    <div className="sm:col-span-2">
                      <select className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
                        value={l.categorie} onChange={(e) => setLigne(i, 'categorie', e.target.value)}>
                        {CATEGORIES_BESOIN.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <input className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
                        placeholder="ex : Ciment"
                        value={l.titre} onChange={(e) => setLigne(i, 'titre', e.target.value)} />
                    </div>
                    <div className="sm:col-span-1">
                      <input className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
                        placeholder="U"
                        value={l.unite} onChange={(e) => setLigne(i, 'unite', e.target.value)} />
                    </div>
                    <div className="sm:col-span-1">
                      <input type="number" min="0" className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
                        placeholder={QUANTITE_META[l.categorie]?.placeholder || 'Qté'}
                        value={l.quantite} onChange={(e) => setLigne(i, 'quantite', e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <input type="number" min="0" className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
                        placeholder="PU"
                        value={l.prixUnitaire} onChange={(e) => setLigne(i, 'prixUnitaire', e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <p className="rounded-lg bg-gray-50 px-2 py-1.5 text-sm font-bold text-gray-700">{montantLigne.toLocaleString('fr-FR')}</p>
                    </div>
                    <div className="col-span-2 flex justify-end sm:col-span-1 sm:justify-center">
                      <button type="button" onClick={() => retirerLigne(i)} disabled={lot.lignes.length <= 1}
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

      {/* Détail d'un besoin, ouvert en cliquant sur sa ligne — regroupe aussi les
          actions moins fréquentes (validation, suivi opérationnel, observation). */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="md" title="Détail du besoin"
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-200/75 backdrop-blur-2xl backdrop-saturate-200"
        footer={<Button variant="outline" onClick={() => setDetail(null)}>Fermer</Button>}>
        {detail && (() => {
          const b = besoins.find((x) => x.id === detail.id) || detail
          const projet = projets.find((p) => p.id === b.projetId)
          const tache  = b.tacheId ? tachesTous.find((t) => t.id === b.tacheId) : null
          const st = STATUTS_BESOIN[b.statut] || STATUTS_BESOIN.a_traiter
          const vt = VALIDATION_META[validationDe(b)]
          const decaissement = b.depenseId ? depenseDepensesTous.find((d) => d.id === b.depenseId) : null
          return (
            <div className="space-y-3 text-sm">
              {/* En-tête : titre + montant + statuts */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className={`text-lg font-black leading-snug ${b.statut === 'satisfait' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{b.titre}</p>
                {Number(b.montant) > 0 && <p className="mt-1 text-2xl font-black text-teal-700">{Number(b.montant).toLocaleString('fr-FR')} <span className="text-sm font-bold text-gray-400">FCFA</span></p>}
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

              {/* Infos clés en tuiles */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Projet</p>
                  <p className="mt-0.5 font-bold text-gray-800">{projet?.nom || '—'}</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Tâche liée</p>
                  <p className="mt-0.5 font-bold text-gray-800">{tache?.titre || '— (aucune)'}</p>
                </div>
                <div className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Ouvrage / Section</p>
                  <p className="mt-0.5 font-bold text-gray-800">{b.section || '—'}</p>
                </div>
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

              {/* Observation du PAU — comme la colonne « Observation » d'un devis papier.
                  Visible par tous une fois enregistrée ; ajout/modification réservés à
                  l'administration. Reprend exactement ce que la carte offrait avant. */}
              {observationEdit?.id === b.id ? (
                <div className="space-y-1.5 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">🗨️ Observation du PAU</p>
                  <textarea rows={2} autoFocus value={observationEdit.valeur}
                    onChange={(e) => setObservationEdit((o) => ({ ...o, valeur: e.target.value }))}
                    placeholder="Observation du PAU sur ce besoin…"
                    className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none" />
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => setObservationEdit(null)} className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-white">Annuler</button>
                    <button onClick={enregistrerObservation} className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-violet-700">Enregistrer</button>
                  </div>
                </div>
              ) : b.observationPau ? (
                <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">🗨️ Observation du PAU</p>
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

              {/* Actions — validation par l'administration, suivi opérationnel,
                  modifier/supprimer. Regroupe ici tout ce que la carte proposait
                  auparavant, la ligne de la liste ne gardant que les raccourcis
                  les plus fréquents (Valider/Refuser, Voir, Modifier, Supprimer). */}
              {estAdmin && validationDe(b) === 'en_attente' && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-violet-500">Validation</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="success" onClick={() => validerBesoin(b)}><Check size={13} /> Valider</Button>
                    <Button size="sm" variant="danger" onClick={() => demanderRefus(b)}><X size={13} /> Refuser</Button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-violet-500">
                    Valider envoie {Number(b.montant || 0).toLocaleString('fr-FR')} FCFA en autorisation de décaissement (E-DÉPENSES). Pour ajuster le prix retenu, modifiez d'abord le besoin, ou laissez une observation.
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

              {/* Pièces jointes — lecture seule */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <PiecesJointes pieces={b.pieces || []} noAdd noDelete label="📎 Pièces jointes" />
              </div>

              {/* Traçabilité */}
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Traçabilité</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 font-semibold text-teal-800">
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

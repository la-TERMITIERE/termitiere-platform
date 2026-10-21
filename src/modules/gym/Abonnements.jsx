// MAXI-GYM — Abonnements : liste complète + ajout d'un abonnement.
// Simple / VIP : durée fixe 1 mois, tarif fixe. Classique : durée ET tarif libres.
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, CalendarRange, SlidersHorizontal, CreditCard, Plus, Trash2, CheckCircle2, Pencil, User, MessageCircle, Receipt, CalendarDays, FileSpreadsheet, Eraser, Repeat, X, Users, Tag, CalendarCheck, Hourglass, Flag, Wallet, StickyNote, Dumbbell, Zap, Crown } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { sendWhatsApp } from '../../core/whatsapp'
import { peutEcrireGym, peutAdministrerGym, peutPurgerClientGym, canExportGym } from '../../core/roles'
import { exportRapportExcel } from '../../utils/excelReport'
import { todayStr, formatMoney, formatDateShort } from '../../utils/formatters'
import { glassModalProps, COULEUR_MODULE, icone3D } from '../../utils/color'
import { BoutonGym } from './uiHelpers'
import { CATEGORIES_GYM, CATEGORIE_PERSO, NOM_CLASSIQUE, PERSO_PREFIXE, estCategoriePerso, nomCategoriePerso, indexSexeClients, sexeDe, filtrerParSexe, sexeInfo, categorieLabel, categorieTone, categorieDesc, dateFinAbonnement, dureeJoursMoisDefaut, abonnementActif, statutAbonnement, joursDepuis, genQrToken, QR_CARNET_ACTIF, peutRenouveler } from './data'
import { useGymParams } from './useGymParams'
import ModesPaiement from './ModePaiementUI'
import { notify } from '../../core/notify'
import { genererFactureGym } from './genererFacture'
import ClientDetailModal from './ClientDetailModal'
import JoursRestants, { BoutonRenouveler, BoutonPointer } from './JoursRestants'
import PurgeClientModal from './PurgeClientModal'
import { dossierClient, dossierTermine } from './purgeClient'
import QrCarnetModal from './QrCarnetModal'
import CalendrierPresences from './CalendrierPresences'
import { useSite, matchSite } from './site/useSite'
import { SexeBoutons, SexeFiltre, SexeBadge } from './SexeUI'

const COULEUR = '#A6342A'
const COULEUR2 = '#E8850F'
const COULEUR_CATEGORIE = { simple: '#94a3b8', classique: '#0ea5e9', vip: '#d97706', perso: '#8b5cf6' }
const ICONE_CATEGORIE = { simple: Dumbbell, classique: Zap, vip: Crown, perso: SlidersHorizontal }

// Étiquette d'une tuile : petite icône 3D (relief) puis le libellé.
function Etiq({ icone: Icone, couleur, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D(couleur)}><Icone size={13} /></span>
      {children}
    </span>
  )
}
const heureCourte = (d) => d.toTimeString().slice(0, 5)

// Recalcule `dateFin` à partir de la DATE DE DÉBUT + durée — sauf si l'utilisateur
// l'a déjà corrigée manuellement (`dateFinManuelle`), auquel cas on la laisse intacte.
// `dateDebut` = début effectif de l'abonnement (par défaut = date de souscription,
// mais peut être une date future si le client commence plus tard).
function recalculerDateFin(next) {
  if (next.dateFinManuelle) return next
  return { ...next, dateFin: dateFinAbonnement(next.dateDebut || next.date, next.dureeJours) }
}

// Période d'un abonnement « Personnalisé » : semaine, mois ou année, multipliée par un nombre (2 semaines, 3 mois, 1 an…).
// Le nom de la catégorie enregistrée en découle (« 2 semaines »), la durée en jours aussi (un mois ou un an = calendaire).
const UNITES_PERIODE = [
  { id: 'semaine', label: 'Semaine', un: 'semaine', pl: 'semaines', icone: CalendarDays },
  { id: 'mois', label: 'Mois', un: 'mois', pl: 'mois', icone: CalendarRange },
  { id: 'annee', label: 'Année', un: 'an', pl: 'ans', icone: CalendarCheck }
]
function joursPeriode(unite, n, debut) {
  if (unite === 'semaine') return 7 * n
  const d0 = new Date(debut || Date.now())
  const d1 = new Date(d0)
  if (unite === 'mois') d1.setMonth(d1.getMonth() + n)
  else d1.setFullYear(d1.getFullYear() + n)
  return Math.round((d1 - d0) / 86400000)
}
const nomPeriode = (unite, n) => { const u = UNITES_PERIODE.find((x) => x.id === unite); return `${n} ${n > 1 ? u.pl : u.un}` }
// Retrouve unité et nombre d'après un nom enregistré (« 2 semaines ») ; null si le nom n'a pas cette forme (ex. « Classique »).
function lirePeriode(nom) {
  const m = /^(\d+) (semaines?|mois|ans?)$/.exec(String(nom || '').trim())
  if (!m) return null
  return { unite: m[2].startsWith('semaine') ? 'semaine' : m[2] === 'mois' ? 'mois' : 'annee', quantite: m[1] }
}
// Applique une période au formulaire : nom de la catégorie, durée en jours et date de fin.
const appliquerPeriode = (f, unite, n) => recalculerDateFin({
  ...f, unite, quantite: String(n), categorieNom: nomPeriode(unite, n), dureeJours: String(joursPeriode(unite, n, f.dateDebut || f.date))
})

// Durée (jours) à pré-remplir pour une catégorie donnée — Classique libre garde son
// minimum réglable depuis Paramètres, toutes les autres (Simple/VIP/Classique fixe)
// démarrent sur l'équivalent d'1 mois calendaire, mais restent modifiables ensuite
// (abonnement plus court ou plus long qu'un mois).
function dureeJoursInitiale(categorie, date, classiqueFixe, dureeMin) {
  if (categorie === 'classique' && !classiqueFixe) return String(dureeMin)
  return String(dureeJoursMoisDefaut(date))
}

export default function Abonnements() {
  const { user, role } = useAuth()
  const site = useSite()
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allSeances } = useCollection('gym_seances')
  const { data: allClients } = useCollection('gym_clients')
  const { data: allFactures } = useCollection('gym_factures')
  const { data: allPresences } = useCollection('gym_presences')
  const { data: allPointagesCoach } = useCollection('gym_pointages_coach')
  // Tout est cloisonné par salle, y compris la clientèle : les clients de Lomé
  // ne sont pas ceux de Kara.
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])
  const seances = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])
  const clients = useMemo(() => allClients.filter((c) => matchSite(c, site)), [allClients, site])
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const presences = useMemo(() => allPresences.filter((p) => matchSite(p, site)), [allPresences, site])
  const pointagesCoach = useMemo(() => allPointagesCoach.filter((p) => matchSite(p, site)), [allPointagesCoach, site])
  // Coach à attribuer à un abonnement du jour `date` — seulement si un SEUL coach a
  // été pointé présent ce jour-là (aucun ou plusieurs coachs présents → ambigu, on
  // laisse l'abonnement sans coach plutôt que de deviner). Sert au suivi de
  // performance par coach (cf. Coachs.jsx), au-delà de la simple corrélation par jour.
  function coachDuJour(date) {
    const idsUniques = [...new Set(pointagesCoach.filter((p) => p.date === date && p.statut !== 'absent').map((p) => p.coachId))]
    if (idsUniques.length !== 1) return { coachId: null, coachNom: null }
    const p = pointagesCoach.find((x) => x.date === date && x.statut !== 'absent' && x.coachId === idsUniques[0])
    return { coachId: p.coachId, coachNom: p.coachNom }
  }
  const peutSupprimer = peutAdministrerGym(role)
  const lectureSeule = !peutEcrireGym(role)
  const peutPurger = peutPurgerClientGym(role)
  const navigate = useNavigate()
  const location = useLocation()
  const params = useGymParams(site)
  const dureeMin = params.dureeClassiqueMinJours
  // Classique à prix FIXE (Kara) : `tarifAbonnementClassique` non nul — se comporte
  // alors comme Simple/VIP (durée fixe 1 mois, prix pré-rempli). `null` (Lomé, par
  // défaut) : Classique garde son prix ET sa durée libres à la saisie.
  const classiqueFixe = params.tarifAbonnementClassique != null
  const tarifs = { simple: params.tarifAbonnementSimple, classique: params.tarifAbonnementClassique, vip: params.tarifAbonnementVip }

  const [modal, setModal] = useState(null)
  const [filtreSexe, setFiltreSexe] = useState('')
  const [recherche, setRecherche] = useState('')
  const idxSexe = useMemo(() => indexSexeClients(clients), [clients])
  const [saving, setSaving] = useState(false)
  const [purge, setPurge] = useState(null) // dossier d'un client terminé à supprimer totalement
  const [suggClient, setSuggClient] = useState(false)
  const [clientDetail, setClientDetail] = useState(null)
  const [qrNouveauClient, setQrNouveauClient] = useState(null)
  const [calendrierClient, setCalendrierClient] = useState(null) // abonnement dont on regarde/corrige le calendrier
  const [dateSelectionnee, setDateSelectionnee] = useState(null) // jour cliqué dans ce calendrier, à pointer
  const moisEnCours = todayStr().slice(0, 7)

  // Filtre de période — Jour / Mois / Année / Plage, sur la liste affichée ci-dessous.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')

  const vide = () => {
    const date = todayStr(), categorie = CATEGORIES_GYM[0].id
    const dureeJours = dureeJoursInitiale(categorie, date, classiqueFixe, dureeMin)
    return {
      id: null, date, dateDebut: date, dateDebutManuelle: false,
      clientNom: '', telephone: '', sexe: '', categorie, categorieNom: '', dureeJours,
      dateFin: dateFinAbonnement(date, dureeJours), dateFinManuelle: false,
      montant: String(tarifs[categorie] || ''), notes: '', modePaiement: 'especes', motifPrix: ''
    }
  }
  // Renouvellement : le formulaire est pré-rempli à partir de l'abonnement actuel du client (nom, catégorie, durée, tarif),
  // sans le réinscrire. Si l'abonnement court encore, le nouveau commence le lendemain de sa fin ; s'il est expiré, aujourd'hui.
  const renouveler = (a) => {
    const auj = todayStr()
    const dateDebut = a.dateFin && a.dateFin >= auj ? dateFinAbonnement(a.dateFin, 1) : auj
    const categorie = (estCategoriePerso(a.categorie) || a.categorie === 'classique') ? 'perso' : a.categorie
    const dureeJours = a.dureeJours != null ? String(a.dureeJours) : String(dureeJoursMoisDefaut(dateDebut))
    return {
      id: null, renouvellement: true, renouvelleDe: a.id, date: auj, dateDebut, dateDebutManuelle: dateDebut !== auj,
      clientNom: a.clientNom, telephone: '', sexe: sexeDe(a, idxSexe), categorie, categorieNom: a.categorie === 'classique' ? NOM_CLASSIQUE : nomCategoriePerso(a.categorie), ...(lirePeriode(nomCategoriePerso(a.categorie)) || {}), dureeJours,
      dateFin: dateFinAbonnement(dateDebut, dureeJours), dateFinManuelle: false,
      montant: String(tarifs[categorie] || a.montant || ''), notes: '', modePaiement: a.modePaiement || 'especes', motifPrix: a.motifPrix || ''
    }
  }
  // Ouverture depuis une alerte du Dashboard (« Renouveler ») : la navigation porte l'id de l'abonnement.
  useEffect(() => {
    const id = location.state?.renouveler
    if (!id || !allAbonnements.length) return
    const a = allAbonnements.find((x) => x.id === id)
    if (a) setModal(renouveler(a))
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, allAbonnements.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Durée d'origine d'un abonnement existant : si elle n'a pas été enregistrée (ancien
  // abonnement Simple/VIP, avant cette fonctionnalité), on la reconstitue exactement à
  // partir des dates déjà enregistrées plutôt que d'appliquer un défaut approximatif.
  const remplir = (a) => {
    const dateDebut = a.dateDebut || a.date // abonnements antérieurs : début = souscription
    return {
      id: a.id, date: a.date, dateDebut, dateDebutManuelle: dateDebut !== a.date,
      clientNom: a.clientNom, sexe: sexeDe(a, idxSexe), telephone: '', categorie: (estCategoriePerso(a.categorie) || a.categorie === 'classique') ? 'perso' : a.categorie, categorieNom: a.categorie === 'classique' ? NOM_CLASSIQUE : nomCategoriePerso(a.categorie), ...(lirePeriode(nomCategoriePerso(a.categorie)) || {}),
      dureeJours: a.dureeJours != null ? String(a.dureeJours) : String(Math.max(1, Math.round((new Date(a.dateFin) - new Date(dateDebut)) / 86400000))),
      dateFin: a.dateFin, dateFinManuelle: true,
      montant: String(a.montant), notes: a.notes || '', modePaiement: a.modePaiement || 'especes', motifPrix: a.motifPrix || ''
    }
  }

  const cleNom = (n) => (n || '').trim().toLowerCase()
  // Noms de catégories personnalisées déjà utilisés dans cette salle : proposés en suggestion à la saisie.
  const nomsPerso = useMemo(() => [...new Set(abonnements.filter((a) => estCategoriePerso(a.categorie)).map((a) => nomCategoriePerso(a.categorie)).filter(Boolean))].sort(), [abonnements])
  const toutes = useMemo(() => [...abonnements].sort((a, b) => (a.date === b.date ? ((b.dateFin || '') < (a.dateFin || '') ? -1 : 1) : (a.date < b.date ? 1 : -1))), [abonnements])
  // Dernier abonnement de chaque client (la fin la plus lointaine) : c'est lui qu'on renouvelle, et lui seul porte le bouton.
  const dernierParClient = useMemo(() => {
    const m = new Map()
    for (const a of abonnements) {
      const k = cleNom(a.clientNom)
      const cur = m.get(k)
      if (!cur || (a.dateFin || '') > (cur.dateFin || '') || ((a.dateFin || '') === (cur.dateFin || '') && a.date > cur.date)) m.set(k, a)
    }
    return m
  }, [abonnements])
  // Nombre de passages (arrivées pointées) de chaque abonné : affiché une seule fois à côté de son nom.
  const passagesParClient = useMemo(() => {
    const m = new Map()
    for (const p of presences) m.set(cleNom(p.clientNom), (m.get(cleNom(p.clientNom)) || 0) + 1)
    return m
  }, [presences])
  const nbParClient = useMemo(() => {
    const m = new Map()
    for (const a of abonnements) m.set(cleNom(a.clientNom), (m.get(cleNom(a.clientNom)) || 0) + 1)
    return m
  }, [abonnements])
  // Période d'abord ; le tri par sexe s'applique ensuite (`liste`). `listePeriode`
  // sert à compter les « non précisé » sur la période affichée.
  const listePeriode = useMemo(() => {
    if (modePeriode === 'mois' && filtreMois) return toutes.filter((a) => (a.date || '').startsWith(filtreMois))
    if (modePeriode === 'annee' && filtreAnnee) return toutes.filter((a) => (a.date || '').startsWith(filtreAnnee))
    if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      return toutes.filter((a) => (!filtreDebut || a.date >= filtreDebut) && (!filtreFin || a.date <= filtreFin))
    }
    if (modePeriode === 'jour' && filtreJour) return toutes.filter((a) => a.date === filtreJour)
    return toutes
  }, [toutes, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])
  const liste = useMemo(() => filtrerParSexe(listePeriode, filtreSexe, idxSexe).filter((a) => correspond(recherche, a.clientNom)), [listePeriode, filtreSexe, idxSexe, recherche])
  // Un client n'apparaît qu'UNE fois dans la liste (son abonnement le plus récent de la période) : un renouvellement
  // ne crée plus de seconde ligne à son nom. L'historique complet est dans sa fiche ; les paiements restent comptés.
  const listeClients = useMemo(() => {
    const vus = new Set()
    return liste.filter((a) => { const k = cleNom(a.clientNom); if (vus.has(k)) return false; vus.add(k); return true })
  }, [liste])
  const nbInconnus = useMemo(() => listePeriode.filter((a) => !sexeDe(a, idxSexe)).length, [listePeriode, idxSexe])
  const total = useMemo(() => liste.reduce((s, x) => s + (Number(x.montant) || 0), 0), [liste])

  // Export Excel — reprend exactement la liste affichée (`liste`), donc le
  // filtre de période (Jour/Mois/Année/Plage) sélectionné ci-dessus.
  function exportXLSX() {
    const rows = liste.map((a) => {
      const st = statutAbonnement(a.dateDebut, a.dateFin)
      return {
        'Souscrit le': formatDateShort(a.date),
        'Début': formatDateShort(a.dateDebut || a.date),
        Client: a.clientNom,
        Sexe: sexeInfo(sexeDe(a, idxSexe))?.label || '—',
        Catégorie: categorieLabel(a.categorie),
        Fin: a.dateFin ? formatDateShort(a.dateFin) : '—',
        Statut: st.label,
        Montant: Number(a.montant) || 0,
        Notes: a.notes || '—',
        'Enregistré par': a.enregistrePar || '—'
      }
    })
    exportRapportExcel({
      filename: `abonnements-maxi-gym-${todayStr()}.xlsx`,
      sections: [{
        name: 'Abonnements',
        title: 'Abonnements : MAXI-GYM',
        subtitle: `${liste.length} abonnement(s) · ${formatMoney(total)} au total`,
        columns: [
          { key: 'Souscrit le', label: 'Souscrit le', width: 14 },
          { key: 'Début', label: 'Début', width: 14 },
          { key: 'Client', label: 'Client', width: 24 },
          { key: 'Sexe', label: 'Sexe', width: 10 },
          { key: 'Catégorie', label: 'Catégorie', width: 16 },
          { key: 'Fin', label: 'Fin', width: 14 },
          { key: 'Statut', label: 'Statut', width: 14 },
          { key: 'Montant', label: 'Montant', width: 16, type: 'money' },
          { key: 'Notes', label: 'Notes', width: 30 },
          { key: 'Enregistré par', label: 'Enregistré par', width: 20 }
        ],
        rows,
        totals: { __label: 'TOTAL', Montant: total }
      }]
    })
  }

  // Dernière arrivée pointée par client — sert à afficher/estimer l'inactivité.
  const dernierePresenceParClient = useMemo(() => {
    const m = new Map()
    for (const p of presences) {
      const cle = (p.clientNom || '').trim().toLowerCase()
      if (!cle) continue
      if (!m.has(cle) || p.date > m.get(cle)) m.set(cle, p.date)
    }
    return m
  }, [presences])

  async function enregistrer() {
    // « Personnalisé » : la catégorie enregistrée est `perso:<nom>` (cf. data.js).
    if (modal.categorie === 'perso' && !(modal.categorieNom || '').trim()) return toast.error('Donnez un nom à la catégorie personnalisée')
    if (modal.categorie === 'perso' && (!modal.dureeJours || Number(modal.dureeJours) < 1)) return toast.error('Indiquez la durée de l\'abonnement (en jours)')
    // Un montant libre doit être justifié : le motif est gardé et la direction est prévenue.
    if (modal.categorie === 'perso' && !(modal.motifPrix || '').trim()) return toast.error('Indiquez le motif du montant (étudiant, négocié, offre…)')
    const personnalise = modal.categorie === 'perso'
    const nomPerso = (modal.categorieNom || '').trim()
    const d = personnalise ? { ...modal, categorie: nomPerso.toLowerCase() === NOM_CLASSIQUE.toLowerCase() ? 'classique' : `${PERSO_PREFIXE}${nomPerso}` } : modal
    if (!d.clientNom.trim()) return toast.error('Nom du client requis')
    if (!d.id && !d.sexe) return toast.error('Précisez le sexe du client (Femme ou Homme)')
    if (!d.montant || Number(d.montant) <= 0) return toast.error('Montant requis')
    // Le prix reste modifiable (ex. tarif négocié, majoration) mais ne peut pas descendre
    // sous le tarif de référence de Paramètres — plancher, pas prix imposé. Un Classique
    // à prix libre (Lomé) n'a pas de tarif de référence : aucun plancher ne s'applique.
    const tarifPlancher = (personnalise || (d.categorie === 'classique' && !classiqueFixe)) ? null : tarifs[d.categorie]
    if (!d.id && tarifPlancher > 0 && Number(d.montant) !== tarifPlancher) {
      return toast.error(`Le montant de cette catégorie est fixé à ${formatMoney(tarifPlancher)} (tarif de Paramètres)`)
    }
    if (tarifPlancher > 0 && Number(d.montant) < tarifPlancher) {
      return toast.error(`Le montant ne peut pas être inférieur à ${formatMoney(tarifPlancher)} pour cette catégorie (tarif de Paramètres)`)
    }
    if (!personnalise && d.categorie === 'classique' && !classiqueFixe && (!d.dureeJours || Number(d.dureeJours) < dureeMin)) return toast.error(`Durée requise (minimum ${dureeMin} jours) pour un abonnement Classique`)
    const total = Number(d.montant)
    if (!d.dateFin) return toast.error('Date de fin requise')
    setSaving(true)
    try {
      const dateFin = d.dateFin
      const clientNom = d.clientNom.trim()
      const modePaiement = d.modePaiement || 'especes'

      // Modification d'un abonnement existant — pas de nouvelle création de client, pas
      // de nouvelle facture ni de nouveau WhatsApp (déjà envoyés à l'enregistrement initial).
      const dateDebut = d.dateDebut || d.date

      if (d.id) {
        const { coachId, coachNom } = coachDuJour(d.date)
        await updateItem('gym_abonnements', d.id, {
          date: d.date, dateDebut, dateFin, clientNom, categorie: d.categorie,
          dureeJours: d.dureeJours ? Number(d.dureeJours) : null,
          montant: total, notes: d.notes.trim(), coachId, coachNom, modePaiement,
          ...(d.motifPrix ? { motifPrix: d.motifPrix.trim() } : {}),
          ...(d.sexe ? { sexe: d.sexe } : {})
        })
        const ficheEdit = clients.find((c) => (c.nom || '').trim().toLowerCase() === clientNom.toLowerCase())
        if (d.sexe && ficheEdit && ficheEdit.sexe !== d.sexe) await updateItem('gym_clients', ficheEdit.id, { sexe: d.sexe })
        // La facture déjà générée à la création garde sinon l'ancien montant — le Dashboard/Facturation (sommes des
        // `gym_factures`) resterait alors désynchronisé. Un abonnement payé en plusieurs fois garde ses montants encaissés.
        const factureLiee = factures.find((f) => f.sourceType === 'abonnement' && f.sourceId === d.id && !f.versement && !f.avoir)
        if (factureLiee) {
          await updateItem('gym_factures', factureLiee.id, {
            date: d.date, clientNom, categorie: d.categorie, modePaiement,
            description: `Abonnement ${categorieLabel(d.categorie)} : jusqu'au ${dateFin}`, ...(partiel ? {} : { montant: total }),
            ...(d.sexe ? { sexe: d.sexe } : {})
          })
        }
        await audit('gym', 'ABONNEMENT_MODIFIE', `${clientNom} : ${categorieLabel(d.categorie)} : ${dateDebut !== d.date ? `du ${dateDebut} ` : ''}jusqu'au ${dateFin} : ${total.toLocaleString('fr-FR')} FCFA`)
        toast.success('Abonnement modifié ✓')
        setModal(null)
        return
      }

      // Fiche client d'abord : l'abonnement et la facture sont rattachés à son identifiant (plus de confusion entre
      // deux clients du même nom, ni de doublon si le nom est mal écrit plus tard). Le répertoire Clients se construit
      // uniquement à partir des séances/abonnements réellement enregistrés. La fiche est rattachée à la salle : le même
      // nom peut exister des deux côtés, chaque salle gardant sa propre clientèle.
      const telephoneSaisi = d.telephone.trim()
      let client = clients.find((c) => (c.nom || '').trim().toLowerCase() === clientNom.toLowerCase())
      let nouveauClient = null
      if (!client) {
        const qrToken = genQrToken()
        const nouveauClientId = await addItem('gym_clients', { nom: clientNom, telephone: telephoneSaisi, sexe: d.sexe, notes: '', site, qrToken, createdAt: Date.now() })
        nouveauClient = { id: nouveauClientId, nom: clientNom, qrToken }
        client = { id: nouveauClientId, nom: clientNom, telephone: telephoneSaisi, sexe: d.sexe }
      } else if ((telephoneSaisi && !client.telephone) || client.sexe !== d.sexe) {
        await updateItem('gym_clients', client.id, {
          ...(telephoneSaisi && !client.telephone ? { telephone: telephoneSaisi } : {}),
          ...(client.sexe !== d.sexe ? { sexe: d.sexe } : {})
        })
      }
      const clientId = client?.id
      const telephone = telephoneSaisi || client?.telephone

      const { coachId, coachNom } = coachDuJour(d.date)
      const id = await addItem('gym_abonnements', {
        date: d.date, dateDebut, dateFin, clientNom, ...(clientId ? { clientId } : {}), sexe: d.sexe, categorie: d.categorie,
        dureeJours: (personnalise || (d.categorie === 'classique' && !classiqueFixe) || estCategoriePerso(d.categorie)) ? Number(d.dureeJours) : null,
        montant: total, modePaiement,
        ...(personnalise ? { motifPrix: d.motifPrix.trim() } : {}),
        notes: d.notes.trim(), site, coachId, coachNom,
        ...(d.renouvelleDe ? { renouvelleDe: d.renouvelleDe } : {}),
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
      })
      await audit('gym', d.renouvelleDe ? 'ABONNEMENT_RENOUVELE' : 'ABONNEMENT_CREATE', `${d.renouvelleDe ? 'Renouvellement : ' : ''}${clientNom} : ${categorieLabel(d.categorie)} : ${dateDebut !== d.date ? `du ${dateDebut} ` : ''}jusqu'au ${dateFin} : ${total.toLocaleString('fr-FR')} FCFA${paye < total ? ` (payé ${paye.toLocaleString('fr-FR')}, reste ${(total - paye).toLocaleString('fr-FR')})` : ''}`)
      // Une facture est TOUJOURS générée (visible dans le volet Facturation, avec son propre bouton de téléchargement). Elle est
      // créée JUSTE après l'abonnement, avant le WhatsApp : si une étape suivante échoue, l'abonnement reste facturé donc compté.
      await genererFactureGym({
        sourceType: 'abonnement', sourceId: id, clientNom, clientId, clientTelephone: telephone,
        categorie: d.categorie, description: `Abonnement ${categorieLabel(d.categorie)} : jusqu'au ${dateFin}${paye < total ? ` (acompte, reste ${formatMoney(total - paye)})` : ''}`, montant: paye,
        user, site, date: d.date, sexe: d.sexe, modePaiement
      })
      // Montant libre : la direction est prévenue, avec le motif donné par l'agent.
      if (personnalise) {
        notify({
          type: 'info', title: `🎚️ Abonnement personnalisé : MAXI-GYM ${site === 'kara' ? 'Kara' : 'Lomé'}`,
          body: `${clientNom} : ${categorieLabel(d.categorie)} : ${formatMoney(total)}. Motif : ${d.motifPrix.trim()}. Par ${user?.nom || user?.login || '—'}.`,
          module: 'gym', site, forRoles: ['info', 'assistant_pau', 'ge', 'pau', 'directeur'], excludeUid: user?.uid, link: `/gym/${site}/abonnements`
        }).catch(() => {})
      }
      if (telephone) {
        const validite = dateDebut !== d.date
          ? `valable du ${formatDateShort(dateDebut)} au ${formatDateShort(dateFin)}`
          : `valable jusqu'au ${formatDateShort(dateFin)}`
        sendWhatsApp([telephone], {
          title: '🎉 MAXI-GYM',
          body: `Bonjour ${clientNom}, votre abonnement ${categorieLabel(d.categorie)} a bien été ${d.renouvelleDe ? 'renouvelé' : 'enregistré'}, ${validite}. Bel abonnement à MAXI-GYM ! 🏋️`
        })
      }
      toast.success(d.renouvelleDe ? 'Abonnement renouvelé ✓' : 'Abonnement enregistré ✓')
      setModal(null)
      // Nouveau client : on propose tout de suite son QR carnet, pendant qu'il
      // est encore devant la réception — masqué tant que QR_CARNET_ACTIF est faux.
      if (nouveauClient && QR_CARNET_ACTIF) setQrNouveauClient(nouveauClient)
    } finally { setSaving(false) }
  }

  // Facture un abonnement existant qui n'en a pas encore (ex. enregistré avant ce
  // changement) — sans re-déclencher le WhatsApp ni recréer le client.
  async function facturer(a) {
    const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === (a.clientNom || '').trim().toLowerCase())
    await genererFactureGym({
      sourceType: 'abonnement', sourceId: a.id, clientNom: a.clientNom, clientId: a.clientId || client?.id, clientTelephone: client?.telephone,
      categorie: a.categorie, description: `Abonnement ${categorieLabel(a.categorie)} : jusqu'au ${a.dateFin}`, montant: a.montant,
      user, site, date: a.date, sexe: sexeDe(a, idxSexe), modePaiement: a.modePaiement || 'especes'
    })
    toast.success('Facture générée ✓')
  }

  async function supprimer(a) {
    // La facture de l'abonnement (et ses éventuels versements) part avec lui : sinon elle resterait comptée dans les totaux.
    const liees = factures.filter((f) => f.sourceType === 'abonnement' && f.sourceId === a.id)
    const mentionFactures = liees.length ? `

Sa facture (${liees.map((f) => f.numero).join(', ')}) sera supprimée aussi : les totaux baisseront de ${formatMoney(liees.reduce((t, f) => t + (Number(f.montant) || 0), 0))}.` : ''
    if (!confirm(`Supprimer l'abonnement de ${a.clientNom} (${categorieLabel(a.categorie)}) ?${mentionFactures}`)) return
    await removeItem('gym_abonnements', a.id)
    for (const f of liees) await removeItem('gym_factures', f.id, { sansMotif: true })
    if (liees.length) await audit('gym', 'FACTURE_SUPPRIMEE', `${liees.map((f) => f.numero).join(', ')} : supprimée avec l'abonnement de ${a.clientNom}`)
    await audit('gym', 'ABONNEMENT_DELETE', `${a.clientNom} : ${categorieLabel(a.categorie)} : ${Number(a.montant).toLocaleString('fr-FR')} FCFA`)
    toast.success('Abonnement supprimé')
  }

  // Pointage d'arrivée — un abonné vient d'arriver à la salle : on l'enregistre (sert
  // à calculer son inactivité pour l'alerte « à relancer » du Dashboard) et on lui
  // souhaite une bonne séance par WhatsApp si son numéro est connu. `date` par défaut
  // = aujourd'hui (bouton rapide de la liste), mais peut être une date passée — en
  // cliquant sur un jour du calendrier rapide (cf. modale « Calendrier », plus bas) —
  // pour corriger un oubli de pointage (ex. client venu hier).
  const [pointageBusy, setPointageBusy] = useState(null)
  async function pointerArrivee(a, date = todayStr()) {
    const dejaPointe = allPresences.some((p) =>
      matchSite(p, site) && p.date === date && (p.clientNom || '').trim().toLowerCase() === (a.clientNom || '').trim().toLowerCase()
    )
    if (dejaPointe) { toast.error(`${a.clientNom} est déjà pointé(e) pour le ${formatDateShort(date)}`); return }
    setPointageBusy(a.id)
    try {
      await addItem('gym_presences', {
        clientNom: a.clientNom, ...(a.clientId ? { clientId: a.clientId } : {}), abonnementId: a.id, date, createdAt: Date.now(), site,
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null
      })
      await audit('gym', 'PRESENCE_POINTEE', `${a.clientNom} : arrivée pointée (${formatDateShort(date)})`)
      const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === (a.clientNom || '').trim().toLowerCase())
      if (client?.telephone && date === todayStr()) {
        sendWhatsApp([client.telephone], {
          title: '🏋️ MAXI-GYM',
          body: `Bonjour ${a.clientNom}, bonne séance à MAXI-GYM aujourd'hui ! 💪`
        })
      }
      toast.success(date === todayStr() ? 'Arrivée pointée ✓' : `Arrivée du ${formatDateShort(date)} pointée ✓`)
      setDateSelectionnee(null)
    } finally {
      setPointageBusy(null)
    }
  }

  // Annulation d'un pointage — ex. jour coché par erreur : on retire l'enregistrement
  // de présence de ce client pour cette date précise (accessible depuis le calendrier
  // rapide, en cliquant sur un jour déjà pointé).
  async function annulerPointage(a, date) {
    const presence = allPresences.find((p) =>
      matchSite(p, site) && p.date === date && (p.clientNom || '').trim().toLowerCase() === (a.clientNom || '').trim().toLowerCase()
    )
    if (!presence) return
    if (!window.confirm(`Annuler le pointage de ${a.clientNom} du ${formatDateShort(date)} ?`)) return
    setPointageBusy(a.id)
    try {
      await removeItem('gym_presences', presence.id)
      await audit('gym', 'PRESENCE_ANNULEE', `${a.clientNom} : pointage du ${formatDateShort(date)} annulé`)
      toast.success('Pointage annulé ✓')
      setDateSelectionnee(null)
    } finally {
      setPointageBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #E8850Fe6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <CreditCard size={28} color="white" />
        </div>
        <div className="min-w-[11rem] flex-1">
          <h2 className="text-lg font-extrabold">Abonnements</h2>
          <p className="text-sm text-white/80">{listeClients.length} abonné(s){liste.length !== listeClients.length ? ` · ${liste.length} abonnement(s)` : ''} : {formatMoney(total)} au total</p>
        </div>
        {/* Filtre de période directement dans le bandeau (glassmorphism). */}
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
        <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un client…" />
        <SexeFiltre value={filtreSexe} onChange={setFiltreSexe} inconnus={nbInconnus} />
        {canExportGym(role) && (
          <button onClick={exportXLSX}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/30 bg-white/15 px-3 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25">
            <FileSpreadsheet size={14} /> Export Excel
          </button>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {!lectureSeule && <BoutonGym variante="ajouter" icone={CreditCard} animation="carte" badgePlus onClick={() => setModal(vide())}>Nouvel abonnement</BoutonGym>}
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'date', label: 'Souscrit le', render: (r) => formatDateShort(r.date) },
            { key: 'dateDebut', label: 'Début', render: (r) => {
              const deb = r.dateDebut || r.date
              return <span className={deb > todayStr() ? 'font-semibold text-sky-600' : ''}>{formatDateShort(deb)}</span>
            } },
            { key: 'clientNom', label: 'Client', render: (r) => {
              const n = nbParClient.get(cleNom(r.clientNom)) || 1
              return (
                <div className="flex flex-col items-start gap-1">
                  <span className="whitespace-nowrap">{r.clientNom}</span>
                  <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap empty:hidden">
                  {(passagesParClient.get(cleNom(r.clientNom)) || 0) > 0 && <span title="Arrivées pointées : cliquez sur la ligne pour le détail" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-extrabold text-orange-700"><Dumbbell size={10} /> {passagesParClient.get(cleNom(r.clientNom))} passage{passagesParClient.get(cleNom(r.clientNom)) > 1 ? 's' : ''}</span>}
                  {n > 1 && <span title={`${n} abonnements enregistrés : voir la fiche du client`} className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700"><Repeat size={10} /> ×{n - 1}</span>}
                  </div>
                </div>
              )
            } },
            { key: 'sexe', label: 'Sexe', align: 'center', render: (r) => <SexeBadge sexe={sexeDe(r, idxSexe)} /> },
            { key: 'categorie', label: 'Catégorie', render: (r) => <Badge tone={categorieTone(r.categorie)}>{categorieLabel(r.categorie)}</Badge> },
            { key: 'dateFin', label: 'Fin', render: (r) => r.dateFin ? formatDateShort(r.dateFin) : '—' },
            { key: 'reste', label: 'Jours restants', render: (r) => <JoursRestants dateFin={r.dateFin} dateDebut={r.dateDebut} /> },
            { key: 'statut', label: 'Statut', render: (r) => {
              const st = statutAbonnement(r.dateDebut, r.dateFin)
              return <Badge tone={st.tone}>{st.label}</Badge>
            } },
            { key: 'montant', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.montant)}</strong> },
            { key: 'derniereArrivee', label: 'Dernière arrivée', render: (r) => {
              if (!abonnementActif(r.dateFin, r.dateDebut)) return '—'
              const derniere = dernierePresenceParClient.get((r.clientNom || '').trim().toLowerCase())
              const jours = joursDepuis(derniere)
              if (jours == null) return <span className="text-gray-400">Jamais pointée</span>
              return <Badge tone={jours >= 7 ? 'danger' : 'success'}>{jours === 0 ? "Aujourd'hui" : jours === 1 ? 'Hier' : `Il y a ${jours} j`}</Badge>
            } },
            { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
            { key: 'enregistrePar', label: 'Enregistré par' },
            { key: 'actions', label: '', align: 'right', render: (r) => {
              const dejaFacturee = factures.some((f) => f.sourceType === 'abonnement' && f.sourceId === r.id)
              const estDernier = dernierParClient.get(cleNom(r.clientNom))?.id === r.id
              const dossier = (peutPurger && estDernier) ? dossierClient({ nom: r.clientNom, site, clients, abonnements, seances, presences }) : null
              const termine = dossier && dossierTermine(dossier, params.validiteSeanceHeures)
              return (
                <div className="flex justify-end gap-1">
                  {!lectureSeule && estDernier && peutRenouveler(r.dateFin) && <BoutonRenouveler compact onClick={() => setModal(renouveler(r))} />}
                  {!lectureSeule && abonnementActif(r.dateFin, r.dateDebut) && (
                    <BoutonPointer onClick={() => pointerArrivee(r)} disabled={pointageBusy === r.id} />
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setDateSelectionnee(null); setCalendrierClient(r) }} title="Voir le calendrier de présence : et corriger un pointage oublié"
                    className="rounded p-1.5 text-sky-600 hover:bg-sky-50"><CalendarDays size={16} /></button>
                  {!lectureSeule && !dejaFacturee && (
                    <button onClick={(e) => { e.stopPropagation(); facturer(r) }} title="Générer la facture manquante"
                      className="rounded p-1.5 text-amber-600 hover:bg-amber-50"><Receipt size={16} /></button>
                  )}
                  {!lectureSeule && <button onClick={(e) => { e.stopPropagation(); setModal(remplir(r)) }} title="Modifier" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>}
                  {peutSupprimer && (
                    <button onClick={(e) => { e.stopPropagation(); supprimer(r) }} title="Supprimer" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                  )}
                  {termine && (
                    <button onClick={(e) => { e.stopPropagation(); setPurge(dossier) }} title="Abonnement terminé : supprimer totalement ce client de la base"
                      className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:bg-red-100"><Eraser size={16} /></button>
                  )}
                </div>
              )
            } }
          ]}
          rows={listeClients}
          onRowClick={(r) => setClientDetail(r.clientNom)}
          empty="Aucun abonnement enregistré."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier l\'abonnement' : modal?.renouvellement ? 'Renouveler l\'abonnement' : 'Nouvel abonnement'}
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<>
          <BoutonGym variante="secondaire" icone={X} onClick={() => setModal(null)} disabled={saving}>Annuler</BoutonGym>
          <BoutonGym icone={modal?.renouvellement ? Repeat : CheckCircle2} onClick={enregistrer} loading={saving}>
            {modal?.id ? 'Enregistrer les modifications' : modal?.renouvellement ? 'Renouveler' : 'Enregistrer'}
          </BoutonGym>
        </>}>
        {modal && (() => {
          const libre = modal.categorie === 'classique' && !classiqueFixe
          const tarifPlancher = libre ? null : tarifs[modal.categorie]
          const prixFixe = modal.categorie !== 'perso' && tarifPlancher > 0 // seul « Personnalisé » a un montant libre
          const differe = (modal.dateDebut || modal.date) > todayStr()
          const entree = (i) => ({ animation: `ab-entree 0.4s ease-out ${i * 0.06}s both` })
          return (
          <div className="space-y-3">
            <style>{`
              @keyframes ab-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
              @keyframes ab-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
              @keyframes ab-pop { 0% { transform: scale(0.94); } 60% { transform: scale(1.05); } 100% { transform: scale(1); } }
              @keyframes ab-reflet { 0% { transform: translateX(-120%) skewX(-12deg); } 100% { transform: translateX(520%) skewX(-12deg); } }
              @keyframes ab-montant { 0% { transform: scale(0.96); opacity: 0.6; } 100% { transform: scale(1); opacity: 1; } }
            `}</style>

            {/* Héro en verre : icône 3D qui flotte, reflet qui passe de temps en temps. */}
            <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(166,52,42,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl"
              style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)`, animation: 'ab-entree 0.35s ease-out both' }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-white/25 blur-md" style={{ animation: 'ab-reflet 4.5s ease-in-out 1s infinite' }} />
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),inset_0_-3px_5px_rgba(0,0,0,0.2),0_10px_20px_-8px_rgba(0,0,0,0.5)] backdrop-blur-sm">
                {modal.renouvellement ? <Repeat size={26} style={{ animation: 'ab-flotte 2.8s ease-in-out infinite' }} /> : <CreditCard size={26} style={{ animation: 'ab-flotte 2.8s ease-in-out infinite' }} />}
              </span>
              <div className="relative min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{modal.clientNom || (modal.id ? 'Modifier l\'abonnement' : 'Nouvel abonnement')}</p>
                <p className="text-sm text-white/85">
                  {modal.renouvellement ? 'Renouvellement : le client n\'est pas réinscrit' : libre ? 'Durée libre : définie à la saisie' : 'Durée par défaut : 1 mois calendaire, modifiable'}
                </p>
              </div>
            </div>

            {/* Bento : chaque information dans sa tuile de verre. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2" style={entree(1)}>
                <FormGroup label={<Etiq icone={User} couleur="#7c3aed">Client</Etiq>} required className="!mb-0">
                  <div className="relative">
                    <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input value={modal.clientNom} className="pl-8" disabled={!!modal.renouvellement}
                      onChange={(e) => {
                        const nom = e.target.value
                        const fiche = clients.find((c) => (c.nom || '').trim().toLowerCase() === nom.trim().toLowerCase())
                        setModal((f) => ({ ...f, clientNom: nom, ...(fiche?.sexe ? { sexe: fiche.sexe } : {}) }))
                        setSuggClient(true)
                      }}
                      onFocus={() => setSuggClient(true)}
                      onBlur={() => setTimeout(() => setSuggClient(false), 150)}
                      placeholder="Nom du client" autoComplete="off" />
                    {suggClient && modal.clientNom.trim() && (() => {
                      const q = modal.clientNom.trim().toLowerCase()
                      const suggestions = clients.filter((c) => (c.nom || '').toLowerCase().includes(q) && (c.nom || '').toLowerCase() !== q).slice(0, 5)
                      return suggestions.length > 0 ? (
                        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/70 bg-white/90 shadow-lg backdrop-blur-xl">
                          {suggestions.map((c) => (
                            <button key={c.id} type="button"
                              onMouseDown={() => { setModal((f) => ({ ...f, clientNom: c.nom, telephone: c.telephone || f.telephone, sexe: c.sexe || f.sexe })); setSuggClient(false) }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-orange-50">
                              <span className="font-semibold text-gray-700">{c.nom}</span>
                              {c.telephone && <span className="text-xs text-gray-400">· {c.telephone}</span>}
                            </button>
                          ))}
                        </div>
                      ) : null
                    })()}
                  </div>
                </FormGroup>
              </div>

              <div className={!modal.id && !modal.renouvellement ? '' : 'col-span-2'} style={entree(2)}>
                <FormGroup label={<Etiq icone={Users} couleur="#ec4899">Sexe</Etiq>} required={!modal.id} className="!mb-0" hint="Pour suivre la proportion de femmes et d'hommes">
                  <SexeBoutons value={modal.sexe} onChange={(v) => setModal((f) => ({ ...f, sexe: v }))} />
                </FormGroup>
              </div>
              {!modal.id && !modal.renouvellement && (
                <div style={entree(3)}>
                  <FormGroup label={<Etiq icone={MessageCircle} couleur="#16a34a">Téléphone</Etiq>} className="!mb-0" hint="Optionnel : confirmation WhatsApp">
                    <div className="relative">
                      <MessageCircle size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-green-500" />
                      <Input className="pl-8" value={modal.telephone} onChange={(e) => setModal((f) => ({ ...f, telephone: e.target.value }))} placeholder="ex : 22890000000" />
                    </div>
                  </FormGroup>
                </div>
              )}

              {/* Catégorie : trois cartes en verre avec icône 3D ; la choisie se teinte et fait un petit « pop ». */}
              <div className="col-span-2" style={entree(4)}>
                <FormGroup label={<Etiq icone={Tag} couleur="#0ea5e9">Catégorie</Etiq>} className="!mb-0" hint={categorieDesc(modal.categorie)}>
                  <div className="grid grid-cols-3 gap-2">
                    {[CATEGORIES_GYM.find((x) => x.id === 'simple'), CATEGORIE_PERSO, CATEGORIES_GYM.find((x) => x.id === 'vip')].map((c) => {
                      const actif = modal.categorie === c.id
                      const coul = COULEUR_CATEGORIE[c.id]
                      const Ic = ICONE_CATEGORIE[c.id]
                      const tarif = tarifs[c.id]
                      return (
                        <button key={c.id} type="button" onClick={() => {
                          setModal((f) => {
                            const dureeJours = dureeJoursInitiale(c.id, f.dateDebut || f.date, classiqueFixe, dureeMin)
                            if (c.id === 'perso') return appliquerPeriode({ ...f, categorie: 'perso', montant: '' }, f.unite || 'mois', Number(f.quantite) || 1)
                            return recalculerDateFin({ ...f, categorie: c.id, dureeJours, montant: tarif != null ? String(tarif) : f.montant })
                          })
                        }}
                          className={`group relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl border px-2 py-2.5 text-xs font-extrabold backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${actif ? 'border-white/60 text-white shadow-[0_12px_22px_-10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.5)]' : 'border-white/70 bg-white/60 text-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] hover:bg-white/85'}`}
                          style={actif ? { background: `linear-gradient(135deg, ${coul}, ${coul}cc)`, animation: 'ab-pop 0.3s ease-out' } : undefined}>
                          {actif && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />}
                          <span className="relative flex h-8 w-8 items-center justify-center rounded-xl" style={actif ? { background: 'rgba(255,255,255,0.25)', boxShadow: 'inset 0 2px 2px rgba(255,255,255,0.5), inset 0 -2px 4px rgba(0,0,0,0.2)' } : icone3D(coul)}>
                            <Ic size={16} className="transition-transform duration-300 group-hover:scale-110" />
                          </span>
                          <span className="relative">{c.label}</span>
                          {tarif != null && tarif > 0 && <span className={`relative text-[10px] font-semibold ${actif ? 'text-white/85' : 'text-gray-400'}`}>{formatMoney(tarif)}</span>}
                          {c.id === 'perso' && <span className={`relative text-[10px] font-semibold ${actif ? 'text-white/85' : 'text-gray-400'}`}>Libre</span>}
                        </button>
                      )
                    })}
                  </div>
                </FormGroup>
              </div>

              {modal.categorie === 'perso' && (
                <div className="col-span-2" style={entree(4.5)}>
                  <FormGroup label={<Etiq icone={Hourglass} couleur="#8b5cf6">Type d'abonnement</Etiq>} required className="!mb-0"
                    hint={modal.unite ? `= ${modal.dureeJours} jour${Number(modal.dureeJours) > 1 ? 's' : ''}${modal.dateFin ? `, jusqu'au ${formatDateShort(modal.dateFin)}` : ''}` : 'Durée saisie à la main ci-dessous.'}>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Commutateur compact : trois segments en verre, celui choisi se teinte et fait un petit « pop ». */}
                      <div className="inline-flex gap-0.5 rounded-xl border border-white/70 bg-white/50 p-0.5 shadow-inner backdrop-blur-md">
                        {UNITES_PERIODE.map((u) => {
                          const actif = modal.unite === u.id
                          const Ic = u.icone
                          return (
                            <button key={u.id} type="button" onClick={() => setModal((f) => appliquerPeriode(f, u.id, Number(f.quantite) || 1))} aria-pressed={actif}
                              className={`group relative inline-flex items-center gap-1 overflow-hidden rounded-[10px] px-2.5 py-1 text-xs font-extrabold transition-all duration-200 active:scale-95 ${actif ? 'text-white shadow-[0_6px_12px_-6px_rgba(109,40,217,0.8),inset_0_1px_0_rgba(255,255,255,0.45)]' : 'text-gray-500 hover:bg-white/80 hover:text-violet-700'}`}
                              style={actif ? { background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', animation: 'ab-pop 0.3s ease-out' } : undefined}>
                              {actif && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />}
                              {/* Petit voyant : éteint (gris) tant que le segment n'est pas choisi, allumé et qui respire une fois choisi. */}
                              <span aria-hidden="true" className={`relative h-1.5 w-1.5 shrink-0 rounded-full transition-all ${actif ? 'animate-pulse bg-white shadow-[0_0_6px_2px_rgba(255,255,255,0.95)]' : 'bg-gray-300'}`} />
                              <Ic size={12} className="relative transition-transform duration-300 group-hover:scale-110" />
                              <span className="relative">{u.label}</span>
                              {actif && <Check size={12} strokeWidth={3} className="relative" style={{ animation: 'ab-pop 0.3s ease-out' }} />}
                            </button>
                          )
                        })}
                      </div>
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500">
                        Nombre
                        <input type="number" min="1" inputMode="numeric" aria-label="Nombre de périodes" value={modal.quantite || ''} placeholder="1"
                          className="w-14 rounded-lg border border-white/80 bg-white/80 px-2 py-1 text-center text-xs font-extrabold text-gray-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
                          onChange={(e) => setModal((f) => { const n = Math.max(1, parseInt(e.target.value, 10) || 1); return appliquerPeriode(f, f.unite || 'mois', e.target.value === '' ? 1 : n) })} />
                      </span>
                    </div>
                  </FormGroup>
                </div>
              )}

              <div style={entree(5)}>
                <FormGroup label={<Etiq icone={CalendarDays} couleur="#f59e0b">Souscription</Etiq>} className="!mb-0" hint="Jour de l'enregistrement : compte dans le chiffre d'affaires du mois.">
                  <Input type="date" value={modal.date} onChange={(e) => setModal((f) => {
                    // Tant que la date de début n'a pas été fixée à part, elle suit la souscription.
                    const next = { ...f, date: e.target.value }
                    if (!f.dateDebutManuelle) next.dateDebut = e.target.value
                    return recalculerDateFin(next)
                  })} />
                </FormGroup>
              </div>
              <div style={entree(6)}>
                <FormGroup label={<Etiq icone={CalendarCheck} couleur="#0d9488">Début</Etiq>} required className="!mb-0"
                  hint={modal.dateDebutManuelle ? 'Le client commence à cette date.' : 'Par défaut le jour de la souscription.'}>
                  <div className="flex items-center gap-2">
                    <Input type="date" value={modal.dateDebut || modal.date} min={modal.date}
                      onChange={(e) => setModal((f) => { const g = { ...f, dateDebut: e.target.value, dateDebutManuelle: true }; return f.categorie === 'perso' && f.unite ? appliquerPeriode(g, f.unite, Number(f.quantite) || 1) : recalculerDateFin(g) })} />
                    {modal.dateDebutManuelle && (
                      <button type="button" title="Revenir au jour même" onClick={() => setModal((f) => recalculerDateFin({ ...f, dateDebut: f.date, dateDebutManuelle: false }))}
                        className="shrink-0 rounded-lg border border-white/70 bg-white/70 px-2 py-2 text-xs font-semibold text-gray-500 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white">🔄</button>
                    )}
                  </div>
                </FormGroup>
              </div>
              {differe && (
                <p className="col-span-2 rounded-xl border border-sky-200/80 bg-sky-50/80 px-3 py-1.5 text-xs font-semibold text-sky-700 backdrop-blur-md" style={{ animation: 'ab-entree 0.3s ease-out both' }}>
                  ⏳ Démarrage différé : l'abonnement sera « À venir » puis « Actif » le {formatDateShort(modal.dateDebut || modal.date)}.
                </p>
              )}

              <div style={entree(7)}>
                <FormGroup label={<Etiq icone={Hourglass} couleur="#8b5cf6">Durée (jours)</Etiq>} required={libre || modal.categorie === 'perso'} className="!mb-0"
                  hint={modal.categorie === 'perso' ? 'Libre : 7 = une semaine, 30 = un mois, 90 = trois mois.' : libre ? `Minimum ${dureeMin} jour${dureeMin > 1 ? 's' : ''}. 7 = une semaine, 14 = deux semaines.` : 'Un mois calendaire par défaut, modifiable.'}>
                  <Input type="number" min={libre ? dureeMin : 1} value={modal.dureeJours}
                    onChange={(e) => setModal((f) => recalculerDateFin(f.categorie === 'perso' ? { ...f, dureeJours: e.target.value, unite: null, quantite: '', categorieNom: Number(e.target.value) > 0 ? `${Number(e.target.value)} jour${Number(e.target.value) > 1 ? 's' : ''}` : '' } : { ...f, dureeJours: e.target.value }))}
                    placeholder={libre ? `ex : ${dureeMin}` : 'ex : 30'} />
                </FormGroup>
              </div>
              <div style={entree(8)}>
                <FormGroup label={<Etiq icone={Flag} couleur="#dc2626">Fin</Etiq>} required className="!mb-0"
                  hint={modal.dateFinManuelle ? 'Corrigée à la main.' : 'Calculée automatiquement, modifiable.'}>
                  <div className="flex items-center gap-2">
                    <Input type="date" value={modal.dateFin}
                      onChange={(e) => setModal((f) => ({ ...f, dateFin: e.target.value, dateFinManuelle: true }))} />
                    {modal.dateFinManuelle && (
                      <button type="button" title="Recalculer la date de fin" onClick={() => setModal((f) => recalculerDateFin({ ...f, dateFinManuelle: false }))}
                        className="shrink-0 rounded-lg border border-white/70 bg-white/70 px-2 py-2 text-xs font-semibold text-gray-500 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white">🔄</button>
                    )}
                  </div>
                </FormGroup>
              </div>

              <div className="col-span-2" style={entree(9)}>
                <FormGroup label={<Etiq icone={Wallet} couleur="#16a34a">Montant (FCFA)</Etiq>} required className="!mb-0"
                  hint={modal.categorie === 'perso' ? 'Montant libre : à fixer pour cet abonnement.' : prixFixe ? 'Tarif fixe de la catégorie (Paramètres) : non modifiable.' : undefined}>
                  <Input type="number" min={tarifPlancher || 0} value={modal.montant} placeholder="ex : 15000" readOnly={prixFixe} className={prixFixe ? 'cursor-not-allowed bg-gray-100/80 font-bold text-gray-600' : ''}
                    onChange={(e) => setModal((f) => ({ ...f, montant: e.target.value }))} />
                </FormGroup>
              </div>
              <div className="col-span-2" style={entree(9.6)}>
                <FormGroup label={<Etiq icone={Wallet} couleur="#f59e0b">Mode de paiement</Etiq>} className="!mb-0" hint="Espèces ou Mobile Money">
                  <ModesPaiement value={modal.modePaiement} onChange={(m) => setModal((f) => ({ ...f, modePaiement: m }))} />
                </FormGroup>
              </div>
              {modal.categorie === 'perso' && (
                <div className="col-span-2" style={entree(9.8)}>
                  <FormGroup label={<Etiq icone={SlidersHorizontal} couleur="#8b5cf6">Motif du montant</Etiq>} required className="!mb-0" hint="Obligatoire : la direction est prévenue de ce montant libre.">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {['Étudiant', 'Couple', 'Tarif négocié', 'Offre / promotion', 'Parrainage'].map((m) => (
                        <button key={m} type="button" onClick={() => setModal((f) => ({ ...f, motifPrix: m }))}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all hover:-translate-y-0.5 ${modal.motifPrix === m ? 'border-transparent text-white shadow-md' : 'border-gray-200 bg-white text-gray-600'}`}
                          style={modal.motifPrix === m ? { background: '#8b5cf6' } : undefined}>{m}</button>
                      ))}
                    </div>
                    <Input value={modal.motifPrix || ''} placeholder="ou précisez le motif" onChange={(e) => setModal((f) => ({ ...f, motifPrix: e.target.value }))} />
                  </FormGroup>
                </div>
              )}
              <div className="col-span-2" style={entree(10)}>
                <FormGroup label={<Etiq icone={StickyNote} couleur="#64748b">Notes</Etiq>} className="!mb-0" hint="Optionnel">
                  <Input value={modal.notes} onChange={(e) => setModal((f) => ({ ...f, notes: e.target.value }))} />
                </FormGroup>
              </div>
            </div>

            {/* Résumé en verre : confirmation visuelle avant validation (fond assez opaque pour rester lisible). */}
            <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-3.5 py-3 shadow-[0_12px_24px_-14px_rgba(166,52,42,0.45),inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur-xl" style={entree(11)}>
              <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-gray-600">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={icone3D('#7c3aed')}><User size={14} /></span>
                <span className="truncate">{modal.clientNom || 'Client à saisir'}</span>
                <Badge tone={modal.categorie === 'perso' ? 'primary' : categorieTone(modal.categorie)}>{modal.categorie === 'perso' ? ((modal.categorieNom || '').trim() || 'Personnalisé') : categorieLabel(modal.categorie)}</Badge>
              </div>
              <span key={modal.montant} className="shrink-0 text-lg font-black" style={{ color: COULEUR2, animation: 'ab-montant 0.25s ease-out' }}>{formatMoney(Number(modal.montant) || 0)}</span>
              <span className="w-full shrink-0 text-[11px] text-gray-500">
                {(modal.dateDebut || modal.date) !== modal.date
                  ? `Du ${formatDateShort(modal.dateDebut)} au ${formatDateShort(modal.dateFin)}`
                  : `Jusqu'au ${formatDateShort(modal.dateFin)}`}
              </span>
            </div>

            {!modal.id && (
              <p className="text-[11px] text-gray-400">🧾 Une facture sera générée automatiquement : téléchargeable depuis le volet Facturation.</p>
            )}
          </div>
          )
        })()}
      </Modal>

      <ClientDetailModal clientNom={clientDetail} onClose={() => setClientDetail(null)}
        clients={clients} seances={seances} abonnements={abonnements} presences={presences}
        onRenouveler={(a) => { setClientDetail(null); setModal(renouveler(a)) }} />
      <PurgeClientModal dossier={purge} onClose={() => setPurge(null)} />
      <QrCarnetModal client={qrNouveauClient} onClose={() => setQrNouveauClient(null)} />

      {/* Calendrier rapide — accessible sans ouvrir la fiche complète du client, pour
          un coup d'œil pendant le pointage à l'accueil. Interactif si l'abonnement est
          actif : cliquer sur un jour passé (ou aujourd'hui) le sélectionne, puis
          « Pointer » l'enregistre — sert à corriger un oubli de pointage. */}
      <Modal open={!!calendrierClient} onClose={() => { setCalendrierClient(null); setDateSelectionnee(null) }}
        title={calendrierClient ? `Calendrier : ${calendrierClient.clientNom}` : ''}
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<>
          <Button variant="outline" onClick={() => { setCalendrierClient(null); setDateSelectionnee(null) }}>Fermer</Button>
          {calendrierClient && abonnementActif(calendrierClient.dateFin, calendrierClient.dateDebut) && (() => {
            const dejaPointe = !!dateSelectionnee && presences.some((p) =>
              p.date === dateSelectionnee && (p.clientNom || '').trim().toLowerCase() === calendrierClient.clientNom.trim().toLowerCase()
            )
            // Annuler un pointage = suppression d'un enregistrement : réservé à
            // l'administration et à Info (comme tous les boutons de suppression).
            if (dejaPointe) {
              return peutSupprimer ? (
                <Button variant="danger" onClick={() => annulerPointage(calendrierClient, dateSelectionnee)}
                  loading={pointageBusy === calendrierClient.id}>
                  <Trash2 size={15} /> Annuler le pointage{dateSelectionnee !== todayStr() ? ` : ${formatDateShort(dateSelectionnee)}` : ''}
                </Button>
              ) : (
                <span className="text-xs text-gray-400">Pointé : l'annulation est réservée à l'administration</span>
              )
            }
            return (
              <Button onClick={() => pointerArrivee(calendrierClient, dateSelectionnee)}
                disabled={!dateSelectionnee} loading={pointageBusy === calendrierClient.id}>
                <CheckCircle2 size={15} /> Pointer{dateSelectionnee && dateSelectionnee !== todayStr() ? ` : ${formatDateShort(dateSelectionnee)}` : ''}
              </Button>
            )
          })()}
        </>}>
        {calendrierClient && (() => {
          const pointagesClient = presences.filter((p) =>
            (p.clientNom || '').trim().toLowerCase() === calendrierClient.clientNom.trim().toLowerCase() && (p.date || '').startsWith(moisEnCours))
          // Heure d'arrivée affichée directement sur le jour concerné du calendrier.
          const details = Object.fromEntries(pointagesClient.filter((p) => p.createdAt).map((p) => [p.date, heureCourte(new Date(p.createdAt))]))
          const interactif = abonnementActif(calendrierClient.dateFin, calendrierClient.dateDebut)
          return (
            <>
              <CalendrierPresences mois={moisEnCours} joursPresents={pointagesClient.map((p) => p.date)} details={details}
                onDayClick={interactif ? setDateSelectionnee : undefined} selectedDate={dateSelectionnee} />
              {interactif && (
                <p className="mt-2 text-center text-[11px] text-gray-400">
                  {dateSelectionnee
                    ? `Jour sélectionné : ${formatDateShort(dateSelectionnee)} : pointe une arrivée oubliée, ou annule un pointage fait par erreur.`
                    : "Clique sur un jour (passé ou aujourd'hui) pour pointer une arrivée oubliée, ou annuler un pointage par erreur."}
                </p>
              )}
            </>
          )
        })()}
      </Modal>
    </div>
  )
}

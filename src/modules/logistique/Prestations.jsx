// Prestations / Location de matériel — quantité × tarif unitaire = montant par catégorie.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Eye, Trash2, Pencil, CheckCircle2, Coins, Save, Wallet, AlertTriangle, ClipboardList, Boxes, Receipt, Sparkles, CalendarRange, Layers, UserRound, Send, Ban } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import ActionIcone from '../../shared/ui/ActionIcone'
import FacturerSortieModal, { facturerEtDemander } from './FacturerSortieModal'
import AvatarNom from '../../shared/ui/AvatarNom'
import NumDoc from '../../shared/ui/NumDoc'
import StatCard from '../../shared/ui/StatCard'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useLogistiqueStore } from './store/referentielStore'
import { addItem, updateItem, removeItem, getAll } from '../../core/db'
import { demanderMotif } from '../../core/motifSuppression'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, addDays, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'
import { isReadOnlyRole, isFullAccessRole, logistiqueVoitMontants, logistiqueVoitValidateur, canViewFinance } from '../../core/roles'
import { glassModalProps, COULEUR_MODULE, icone3D } from '../../utils/color'
import FicheDetail from '../../shared/ui/FicheDetail'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { FX_STYLES, TitreSection, BoutonAjout, TypeHero, TypeBoutons, ChipsEvenement, PrestationHero } from './PrestationFormUI'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { catColor } from './data'
import { nbJoursInclus, dernierStock } from './logic'
import { useSite, matchSite, siteLabel } from './site/useSite'

const STATUTS = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  facturee: { label: 'Facturée', tone: 'info' },
  en_cours: { label: 'En location', tone: 'warning' },
  terminee: { label: 'Terminée', tone: 'success' },
  annulee: { label: 'Annulée', tone: 'danger' }
}

// Rappel visuel : une prestation dont la période est terminée depuis plus de
// SEUIL_RELANCE_JOURS jours mais jamais facturée (statut toujours brouillon) —
// pour repérer d'un coup d'œil celles qu'on a oublié de facturer, sans attendre
// de tomber dessus par hasard. Indépendant du statut d'approbation ou de retour
// du matériel : ce qui compte ici, c'est seulement « la période est passée et
// personne n'a émis la facture ».
const SEUIL_RELANCE_JOURS = 2
const factureEnRetard = (p) => p.statut === 'brouillon' && !!p.dateFin && p.dateFin < addDays(todayStr(), -SEUIL_RELANCE_JOURS)

export default function Prestations() {
  const { user, role } = useAuth()
  const site = useSite()
  // La secrétaire voit désormais les montants de location (accès explicitement
  // accordé) mais pas qui a approuvé la prestation (cf. `voitValidateur`).
  const voitMontants = logistiqueVoitMontants(role)
  const voitValidateur = logistiqueVoitValidateur(role)
  const estAdministration = canViewFinance(role)
  const { data: allPrestations } = useCollection('logistique_prestations')
  const { data: clients } = useCollection('logistique_clients')
  const { data: facturesTout } = useCollection('logistique_factures')
  const { data: demandesTout } = useCollection('logistique_demandes')
  const { data: allInventaires } = useCollection('logistique_inventaires')
  // Suggestions : les fiches strictement identiques (même nom, même téléphone) ne comptent qu'une fois.
  const clientsUniques = useMemo(() => {
    const vus = new Map()
    clients.forEach((x) => {
      const k = `${(x.nom || '').trim().toLowerCase()}|${(x.telephone || '').replace(/ /g, '')}`
      if (!vus.has(k)) vus.set(k, x)
    })
    return [...vus.values()]
  }, [clients])
  const { data: allRetours } = useCollection('logistique_retours')
  const materiel = useLogistiqueStore((s) => s.materiel)
  const evenements = useLogistiqueStore((s) => s.evenements)
  const saveEvenements = useLogistiqueStore((s) => s.saveEvenements)

  // Cloisonnement par site (sous-application Lomé / Kara).
  const prestations = useMemo(() => allPrestations.filter((p) => matchSite(p, site)), [allPrestations, site])
  const inventaires = useMemo(() => allInventaires.filter((i) => matchSite(i, site)), [allInventaires, site])
  const retours = useMemo(() => allRetours.filter((r) => matchSite(r, site)), [allRetours, site])

  // Retours enregistrés par prestation (pour l'état « retour OK / en attente »).
  const retoursParPresta = useMemo(() => {
    const map = {}
    retours.forEach((r) => {
      if (!r.prestationId) return
      ;(map[r.prestationId] = map[r.prestationId] || []).push(r)
    })
    return map
  }, [retours])

  // État opérationnel dérivé d'une prestation (dates + retours), au-delà du statut brut.
  function statutOp(p) {
    if (p.statut === 'annulee') return { label: 'Annulée', tone: 'danger' }
    const rets = retoursParPresta[p.id] || []
    const pris = (p.lignes || []).filter((l) => l.materielId).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
    const rendu = rets.reduce((s, r) => s + (parseInt(r.qte) || 0), 0)
    const today = todayStr()
    if (pris > 0 && rendu >= pris) return { label: 'Terminée : retour OK', tone: 'success' }
    if (today < (p.dateDebut || '')) return { label: 'À venir', tone: 'info' }
    if (today <= (p.dateFin || '')) return { label: 'En cours', tone: 'warning' }
    return { label: 'Terminée : retour en attente', tone: 'neutral' }
  }
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [facturer, setFacturer] = useState(null) // prestation à facturer + demander la sortie
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(null)
  // Édition « plus tard » des dépenses internes depuis la fiche de détail.
  const [depLater, setDepLater] = useState([])
  const [depSaving, setDepSaving] = useState(false)
  useEffect(() => { setDepLater(detail?.depenses ? detail.depenses.map((x) => ({ ...x })) : []) }, [detail])

  async function saveDepensesLater() {
    if (!detail) return
    const clean = depLater
      .filter((x) => (parseFloat(x.montant) || 0) > 0)
      .map((x) => ({ label: (x.label || 'Dépense').trim(), montant: parseFloat(x.montant) || 0 }))
    setDepSaving(true)
    try {
      await updateItem('logistique_prestations', detail.id, { depenses: clean })
      await audit('logistique', 'PRESTATION_DEPENSES', `${detail.num} : ${clean.length} dépense(s)`)
      setDetail((d) => (d ? { ...d, depenses: clean } : d))
      toast.success('Dépenses enregistrées ✓')
    } catch (e) { toast.error(e.message) } finally { setDepSaving(false) }
  }

  // Filtre de période fusionné (Jour / Mois) — même composant que Facturation et
  // Sources de revenus (E-DÉPENSES), pour rester directement comparable.
  const [modePeriode, setModePeriode] = useState('jour')
  const [filtreJour, setFiltreJour]   = useState('')
  const [filtreMois, setFiltreMois]   = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin]     = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreClient, setFiltreClient] = useState('')
  const filtrePeriodeActif = modePeriode === 'mois' ? filtreMois : modePeriode === 'annee' ? filtreAnnee : modePeriode === 'plage' ? (filtreDebut || filtreFin) : filtreJour
  const liste = useMemo(() => {
    let rows = [...prestations]
    if (modePeriode === 'mois' && filtreMois) {
      rows = rows.filter((p) => (p.date || '').startsWith(filtreMois))
    } else if (modePeriode === 'annee' && filtreAnnee) {
      rows = rows.filter((p) => (p.date || '').startsWith(filtreAnnee))
    } else if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      rows = rows.filter((p) => (!filtreDebut || p.date >= filtreDebut) && (!filtreFin || p.date <= filtreFin))
    } else if (modePeriode === 'jour' && filtreJour) {
      rows = rows.filter((p) => p.date === filtreJour)
    }
    if (filtreStatut) rows = rows.filter((p) => p.statut === filtreStatut)
    if (filtreClient.trim()) {
      const q = filtreClient.trim().toLowerCase()
      rows = rows.filter((p) => (p.clientNom || '').toLowerCase().includes(q))
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [prestations, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin, filtreStatut, filtreClient])

  // Cumul des prestations — somme de la liste actuellement filtrée (période, statut,
  // client ci-dessus), comme le KPI équivalent de Facturation (`cumulFacturation`) :
  // recalculé automatiquement dès qu'un filtre change, jamais figé sur le total brut.
  const cumulPrestations = useMemo(() => liste.reduce((s, p) => s + (Number(p.total) || 0), 0), [liste])

  // Basé sur `prestations` (site courant, PAS `liste`) : ce rappel ne doit jamais
  // disparaître simplement parce qu'un filtre période/statut/client est actif.
  const aRelancer = useMemo(() => prestations.filter(factureEnRetard), [prestations])

  // Une prestation facturée ou approuvée est « verrouillée » : seule l'administration peut encore la
  // modifier (la facture liée suit). Les autres rôles voient le bouton, grisé.
  const verrouillee = (p) => p.statut !== 'brouillon' || !!p.approuvee
  // Facturer et demander la sortie d'un coup : agents et administration, sur une prestation en brouillon.
  const peutFacturerRole = !isReadOnlyRole(role) && (role === 'agent' || isFullAccessRole(role))
  const peutFacturerSortie = (p) => !isReadOnlyRole(role) && (role === 'agent' || isFullAccessRole(role)) && p.statut === 'brouillon' && !p.factureId
  const peutModifier = (p) => !isReadOnlyRole(role) && p.statut !== 'annulee' && (isFullAccessRole(role) || !verrouillee(p))

  function openCreate() {
    setForm({
      id: null, // null = création ; sinon édition du brouillon de cet id
      type: 'prestation', // 'prestation' (avec dépenses internes) ou 'location' (simple)
      clientId: '',
      clientNom: '',
      clientTel: '',
      clientEmail: '',
      clientAdresse: '',
      facturerAussi: false,
      evenement: evenements[0] || '',
      evenementAutre: '',
      dateDebut: todayStr(),
      dateFin: todayStr(),
      lieu: '',
      lignes: [{ materielId: materiel[0]?.id || '', qte: 1, nbJours: 1, tarif: materiel[0]?.tarifLocation || 0 }],
      frais: [], // frais supplémentaires FACTURÉS au client : { label, montant } (transport, lieu…)
      depenses: [], // dépenses INTERNES liées à la prestation (frais de mission…) — hors CA
      statut: 'brouillon'
    })
    setOpen(true)
  }

  // Modification d'un brouillon existant (corriger un doublon, une erreur de
  // saisie…) — réutilise la même modale que la création, pré-remplie. Réservée
  // aux brouillons non approuvés (au-delà, la prestation est déjà engagée vers
  // la facturation/le stock).
  function openEdit(p) {
    const cl = clients.find((c) => c.id === p.clientId) || clients.find((c) => (c.nom || '').trim().toLowerCase() === (p.clientNom || '').trim().toLowerCase())
    setForm({
      clientTel: cl?.telephone || '',
      clientEmail: cl?.email || '',
      clientAdresse: cl?.adresse || '',
      id: p.id,
      num: p.num,
      type: p.type || 'prestation',
      clientId: p.clientId || clients.find((c) => c.nom === p.clientNom)?.id || '',
      clientNom: p.clientNom || '',
      evenement: p.evenement && !evenements.includes(p.evenement) ? '__autre__' : (p.evenement || evenements[0] || ''),
      evenementAutre: p.evenement && !evenements.includes(p.evenement) ? p.evenement : '',
      dateDebut: p.dateDebut || todayStr(),
      dateFin: p.dateFin || todayStr(),
      lieu: p.lieu || '',
      lignes: (p.lignes || []).map((l) => ({
        materielId: l.autre ? '__autre__' : l.materielId,
        qte: l.qte, nbJours: l.nbJours, tarif: l.tarifUnitaire,
        nomAutre: l.autre ? l.materielNom : undefined
      })),
      frais: p.frais || [],
      depenses: p.depenses || [],
      statut: p.statut,
      factureNum: p.factureNum || '',
      approuvee: !!p.approuvee
    })
    setOpen(true)
  }

  // ── Dépenses internes (frais de mission, carburant équipe…) — hors facturation ──
  function addDepense() { setForm((f) => ({ ...f, depenses: [...(f.depenses || []), { label: '', montant: 0 }] })) }
  function setDepense(i, patch) { setForm((f) => ({ ...f, depenses: f.depenses.map((x, k) => (k === i ? { ...x, ...patch } : x)) })) }
  function removeDepense(i) { setForm((f) => ({ ...f, depenses: f.depenses.filter((_, k) => k !== i) })) }

  function addLigne() {
    const m = materiel[0]
    setForm((f) => ({ ...f, lignes: [...f.lignes, { materielId: m?.id || '', qte: 1, nbJours: nbJoursInclus(f.dateDebut, f.dateFin), tarif: m?.tarifLocation || 0 }] }))
  }

  // Change une date de période et réaligne le nombre de jours des lignes encore
  // calées sur l'ancienne durée (les valeurs saisies à la main sont préservées).
  function setPeriode(patch) {
    setForm((f) => {
      const ancien = nbJoursInclus(f.dateDebut, f.dateFin)
      const next = { ...f, ...patch }
      const nouveau = nbJoursInclus(next.dateDebut, next.dateFin)
      next.lignes = f.lignes.map((l) => ((parseInt(l.nbJours) || 1) === ancien ? { ...l, nbJours: nouveau } : l))
      return next
    })
  }

  function setLigne(i, patch) {
    setForm((f) => {
      const lignes = f.lignes.map((l, k) => {
        if (k !== i) return l
        const next = { ...l, ...patch }
        if (patch.materielId !== undefined) {
          if (patch.materielId === '__autre__') {
            // Matériel hors référentiel : l'utilisateur précise le nom + le tarif.
            next.tarif = next.tarif || 0
            if (next.nomAutre === undefined) next.nomAutre = ''
          } else {
            const mat = materiel.find((x) => x.id === patch.materielId)
            next.tarif = mat?.tarifLocation || 0
            next.nomAutre = ''
          }
        }
        return next
      })
      return { ...f, lignes }
    })
  }

  // ── Frais supplémentaires (transport, lieu, divers…) ──
  function addFrais() { setForm((f) => ({ ...f, frais: [...(f.frais || []), { label: '', montant: 0 }] })) }
  function setFrais(i, patch) { setForm((f) => ({ ...f, frais: f.frais.map((x, k) => (k === i ? { ...x, ...patch } : x)) })) }
  function removeFrais(i) { setForm((f) => ({ ...f, frais: f.frais.filter((_, k) => k !== i) })) }

  const totalFrais = useMemo(
    () => (form?.frais || []).reduce((s, x) => s + (parseFloat(x.montant) || 0), 0),
    [form]
  )
  const totalDepenses = useMemo(
    () => (form?.depenses || []).reduce((s, x) => s + (parseFloat(x.montant) || 0), 0),
    [form]
  )

  // Montant d'une ligne du formulaire : Qté × Jours × Tarif/jour.
  const ligneMontant = (l) => (parseInt(l.qte) || 0) * (parseInt(l.nbJours) || 1) * (parseFloat(l.tarif) || 0)

  const totalForm = useMemo(() => {
    if (!form) return 0
    const mat = form.lignes.reduce((s, l) => s + ligneMontant(l), 0)
    return mat + (form.frais || []).reduce((s, x) => s + (parseFloat(x.montant) || 0), 0)
  }, [form])

  const parCategorie = useMemo(() => {
    if (!form) return []
    const map = {}
    form.lignes.forEach((l) => {
      const montant = ligneMontant(l)
      const cat = l.materielId === '__autre__' ? 'AUTRES' : materiel.find((x) => x.id === l.materielId)?.cat
      if (!cat) return
      map[cat] = (map[cat] || 0) + montant
    })
    const fr = (form.frais || []).reduce((s, x) => s + (parseFloat(x.montant) || 0), 0)
    if (fr > 0) map['FRAIS SUPPLÉMENTAIRES'] = (map['FRAIS SUPPLÉMENTAIRES'] || 0) + fr
    return Object.entries(map).map(([cat, montant]) => ({ cat, montant, color: catColor(cat) }))
  }, [form, materiel])

  // Client de la prestation : retrouvé (identifiant, sinon même nom, avec le même téléphone si les
  // deux en ont un) ou créé automatiquement dans le volet Clients. Les coordonnées manquantes
  // d'un client existant sont complétées.
  async function resoudreClient() {
    const cle = (v) => (v || '').trim().toLowerCase()
    const nom = (form.clientNom || '').trim()
    const tel = (form.clientTel || '').trim()
    const email = (form.clientEmail || '').trim()
    const adresse = (form.clientAdresse || '').trim()
    const num = (v) => (v || '').replace(/ /g, '')
    const existant = clients.find((x) => x.id === form.clientId)
      || clients.find((x) => cle(x.nom) === cle(nom) && (!tel || !x.telephone || num(x.telephone) === num(tel)))
    if (existant) {
      const patch = {}
      if (tel && !existant.telephone) patch.telephone = tel
      if (email && !existant.email) patch.email = email
      if (adresse && !existant.adresse) patch.adresse = adresse
      if (Object.keys(patch).length) await updateItem('logistique_clients', existant.id, patch)
      return existant
    }
    const id = await addItem('logistique_clients', { nom, telephone: tel, email, adresse })
    await audit('logistique', 'CLIENT_AUTO', `${nom} : ajouté depuis une prestation`)
    return { id, nom, telephone: tel }
  }

  // Un second clic pendant l'enregistrement créait la prestation (et le client) en double.
  async function save() {
    if (saving) return
    setSaving(true)
    try { await enregistrer() } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function enregistrer() {
    if (!form.clientNom?.trim() && !form.clientId) return toast.error('Client requis')
    if (!form.lignes.length) return toast.error('Ajoutez au moins une ligne')
    const client = await resoudreClient()
    const evenement = (form.evenement === '__autre__' ? form.evenementAutre : form.evenement || '').trim()
    const lignes = form.lignes.map((l) => {
      const qte = parseInt(l.qte) || 0
      const jours = parseInt(l.nbJours) || 1
      const tarif = parseFloat(l.tarif) || 0
      if (l.materielId === '__autre__') {
        // Matériel hors référentiel : nom libre, pas de lien matériel/stock.
        return { materielId: '', materielNom: (l.nomAutre || 'Autre').trim(), cat: 'AUTRES', unite: '', autre: true, qte, nbJours: jours, tarifUnitaire: tarif, montant: qte * jours * tarif }
      }
      const m = materiel.find((x) => x.id === l.materielId)
      return { materielId: m?.id, materielNom: m?.nom, cat: m?.cat, unite: m?.unite, qte, nbJours: jours, tarifUnitaire: tarif, montant: qte * jours * tarif }
    })
    // Frais supplémentaires (transport, lieu…) : on garde ceux qui ont un montant.
    const frais = (form.frais || [])
      .filter((x) => (parseFloat(x.montant) || 0) > 0)
      .map((x) => ({ label: (x.label || 'Frais').trim(), montant: parseFloat(x.montant) || 0 }))
    // Dépenses INTERNES (frais de mission…) — seulement pour une prestation, hors CA.
    const depenses = form.type === 'prestation'
      ? (form.depenses || [])
        .filter((x) => (parseFloat(x.montant) || 0) > 0)
        .map((x) => ({ label: (x.label || 'Dépense').trim(), montant: parseFloat(x.montant) || 0 }))
      : []
    const totalMateriel = lignes.reduce((s, l) => s + l.montant, 0)
    const totalFraisSave = frais.reduce((s, x) => s + x.montant, 0)
    const total = totalMateriel + totalFraisSave
    // Nouvel événement saisi à la volée → mémorisé dans le référentiel pour réemploi.
    if (evenement && !evenements.includes(evenement)) {
      try { await saveEvenements([...evenements, evenement]) } catch { /* non bloquant */ }
    }
    if (form.id) {
      // Édition d'une prestation existante (corriger un doublon, une erreur…).
      const avant = prestations.find((x) => x.id === form.id)
      if (avant && verrouillee(avant) && !isFullAccessRole(role)) return toast.error(`Prestation déjà facturée : modification réservée à l'administration`)
      await updateItem('logistique_prestations', form.id, {
        type: form.type || 'prestation', clientId: client?.id || '', clientNom: client?.nom || form.clientNom,
        evenement, dateDebut: form.dateDebut, dateFin: form.dateFin, lieu: form.lieu,
        lignes, frais, depenses, total
      })
      // Prestation déjà facturée : la facture liée suit (montant corrigé tracé si elle est approuvée).
      if (avant?.factureId) {
        const fac = facturesTout.find((f) => f.id === avant.factureId)
        if (fac) {
          const patch = { clientNom: client?.nom || form.clientNom, evenement, dateDebut: form.dateDebut, dateFin: form.dateFin, lignes, frais, totalHT: total, totalTTC: total }
          if (fac.statut === 'approuvee' && Number(fac.totalTTC) !== total) {
            patch.totalInitial = fac.totalInitial ?? fac.totalTTC
            patch.motifCorrection = 'Prestation modifiée'
          }
          await updateItem('logistique_factures', fac.id, patch)
        }
      }
      await audit('logistique', 'PRESTATION_MODIFIEE', `${siteLabel(site)} : ${form.num || form.id} : ${formatMoney(total)}`)
      toast.success('Prestation modifiée ✓')
    } else {
      const num = genNumero(`PREST-${site.toUpperCase()}`, prestations.length)
      const idCree = await addItem('logistique_prestations', {
        num, date: todayStr(), site, type: form.type || 'prestation',
        clientId: client?.id || '', clientNom: client?.nom || form.clientNom,
        evenement,
        dateDebut: form.dateDebut, dateFin: form.dateFin, lieu: form.lieu,
        lignes, frais, depenses, total, statut: 'brouillon',
        agentId: user.uid, agentNom: user.nom
      })
      await audit('logistique', 'PRESTATION', `${siteLabel(site)} : ${num} : ${formatMoney(total)}`)
      toast.success('Prestation enregistrée ✓ : en attente d\'approbation, facturable dès à présent')
      if (form.facturerAussi && peutFacturerRole) {
        const auto = await facturerEtDemander({
          p: { id: idCree, num, site, clientNom: client.nom, evenement, dateDebut: form.dateDebut, dateFin: form.dateFin, lignes, frais, total },
          site, user, factureDate: todayStr(), dateSortie: form.dateDebut,
          message: `Sortie du matériel pour ${client.nom}${evenement ? ` : ${evenement}` : ''}`,
          facturesSite: facturesTout.filter((f) => matchSite(f, site)),
          demandesSite: demandesTout.filter((d) => matchSite(d, site))
        })
        toast.success(auto.numDemande
          ? `Facture ${auto.numFacture} émise et autorisation ${auto.numDemande} envoyée à la hiérarchie ✓`
          : `Facture ${auto.numFacture} émise ✓ (aucun matériel du référentiel à sortir)`)
        if (auto.destinataires === 0) toast.warning(`Aucun validateur n'a accès au module Logistique : personne n'a été alerté. Prévenez la hiérarchie.`)
      }
    }
    setOpen(false)
  }

  // Suppression réservée au BROUILLON : dès qu'elle est facturée, la prestation
  // se retire en supprimant d'abord la facture (onglet Facturation).
  // Annuler une prestation (administration + Info) : le matériel revient en stock.
  //  - ses autorisations de sortie sont annulées : le stock est calculé à partir des autorisations
  //    CERTIFIÉES, il remonte donc tout seul à la prochaine lecture de la saisie magasin ;
  //  - ses retours déjà enregistrés sont retirés (sinon ils remettraient le matériel en stock une 2e fois) ;
  //  - sa facture est retirée du chiffre d'affaires ;
  //  - la prestation reste visible, marquée « Annulée », avec le motif.
  async function annulerPrestation(p) {
    if (!isFullAccessRole(role) || p.statut === 'annulee') return
    const motif = await demanderMotif({ libelle: `Annuler la prestation ${p.num} : ${p.clientNom}` })
    if (!motif) return
    try {
      for (const d of demandesTout.filter((x) => x.prestationId === p.id && x.statut !== 'annulee')) {
        await updateItem('logistique_demandes', d.id, { statut: 'annulee', annuleeLe: Date.now(), annuleePar: user.nom, motifAnnulation: motif })
      }
      const retoursP = (await getAll('logistique_retours')).filter((r) => r.prestationId === p.id)
      for (const r of retoursP) await removeItem('logistique_retours', r.id, { motif })
      if (p.factureId && facturesTout.some((f) => f.id === p.factureId)) await removeItem('logistique_factures', p.factureId, { motif })
      await updateItem('logistique_prestations', p.id, { statut: 'annulee', annuleeLe: Date.now(), annuleePar: user.nom, motifAnnulation: motif, approuvee: false, factureId: null, factureNum: null })
      await audit('logistique', 'PRESTATION_ANNULEE', `${siteLabel(site)} : ${p.num} : stock rétabli, ${retoursP.length} retour(s) et la facture retirés : motif : ${motif}`)
      toast.success('Prestation annulée : matériel rétabli en stock et facture retirée')
      setDetail(null)
    } catch (e) { toast.error(e.message) }
  }

  async function supprimer(p) {
    if (!isFullAccessRole(role)) return toast.error(`Suppression réservée à l'administration`)
    if (p.factureId) return toast.error(`Prestation déjà facturée (${p.factureNum || 'facture liée'}) : supprimez d'abord la facture dans le volet Factures, ou utilisez « Annuler la prestation »`)
    if (!confirm(`Supprimer la prestation ${p.num} (${p.clientNom}) ?`)) return
    await removeItem('logistique_prestations', p.id)
    await audit('logistique', 'PRESTATION_DELETE', `${siteLabel(site)} : ${p.num}`)
    toast.success('Prestation supprimée')
  }

  return (
    <div className="space-y-4">
      {/* Bandeau héro — même recette que les autres volets (logo rond, titre, filtre
          de période en glassmorphism directement sur la bande). */}
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.9) 0%, rgba(26,26,26,0.85) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR_MODULE.logistique, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <ClipboardList size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Prestations</h2>
          <p className="text-sm text-white/80">{liste.length} prestation(s) · {siteLabel(site)}</p>
        </div>
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
        <div className="band-filtres">
        <div className="relative">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Client</label>
          <input value={filtreClient} onChange={(e) => setFiltreClient(e.target.value)} placeholder="Rechercher un client…"
            className="rounded-lg border border-white/60 bg-white/70 px-3 py-2 text-sm backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="band-pills relative flex flex-wrap gap-1 rounded-2xl p-1">
          {[['', 'Tous'], ...Object.entries(STATUTS).map(([k, v]) => [k, v.label])].map(([v, l]) => (
            <button key={v || 'tous'} onClick={() => setFiltreStatut(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtreStatut === v ? 'bg-secondary text-white shadow-sm' : 'text-gray-600 hover:bg-white/80'}`}>
              {l}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Rappel : prestations dont la période est passée depuis plus de
          SEUIL_RELANCE_JOURS jours mais jamais facturées — sans ça, elles ne se
          signalent que si on tombe dessus par hasard dans le tableau. Toujours
          visible, quel que soit le filtre en cours (cf. `aRelancer`). */}
      {aRelancer.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            <strong>{aRelancer.length}</strong> prestation{aRelancer.length > 1 ? 's' : ''} terminée{aRelancer.length > 1 ? 's' : ''} depuis plus de {SEUIL_RELANCE_JOURS} jours,
            toujours pas facturée{aRelancer.length > 1 ? 's' : ''} : {aRelancer.slice(0, 4).map((p) => `${p.num} (${p.clientNom})`).join(', ')}{aRelancer.length > 4 ? '…' : ''}
          </span>
        </div>
      )}

      {/* Cumul des prestations — réservé à l'administration, recalculé selon les
          filtres ci-dessous (période, statut, client). Valeur BRUTE de ce qui a
          été créé ici, PAS le chiffre d'affaires réel : une prestation encore en
          brouillon (jamais facturée) compte quand même dans ce total — pour le
          CA réellement acquis, voir le Cumul facturation (statut Approuvée) dans
          l'onglet Facturation. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <style>{`
          @keyframes presta-balayage { 0% { transform: translateX(-130%) skewX(-18deg); } 55%, 100% { transform: translateX(260%) skewX(-18deg); } }
          @keyframes presta-plus { 0%, 65%, 100% { transform: rotate(0deg) scale(1); } 80% { transform: rotate(90deg) scale(1.2); } 92% { transform: rotate(90deg) scale(1); } }
          @keyframes presta-feuille { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        `}</style>
      {estAdministration && (
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard glass
            title={`Valeur brute des prestations${filtreStatut ? ` (${STATUTS[filtreStatut]?.label.toLowerCase()})` : ''}`}
            value={formatMoney(cumulPrestations)}
            sub={`${liste.length} prestation${liste.length > 1 ? 's' : ''} · site ${siteLabel(site)}${filtrePeriodeActif ? ' · période filtrée' : ''}${filtreClient.trim() ? ' · client filtré' : ''} · hors facturation`}
            icon={Wallet} accent={COULEUR_MODULE.logistique} />
        </div>
      )}
        {/* Nouvelle prestation : même style que « Autorisations » (Briqueterie), à droite du KPI. */}
        {!isReadOnlyRole(role) && (
          <button type="button" onClick={openCreate}
            className="group relative flex shrink-0 items-center justify-center gap-2 self-end overflow-hidden rounded-2xl px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_-10px_rgba(188,60,49,0.7),inset_0_1px_0_0_rgba(255,255,255,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-10px_rgba(188,60,49,0.85)] sm:ml-auto sm:self-center"
            style={{ background: 'linear-gradient(135deg, #d9594b 0%, #bc3c31 100%)' }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent"
              style={{ animation: 'presta-balayage 3.2s ease-in-out infinite' }} />
            <span className="relative flex h-5 w-5 items-center justify-center" style={{ animation: 'presta-feuille 2.6s ease-in-out infinite' }}>
              <ClipboardList size={17} />
              <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[#bc3c31]">
                <Plus size={10} strokeWidth={3.4} style={{ animation: 'presta-plus 4s ease-in-out infinite' }} />
              </span>
            </span>
            <span className="relative">Nouvelle prestation</span>
          </button>
        )}
      </div>

      <Card className="p-0">
        <Table
          stickyHeader
          columns={[
            { key: 'num', label: 'N°', sticky: true, width: '96px', render: (r) => <NumDoc num={r.num} /> },
            { key: 'clientNom', label: 'Client', sticky: true, width: '130px', render: (r) => (
              <span className="flex items-center gap-2">
                <AvatarNom nom={r.clientNom} size={26} accent={COULEUR_MODULE.logistique} className="hidden sm:inline-flex" />
                <span className="font-semibold">{r.clientNom}</span>
              </span>
            ) },
            { key: 'periode', label: 'Période', render: (r) => `${formatDateShort(r.dateDebut)} → ${formatDateShort(r.dateFin)}` },
            // Colonne « Montant » retirée pour la secrétaire (cf. voitMontants).
            ...(voitMontants ? [{ key: 'total', label: 'Montant', align: 'right', render: (r) => <strong className="whitespace-nowrap">{formatMoney(r.total)}</strong> }] : []),
            { key: 'statut', label: 'Facturation', render: (r) => (
              <div>
                <Badge tone={STATUTS[r.statut]?.tone}>{STATUTS[r.statut]?.label || r.statut}</Badge>
                {factureEnRetard(r) && <p className="mt-0.5 text-[10px] font-semibold text-amber-600">⏳ À facturer</p>}
              </div>
            ) },
            { key: 'etat', label: 'État', render: (r) => { const s = statutOp(r); return <Badge tone={s.tone}>{s.label}</Badge> } },
            { key: 'appr', label: 'Appro.', align: 'center', render: (r) => r.approuvee
              ? <Badge tone="success">Approuvée</Badge>
              : <Badge tone="neutral">En attente</Badge> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <ActionIcone icone={Eye} tone="voir" title="Voir les détails" onClick={() => setDetail(r)} />
                {peutFacturerSortie(r) && <ActionIcone icone={Send} tone="#BC3C31" title="Facturer et demander la sortie" onClick={() => setFacturer(r)} />}
                {!isReadOnlyRole(role) && r.statut !== 'annulee' && (
                  <ActionIcone icone={Pencil} tone="modifier" disabled={!peutModifier(r)}
                    title={peutModifier(r) ? 'Modifier la prestation' : `Déjà facturée : modification réservée à l'administration`} onClick={() => openEdit(r)} />
                )}
                {isFullAccessRole(role) && r.statut !== 'brouillon' && r.statut !== 'annulee' && (
                  <ActionIcone icone={Ban} tone="#B45309" title="Annuler la prestation (le stock est rétabli)" onClick={() => annulerPrestation(r)} />
                )}
                {isFullAccessRole(role) && (
                  <ActionIcone icone={Trash2} tone="supprimer" title="Supprimer la prestation" onClick={() => supprimer(r)} />
                )}
              </div>
            ) }
          ]}
          rows={liste} onRowClick={(r) => setDetail(r)}
          empty="Aucune prestation." emptyIcon={ClipboardList}
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} size="lg" {...glassModalProps(COULEUR_MODULE.logistique)}
        title={form?.id ? 'Modifier la prestation / location' : 'Nouvelle prestation / location'}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={save} loading={saving}>Enregistrer</Button></>}>
        {form && (
          <div className="space-y-3">
            <style>{FX_STYLES}</style>
            {/* Nature de l'opération : l'icône du type choisi s'anime en haut ; une prestation porte des dépenses internes. */}
            {form.id && (form.statut !== 'brouillon' || form.approuvee) && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-900 backdrop-blur-md">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                <span>Cette prestation est déjà {form.factureNum ? `facturée (${form.factureNum})` : 'approuvée'} : la facture liée sera mise à jour avec les nouveaux montants. Le stock déjà sorti n'est pas recalculé.</span>
              </div>
            )}
            <TypeHero type={form.type} />
            <TypeBoutons type={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} />

            <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
              <FormGroup required className="col-span-2 sm:col-span-4"
                label={<span className="inline-flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D(COULEUR_MODULE.logistique)}><UserRound size={13} /></span>Client</span>}>
                {/* Saisie libre : les clients enregistrés sont proposés et la liste se filtre à chaque lettre. */}
                <div className="relative">
                <UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-red-500" />
                <ChampAutocomplete accent="orange" className="input-base pl-9" autoFocus={!form.id}
                  value={form.clientNom} placeholder="Tapez le nom du client…"
                  suggestions={clientsUniques} getLabel={(c) => (c.nom || '').trim()} getDetail={(c) => c.telephone || ''} maxSuggestions={12}
                  emptyLabel="Nouveau client : il sera ajouté automatiquement."
                  onChange={(t) => setForm((f) => ({ ...f, clientNom: t, clientId: '' }))}
                  onSelect={(c) => setForm((f) => ({ ...f, clientId: c.id, clientNom: (c.nom || '').trim(), clientTel: c.telephone || '', clientEmail: c.email || '', clientAdresse: c.adresse || '' }))} />
                </div>
                {form.clientNom.trim() && (
                  clients.some((c) => c.id === form.clientId || (c.nom || '').trim().toLowerCase() === form.clientNom.trim().toLowerCase())
                    ? <p className="mt-1.5 text-[11px] font-semibold text-green-600">Client existant ✓ : ses coordonnées sont reprises.</p>
                    : <p className="mt-1.5 text-[11px] font-semibold text-sky-600">Nouveau client : il sera ajouté automatiquement au volet Clients.</p>
                )}
              </FormGroup>
              <FormGroup label="Téléphone du client" className="col-span-2">
                <Input type="tel" value={form.clientTel} onChange={(e) => setForm((f) => ({ ...f, clientTel: e.target.value }))} placeholder="ex : 90 00 00 00" />
              </FormGroup>
              <FormGroup label="E-mail (facultatif)" className="col-span-2">
                <Input type="email" value={form.clientEmail} onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Adresse (facultatif)" className="col-span-2 sm:col-span-4">
                <Input value={form.clientAdresse} onChange={(e) => setForm((f) => ({ ...f, clientAdresse: e.target.value }))} />
              </FormGroup>

              <div className="tuile-verre col-span-2 mb-3 sm:col-span-4">
                <TitreSection icone={Sparkles} titre="Événement" />
                <ChipsEvenement evenements={evenements} value={form.evenement} onChange={(v) => setForm((f) => ({ ...f, evenement: v }))} />
                {form.evenement === '__autre__' && (
                  <div className="mt-3">
                    <Input value={form.evenementAutre} onChange={(e) => setForm((f) => ({ ...f, evenementAutre: e.target.value }))} placeholder="ex : Lancement produit, Gala, Investiture…" autoFocus />
                    <p className="mt-1 text-[11px] text-gray-400">Il sera ajouté à la liste pour être réutilisé.</p>
                  </div>
                )}
              </div>

              <FormGroup label="Lieu" className="col-span-2"><Input value={form.lieu} onChange={(e) => setForm((f) => ({ ...f, lieu: e.target.value }))} /></FormGroup>
              <FormGroup label="Date début"><Input type="date" value={form.dateDebut} onChange={(e) => setPeriode({ dateDebut: e.target.value })} /></FormGroup>
              <FormGroup label="Date fin"><Input type="date" value={form.dateFin} onChange={(e) => setPeriode({ dateFin: e.target.value })} /></FormGroup>
              <div className="col-span-2 -mt-1 mb-3 flex items-center gap-2 text-xs text-gray-500 sm:col-span-4">
                <CalendarRange size={14} className="text-red-500" />
                <span>Durée de la période : <strong>{nbJoursInclus(form.dateDebut, form.dateFin)} jour(s)</strong>, appliquée par défaut à chaque ligne (modifiable).</span>
              </div>
            </div>

            <div className="tuile-verre">
              <TitreSection icone={Boxes} titre="Matériel loué" />
              <div className="mb-1 hidden grid-cols-12 gap-2 px-1 text-[10px] font-bold uppercase text-gray-400 md:grid">
                <span className="col-span-5">Matériel</span>
                <span className="col-span-2 text-center">Qté</span>
                <span className="col-span-1 text-center">Jours</span>
                <span className="col-span-2 text-center">Tarif/j</span>
                <span className="col-span-2 text-right">Montant</span>
              </div>
              <div className="space-y-2">
                {form.lignes.map((l, i) => (
                  <div key={i} className="rounded-2xl border border-white/80 bg-white/60 p-2 shadow-[0_8px_16px_-14px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.95)]">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-12">
                      <Select className="col-span-2 md:col-span-5" value={l.materielId} onChange={(e) => setLigne(i, { materielId: e.target.value })}>
                        {materiel.map((m) => <option key={m.id} value={m.id}>{m.nom} ({m.cat})</option>)}
                        <option value="__autre__">➕ Autre (à préciser)…</option>
                      </Select>
                      <Input className="md:col-span-2" type="number" min="1" value={l.qte} onChange={(e) => setLigne(i, { qte: e.target.value })} placeholder="Qté" />
                      <Input className="md:col-span-1" type="number" min="1" value={l.nbJours ?? 1} onChange={(e) => setLigne(i, { nbJours: e.target.value })} placeholder="Jours" />
                      <Input className="md:col-span-2" type="number" min="0" value={l.tarif} onChange={(e) => setLigne(i, { tarif: e.target.value })} placeholder="Tarif/j" />
                      <div className="col-span-2 flex items-center justify-end font-bold text-secondary md:col-span-2">
                        {formatMoney(ligneMontant(l))}
                      </div>
                    </div>
                    {l.materielId === '__autre__' && (
                      <Input className="mt-2" value={l.nomAutre || ''} onChange={(e) => setLigne(i, { nomAutre: e.target.value })}
                        placeholder="Précisez le matériel / la prestation (ex : groupe électrogène, podium…)" />
                    )}
                    {l.materielId && l.materielId !== '__autre__' && (() => {
                      const stock = dernierStock(inventaires, l.materielId)
                      const qte = parseInt(l.qte) || 0
                      const insuffisant = qte > stock
                      return (
                        <p className={`mt-1.5 flex items-center gap-1 text-[11px] ${insuffisant ? 'font-bold text-red-600' : 'text-gray-500'}`}>
                          {insuffisant && <AlertTriangle size={11} className="animate-pulse" />}
                          Stock disponible : {stock}{insuffisant ? ` : insuffisant pour ${qte} pièce(s)` : ''}
                        </p>
                      )
                    })()}
                  </div>
                ))}
              </div>
              <div className="mt-2.5"><BoutonAjout onClick={addLigne}>Ligne</BoutonAjout></div>
            </div>

            {/* Frais supplémentaires libres : transport, lieu, divers… */}
            <div className="tuile-verre">
              <TitreSection icone={Receipt} titre="Frais supplémentaires facturés" />
              {(form.frais || []).map((x, i) => (
                <div key={i} className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-12">
                  <Input className="col-span-2 md:col-span-7" value={x.label} onChange={(e) => setFrais(i, { label: e.target.value })} placeholder="Intitulé (ex : Transport, Lieu, Montage…)" />
                  <Input className="md:col-span-4" type="number" min="0" value={x.montant} onChange={(e) => setFrais(i, { montant: e.target.value })} placeholder="Montant" />
                  <button type="button" onClick={() => removeFrais(i)} className="flex items-center justify-center rounded-xl text-red-500 transition-colors hover:bg-white/80 hover:text-red-700 md:col-span-1"><Trash2 size={15} /></button>
                </div>
              ))}
              <BoutonAjout onClick={addFrais}>Frais</BoutonAjout>
              {totalFrais > 0 && <p className="mt-2 text-right text-sm text-gray-600">Total frais : <strong>{formatMoney(totalFrais)}</strong></p>}
            </div>

            {/* Dépenses INTERNES (hors facturation) : uniquement pour une prestation */}
            {form.type === 'prestation' && (
              <div className="rounded-[1.1rem] border border-orange-200/80 bg-orange-50/60 p-3 shadow-[0_10px_22px_-16px_rgba(234,88,12,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
                <TitreSection icone={Coins} titre="Dépenses internes de la prestation" accent="#EA580C" />
                <p className="-mt-1 mb-2 text-[11px] text-gray-500">Coûts supportés par l'entreprise (frais de mission, carburant, main-d'œuvre…). Non facturés au client. Peuvent être complétés plus tard.</p>
                {(form.depenses || []).map((x, i) => (
                  <div key={i} className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-12">
                    <Input className="col-span-2 md:col-span-7" value={x.label} onChange={(e) => setDepense(i, { label: e.target.value })} placeholder="Intitulé (ex : Frais de mission, Carburant…)" />
                    <Input className="md:col-span-4" type="number" min="0" value={x.montant} onChange={(e) => setDepense(i, { montant: e.target.value })} placeholder="Montant" />
                    <button type="button" onClick={() => removeDepense(i)} className="flex items-center justify-center rounded-xl text-red-500 transition-colors hover:bg-white/80 hover:text-red-700 md:col-span-1"><Trash2 size={15} /></button>
                  </div>
                ))}
                <BoutonAjout onClick={addDepense}>Dépense</BoutonAjout>
                {totalDepenses > 0 && <p className="mt-2 text-right text-sm text-orange-700">Total dépenses : <strong>{formatMoney(totalDepenses)}</strong></p>}
              </div>
            )}

            {(() => {
              const manque = form.lignes.filter((l) => l.materielId && l.materielId !== '__autre__' && (parseInt(l.qte) || 0) > dernierStock(inventaires, l.materielId))
              return manque.length > 0 ? (
                <div className="flex items-start gap-3 rounded-2xl border border-red-200/80 bg-red-50/80 px-3 py-2.5 text-xs text-red-800 backdrop-blur-md">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 animate-pulse text-red-500" />
                  <span>Stock insuffisant pour {manque.length} article{manque.length > 1 ? 's' : ''} : la sortie risque d'être bloquée. Vous pouvez quand même enregistrer.</span>
                </div>
              ) : null
            })()}
            {!form.id && peutFacturerRole && (
              <button type="button" aria-pressed={!!form.facturerAussi}
                onClick={() => setForm((f) => ({ ...f, facturerAussi: !f.facturerAussi }))}
                className={`btn-balaye group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 ${form.facturerAussi ? 'border-transparent text-white' : 'border-red-200 bg-white/70 text-gray-700 backdrop-blur-sm hover:bg-white/90'}`}
                style={form.facturerAussi
                  ? { background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)', boxShadow: '0 14px 26px -12px rgba(5,150,105,0.75), inset 0 1px 0 rgba(255,255,255,0.45)' }
                  : { boxShadow: '0 10px 20px -14px rgba(188,60,49,0.55), inset 0 1px 0 rgba(255,255,255,0.95)' }}>
                <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${form.facturerAussi ? 'bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]' : ''}`}
                  style={form.facturerAussi ? undefined : icone3D(COULEUR_MODULE.logistique)}>
                  <Send size={20} style={{ animation: 'fx-saute 2.4s ease-in-out infinite' }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold">{form.facturerAussi ? 'Facturation et demande de sortie activées' : 'Facturer et demander la sortie tout de suite'}</span>
                  <span className={`block text-[11px] leading-snug ${form.facturerAussi ? 'text-white/90' : 'text-gray-500'}`}>
                    {form.facturerAussi
                      ? "À l'enregistrement : facture émise en brouillon et autorisation envoyée à la hiérarchie. Cliquez pour annuler."
                      : "Cliquez pour émettre la facture et envoyer l'autorisation de sortie dès l'enregistrement."}
                  </span>
                </span>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${form.facturerAussi ? 'bg-white text-green-600' : 'border-2 border-red-300 text-transparent'}`}>
                  <CheckCircle2 size={16} />
                </span>
              </button>
            )}
            {/* Synthèse : par catégorie + total */}
            <div className="grid gap-3 sm:grid-cols-5">
              {parCategorie.length > 0 && (
                <div className="tuile-verre sm:col-span-3">
                  <TitreSection icone={Layers} titre="Par catégorie" />
                  {parCategorie.map((pc) => (
                    <div key={pc.cat} className="flex justify-between py-0.5 text-sm">
                      <span style={{ color: pc.color }} className="font-semibold">{pc.cat}</span>
                      <span>{formatMoney(pc.montant)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className={`relative flex flex-col justify-center overflow-hidden rounded-[1.1rem] p-4 text-white shadow-[0_16px_28px_-14px_rgba(188,60,49,0.8),inset_0_1px_0_rgba(255,255,255,0.45)] ${parCategorie.length > 0 ? 'sm:col-span-2' : 'sm:col-span-5'}`}
                style={{ background: 'linear-gradient(135deg, #d9594b 0%, #bc3c31 55%, #8f2a22 100%)' }}>
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                <p className="relative text-[11px] font-bold uppercase tracking-wide text-white/80">Total facturé</p>
                <p className="relative text-2xl font-extrabold leading-tight">{formatMoney(totalForm)}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <FacturerSortieModal prestation={facturer ? prestations.find((x) => x.id === facturer.id && peutFacturerSortie(x)) || null : null}
        site={site} user={user} voitMontants={voitMontants} onClose={() => setFacturer(null)} />

      {/* Détail d'une prestation — même design que la facture (Factures.jsx) :
          fenêtre glassmorphism + FicheDetail, pour une présentation cohérente
          entre les deux volets. */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" {...glassModalProps(COULEUR_MODULE.logistique)}
        title={detail ? `Prestation ${detail.num}` : ''}
        footer={<>
          {detail && peutFacturerSortie(detail) && (
            <Button onClick={() => { const d = detail; setDetail(null); setFacturer(d) }}><Send size={15} /> Facturer et demander la sortie</Button>
          )}
          {detail && !isReadOnlyRole(role) && detail.statut !== 'annulee' && (
            <Button variant="outline" disabled={!peutModifier(detail)} onClick={() => { const d = detail; setDetail(null); openEdit(d) }}><Pencil size={15} /> Modifier</Button>
          )}
          {detail && isFullAccessRole(role) && detail.statut !== 'brouillon' && detail.statut !== 'annulee' && (
            <Button variant="outline" onClick={() => annulerPrestation(detail)}><Ban size={15} /> Annuler la prestation</Button>
          )}
          {detail && isFullAccessRole(role) && (
            <Button variant="danger" onClick={async () => { const d = detail; await supprimer(d); setDetail(null) }}><Trash2 size={15} /> Supprimer</Button>
          )}
          <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
        </>}>
        {detail && (() => {
          const s = statutOp(detail)
          const rets = retoursParPresta[detail.id] || []
          const pris = (detail.lignes || []).filter((l) => l.materielId).reduce((a, l) => a + (parseInt(l.qte) || 0), 0)
          const rendu = rets.reduce((a, r) => a + (parseInt(r.qte) || 0), 0)
          const lignesEtFrais = [
            ...(detail.lignes || []),
            ...(voitMontants ? (detail.frais || []).map((x) => ({ materielNom: `${x.label} (frais)`, montant: x.montant, estFrais: true })) : [])
          ]
          return (
            <FicheDetail
              hero={<PrestationHero type={detail.type || 'prestation'} num={detail.num} client={detail.clientNom} evenement={detail.evenement}
                pastilles={[
                  { label: STATUTS[detail.statut]?.label || detail.statut, tone: STATUTS[detail.statut]?.tone },
                  { label: s.label, tone: s.tone },
                  { label: detail.approuvee ? 'Approuvée' : `En attente d'approbation`, tone: detail.approuvee ? 'success' : 'neutral' }
                ]}
                total={Number(detail.total) || 0} voitMontants={voitMontants} />}
              entetes={[
                { label: 'Événement', value: detail.evenement },
                { label: 'Période', value: `${formatDateShort(detail.dateDebut)} → ${formatDateShort(detail.dateFin)}` },
                { label: 'Lieu', value: detail.lieu },
                { label: 'Facture', value: detail.factureNum },
                { label: 'Saisie par', value: detail.agentNom },
                // L'identité du validateur reste réservée à l'administration/direction.
                { label: 'Approbation', value: detail.approuvee
                  ? (voitValidateur ? `${detail.approuveePar || '—'}${detail.approuveeLe ? ' · ' + detail.approuveeLe : ''}` : 'Approuvée')
                  : 'En attente' }
              ]}
              colonnes={[
                { label: 'Matériel', render: (l) => <>{l.materielNom}{l.autre ? <span className="ml-1 text-[10px] text-gray-400">(autre)</span> : null}</> },
                { label: 'Qté', align: 'center', render: (l) => l.qte ?? '—' },
                { label: 'Jours', align: 'center', render: (l) => l.nbJours || (l.estFrais ? '—' : 1) },
                ...(voitMontants ? [
                  { label: 'Tarif / jour', align: 'right', render: (l) => l.tarifUnitaire !== undefined ? formatMoney(l.tarifUnitaire || 0) : '—' },
                  { label: 'Montant', align: 'right', render: (l) => formatMoney(l.montant || 0) }
                ] : [])
              ]}
              lignes={lignesEtFrais}
              vide="Aucune ligne sur cette prestation."
              pied={voitMontants ? [{ label: 'Total', value: detail.total, fort: true }] : []}
            >
              {/* Dépenses internes — modifiables « plus tard » tant que non facturée.
                  Bloc entièrement financier : masqué aux profils sans accès aux montants. */}
              {voitMontants && (detail.type === 'prestation' || (detail.depenses || []).length > 0) && (
                <div className="rounded-lg border border-orange-200/70 bg-orange-50/60 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                    <Coins size={13} /> Dépenses internes <span className="font-normal normal-case text-orange-500">(hors facturation)</span>
                  </p>
                  {!isReadOnlyRole(role) && detail.statut === 'brouillon' ? (
                    <>
                      {depLater.map((x, i) => (
                        <div key={i} className="mt-1.5 grid grid-cols-2 gap-2 md:grid-cols-12">
                          <Input className="col-span-2 md:col-span-7" value={x.label} onChange={(e) => setDepLater((a) => a.map((y, k) => (k === i ? { ...y, label: e.target.value } : y)))} placeholder="Intitulé (ex : Frais de mission…)" />
                          <Input className="md:col-span-4" type="number" min="0" value={x.montant} onChange={(e) => setDepLater((a) => a.map((y, k) => (k === i ? { ...y, montant: e.target.value } : y)))} placeholder="Montant" />
                          <button type="button" onClick={() => setDepLater((a) => a.filter((_, k) => k !== i))} title="Retirer cette ligne" className="flex items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 md:col-span-1"><Trash2 size={15} /></button>
                        </div>
                      ))}
                      {!depLater.length && <p className="text-xs text-orange-500/80">Aucune dépense : ajoutez-en une si la prestation a généré des frais internes.</p>}
                      <div className="mt-3 flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setDepLater((a) => [...a, { label: '', montant: 0 }])}><Plus size={14} /> Dépense</Button>
                        <Button size="sm" onClick={saveDepensesLater} loading={depSaving}><Save size={14} /> Enregistrer</Button>
                      </div>
                    </>
                  ) : (
                    (detail.depenses || []).length
                      ? <div className="space-y-1">
                          {(detail.depenses || []).map((x, i) => (
                            <div key={i} className="flex justify-between rounded-lg bg-white/70 px-2.5 py-1.5 text-xs text-orange-900">
                              <span>{x.label}</span><span className="font-semibold">{formatMoney(x.montant)}</span>
                            </div>
                          ))}
                        </div>
                      : <p className="text-xs text-gray-400">Aucune dépense renseignée.</p>
                  )}
                  {(detail.depenses || []).length > 0 && (
                    <p className="mt-2 border-t border-orange-200/60 pt-2 text-right text-xs font-bold text-orange-700">
                      Total dépenses : {formatMoney((detail.depenses || []).reduce((s, x) => s + (x.montant || 0), 0))}
                    </p>
                  )}
                </div>
              )}

              {/* Suivi des retours — une barre de progression rend le « où en est-on »
                  lisible immédiatement, au lieu d'un simple ratio en texte. */}
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">Suivi des retours</p>
                {pris > 0 ? (() => {
                  const complet = rendu >= pris
                  const pct = Math.min(100, Math.round((rendu / pris) * 100))
                  return (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-base font-bold text-gray-800">
                          {rendu} <span className="text-sm font-normal text-gray-400">/ {pris} pièce(s) retournée(s)</span>
                        </p>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${complet ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                          {complet ? '✅ Retour complet' : '⏳ Retour en attente'}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                        <div className={`h-2 rounded-full transition-all ${complet ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </>
                  )
                })() : <p className="text-sm text-gray-400">Aucun matériel du référentiel à retourner.</p>}
                {rets.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-gray-200 pt-2">
                    {rets.map((r, i) => (
                      <p key={i} className="text-xs text-gray-500">
                        <span className="font-mono text-[11px] text-gray-400">{formatDateShort(r.date)}</span>
                        {' : '}<span className="font-semibold text-gray-600">{r.qte} × {r.materielNom}</span>
                        {' '}<span className="text-gray-400">({r.type})</span>{r.motif ? ` : ${r.motif}` : ''}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </FicheDetail>
          )
        })()}
      </Modal>
    </div>
  )
}

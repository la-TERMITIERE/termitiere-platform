// MAXI-GYM — Séances : liste complète + ajout d'une séance ponctuelle.
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import { useEffect, useMemo, useState } from 'react'
import { Ticket, Plus, Trash2, Pencil, User, MessageCircle, Receipt, Printer, Lock, FileSpreadsheet, Eraser, Eye, Dumbbell, Crown, Tag, Wallet, StickyNote, CalendarDays, Users, Handshake, Timer, Check, X, CheckCircle2, SlidersHorizontal } from 'lucide-react'
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
import { CATEGORIES_SEANCE, PERSO_PREFIXE, estCategoriePerso, nomCategoriePerso, indexSexeClients, sexeDe, filtrerParSexe, sexeInfo, categorieLabel, categorieTone, categorieDesc, finValiditeSeance, seanceValide, genQrToken, QR_CARNET_ACTIF } from './data'
import { useGymParams } from './useGymParams'
import ModesPaiement from './ModePaiementUI'
import { notify } from '../../core/notify'
import { genererFactureGym } from './genererFacture'
import { imprimerTicketSeance } from './printTicket'
import ClientDetailModal from './ClientDetailModal'
import PurgeClientModal from './PurgeClientModal'
import { BoutonGym } from './uiHelpers'
import { dossierClient, dossierTermine } from './purgeClient'
import QrCarnetModal from './QrCarnetModal'
import { useSite, matchSite } from './site/useSite'
import { SexeBoutons, SexeFiltre, SexeBadge } from './SexeUI'

const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'
const COULEUR_CATEGORIE = { simple: '#94a3b8', classique: '#0ea5e9', vip: '#d97706', perso: '#8b5cf6' }
// Carte « Personnalisé » d'une séance : nom, montant et motif libres (l'agent fixe le prix quand aucune catégorie ne convient).
const SEANCE_PERSO = { id: 'perso', label: 'Personnalisé' }
const ICONE_CATEGORIE = { simple: Dumbbell, vip: Crown, perso: SlidersHorizontal }

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

export default function Seances() {
  const { user, role } = useAuth()
  const site = useSite()
  const { data: allSeances } = useCollection('gym_seances')
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allClients } = useCollection('gym_clients')
  const { data: allFactures } = useCollection('gym_factures')
  const { data: allPresences } = useCollection('gym_presences')
  const { data: allPointagesCoach } = useCollection('gym_pointages_coach')
  // Tout est cloisonné par salle, y compris la clientèle : les clients de Lomé
  // ne sont pas ceux de Kara.
  const seances = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])
  const clients = useMemo(() => allClients.filter((c) => matchSite(c, site)), [allClients, site])
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const presences = useMemo(() => allPresences.filter((p) => matchSite(p, site)), [allPresences, site])
  const pointagesCoach = useMemo(() => allPointagesCoach.filter((p) => matchSite(p, site)), [allPointagesCoach, site])
  // Coach à attribuer à une séance du jour `date` — même règle que pour les
  // abonnements (cf. Abonnements.jsx → coachDuJour) : seulement si un SEUL coach a
  // été pointé présent ce jour-là, sinon ambigu et on laisse la séance sans coach.
  function coachDuJour(date) {
    const idsUniques = [...new Set(pointagesCoach.filter((p) => p.date === date && p.statut !== 'absent').map((p) => p.coachId))]
    if (idsUniques.length !== 1) return { coachId: null, coachNom: null }
    const p = pointagesCoach.find((x) => x.date === date && x.statut !== 'absent' && x.coachId === idsUniques[0])
    return { coachId: p.coachId, coachNom: p.coachNom }
  }
  const peutSupprimer = peutAdministrerGym(role)
  const lectureSeule = !peutEcrireGym(role)
  const peutPurger = peutPurgerClientGym(role)
  const params = useGymParams(site)
  const tarifs = { simple: params.tarifSeanceSimple, vip: params.tarifSeanceVip }

  const [modal, setModal] = useState(null)
  const [filtreSexe, setFiltreSexe] = useState('')
  const [recherche, setRecherche] = useState('')
  const idxSexe = useMemo(() => indexSexeClients(clients), [clients])
  const [saving, setSaving] = useState(false)
  const [suggClient, setSuggClient] = useState(false)
  const [clientDetail, setClientDetail] = useState(null)
  const [purge, setPurge] = useState(null) // dossier d'un client terminé à supprimer totalement
  // Séance terminée (validité dépassée) d'un client sans abonnement en cours : suppression totale de son dossier.
  const boutonPurge = (r) => {
    if (!peutPurger || seanceValide(r.createdAt, params.validiteSeanceHeures, r.date)) return null
    const dossier = dossierClient({ nom: r.clientNom, site, clients, abonnements, seances, presences })
    if (!dossierTermine(dossier, params.validiteSeanceHeures)) return null
    return (
      <button onClick={(e) => { e.stopPropagation(); setPurge(dossier) }} title="Séance terminée : supprimer totalement ce client de la base"
        className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:bg-red-100"><Eraser size={16} /></button>
    )
  }
  const [qrNouveauClient, setQrNouveauClient] = useState(null)

  // Rafraîchit l'affichage toutes les 30 s : sans ça, le badge « Valide / Expirée »
  // d'une séance est figé à sa valeur du chargement de la page et resterait « Valide »
  // (vert) même une fois les N heures de validité écoulées, jusqu'à un rechargement.
  const [, tickValidite] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tickValidite((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])

  // Filtre de période — Jour / Mois / Année / Plage, sur la liste affichée ci-dessous.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')

  const vide = () => ({ id: null, date: todayStr(), clientNom: '', telephone: '', sexe: '', categorie: CATEGORIES_SEANCE[0].id, montant: String(tarifs[CATEGORIES_SEANCE[0].id] || ''), notes: '', imprimer: true, partenaire: false, partenaireStructure: '', modePaiement: 'especes', categorieNom: '', motifPrix: '' })
  const remplir = (s) => ({ id: s.id, date: s.date, clientNom: s.clientNom, sexe: sexeDe(s, idxSexe), telephone: '', categorie: estCategoriePerso(s.categorie) ? 'perso' : s.categorie, categorieNom: nomCategoriePerso(s.categorie), motifPrix: s.motifPrix || '', modePaiement: s.modePaiement || 'especes', montant: String(s.montant), notes: s.notes || '', partenaire: !!s.partenaire, partenaireStructure: s.partenaireStructure || '' })

  const toutes = useMemo(() => [...seances].sort((a, b) => (a.date < b.date ? 1 : -1)), [seances])
  // Période d'abord ; le tri par sexe s'applique ensuite (`liste`). `listePeriode`
  // sert à compter les « non précisé » sur la période affichée.
  const listePeriode = useMemo(() => {
    if (modePeriode === 'mois' && filtreMois) return toutes.filter((s) => (s.date || '').startsWith(filtreMois))
    if (modePeriode === 'annee' && filtreAnnee) return toutes.filter((s) => (s.date || '').startsWith(filtreAnnee))
    if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      return toutes.filter((s) => (!filtreDebut || s.date >= filtreDebut) && (!filtreFin || s.date <= filtreFin))
    }
    if (modePeriode === 'jour' && filtreJour) return toutes.filter((s) => s.date === filtreJour)
    return toutes
  }, [toutes, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])
  const liste = useMemo(() => filtrerParSexe(listePeriode, filtreSexe, idxSexe).filter((s) => correspond(recherche, s.clientNom, s.partenaireStructure)), [listePeriode, filtreSexe, idxSexe, recherche])
  const nbInconnus = useMemo(() => listePeriode.filter((s) => !sexeDe(s, idxSexe)).length, [listePeriode, idxSexe])
  const total = useMemo(() => liste.filter((x) => !x.annule).reduce((s, x) => s + (Number(x.montant) || 0), 0), [liste])

  // Quand on cherche un client, il n'apparaît qu'UNE fois, avec son nombre de passages et le total payé : plus de
  // dizaines de lignes à son nom. Un clic ouvre sa fiche, avec le détail de chaque passage. Sans recherche, la liste
  // reste séance par séance (pour imprimer un ticket, corriger ou supprimer une séance).
  const groupe = !!recherche.trim()
  const lignesAffichees = useMemo(() => {
    if (!groupe) return liste
    const m = new Map()
    liste.forEach((x) => { // `liste` est triée de la plus récente à la plus ancienne : la 1re ligne rencontrée est la dernière séance
      const k = (x.clientNom || '').trim().toLowerCase()
      const g = m.get(k)
      if (!g) m.set(k, { ...x, _groupe: true, nbPassages: 1, montantTotal: Number(x.montant) || 0 })
      else { g.nbPassages += 1; g.montantTotal += Number(x.montant) || 0 }
    })
    return [...m.values()]
  }, [liste, groupe])

  // Export Excel — reprend exactement la liste affichée (`liste`), donc le
  // filtre de période (Jour/Mois/Année/Plage) sélectionné ci-dessus.
  function exportXLSX() {
    const rows = liste.map((s) => ({
      Date: formatDateShort(s.date),
      Client: s.clientNom + (s.partenaire ? ` (partenaire${s.partenaireStructure ? ` : ${s.partenaireStructure}` : ''})` : ''),
      Sexe: sexeInfo(sexeDe(s, idxSexe))?.label || '—',
      Catégorie: categorieLabel(s.categorie),
      Montant: Number(s.montant) || 0,
      Notes: s.notes || '—',
      'Enregistrée par': s.enregistrePar || '—'
    }))
    exportRapportExcel({
      filename: `seances-maxi-gym-${todayStr()}.xlsx`,
      sections: [{
        name: 'Séances',
        title: 'Séances : MAXI-GYM',
        subtitle: `${liste.length} séance(s) · ${formatMoney(total)} au total`,
        columns: [
          { key: 'Date', label: 'Date', width: 14 },
          { key: 'Client', label: 'Client', width: 28 },
          { key: 'Sexe', label: 'Sexe', width: 10 },
          { key: 'Catégorie', label: 'Catégorie', width: 16 },
          { key: 'Montant', label: 'Montant', width: 16, type: 'money' },
          { key: 'Notes', label: 'Notes', width: 30 },
          { key: 'Enregistrée par', label: 'Enregistrée par', width: 20 }
        ],
        rows,
        totals: { __label: 'TOTAL', Montant: total }
      }]
    })
  }

  async function enregistrer() {
    // « Personnalisé » : la catégorie enregistrée est `perso:<nom>` (cf. data.js), avec un motif obligatoire.
    const personnalise = modal.categorie === 'perso'
    if (personnalise && !(modal.categorieNom || '').trim()) return toast.error('Indiquez le nom et le motif du montant (étudiant, négocié, offre…)')
    const d = personnalise ? { ...modal, categorie: `${PERSO_PREFIXE}${modal.categorieNom.trim()}`, motifPrix: modal.categorieNom.trim() } : modal
    const modePaiement = d.modePaiement || 'especes'
    if (!d.clientNom.trim()) return toast.error('Nom du client requis')
    if (!d.id && !d.sexe) return toast.error('Précisez le sexe du client (Femme ou Homme)')
    if (!d.montant || Number(d.montant) <= 0) return toast.error('Montant requis')
    if (d.partenaire && !d.partenaireStructure.trim()) return toast.error('Indiquez la structure du partenaire (ex. CIMTOGO)')
    setSaving(true)
    try {
      const clientNom = d.clientNom.trim()

      // Modification d'une séance existante — pas de nouvelle création de client, pas
      // de nouvelle facture ni de nouveau WhatsApp (déjà envoyés à l'enregistrement initial).
      if (d.id) {
        const { coachId, coachNom } = coachDuJour(d.date)
        await updateItem('gym_seances', d.id, {
          date: d.date, clientNom, categorie: d.categorie, montant: Number(d.montant), notes: d.notes.trim(), coachId, coachNom, modePaiement,
          ...(personnalise ? { motifPrix: d.motifPrix.trim() } : {}),
          ...(d.sexe ? { sexe: d.sexe } : {})
        })
        const ficheEdit = clients.find((c) => (c.nom || '').trim().toLowerCase() === clientNom.toLowerCase())
        if (d.sexe && ficheEdit && ficheEdit.sexe !== d.sexe) await updateItem('gym_clients', ficheEdit.id, { sexe: d.sexe })
        // La facture déjà générée à la création garde sinon l'ancien montant — le
        // Dashboard/Facturation (sommes des `gym_factures`) resterait alors désynchronisé.
        const factureLiee = factures.find((f) => f.sourceType === 'seance' && f.sourceId === d.id && !f.avoir)
        if (factureLiee) {
          await updateItem('gym_factures', factureLiee.id, {
            date: d.date, clientNom, categorie: d.categorie, modePaiement,
            description: `Séance ${categorieLabel(d.categorie)}`, montant: Number(d.montant),
            ...(d.sexe ? { sexe: d.sexe } : {})
          })
        }
        await audit('gym', 'SEANCE_MODIFIEE', `${clientNom} : ${categorieLabel(d.categorie)} : ${Number(d.montant).toLocaleString('fr-FR')} FCFA`)
        toast.success('Séance modifiée ✓')
        setModal(null)
        return
      }

      // Le répertoire Clients se construit uniquement à partir des séances/abonnements
      // réellement enregistrés — pas d'ajout manuel possible (cf. Clients.jsx). La
      // fiche est rattachée à la salle : le même nom peut donc exister des deux côtés,
      // chaque salle gardant sa propre clientèle.
      // Client partenaire : la séance est « portée au compte du partenaire » — pas
      // de facture ni de ticket sur le moment, c'est la structure qui règle le lot
      // en fin de mois (cf. volet « Clients partenaires »). Le marquage peut venir
      // de la fiche client OU être coché ici, à l'enregistrement de la séance.
      const telephoneSaisi = d.telephone.trim()
      let client = clients.find((c) => (c.nom || '').trim().toLowerCase() === clientNom.toLowerCase())
      const estPartenaire = !!d.partenaire || !!client?.partenaire
      const partenaireStructure = (d.partenaire ? d.partenaireStructure.trim() : '') || client?.partenaireStructure || ''
      let nouveauClient = null
      if (!client) {
        const qrToken = genQrToken()
        const nouveauClientId = await addItem('gym_clients', {
          nom: clientNom, telephone: telephoneSaisi, sexe: d.sexe, notes: '', site, qrToken, createdAt: Date.now(),
          partenaire: estPartenaire, partenaireStructure: estPartenaire ? partenaireStructure : ''
        })
        nouveauClient = { id: nouveauClientId, nom: clientNom, qrToken }
        client = { id: nouveauClientId, nom: clientNom, telephone: telephoneSaisi }
      } else if ((telephoneSaisi && !client.telephone) || client.sexe !== d.sexe) {
        await updateItem('gym_clients', client.id, {
          ...(telephoneSaisi && !client.telephone ? { telephone: telephoneSaisi } : {}),
          ...(client.sexe !== d.sexe ? { sexe: d.sexe } : {})
        })
      }
      // Coché ici sur un client existant pas encore marqué (ou structure différente) :
      // on met à jour sa fiche pour que ce soit automatique la prochaine fois.
      if (estPartenaire && client && (!client.partenaire || (client.partenaireStructure || '') !== partenaireStructure)) {
        await updateItem('gym_clients', client.id, { partenaire: true, partenaireStructure })
      }

      const { coachId, coachNom } = coachDuJour(d.date)
      const id = await addItem('gym_seances', {
        date: d.date, clientNom, ...(client?.id ? { clientId: client.id } : {}), sexe: d.sexe, categorie: d.categorie, montant: Number(d.montant), modePaiement, notes: d.notes.trim(), site, coachId, coachNom,
        ...(personnalise ? { motifPrix: d.motifPrix.trim() } : {}),
        partenaire: estPartenaire, partenaireStructure, regleParPartenaire: false,
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
      })
      await audit('gym', 'SEANCE_CREATE', `${clientNom} : ${categorieLabel(d.categorie)} : ${Number(d.montant).toLocaleString('fr-FR')} FCFA${estPartenaire ? ` : portée au compte ${partenaireStructure}` : ''}`)
      const telephone = telephoneSaisi || client?.telephone
      if (telephone) {
        sendWhatsApp([telephone], {
          title: '🏋️ MAXI-GYM',
          body: `Bonjour ${clientNom}, votre séance ${categorieLabel(d.categorie)} vient d'être enregistrée. Bonne séance ! 💪`
        })
      }

      if (estPartenaire) {
        toast.success(`Séance portée au compte de ${partenaireStructure} : à régler en fin de mois ✓`)
        setModal(null)
      } else {
        // Une facture est TOUJOURS générée pour un client normal (visible dans le
        // volet Facturation, avec son propre bouton d'impression). Le ticket ne
        // s'imprime que si la case « Imprimer le reçu » est cochée.
        const facture = await genererFactureGym({
          sourceType: 'seance', sourceId: id, clientNom, clientId: client?.id, clientTelephone: telephone,
          categorie: d.categorie, description: `Séance ${categorieLabel(d.categorie)}`, montant: d.montant,
          user, site, date: d.date, sexe: d.sexe, imprime: d.imprimer, modePaiement
        })
        // Montant libre : la direction est prévenue, avec le motif donné par l'agent.
        if (personnalise) {
          notify({
            type: 'info', title: `🎚️ Séance personnalisée : MAXI-GYM ${site === 'kara' ? 'Kara' : 'Lomé'}`,
            body: `${clientNom} : ${categorieLabel(d.categorie)} : ${formatMoney(Number(d.montant))}. Motif : ${d.motifPrix.trim()}. Par ${user?.nom || user?.login || '—'}.`,
            module: 'gym', site, forRoles: ['info', 'assistant_pau', 'ge', 'pau', 'directeur'], excludeUid: user?.uid, link: `/gym/${site}/seances`
          }).catch(() => {})
        }
        if (d.imprimer) imprimerTicketSeance(facture)
        toast.success(d.imprimer ? 'Séance enregistrée : reçu imprimé ✓' : 'Séance enregistrée ✓')
        setModal(null)
      }
      // Nouveau client : on propose tout de suite son QR carnet, pendant qu'il
      // est encore devant la réception — masqué tant que QR_CARNET_ACTIF est faux.
      if (nouveauClient && QR_CARNET_ACTIF) setQrNouveauClient(nouveauClient)
    } finally { setSaving(false) }
  }

  // Facture une séance existante qui n'en a pas encore (ex. enregistrée avant ce
  // changement) — sans re-déclencher le WhatsApp ni recréer le client.
  async function facturer(s) {
    const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === (s.clientNom || '').trim().toLowerCase())
    const facture = await genererFactureGym({
      sourceType: 'seance', sourceId: s.id, clientNom: s.clientNom, clientId: s.clientId || client?.id, clientTelephone: client?.telephone,
      categorie: s.categorie, description: `Séance ${categorieLabel(s.categorie)}`, montant: s.montant,
      user, site, date: s.date, sexe: sexeDe(s, idxSexe), modePaiement: s.modePaiement || 'especes'
    })
    imprimerTicketSeance(facture)
    toast.success('Facture générée ✓')
  }

  async function supprimer(s) {
    // La facture de la séance part avec elle : sinon elle resterait comptée dans les totaux.
    const liees = factures.filter((f) => f.sourceType === 'seance' && f.sourceId === s.id)
    const mentionFactures = liees.length ? `

Sa facture (${liees.map((f) => f.numero).join(', ')}) sera supprimée aussi : les totaux baisseront de ${formatMoney(liees.reduce((t, f) => t + (Number(f.montant) || 0), 0))}.` : ''
    if (!confirm(`Supprimer la séance de ${s.clientNom} du ${formatDateShort(s.date)} ?${mentionFactures}`)) return
    await removeItem('gym_seances', s.id)
    for (const f of liees) await removeItem('gym_factures', f.id, { sansMotif: true })
    if (liees.length) await audit('gym', 'FACTURE_SUPPRIMEE', `${liees.map((f) => f.numero).join(', ')} : supprimée avec la séance de ${s.clientNom}`)
    await audit('gym', 'SEANCE_DELETE', `${s.clientNom} : ${Number(s.montant).toLocaleString('fr-FR')} FCFA`)
    toast.success('Séance supprimée')
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #A6342Ae6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Ticket size={28} color="white" />
        </div>
        <div className="min-w-[11rem] flex-1">
          <h2 className="text-lg font-extrabold">Séances</h2>
          <p className="text-sm text-white/80">{liste.length} séance(s){groupe ? ` · ${lignesAffichees.length} client(s)` : ''} : {formatMoney(total)} au total : valables {params.validiteSeanceHeures} h</p>
        </div>
        {/* Filtre de période directement dans le bandeau (glassmorphism) — à la place
            d'une ligne séparée en dessous. */}
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
        {!lectureSeule && <BoutonGym variante="ajouter" icone={Ticket} animation="ticket" badgePlus onClick={() => setModal(vide())}>Nouvelle séance</BoutonGym>}
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'clientNom', label: 'Client', render: (r) => (
              <div className="flex flex-col items-start gap-1">
                <span className="whitespace-nowrap">{r.clientNom}</span>
                <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap empty:hidden">
                {r._groupe && <span title={`${r.nbPassages} passage(s) : cliquez pour le détail de chacun`} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-extrabold text-orange-700"><Dumbbell size={10} /> {r.nbPassages} passage{r.nbPassages > 1 ? 's' : ''}</span>}
                {r.partenaire && (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">🤝 {r.partenaireStructure || 'partenaire'}</span>
                )}
                </div>
              </div>
            ) },
            { key: 'sexe', label: 'Sexe', align: 'center', render: (r) => <SexeBadge sexe={sexeDe(r, idxSexe)} /> },
            { key: 'categorie', label: 'Catégorie', render: (r) => <Badge tone={categorieTone(r.categorie)}>{categorieLabel(r.categorie)}</Badge> },
            { key: 'montant', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r._groupe ? r.montantTotal : r.montant)}</strong> },
            { key: 'validite', label: 'Validité', render: (r) => {
              const valide = seanceValide(r.createdAt, params.validiteSeanceHeures, r.date)
              return (
                <Badge tone={valide ? 'success' : 'neutral'}>
                  {valide ? `Valide jusqu'à ${heureCourte(finValiditeSeance(r.createdAt, params.validiteSeanceHeures, r.date))}` : 'Expirée'}
                </Badge>
              )
            } },
            { key: 'notes', label: 'Notes', render: (r) => (r._groupe ? '—' : (r.notes || '—')) },
            { key: 'enregistrePar', label: 'Enregistrée par' },
            { key: 'actions', label: '', align: 'right', render: (r) => {
              // Ligne regroupée (recherche d'un client) : un seul geste, ouvrir sa fiche avec tous les passages.
              if (r._groupe) {
                return (
                  <div className="flex justify-end">
                    <button onClick={(e) => { e.stopPropagation(); setClientDetail(r.clientNom) }} title="Voir tous les détails" className="rounded-lg border border-orange-200 bg-white p-1.5 text-orange-600 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-orange-50"><Eye size={16} /></button>
                  </div>
                )
              }
              // Séance partenaire : pas de facture ni de ticket — juste l'état de
              // règlement par la structure (mis à jour depuis le volet Clients partenaires).
              if (r.partenaire) {
                return (
                  <div className="flex justify-end gap-1">
                    <Badge tone={r.regleParPartenaire ? 'success' : 'warning'}>
                      {r.regleParPartenaire ? 'Réglé par la structure' : 'Au compte du partenaire'}
                    </Badge>
                    {!lectureSeule && <button onClick={(e) => { e.stopPropagation(); setModal(remplir(r)) }} title="Modifier" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>}
                    {peutSupprimer && (
                      <button onClick={(e) => { e.stopPropagation(); supprimer(r) }} title="Supprimer" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                    )}
                  {boutonPurge(r)}
                  </div>
                )
              }
              const facture = factures.find((f) => f.sourceType === 'seance' && f.sourceId === r.id)
              return (
                <div className="flex justify-end gap-1">
                  {facture ? (
                    <button onClick={(e) => { e.stopPropagation(); imprimerTicketSeance(facture) }}
                      title={facture.imprime === false ? 'Pas encore imprimé : cliquer pour imprimer' : 'Réimprimer le ticket'}
                      className={`rounded p-1.5 hover:bg-orange-50 ${facture.imprime === false ? 'text-amber-500' : 'text-orange-600'}`}><Printer size={16} /></button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); facturer(r) }} title="Générer la facture manquante"
                      className="rounded p-1.5 text-amber-600 hover:bg-amber-50"><Receipt size={16} /></button>
                  )}
                  {!lectureSeule && <button onClick={(e) => { e.stopPropagation(); setModal(remplir(r)) }} title="Modifier" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>}
                  {peutSupprimer && (
                    <button onClick={(e) => { e.stopPropagation(); supprimer(r) }} title="Supprimer" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                  )}
                  {boutonPurge(r)}
                </div>
              )
            } }
          ]}
          rows={lignesAffichees}
          onRowClick={(r) => setClientDetail(r.clientNom)}
          empty="Aucune séance enregistrée."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier la séance' : 'Nouvelle séance'}
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<>
          <BoutonGym variante="secondaire" icone={X} onClick={() => setModal(null)} disabled={saving}>Annuler</BoutonGym>
          <BoutonGym icone={CheckCircle2} onClick={enregistrer} loading={saving}>{modal?.id ? 'Enregistrer les modifications' : 'Enregistrer'}</BoutonGym>
        </>}>
        {modal && (() => {
          const ficheClientSaisi = clients.find((c) => (c.nom || '').trim().toLowerCase() === modal.clientNom.trim().toLowerCase())
          const entree = (i) => ({ animation: `se-entree 0.4s ease-out ${i * 0.06}s both` })
          return (
          <div className="space-y-3">
            <style>{`
              @keyframes se-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
              @keyframes se-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
              @keyframes se-pop { 0% { transform: scale(0.94); } 60% { transform: scale(1.05); } 100% { transform: scale(1); } }
              @keyframes se-reflet { 0% { transform: translateX(-120%) skewX(-12deg); } 100% { transform: translateX(520%) skewX(-12deg); } }
              @keyframes se-montant { 0% { transform: scale(0.96); opacity: 0.6; } 100% { transform: scale(1); opacity: 1; } }
            `}</style>

            {/* Héro en verre : ticket 3D qui flotte, reflet qui passe de temps en temps. */}
            <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl border border-white/40 p-4 text-white shadow-[0_16px_30px_-14px_rgba(166,52,42,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl"
              style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)`, animation: 'se-entree 0.35s ease-out both' }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-white/25 blur-md" style={{ animation: 'se-reflet 4.5s ease-in-out 1s infinite' }} />
              <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),inset_0_-3px_5px_rgba(0,0,0,0.2),0_10px_20px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md">
                <Ticket size={26} style={{ animation: 'se-flotte 2.8s ease-in-out infinite' }} />
              </span>
              <div className="relative min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{modal.clientNom || (modal.id ? 'Modifier la séance' : 'Nouvelle séance')}</p>
                <p className="flex items-center gap-1.5 text-sm text-white/85"><Timer size={14} /> Valable {params.validiteSeanceHeures} h à partir de l'enregistrement</p>
              </div>
            </div>

            {/* Bento : chaque information dans sa tuile de verre. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2" style={entree(1)}>
                <FormGroup label={<Etiq icone={User} couleur="#7c3aed">Client</Etiq>} required className="!mb-0">
                  <div className="relative">
                    <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input value={modal.clientNom} className="pl-8"
                      onChange={(e) => {
                        const nom = e.target.value
                        const fiche = clients.find((c) => (c.nom || '').trim().toLowerCase() === nom.trim().toLowerCase())
                        setModal((f) => ({ ...f, clientNom: nom, ...(fiche ? { partenaire: !!fiche.partenaire, partenaireStructure: fiche.partenaireStructure || f.partenaireStructure, sexe: fiche.sexe || f.sexe } : {}) }))
                        setSuggClient(true)
                      }}
                      onFocus={() => setSuggClient(true)}
                      onBlur={() => setTimeout(() => setSuggClient(false), 150)}
                      placeholder="Nom du client" autoComplete="off" />
                    {suggClient && modal.clientNom.trim() && (() => {
                      const q = modal.clientNom.trim().toLowerCase()
                      const suggestions = clients.filter((c) => (c.nom || '').toLowerCase().includes(q) && (c.nom || '').toLowerCase() !== q).slice(0, 5)
                      return suggestions.length > 0 ? (
                        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                          {suggestions.map((c) => (
                            <button key={c.id} type="button"
                              onMouseDown={() => { setModal((f) => ({ ...f, clientNom: c.nom, telephone: c.telephone || f.telephone, sexe: c.sexe || f.sexe, partenaire: !!c.partenaire, partenaireStructure: c.partenaireStructure || f.partenaireStructure })); setSuggClient(false) }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-orange-50">
                              <span className="font-semibold text-gray-700">{c.nom}</span>
                              {c.partenaire && <span className="rounded-full bg-sky-100 px-1.5 text-[10px] font-bold text-sky-700">🤝 {c.partenaireStructure || 'partenaire'}</span>}
                              {c.telephone && <span className="text-xs text-gray-400">· {c.telephone}</span>}
                            </button>
                          ))}
                        </div>
                      ) : null
                    })()}
                  </div>
                </FormGroup>
              </div>

              <div style={entree(2)}>
                <FormGroup label={<Etiq icone={Users} couleur="#ec4899">Sexe</Etiq>} required={!modal.id} className="!mb-0" hint="Pour suivre la proportion de femmes et d'hommes">
                  <SexeBoutons value={modal.sexe} onChange={(v) => setModal((f) => ({ ...f, sexe: v }))} />
                </FormGroup>
              </div>
              {!modal.id && (
                <div style={entree(3)}>
                  <FormGroup label={<Etiq icone={MessageCircle} couleur="#16a34a">Téléphone</Etiq>} className="!mb-0" hint="Optionnel : confirmation WhatsApp">
                    <div className="relative">
                      <MessageCircle size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-green-500" />
                      <Input className="pl-8" value={modal.telephone} onChange={(e) => setModal((f) => ({ ...f, telephone: e.target.value }))} placeholder="ex : 22890000000" />
                    </div>
                  </FormGroup>
                </div>
              )}

              {/* Catégorie : cartes en verre avec icône 3D ; la choisie se teinte, fait un « pop » et affiche une coche. */}
              <div className="col-span-2" style={entree(4)}>
                <FormGroup label={<Etiq icone={Tag} couleur="#0ea5e9">Catégorie</Etiq>} className="!mb-0" hint={categorieDesc(modal.categorie)}>
                  <div className="grid grid-cols-3 gap-2">
                    {[...CATEGORIES_SEANCE, SEANCE_PERSO].map((c) => {
                      const actif = modal.categorie === c.id
                      const coul = COULEUR_CATEGORIE[c.id]
                      const Ic = ICONE_CATEGORIE[c.id] || Tag
                      const tarif = tarifs[c.id]
                      return (
                        <button key={c.id} type="button" aria-pressed={actif} onClick={() => {
                          setModal((f) => ({ ...f, categorie: c.id, montant: c.id === 'perso' ? '' : (tarif != null ? String(tarif) : f.montant) }))
                        }}
                          className={`group relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl border px-2 py-2.5 text-xs font-extrabold backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${actif ? 'border-white/60 text-white shadow-[0_12px_22px_-10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.5)]' : 'border-white/70 bg-white/70 text-gray-600'}`}
                          style={actif ? { background: `linear-gradient(135deg, ${coul}, ${coul}cc)`, animation: 'se-pop 0.3s ease-out' } : undefined}>
                          {actif && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />}
                          {actif && <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/90" style={{ color: coul, animation: 'se-pop 0.3s ease-out' }}><Check size={10} strokeWidth={3.5} /></span>}
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
                  <FormGroup label={<Etiq icone={SlidersHorizontal} couleur="#8b5cf6">Nom et motif</Etiq>} required className="!mb-0" hint="Ce texte nomme la catégorie et sert de motif : la direction est prévenue du montant libre.">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {['Étudiant', 'Couple', 'Tarif négocié', 'Offre / promotion', 'Parrainage'].map((m) => (
                        <button key={m} type="button" onClick={() => setModal((f) => ({ ...f, categorieNom: m, motifPrix: m }))}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all hover:-translate-y-0.5 ${modal.categorieNom === m ? 'border-transparent text-white shadow-md' : 'border-gray-200 bg-white text-gray-600'}`}
                          style={modal.categorieNom === m ? { background: '#8b5cf6' } : undefined}>{m}</button>
                      ))}
                    </div>
                    <Input value={modal.categorieNom || ''} placeholder="ex : Étudiant, tarif négocié…" onChange={(e) => setModal((f) => ({ ...f, categorieNom: e.target.value, motifPrix: e.target.value }))} />
                  </FormGroup>
                </div>
              )}

              <div style={entree(5)}>
                <FormGroup label={<Etiq icone={CalendarDays} couleur="#f59e0b">Date</Etiq>} className="!mb-0">
                  <Input type="date" value={modal.date} onChange={(e) => setModal((f) => ({ ...f, date: e.target.value }))} />
                </FormGroup>
              </div>
              <div style={entree(6)}>
                {/* Verrouillé sur le tarif configuré dans Paramètres : impossible de saisir un autre montant (ex. 500 pour une
                    Simple à 1000), à la création comme en modifiant une séance. Pour changer le prix, changer le tarif dans
                    Paramètres (il s'applique aux prochaines séances). Simple/VIP uniquement : pas de séance Classique. */}
                <FormGroup label={<Etiq icone={Wallet} couleur="#16a34a">Montant (FCFA)</Etiq>} required className="!mb-0" hint={modal.categorie === 'perso' ? 'Montant libre' : 'Tarif de la catégorie, non modifiable'}>
                  {modal.categorie === 'perso' ? (
                    <Input type="number" min="1" value={modal.montant} placeholder="ex : 500" onChange={(e) => setModal((f) => ({ ...f, montant: e.target.value }))} />
                  ) : (
                    <div className="relative">
                      <Input type="number" min="0" value={modal.montant} disabled className="bg-gray-50 pr-9 font-bold text-gray-700" />
                      <Lock size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                  )}
                </FormGroup>
              </div>

              <div className="col-span-2" style={entree(6.5)}>
                <FormGroup label={<Etiq icone={Wallet} couleur="#f59e0b">Mode de paiement</Etiq>} className="!mb-0" hint="Espèces ou Mobile Money.">
                  <ModesPaiement value={modal.modePaiement} onChange={(m) => setModal((f) => ({ ...f, modePaiement: m }))} />
                </FormGroup>
              </div>
              <div className="col-span-2" style={entree(7)}>
                <FormGroup label={<Etiq icone={StickyNote} couleur="#64748b">Notes</Etiq>} className="!mb-0" hint="Optionnel">
                  <Input value={modal.notes} onChange={(e) => setModal((f) => ({ ...f, notes: e.target.value }))} />
                </FormGroup>
              </div>
            </div>

            {/* Résumé en verre : confirmation visuelle avant validation. */}
            <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 overflow-hidden rounded-2xl border border-white/80 bg-white/85 px-3.5 py-3 shadow-[0_12px_24px_-14px_rgba(166,52,42,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md" style={entree(8)}>
              <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-gray-600">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={icone3D('#7c3aed')}><User size={14} /></span>
                <span className="truncate">{modal.clientNom || 'Client à saisir'}</span>
                <Badge tone={modal.categorie === 'perso' ? 'primary' : categorieTone(modal.categorie)}>{modal.categorie === 'perso' ? ((modal.categorieNom || '').trim() || 'Personnalisé') : categorieLabel(modal.categorie)}</Badge>
              </div>
              <span key={modal.montant} className="shrink-0 text-lg font-black" style={{ color: COULEUR2, animation: 'se-montant 0.25s ease-out' }}>{formatMoney(Number(modal.montant) || 0)}</span>
            </div>

            {/* Client partenaire : marquable directement ici (et pas seulement sur la fiche client), pré-coché si la fiche
                l'est déjà. Une séance partenaire est « portée au compte » : pas de facture ni de ticket, réglée par la
                structure en fin de mois (cf. volet Clients partenaires). */}
            {!modal.id && (
              <div className="rounded-2xl border border-sky-200/80 bg-sky-50/70 p-3 backdrop-blur-md" style={entree(9)}>
                <button type="button" aria-pressed={!!modal.partenaire}
                  onClick={() => setModal((f) => ({ ...f, partenaire: !f.partenaire, imprimer: !f.partenaire ? false : f.imprimer }))}
                  className="flex w-full items-center gap-2.5 text-left">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D('#0284c7')}><Handshake size={16} /></span>
                  <span className="min-w-0 flex-1 text-sm font-bold text-sky-900">Client partenaire <span className="font-medium text-sky-700">(paie en fin de mois via sa structure)</span></span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${modal.partenaire ? 'border-sky-600 bg-sky-600 text-white' : 'border-sky-300 bg-white text-transparent'}`}><Check size={12} strokeWidth={3.5} /></span>
                </button>
                {modal.partenaire && (
                  <div className="mt-2.5 space-y-1.5" style={{ animation: 'se-entree 0.3s ease-out both' }}>
                    <FormGroup label={<Etiq icone={Handshake} couleur="#0284c7">Structure</Etiq>} required className="!mb-0">
                      <Input value={modal.partenaireStructure} onChange={(e) => setModal((f) => ({ ...f, partenaireStructure: e.target.value }))} placeholder="ex : CIMTOGO" />
                    </FormGroup>
                    <p className="text-[11px] text-sky-700">
                      Séance <strong>portée au compte du partenaire</strong> : ni facture ni ticket maintenant.
                      {!ficheClientSaisi?.partenaire && ' La fiche du client sera aussi marquée « partenaire » pour les prochaines fois.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!modal.id && !modal.partenaire && (
              <div className="rounded-2xl border border-white/80 bg-white/70 p-3 shadow-sm backdrop-blur-md" style={entree(9)}>
                <button type="button" aria-pressed={!!modal.imprimer} onClick={() => setModal((f) => ({ ...f, imprimer: !f.imprimer }))} className="flex w-full items-center gap-2.5 text-left">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D('#E8850F')}><Printer size={16} /></span>
                  <span className="min-w-0 flex-1 text-sm font-bold text-gray-700">Imprimer le reçu maintenant</span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${modal.imprimer ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-300 bg-white text-transparent'}`}><Check size={12} strokeWidth={3.5} /></span>
                </button>
                <p className="ml-10 mt-0.5 text-[11px] text-gray-400">
                  {modal.imprimer
                    ? 'Une facture est générée et le ticket s\'imprime aussitôt.'
                    : 'Une facture est quand même générée (visible dans Facturation), sans impression immédiate : réimprimable depuis la liste.'}
                </p>
              </div>
            )}
          </div>
          )
        })()}
      </Modal>

      <PurgeClientModal dossier={purge} onClose={() => setPurge(null)} />
      <ClientDetailModal clientNom={clientDetail} onClose={() => setClientDetail(null)}
        clients={clients} seances={seances} abonnements={abonnements} presences={presences} />
      <QrCarnetModal client={qrNouveauClient} onClose={() => setQrNouveauClient(null)} />
    </div>
  )
}

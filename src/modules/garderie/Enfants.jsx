import { useMemo, useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, Eye, Search, FilePen, Trash2, UserPlus, Camera, X, Loader2, UserCheck, UserX, CreditCard, ShieldAlert, Baby, GraduationCap, DoorOpen, ChevronRight, ArrowLeft, Users } from 'lucide-react'
import { compresserPhotoProfil } from '../../utils/fichiers'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, genId, formatDateShort, formatMoney } from '../../utils/formatters'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { GROUPES_AGE, STATUTS_ENFANT, PROGRAMMES_ENFANT, GROUPES_PAR_PROGRAMME, programmeDuGroupe, TYPES_ABONNEMENT } from './data'
import { calcAge, groupeRecommande, groupeDepuisAgeTexte, tarifSuggere, aImpayes, dateFinCourtSejour, joursAvantFinCourtSejour } from './logic'
import { useGarderieStore } from './store/garderieStore'
import { toggleScolariteClass } from './pastilles'
import ModePaiementBoutons from './ModePaiementBoutons'

const emptyJournalier = () => ({
  nom: '', prenom: '', ageApprox: '',
  parentNom: '', parentContact: '',
  date: todayStr(), nombreJours: '1', notes: '',
  apporteRepas: false
})

const empty = () => ({
  nom: '', prenom: '', photo: '', dateNaissance: '', ageSaisi: '', sexe: 'F',
  programme: '', groupe: '', statut: 'actif',
  typeAbonnement: 'mensuel', dureeSemaines: '',
  allergies: '', infoMedicale: '',
  parentId: '', parentNom: '', parentContact: '',
  parentContact2: '', parentProfession: '', adresse: '',
  dateInscription: todayStr(), notes: ''
})

// Paiements saisis en même temps que l'inscription (facultatif) — mêmes trois
// volets que l'écran Paiements (inscription / scolarité / cuisine), pour éviter
// l'aller-retour si le parent règle sur place. `modeScolarite` distingue un
// versement partiel (tranche) d'un règlement complet — cf. `toggleScolariteClass`.
const emptyPaiementInscription = () => ({
  montantInscription: '',
  montantScolarite: '', modeScolarite: null, montantScolariteVerse: '',
  montantCuisine: '',
  modePaiement: 'espece'
})

export default function Enfants() {
  const { user, role } = useAuth()
  const lectureSeule = role === 'tata' || role === 'superviseur' || role === 'partenaire'
  const { data: enfants }     = useCollection('garderie_enfants')
  const { data: parents }     = useCollection('garderie_parents')
  const { data: journaliers } = useCollection('garderie_journaliers')
  const { data: presences }   = useCollection('garderie_presences')
  const { data: incidents }   = useCollection('garderie_incidents')
  const { data: paiements }   = useCollection('garderie_paiements')

  const [onglet, setOnglet]   = useState('inscrits')
  const [recherche, setRecherche] = useState('')
  const [filtreProgramme, setFiltreProgramme] = useState('')
  const [filtreGroupe, setFiltreGroupe] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('actif')
  // Tri par date d'inscription — un mode à la fois (Jour / Mois / Année / Plage),
  // comme le sélecteur de période de Présences enfants.
  const [modeDateInsc, setModeDateInsc] = useState('') // '' | 'jour' | 'mois' | 'annee' | 'plage'
  const [dateInscJour, setDateInscJour]   = useState('')
  const [dateInscMois, setDateInscMois]   = useState('') // 'YYYY-MM'
  const [dateInscAnnee, setDateInscAnnee] = useState('')
  const [dateInscDebut, setDateInscDebut] = useState('')
  const [dateInscFin, setDateInscFin]     = useState('')
  const [modal, setModal]       = useState(null)
  // Paiements (inscription / scolarité / cuisine) saisis en même temps que
  // l'inscription d'un enfant — facultatif, cf. handleSave().
  const [paiementInscription, setPaiementInscription] = useState(emptyPaiementInscription())
  const [detail, setDetail]     = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deletedEnfantIds    = useGarderieStore((s) => s.deletedEnfantIds)
  const markEnfantDeleted   = useGarderieStore((s) => s.markEnfantDeleted)
  const unmarkEnfantDeleted = useGarderieStore((s) => s.unmarkEnfantDeleted)
  const GRILLE_TARIFAIRE    = useGarderieStore((s) => s.grilleTarifaire)

  async function handleDelete() {
    if (!toDelete || deleting) return
    const target = toDelete
    setDeleting(true)
    markEnfantDeleted(target.id)
    setToDelete(null)
    try {
      // Suppression RÉELLE et définitive : l'enregistrement quitte la base.
      //
      // L'ancienne logique écrivait d'abord un statut 'supprime' (pierre tombale)
      // et ne tentait la vraie suppression qu'en « best-effort », avec un
      // `.catch()` silencieux. Résultat : au moindre échec, l'enfant restait en
      // base indéfiniment — masqué dans l'écran, mais bien présent dans les
      // données. C'est précisément ce comportement qui est corrigé ici : plus de
      // pierre tombale, et un échec est signalé au lieu d'être avalé.
      await removeItem('garderie_enfants', target.id)
      audit('garderie', 'ENFANT_DELETE', `${target.prenom} ${target.nom}`)
      toast.success(`${target.prenom} ${target.nom} supprimé(e) ✓`)
    } catch (err) {
      // Échec réel : on démasque et on prévient, au lieu de prétendre que la
      // suppression a marché alors que l'enfant est toujours en base.
      unmarkEnfantDeleted(target.id)
      toast.error(`Échec de la suppression de ${target.prenom} ${target.nom} — réessayez.`)
    } finally {
      setDeleting(false)
    }
  }

  // Clôture l'alarme « séjour terminé » (court séjour arrivé à échéance, déclenchée
  // par SurveillanceFinSejour) — n'efface pas l'enfant ni son abonnement, seulement
  // l'alerte persistante affichée sur le Dashboard. Le statut se change séparément
  // (fiche « Modifier ») si l'enfant a effectivement quitté la garderie.
  async function resoudreFinSejour(e) {
    await updateItem('garderie_enfants', e.id, { finSejourAlarme: false })
    audit('garderie', 'FIN_SEJOUR_RESOLU', `${e.prenom} ${e.nom}`)
    toast.success(`Alerte de fin de séjour de ${e.prenom} ${e.nom} clôturée ✓`)
    setDetail((d) => (d && d.id === e.id ? { ...d, finSejourAlarme: false } : d))
  }

  const liste = useMemo(() => {
    // `deletedEnfantIds` est un masquage local temporaire (perdu au rechargement) —
    // on exclut AUSSI sur le statut persisté en base, seule source fiable après reload.
    let rows = enfants.filter((e) => !deletedEnfantIds.has(e.id) && e.statut !== 'supprime')
    if (filtreStatut) rows = rows.filter((e) => e.statut === filtreStatut)
    if (filtreProgramme) rows = rows.filter((e) => (e.programme || programmeDuGroupe(e.groupe)) === filtreProgramme)
    if (filtreGroupe) rows = rows.filter((e) => e.groupe === filtreGroupe)
    if (modeDateInsc === 'jour' && dateInscJour) {
      rows = rows.filter((e) => (e.dateInscription || '').slice(0, 10) === dateInscJour)
    } else if (modeDateInsc === 'mois' && dateInscMois) {
      rows = rows.filter((e) => (e.dateInscription || '').slice(0, 7) === dateInscMois)
    } else if (modeDateInsc === 'annee' && dateInscAnnee) {
      rows = rows.filter((e) => (e.dateInscription || '').startsWith(dateInscAnnee))
    } else if (modeDateInsc === 'plage' && dateInscDebut && dateInscFin) {
      rows = rows.filter((e) => {
        const d = (e.dateInscription || '').slice(0, 10)
        return d && d >= dateInscDebut && d <= dateInscFin
      })
    }
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((e) => `${e.prenom} ${e.nom} ${e.parentNom}`.toLowerCase().includes(q))
    }
    return rows.sort((a, b) => `${a.prenom} ${a.nom}` < `${b.prenom} ${b.nom}` ? -1 : 1)
  }, [enfants, recherche, filtreProgramme, filtreGroupe, filtreStatut, modeDateInsc, dateInscJour, dateInscMois, dateInscAnnee, dateInscDebut, dateInscFin, deletedEnfantIds])

  // KPI — répartition par statut au sein du programme sélectionné (indépendant
  // du filtre Statut, pour toujours voir les 3 compteurs côte à côte).
  const statsProgramme = useMemo(() => {
    let rows = enfants.filter((e) => !deletedEnfantIds.has(e.id) && e.statut !== 'supprime')
    if (filtreProgramme) rows = rows.filter((e) => (e.programme || programmeDuGroupe(e.groupe)) === filtreProgramme)
    return {
      actifs: rows.filter((e) => e.statut === 'actif').length,
      suspendus: rows.filter((e) => e.statut === 'suspendu').length,
      sortis: rows.filter((e) => e.statut === 'sorti').length,
      total: rows.length
    }
  }, [enfants, filtreProgramme, deletedEnfantIds])

  // Avant toute inscription, la gérante choisit d'abord le TYPE d'enfant — la suite
  // (formulaire complet vs fiche journalière) dépend entièrement de ce choix.
  const [choixInscription, setChoixInscription] = useState(false)
  function openCreate() { setChoixInscription(true) }
  function choisirTypeInscription(type) {
    setChoixInscription(false)
    if (type === 'journalier') {
      setJoModal({ data: emptyJournalier(), isNew: true })
      setJoPaiement({ montantPaye: '', modePaiement: 'espece' })
      setJoRecherche('')
    } else {
      // La maternelle inscrit pour toute l'année scolaire — pas de mensuel/court
      // séjour possible pour ce programme (cf. Type d'abonnement, masqué en JSX).
      setModal({ data: { ...empty(), programme: type, typeAbonnement: type === 'maternelle' ? 'annuel' : 'mensuel' }, isNew: true })
      setPaiementInscription(emptyPaiementInscription())
    }
  }
  // Fiches créées avant l'ajout du champ `programme` : déduit du groupe pour que le
  // sélecteur s'ouvre déjà cohérent, plutôt que vide.
  function openEdit(e)  { setModal({ data: { ...empty(), ...e, programme: e.programme || programmeDuGroupe(e.groupe) }, isNew: false, id: e.id }) }

  async function handleSave() {
    if (saving) return
    // La maternelle inscrit pour toute l'année scolaire, quoi qu'il en soit du
    // sélecteur (masqué en JSX pour ce programme) — filet de sécurité pour une
    // fiche modifiée avant l'ajout de cette règle.
    const d = modal.data.programme === 'maternelle'
      ? { ...modal.data, typeAbonnement: 'annuel' }
      : modal.data
    if (!d.nom.trim() || !d.prenom.trim()) return toast.error('Nom et prénom requis')
    if (!d.dateNaissance && !d.ageSaisi?.trim()) return toast.error('Date de naissance ou âge requis')
    if (!d.groupe) return toast.error('Groupe requis')
    if (!d.parentNom?.trim()) return toast.error('Nom du parent / tuteur requis')
    if (!d.parentContact?.trim()) return toast.error('Contact principal du parent requis')
    if (!d.adresse?.trim()) return toast.error('Adresse requise')
    if (d.typeAbonnement === 'court_sejour' && (!d.dureeSemaines || Number(d.dureeSemaines) < 2)) {
      return toast.error('Durée du court séjour requise (2 semaines minimum)')
    }
    // Paiements saisis à l'inscription — validés seulement si un montant a été
    // renseigné (tout est facultatif, cf. emptyPaiementInscription).
    const montantScolariteSaisi = Number(paiementInscription.montantScolarite) || 0
    if (montantScolariteSaisi > 0 && !paiementInscription.modeScolarite) {
      return toast.error('Précisez si la scolarité est payée par tranche ou en totalité')
    }
    if (paiementInscription.modeScolarite === 'tranche') {
      const verse = Number(paiementInscription.montantScolariteVerse) || 0
      if (verse <= 0) return toast.error('Montant versé (tranche) requis')
      const du = montantScolariteSaisi + (Number(paiementInscription.montantCuisine) || 0)
      if (verse > du) return toast.error(`Le montant versé ne peut pas dépasser le total dû (${formatMoney(du)})`)
    }

    setSaving(true)
    try {
      if (modal.isNew) {
        const id = genId()
        await setItem('garderie_enfants', id, { ...d, id })
        audit('garderie', 'ENFANT_CREATE', `${d.prenom} ${d.nom}`, { groupe: d.groupe })
        notify({ type: 'info', title: '🍼 Nouvel enfant inscrit', body: `${d.prenom} ${d.nom} a été inscrit(e) à la garderie`, module: 'garderie', forRoles: ['ge','gerante_garderie'], excludeUid: user.uid, link: '/garderie/enfants' })

        // Paiements encaissés en même temps que l'inscription, si renseignés —
        // même logique que le paiement optionnel des journaliers (cf.
        // handleSaveJournalier) : jusqu'à 2 lignes dans garderie_paiements
        // (inscription, scolarité — celle-ci porte aussi les frais de cuisine,
        // comme TYPES_AVEC_CUISINE le fait déjà pour tout paiement 'mensuel').
        const enfantNomComplet = `${d.prenom} ${d.nom}`
        const [anneeP, moisP] = (d.dateInscription || todayStr()).split('-').map(Number)
        const montantInscription = Number(paiementInscription.montantInscription) || 0
        const montantCuisine = Number(paiementInscription.montantCuisine) || 0
        const recap = []

        if (montantInscription > 0) {
          const pid = genId()
          await setItem('garderie_paiements', pid, {
            id: pid, enfantId: id, enfantNom: enfantNomComplet,
            type: 'inscription', mois: moisP, annee: anneeP,
            montantDu: montantInscription, montantPaye: montantInscription, montantCuisine: 0,
            modePaiement: paiementInscription.modePaiement, statut: 'paye',
            date: d.dateInscription || todayStr(), notes: "Frais d'inscription — saisis à l'inscription"
          })
          audit('garderie', 'PAIEMENT_CREATE', enfantNomComplet, { type: 'inscription', montant: montantInscription })
          recap.push(`inscription ${formatMoney(montantInscription)}`)
        }

        if (montantScolariteSaisi > 0 && paiementInscription.modeScolarite) {
          const parTranche = paiementInscription.modeScolarite === 'tranche'
          const montantVerse = parTranche ? (Number(paiementInscription.montantScolariteVerse) || 0) : montantScolariteSaisi
          const montantDuTotal = montantScolariteSaisi + montantCuisine
          const statut = montantVerse >= montantDuTotal ? 'paye' : montantVerse > 0 ? 'partiel' : 'impaye'
          const pid = genId()
          await setItem('garderie_paiements', pid, {
            id: pid, enfantId: id, enfantNom: enfantNomComplet,
            type: 'mensuel', mois: moisP, annee: anneeP,
            montantDu: montantDuTotal, montantPaye: montantVerse, montantCuisine,
            modePaiement: paiementInscription.modePaiement, statut,
            date: d.dateInscription || todayStr(),
            notes: `Scolarité — ${parTranche ? 'paiement par tranche' : 'payée en totalité'} (saisie à l'inscription)`
          })
          audit('garderie', 'PAIEMENT_CREATE', enfantNomComplet, { type: 'mensuel', montant: montantVerse })
          recap.push(`scolarité ${formatMoney(montantVerse)}${parTranche ? ' (tranche)' : ''}`)
        }

        if (recap.length > 0) {
          notify({ type: 'info', title: `💰 Paiement(s) reçu(s) — ${enfantNomComplet}`, body: recap.join(' · '), module: 'garderie', forRoles: ['ge','gerante_garderie'], excludeUid: user.uid, link: '/garderie/paiements' })
        }
        toast.success(`${d.prenom} ${d.nom} inscrit(e) ✓${recap.length ? ' — paiement(s) enregistré(s)' : ''}`)
      } else {
        await setItem('garderie_enfants', modal.id, { ...d, id: modal.id })
        audit('garderie', 'ENFANT_EDIT', `${d.prenom} ${d.nom}`)
        toast.success('Fiche mise à jour ✓')
      }
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  // ── Photo de profil ──
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoInputRef = useRef(null)

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Choisissez une image')
    setPhotoUploading(true)
    try {
      const dataURL = await compresserPhotoProfil(file)
      set('photo', dataURL)
    } catch (err) {
      toast.error(err.message || 'Erreur lors du traitement de la photo')
    } finally {
      setPhotoUploading(false)
    }
  }

  // ── Photo de profil depuis la fiche détail (modification directe) ──
  const [detailPhotoUploading, setDetailPhotoUploading] = useState(false)
  const detailPhotoInputRef = useRef(null)

  async function handleDetailPhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !detail) return
    if (!file.type.startsWith('image/')) return toast.error('Choisissez une image')
    setDetailPhotoUploading(true)
    try {
      const dataURL = await compresserPhotoProfil(file)
      await updateItem('garderie_enfants', detail.id, { photo: dataURL })
      setDetail((d) => ({ ...d, photo: dataURL }))
      toast.success('Photo mise à jour ✓')
    } catch (err) {
      toast.error(err.message || 'Erreur lors du traitement de la photo')
    } finally {
      setDetailPhotoUploading(false)
    }
  }

  // ── Statistiques de l'enfant affiché dans la fiche détail ──
  const detailStats = useMemo(() => {
    if (!detail) return null
    const presEnfant = presences.filter((p) => p.enfantId === detail.id)
    const joursPresents = presEnfant.filter((p) => p.statut === 'present').length
    const joursAbsents  = presEnfant.filter((p) => p.statut === 'absent').length
    const joursExcuses   = presEnfant.filter((p) => p.statut === 'excuse').length
    const incidentsEnfant = incidents.filter((i) => i.enfantId === detail.id)
    const incidentsOuverts = incidentsEnfant.filter((i) => !i.resolu).length
    return {
      joursPresents, joursAbsents, joursExcuses,
      incidentsTotal: incidentsEnfant.length,
      incidentsOuverts,
      impaye: aImpayes(paiements, detail.id)
    }
  }, [detail, presences, incidents, paiements])

  // ── Journaliers ──
  const [joModal, setJoModal]   = useState(null)
  const [joSaving, setJoSaving] = useState(false)
  const [joDelete, setJoDelete] = useState(null)
  const [joDeleting, setJoDeleting] = useState(false)
  const [filtreDateJo, setFiltreDateJo] = useState(todayStr())
  // Paiement encaissé directement à l'inscription du journalier — évite l'aller-retour
  // vers Paiements → Journaliers quand le parent paie sur place. Reste facultatif :
  // laissé vide, le paiement pourra toujours être saisi plus tard comme avant.
  const [joPaiement, setJoPaiement] = useState({ montantPaye: '', modePaiement: 'espece' })
  // Recherche d'un enfant journalier déjà venu — évite de tout ressaisir (nom, âge,
  // parent, contact…) à chaque nouvelle journée d'un même enfant. Purement un
  // raccourci de saisie : les champs restent modifiables après la sélection.
  const [joRecherche, setJoRecherche] = useState('')

  const journaliersFiltre = useMemo(
    () => journaliers.filter((j) => !filtreDateJo || j.date === filtreDateJo)
      .sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1),
    [journaliers, filtreDateJo]
  )

  // Un enfant journalier par nom (le plus récent) — sert à pré-remplir prénom, nom,
  // âge, parent et contact quand il revient un autre jour.
  const journaliersConnus = useMemo(() => {
    const map = new Map()
    for (const j of [...journaliers].sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1)) {
      const cle = `${(j.prenom || '').trim()} ${(j.nom || '').trim()}`.trim().toLowerCase()
      if (!cle) continue
      map.set(cle, j) // tri croissant par date : la plus récente écrase les précédentes
    }
    return [...map.values()].sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`))
  }, [journaliers])

  async function handleSaveJournalier() {
    if (joSaving) return
    const d = joModal.data
    if (!d.nom.trim() || !d.prenom.trim()) return toast.error('Nom et prénom requis')
    if (!d.date) return toast.error('Date requise')
    if (!d.nombreJours || Number(d.nombreJours) < 1) return toast.error('Nombre de jours requis')
    if (!d.parentNom?.trim()) return toast.error('Nom du parent requis')
    if (!d.parentContact?.trim()) return toast.error('Contact du parent requis')
    setJoSaving(true)
    try {
      if (joModal.isNew) {
        const id = genId()
        await setItem('garderie_journaliers', id, { ...d, id })
        audit('garderie', 'JOURNALIER_ADD', `${d.prenom} ${d.nom}`, { date: d.date })

        // Paiement encaissé en même temps que l'inscription, si renseigné.
        const montant = Number(joPaiement.montantPaye)
        if (montant > 0) {
          const paiementId = genId()
          await setItem('garderie_paiements', paiementId, {
            id: paiementId,
            type: 'journalier',
            enfantNom: `${d.prenom} ${d.nom}`,
            parentNom: d.parentNom.trim(),
            date: d.date,
            nombreJours: Number(d.nombreJours) || 1,
            montantPaye: montant,
            montantDu: montant,
            modePaiement: joPaiement.modePaiement,
            statut: 'paye',
            notes: ''
          })
          audit('garderie', 'JOURNALIER_PAIEMENT', `${d.prenom} ${d.nom}`, { montant })
          notify({ type: 'info', title: `💰 Paiement journalier — ${d.prenom} ${d.nom}`, body: `${montant.toLocaleString('fr-FR')} FCFA`, module: 'garderie', forRoles: ['ge','gerante_garderie'], excludeUid: user.uid, link: '/garderie/paiements' })
          toast.success(`${d.prenom} ${d.nom} enregistré(e) — paiement de ${montant.toLocaleString('fr-FR')} FCFA encaissé ✓`)
        } else {
          toast.success(`${d.prenom} ${d.nom} enregistré(e) ✓`)
        }
      } else {
        await setItem('garderie_journaliers', joModal.id, { ...d, id: joModal.id })
        audit('garderie', 'JOURNALIER_EDIT', `${d.prenom} ${d.nom}`)
        toast.success('Fiche mise à jour ✓')
      }
      setJoModal(null)
    } finally {
      setJoSaving(false)
    }
  }

  async function handleDeleteJournalier() {
    if (!joDelete || joDeleting) return
    const target = joDelete
    setJoDeleting(true)
    setJoDelete(null)
    try {
      await removeItem('garderie_journaliers', target.id)
      audit('garderie', 'JOURNALIER_DELETE', `${target.prenom} ${target.nom}`)
      toast.success(`${target.prenom} ${target.nom} supprimé(e) ✓`)
    } catch {
      toast.error('Erreur lors de la suppression')
    } finally {
      setJoDeleting(false)
    }
  }

  const setJo = (k, v) => setJoModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  // Le regroupement garderie / maternelle / journaliers se pilote depuis le
  // menu déroulant de la barre latérale (Sidebar.jsx → EnfantsNavMenu), qui
  // navigue vers /garderie/enfants?programme=… ou ?vue=journaliers. On
  // synchronise l'onglet et le filtre programme sur ces paramètres d'URL.
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  useEffect(() => {
    const vue = searchParams.get('vue')
    const programme = searchParams.get('programme')
    if (vue === 'journaliers') {
      setOnglet('journaliers')
    } else {
      setOnglet('inscrits')
      setFiltreProgramme(programme === 'garderie' || programme === 'maternelle' ? programme : '')
    }
  }, [searchParams])

  return (
    <div className="space-y-5">

      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,57,14,0.35),0_8px_20px_-8px_rgba(232,57,14,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(232,57,14,0.85) 0%, rgba(245,168,0,0.8) 100%)' }}>
        <button onClick={() => navigate('/garderie')} title="Retour au tableau de bord"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-all duration-200 hover:bg-white/30 hover:shadow-[0_0_16px_4px_rgba(255,255,255,0.8)]">
          <ArrowLeft size={18} />
        </button>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#E8390E', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Baby size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Enfants</h2>
          <p className="text-sm text-white/80">Garderie · Maternelle · Journaliers : inscriptions et suivi</p>
        </div>

        {/* Tri par date d'inscription — même format que le sélecteur de période
            de Présences enfants (pastille blanche sur le dégradé du module). */}
        {onglet === 'inscrits' && (
          <div className="relative flex w-full flex-wrap items-center gap-1.5 rounded-2xl border border-white/30 bg-white/15 p-1.5 backdrop-blur-sm sm:ml-auto sm:w-auto">
            <select value={modeDateInsc} onChange={(e) => setModeDateInsc(e.target.value)}
              className="rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/50 [&>option]:text-gray-800">
              <option value="">Inscription</option>
              <option value="jour">Jour</option>
              <option value="mois">Mois</option>
              <option value="annee">Année</option>
              <option value="plage">Plage</option>
            </select>

            {modeDateInsc === 'jour' && (
              <input type="date" value={dateInscJour} style={{ colorScheme: 'dark' }}
                onChange={(e) => setDateInscJour(e.target.value)}
                className="rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/50" />
            )}

            {modeDateInsc === 'mois' && (
              <input type="month" value={dateInscMois} style={{ colorScheme: 'dark' }}
                onChange={(e) => setDateInscMois(e.target.value)}
                className="rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/50" />
            )}

            {modeDateInsc === 'annee' && (
              <input type="number" value={dateInscAnnee} placeholder="ex: 2026" min="2020" max="2099"
                onChange={(e) => setDateInscAnnee(e.target.value)}
                className="w-24 rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50" />
            )}

            {modeDateInsc === 'plage' && (
              <div className="flex items-center gap-1">
                <input type="date" value={dateInscDebut} max={dateInscFin || undefined} style={{ colorScheme: 'dark' }}
                  onChange={(e) => setDateInscDebut(e.target.value)}
                  className="rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/50" />
                <span className="text-xs text-white/60">→</span>
                <input type="date" value={dateInscFin} min={dateInscDebut || undefined} style={{ colorScheme: 'dark' }}
                  onChange={(e) => setDateInscFin(e.target.value)}
                  className="rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/50" />
              </div>
            )}

            {modeDateInsc && (
              <button onClick={() => { setModeDateInsc(''); setDateInscJour(''); setDateInscMois(''); setDateInscAnnee(''); setDateInscDebut(''); setDateInscFin('') }}
                className="rounded-xl bg-white/20 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/30">
                Effacer
              </button>
            )}
          </div>
        )}
      </div>

      {/* Onglets — un volet par catégorie, chacun avec sa couleur et son
          signal lumineux au clic (même design/fonctionnement que Présences). */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'garderie',    icon: '🍼', label: 'Garderie',
            active: 'scale-105 bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-[0_6px_18px_-4px_rgba(37,99,235,0.6),inset_0_1px_0_0_rgba(255,255,255,0.5)]',
            hover: 'hover:border-blue-300 hover:text-blue-600' },
          { id: 'maternelle',  icon: '🎓', label: 'Maternelle',
            active: 'scale-105 bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-[0_6px_18px_-4px_rgba(22,163,74,0.6),inset_0_1px_0_0_rgba(255,255,255,0.5)]',
            hover: 'hover:border-green-300 hover:text-green-600' },
          { id: 'journaliers', icon: '🚪', label: 'Journaliers',
            active: 'scale-105 bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-[0_6px_18px_-4px_rgba(232,57,14,0.6),inset_0_1px_0_0_rgba(255,255,255,0.5)]',
            hover: 'hover:border-orange-300 hover:text-orange-600' }
        ].map((t) => {
          const active = t.id === 'journaliers' ? onglet === 'journaliers' : (onglet === 'inscrits' && filtreProgramme === t.id)
          return (
            <button key={t.id} type="button"
              onClick={() => {
                if (t.id === 'journaliers') { setOnglet('journaliers') }
                else { setOnglet('inscrits'); setFiltreProgramme(t.id); setFiltreGroupe('') }
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ${active
                ? t.active
                : `border border-gray-200 bg-white text-gray-500 hover:scale-105 hover:shadow-sm ${t.hover}`}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full transition-all ${active ? 'bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.9)]' : 'bg-gray-300'}`} />
              <span>{t.icon}</span> {t.label}
            </button>
          )
        })}
      </div>

      {/* KPI — bande unique glassmorphism, répartition par statut du programme sélectionné */}
      {onglet === 'inscrits' && (
        <div className="relative overflow-hidden rounded-3xl border border-white/50 bg-white/55 shadow-[0_8px_28px_-10px_rgba(0,0,0,0.15),inset_0_1px_0_0_rgba(255,255,255,0.7)] backdrop-blur-2xl backdrop-saturate-150">
          <div className="flex divide-x divide-gray-200/70">
            {[
              { label: 'Actifs', value: statsProgramme.actifs, icon: UserCheck, accent: '#16a34a' },
              { label: 'Suspendus', value: statsProgramme.suspendus, icon: ShieldAlert, accent: '#d97706' },
              { label: 'Sortis', value: statsProgramme.sortis, icon: UserX, accent: '#94a3b8' },
              { label: 'Total', value: statsProgramme.total, icon: Users, accent: '#E8390E' }
            ].map((k) => (
              <div key={k.label} className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-center">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ background: k.accent + '1a', color: k.accent }}>
                  <k.icon className="h-3 w-3" />
                </div>
                <p className="w-full truncate text-[8px] font-semibold uppercase tracking-wide text-gray-500" title={k.label}>{k.label}</p>
                <p className="text-sm font-extrabold leading-none text-gray-900">{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ ONGLET JOURNALIERS ══ */}
      {onglet === 'journaliers' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <p className="font-semibold mb-0.5">💡 Enfants journaliers</p>
            <p>Enfants non inscrits officiellement, déposés pour <strong>une seule journée</strong>. Le paiement de la journée (cantine incluse) est enregistré ici. Ils apparaissent automatiquement dans la <strong>Cantine</strong> du jour concerné.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Filtrer par date</label>
              <Input type="date" value={filtreDateJo} onChange={(e) => setFiltreDateJo(e.target.value)} />
            </div>
            {filtreDateJo && (
              <button onClick={() => setFiltreDateJo('')}
                className="mt-4 text-xs text-gray-400 hover:text-orange-500 underline">Voir tous</button>
            )}
            <div className="ml-auto">
              <Button onClick={() => {
                setJoModal({ data: emptyJournalier(), isNew: true })
                setJoPaiement({ montantPaye: '', modePaiement: 'espece' })
                setJoRecherche('')
              }}>
                <UserPlus size={16} /> Ajouter un journalier
              </Button>
            </div>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Enfant</th>
                  <th className="px-3 py-2 text-left">Âge</th>
                  <th className="px-3 py-2 text-left">Parent / Contact</th>
                  <th className="px-3 py-2 text-center">Nb jours</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {journaliersFiltre.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-400">Aucun enfant journalier{filtreDateJo ? ' ce jour' : ''}.</td></tr>
                )}
                {journaliersFiltre.map((j) => (
                  <tr key={j.id} className="hover:bg-orange-50 transition-colors">
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDateShort(j.date)}</td>
                    <td className="px-3 py-2 font-semibold">
                      {j.prenom} {j.nom}
                      {j.apporteRepas && (
                        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">🍱 repas apporté</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{j.ageApprox ? `~${j.ageApprox}` : '—'}</td>
                    <td className="px-3 py-2">
                      <p>{j.parentNom || '—'}</p>
                      <p className="text-xs text-gray-400">{j.parentContact}</p>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">
                        {j.nombreJours || 1} jour{Number(j.nombreJours) > 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">{j.notes || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => setJoModal({ data: { ...emptyJournalier(), ...j }, isNew: false, id: j.id })}
                          className="rounded p-1 text-orange-600 hover:bg-orange-50"><FilePen size={14} /></button>
                        <button onClick={() => setJoDelete(j)}
                          className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ══ ONGLET INSCRITS ══ */}
      {onglet === 'inscrits' && <>

      {/* Reliquats d'anciennes suppressions incomplètes (statut 'supprime' laissé
          en base par l'ancienne logique). « Sorti » est EXCLU : c'est un statut
          métier normal — un enfant qui a quitté la garderie — et non une
          suppression ratée. L'inclure ici faisait effacer définitivement, d'un
          simple clic sur « Nettoyer », des enfants parfaitement légitimes avec
          tout leur historique (présences, paiements). */}
      {enfants.filter((e) => e.statut === 'supprime' && !deletedEnfantIds.has(e.id)).length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 flex items-center justify-between">
          <p>⚠️ {enfants.filter((e) => e.statut === 'supprime').length} enfant(s) en suppression incomplète — masqués mais encore présents en base.</p>
          <button
            onClick={async () => {
              const aNettoyer = enfants.filter((e) => e.statut === 'supprime')
              let echecs = 0
              for (const e of aNettoyer) {
                try { await removeItem('garderie_enfants', e.id) } catch { echecs++ }
              }
              if (echecs) toast.error(`${aNettoyer.length - echecs} nettoyé(s), ${echecs} échec(s) — réessayez.`)
              else toast.success(`${aNettoyer.length} enfant(s) nettoyé(s) ✓`)
            }}
            className="ml-3 rounded-lg bg-orange-500 px-3 py-1 text-xs font-bold text-white hover:bg-orange-600 shrink-0">
            Nettoyer
          </button>
        </div>
      )}

      {/* Filtres + inscription — une seule bande glassmorphism, dégradé subtil
          entre la couleur du module (orange) et le blanc (même design que
          Présences enfants). */}
      <div className="relative flex flex-wrap items-center gap-2 rounded-2xl border border-white/60 p-2.5 shadow-[0_10px_24px_-12px_rgba(26,26,26,0.2),inset_0_1px_0_0_rgba(255,255,255,0.7)] backdrop-blur-2xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(232,57,14,0.16) 0%, rgba(245,168,0,0.08) 35%, rgba(255,255,255,0.65) 75%)' }}>
        <div className="relative min-w-[150px] flex-1 sm:flex-none">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-xl border border-gray-200/80 bg-white/80 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            placeholder="Rechercher un enfant…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        <Select value={filtreGroupe} onChange={(e) => setFiltreGroupe(e.target.value)} className="w-auto !bg-white/80">
          <option value="">Tous les groupes</option>
          {(filtreProgramme ? GROUPES_AGE.filter((g) => GROUPES_PAR_PROGRAMME[filtreProgramme].includes(g.id)) : GROUPES_AGE)
            .map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </Select>
        <Select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className="w-auto !bg-white/80">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_ENFANT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-500 whitespace-nowrap">{liste.length} enfant(s)</span>
          {!lectureSeule && (
            <Button onClick={openCreate} className="shrink-0"><Plus size={16} /> Inscrire un enfant</Button>
          )}
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Prénom Nom</th>
              <th className="px-3 py-2 text-left">Âge</th>
              <th className="px-3 py-2 text-left">Programme / Groupe</th>
              <th className="px-3 py-2 text-left">Parent / Contact</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Inscription</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-400">Aucun enfant trouvé.</td></tr>
            )}
            {liste.map((e) => (
              <tr key={e.id} onClick={() => setDetail(e)} className="cursor-pointer hover:bg-orange-50 transition-colors">
                <td className="px-3 py-2 font-semibold">
                  <div className="flex items-center gap-2">
                    {e.photo ? (
                      <img src={e.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-300 to-orange-600 text-xs font-bold text-white shadow-[0_3px_6px_-1px_rgba(234,88,12,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.6),inset_0_-2px_3px_0_rgba(0,0,0,0.15)]">
                        {(e.prenom?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                    {e.prenom} {e.nom}
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-600">{calcAge(e.dateNaissance) || e.ageSaisi || '—'}</td>
                <td className="px-3 py-2">
                  <span className={`mr-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${(e.programme || programmeDuGroupe(e.groupe)) === 'maternelle' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {PROGRAMMES_ENFANT.find((p) => p.id === (e.programme || programmeDuGroupe(e.groupe)))?.label}
                  </span>
                  {GROUPES_AGE.find((g) => g.id === e.groupe)?.label || '—'}
                </td>
                <td className="px-3 py-2">
                  <p>{e.parentNom || '—'}</p>
                  <p className="text-xs text-gray-400">{e.parentContact}</p>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={STATUTS_ENFANT[e.statut]?.tone}>{STATUTS_ENFANT[e.statut]?.label}</Badge>
                  {e.allergies && <span className="ml-1 text-xs text-orange-500">⚠ allergie</span>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-400">
                  <p>{formatDateShort(e.dateInscription)}</p>
                  {e.typeAbonnement === 'court_sejour' ? (() => {
                    const joursRestants = joursAvantFinCourtSejour(e.dateInscription, e.dureeSemaines)
                    return (
                      <span className={`font-semibold ${joursRestants !== null && joursRestants <= 7 ? 'text-red-600' : 'text-orange-600'}`}>
                        Court séjour{joursRestants !== null && (
                          joursRestants < 0 ? ' — terminé' : ` — fin dans ${joursRestants}j`
                        )}
                      </span>
                    )
                  })() : e.typeAbonnement && (
                    <span className={`font-semibold ${e.typeAbonnement === 'annuel' ? 'text-purple-600' : 'text-blue-600'}`}>
                      {e.typeAbonnement === 'annuel' ? 'Annuel' : 'Mensuel'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                  <div className="flex gap-1">
                    <button onClick={() => setDetail(e)} title="Voir la fiche" className="rounded p-1 hover:bg-gray-100"><Eye size={14} /></button>
                    {!lectureSeule && (
                      <>
                        <button onClick={() => openEdit(e)} title="Modifier la fiche" className="rounded p-1 text-orange-600 hover:bg-orange-50"><FilePen size={14} /></button>
                        <button onClick={() => setToDelete(e)} title="Supprimer" className="rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      </> }

      {/* Choix du type d'inscription — détermine ensuite quel formulaire s'ouvre */}
      <Modal open={choixInscription} onClose={() => setChoixInscription(false)} size="sm"
        {...glassModalProps(COULEUR_MODULE.garderie)} title="Nouvelle inscription">
        <p className="mb-4 text-sm text-gray-500">Choisissez le type d'inscription pour cet enfant :</p>
        <div className="space-y-2.5">
          {[
            { type: 'maternelle', icon: GraduationCap, label: 'Maternelle', sub: 'Enfant inscrit — 3 à 6 ans', color: '#16a34a', tint: 'bg-green-50 border-green-200 hover:border-green-400' },
            { type: 'garderie',   icon: Baby,           label: 'Garderie',   sub: 'Enfant inscrit — 0 à 2 ans', color: '#3b82f6', tint: 'bg-blue-50 border-blue-200 hover:border-blue-400' },
            { type: 'journalier', icon: DoorOpen,       label: 'Enfant journalier', sub: "Non inscrit officiellement — dépôt d'une seule journée", color: '#E8390E', tint: 'bg-orange-50 border-orange-200 hover:border-orange-400' }
          ].map((o) => (
            <button key={o.type} onClick={() => choisirTypeInscription(o.type)}
              className={`group flex w-full items-center gap-3.5 rounded-2xl border-2 px-4 py-3.5 text-left shadow-[0_10px_24px_-14px_rgba(26,26,26,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-14px_rgba(26,26,26,0.26)] ${o.tint}`}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: o.color, boxShadow: `0 0 0 3px #ffffff, 0 4px 10px -2px ${o.color}66` }}>
                <o.icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-800">{o.label}</p>
                <p className="text-xs text-gray-500">{o.sub}</p>
              </div>
              <ChevronRight size={18} className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
            </button>
          ))}
        </div>
      </Modal>

      {/* Modal journalier création / édition */}
      <Modal open={!!joModal} onClose={() => setJoModal(null)} size="md"
        {...glassModalProps(COULEUR_MODULE.garderie)}
        title={joModal?.isNew ? '🚪 Ajouter un enfant journalier' : 'Modifier le journalier'}
        footer={
          <>
            <Button variant="outline" onClick={() => setJoModal(null)} disabled={joSaving}>Annuler</Button>
            <Button onClick={handleSaveJournalier} loading={joSaving}>
              {joModal?.isNew ? 'Enregistrer' : 'Mettre à jour'}
            </Button>
          </>
        }>
        {joModal && (
          <div className="space-y-4">
            {/* Bandeau héro — nom en direct, comme le formulaire d'inscription classique */}
            <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,57,14,0.35),0_8px_20px_-8px_rgba(232,57,14,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
              style={{ background: 'linear-gradient(135deg, rgba(232,57,14,0.85) 0%, rgba(245,168,0,0.8) 100%)' }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: '#E8390E', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55' }}>
                <DoorOpen size={22} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">
                  {joModal.data.prenom || joModal.data.nom ? `${joModal.data.prenom} ${joModal.data.nom}`.trim() : 'Nouvel enfant journalier'}
                </p>
                <p className="text-sm text-white/80">Dépôt d'une seule journée : non inscrit officiellement</p>
              </div>
            </div>

            {joModal.isNew && journaliersConnus.length > 0 && (
              <div className="rounded-2xl border border-teal-200 border-l-4 border-l-teal-400 bg-teal-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)]">
                <FormGroup label="🔍 Déjà venu(e) ? Rechercher son nom" hint="Sélectionnez pour remplir automatiquement âge, parent et contact — tout reste modifiable ensuite.">
                  <ChampAutocomplete
                    value={joRecherche}
                    onChange={setJoRecherche}
                    suggestions={journaliersConnus}
                    getLabel={(j) => `${j.prenom} ${j.nom}`}
                    placeholder="Tapez un prénom ou un nom déjà enregistré…"
                    accent="teal"
                    onSelect={(j) => {
                      setJoModal((m) => ({
                        ...m,
                        data: {
                          ...m.data,
                          prenom: j.prenom, nom: j.nom, ageApprox: j.ageApprox || '',
                          parentNom: j.parentNom || '', parentContact: j.parentContact || '',
                          apporteRepas: !!j.apporteRepas
                        }
                      }))
                      setJoRecherche(`${j.prenom} ${j.nom}`)
                    }}
                  />
                </FormGroup>
              </div>
            )}

            <div className="rounded-2xl border border-orange-200 border-l-4 border-l-orange-400 bg-orange-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)]">
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Prénom *">
                <Input value={joModal.data.prenom} onChange={(e) => setJo('prenom', e.target.value)} />
              </FormGroup>
              <FormGroup label="Nom *">
                <Input value={joModal.data.nom} onChange={(e) => setJo('nom', e.target.value)} />
              </FormGroup>
              <FormGroup label="Âge approximatif">
                <Input value={joModal.data.ageApprox} onChange={(e) => setJo('ageApprox', e.target.value)} placeholder="ex: 3 ans" />
              </FormGroup>
              <FormGroup label="Date de début *">
                <Input type="date" value={joModal.data.date} onChange={(e) => setJo('date', e.target.value)} />
              </FormGroup>
              <FormGroup label="Nombre de jours *">
                <Input type="number" min="1" value={joModal.data.nombreJours}
                  onChange={(e) => setJo('nombreJours', e.target.value)} placeholder="ex: 3" />
              </FormGroup>
            </div>
            </div>

            <div className="rounded-2xl border border-sky-200 border-l-4 border-l-sky-400 bg-sky-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)]">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sky-700">👪 Parent / Tuteur</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Nom du parent *">
                  <Input value={joModal.data.parentNom} onChange={(e) => setJo('parentNom', e.target.value)} placeholder="Nom complet du parent" />
                </FormGroup>
                <FormGroup label="Contact *">
                  <Input value={joModal.data.parentContact} onChange={(e) => setJo('parentContact', e.target.value)} placeholder="ex: +226 70 00 00 00" />
                </FormGroup>
              </div>
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800 cursor-pointer">
              <input type="checkbox" checked={!!joModal.data.apporteRepas}
                onChange={(e) => setJo('apporteRepas', e.target.checked)}
                className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-400" />
              🍱 Apporte son propre repas (pas de frais de cuisine)
            </label>

            {joModal.isNew ? (
              <div className="rounded-2xl border border-green-200 border-l-4 border-l-green-400 bg-green-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)]">
                <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-green-700">💰 Paiement (si le parent règle maintenant)</p>
                <div className="grid grid-cols-2 gap-3">
                  <FormGroup label="Montant payé (FCFA)">
                    <Input type="number" min="0" value={joPaiement.montantPaye}
                      onChange={(e) => setJoPaiement((p) => ({ ...p, montantPaye: e.target.value }))}
                      placeholder="ex: 5000" />
                  </FormGroup>
                  <FormGroup label="Mode de paiement">
                    <ModePaiementBoutons value={joPaiement.modePaiement}
                      onChange={(v) => setJoPaiement((p) => ({ ...p, modePaiement: v }))} />
                  </FormGroup>
                </div>
                <p className="mt-2 text-[11px] text-green-600">
                  Laissez vide si le paiement se fera plus tard — vous pourrez toujours l'enregistrer dans <strong>Paiements → Journaliers</strong>.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                💡 Le paiement se gère dans le volet <strong>Paiements → Journaliers</strong>
              </div>
            )}

            <FormGroup label="Notes">
              <Input value={joModal.data.notes} onChange={(e) => setJo('notes', e.target.value)} placeholder="Informations complémentaires…" />
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal confirmation suppression journalier */}
      <Modal open={!!joDelete} onClose={() => setJoDelete(null)} size="sm"
        {...glassModalProps('#dc2626')}
        title="Supprimer ce journalier ?"
        footer={
          <>
            <Button variant="outline" onClick={() => setJoDelete(null)}>Annuler</Button>
            <Button variant="danger" onClick={handleDeleteJournalier} loading={joDeleting}>Supprimer</Button>
          </>
        }>
        {joDelete && (
          <div className="space-y-4">
            <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_8px_20px_-8px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.35)]"
              style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.88) 0%, rgba(127,29,29,0.88) 100%)' }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: '#dc2626', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55' }}>
                <Trash2 size={22} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{joDelete.prenom} {joDelete.nom}</p>
                <p className="text-sm text-white/80">Journalier du {formatDateShort(joDelete.date)}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Vous allez supprimer cet enfant journalier. Cette action est <span className="font-semibold text-red-600">irréversible</span>.
            </p>
          </div>
        )}
      </Modal>

      {/* Modal création / édition */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="lg"
        {...glassModalProps(COULEUR_MODULE.garderie)}
        title={modal?.isNew ? 'Inscrire un enfant' : 'Modifier la fiche enfant'}
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={handleSave} loading={saving}>{modal?.isNew ? 'Inscrire' : 'Mettre à jour'}</Button></>}>
        {modal && (
          <div className="space-y-4">
            {/* Bandeau héro — même dégradé/badge lumineux que les en-têtes du module,
                avec la photo de profil intégrée (au lieu d'une simple carte plate) */}
            <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,57,14,0.35),0_8px_20px_-8px_rgba(232,57,14,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
              style={{ background: 'linear-gradient(135deg, rgba(232,57,14,0.85) 0%, rgba(245,168,0,0.8) 100%)' }}>
              <div className="relative h-20 w-20 shrink-0">
                {modal.data.photo ? (
                  <img src={modal.data.photo} alt="Photo de profil" className="h-20 w-20 rounded-full border-2 border-white/80 object-cover shadow-lg" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/80 bg-white/20 text-2xl font-bold text-white shadow-lg backdrop-blur-sm">
                    {modal.data.prenom ? modal.data.prenom[0].toUpperCase() : <Camera size={22} />}
                  </div>
                )}
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                  title={modal.data.photo ? 'Changer la photo' : 'Ajouter une photo'}
                  className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-orange-600 text-white shadow hover:bg-orange-700 disabled:opacity-60"
                >
                  {photoUploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                </button>
                {modal.data.photo && (
                  <button
                    type="button"
                    onClick={() => set('photo', '')}
                    title="Retirer la photo"
                    className="absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-red-500 shadow hover:bg-red-50"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-lg font-extrabold leading-tight">
                    {modal.data.prenom || modal.data.nom ? `${modal.data.prenom} ${modal.data.nom}`.trim() : (modal.isNew ? 'Nouvel enfant' : 'Fiche enfant')}
                  </p>
                  {/* Rappelle en permanence dans QUELLE catégorie on inscrit — on peut
                      vite perdre le fil après le choix initial (Maternelle/Garderie),
                      surtout sur un formulaire aussi long. */}
                  {modal.data.programme && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-bold text-white backdrop-blur-sm">
                      {modal.data.programme === 'maternelle' ? '🎓 Maternelle' : '🍼 Garderie'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/80">Photo JPG ou PNG : recadrée automatiquement en carré</p>
              </div>
            </div>

            {/* 📋 Identité */}
            <div className="rounded-2xl border border-orange-200 border-l-4 border-l-orange-400 bg-orange-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-16px_rgba(26,26,26,0.20)]">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-orange-700">📋 Identité</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Prénom *">
                  <Input value={modal.data.prenom} onChange={(e) => set('prenom', e.target.value)} />
                </FormGroup>
                <FormGroup label="Nom *">
                  <Input value={modal.data.nom} onChange={(e) => set('nom', e.target.value)} />
                </FormGroup>
                <FormGroup label="Date de naissance">
                  <Input type="date" value={modal.data.dateNaissance} onChange={(e) => {
                    const g = groupeRecommande(e.target.value)
                    const prog = g ? programmeDuGroupe(g) : ''
                    set('dateNaissance', e.target.value)
                    set('groupe', g)
                    set('programme', prog)
                    set('ageSaisi', '')
                    // La maternelle inscrit pour toute l'année scolaire — pas de
                    // mensuel/court séjour possible pour ce programme.
                    if (prog === 'maternelle') set('typeAbonnement', 'annuel')
                  }} />
                  {modal.data.dateNaissance && (() => {
                    const t = tarifSuggere(modal.data.dateNaissance, GRILLE_TARIFAIRE)
                    return t ? (
                      <p className="mt-1 rounded-lg bg-green-50 px-2 py-1 text-xs text-green-700 font-semibold">
                        💰 Tarif suggéré ({t.label}) : <span className="text-green-800">{t.tarif.toLocaleString('fr-FR')} FCFA / mois</span>
                      </p>
                    ) : null
                  })()}
                </FormGroup>
                <FormGroup label="Âge (si date inconnue)">
                  <Input
                    value={modal.data.ageSaisi}
                    onChange={(e) => {
                      const val = e.target.value
                      set('ageSaisi', val)
                      if (val) set('dateNaissance', '')
                      // Déduit le groupe d'âge du texte saisi (« 2 ans », « 18 mois »…) —
                      // n'écrase rien si le texte n'est pas reconnaissable.
                      const g = groupeDepuisAgeTexte(val)
                      if (g) {
                        const prog = programmeDuGroupe(g)
                        set('groupe', g)
                        set('programme', prog)
                        if (prog === 'maternelle') set('typeAbonnement', 'annuel')
                      }
                    }}
                    placeholder="ex: 2 ans, 18 mois…"
                    disabled={!!modal.data.dateNaissance}
                  />
                  {!modal.data.dateNaissance && !modal.data.ageSaisi && (
                    <p className="mt-1 text-[10px] text-gray-400">Renseignez la date de naissance OU l'âge</p>
                  )}
                </FormGroup>
                <FormGroup label="Sexe">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => set('sexe', 'F')}
                      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ${modal.data.sexe === 'F'
                        ? 'scale-105 bg-gradient-to-br from-pink-400 to-rose-500 text-white shadow-[0_6px_18px_-4px_rgba(236,72,153,0.6),inset_0_1px_0_0_rgba(255,255,255,0.5)]'
                        : 'border border-gray-200 bg-white text-gray-500 hover:scale-105 hover:border-pink-300 hover:text-pink-600 hover:shadow-sm'}`}>
                      👧 Fille
                    </button>
                    <button type="button" onClick={() => set('sexe', 'M')}
                      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ${modal.data.sexe === 'M'
                        ? 'scale-105 bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-[0_6px_18px_-4px_rgba(2,132,199,0.6),inset_0_1px_0_0_rgba(255,255,255,0.5)]'
                        : 'border border-gray-200 bg-white text-gray-500 hover:scale-105 hover:border-sky-300 hover:text-sky-600 hover:shadow-sm'}`}>
                      👦 Garçon
                    </button>
                  </div>
                </FormGroup>
              </div>
            </div>

            {/* 🎓 Scolarité */}
            <div className="rounded-2xl border border-sky-200 border-l-4 border-l-sky-400 bg-sky-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-16px_rgba(26,26,26,0.20)]">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sky-700">🎓 Scolarité</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Groupe d'âge *" hint={
                  (modal.data.dateNaissance
                    ? '✓ Rempli automatiquement (date de naissance).'
                    : groupeDepuisAgeTexte(modal.data.ageSaisi)
                      ? '✓ Rempli automatiquement (âge saisi).'
                      : 'À choisir manuellement.')
                  + (modal.data.programme === 'maternelle' ? ' 📅 Maternelle = année scolaire complète.' : '')
                }>
                  <Select value={modal.data.groupe} onChange={(e) => {
                    const g = e.target.value
                    const prog = g ? programmeDuGroupe(g) : modal.data.programme
                    set('groupe', g)
                    set('programme', prog)
                    // La maternelle inscrit pour toute l'année scolaire — pas de
                    // mensuel/court séjour possible pour ce programme.
                    if (prog === 'maternelle') set('typeAbonnement', 'annuel')
                  }}>
                    <option value="">— Choisir —</option>
                    {GROUPES_AGE
                      .filter((g) => !modal.data.programme || GROUPES_PAR_PROGRAMME[modal.data.programme].includes(g.id))
                      .map((g) => <option key={g.id} value={g.id}>{g.label} ({g.desc})</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Statut">
                  <Select value={modal.data.statut} onChange={(e) => set('statut', e.target.value)}>
                    {Object.entries(STATUTS_ENFANT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </Select>
                </FormGroup>
                {modal.data.programme !== 'maternelle' && (
                  <FormGroup label="Type d'abonnement">
                    <Select value={modal.data.typeAbonnement || 'mensuel'} onChange={(e) => set('typeAbonnement', e.target.value)}>
                      {TYPES_ABONNEMENT.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </Select>
                  </FormGroup>
                )}
                {modal.data.typeAbonnement === 'court_sejour' && (
                  <FormGroup label="Durée (semaines) *">
                    <Input type="number" min="2" value={modal.data.dureeSemaines}
                      onChange={(e) => set('dureeSemaines', e.target.value)} placeholder="ex: 3" />
                    {modal.data.dureeSemaines && modal.data.dateInscription && (
                      <p className="mt-1 text-xs font-semibold text-orange-600">
                        → jusqu'au {formatDateShort(dateFinCourtSejour(modal.data.dateInscription, modal.data.dureeSemaines))}
                      </p>
                    )}
                  </FormGroup>
                )}
                <FormGroup label="Date d'inscription">
                  <Input type="date" value={modal.data.dateInscription} onChange={(e) => set('dateInscription', e.target.value)} />
                </FormGroup>
              </div>
            </div>

            {/* 👪 Parent / Tuteur */}
            <div className="rounded-2xl border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-16px_rgba(26,26,26,0.20)]">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">👪 Parent / Tuteur</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Nom du parent / tuteur *">
                  <Input value={modal.data.parentNom} onChange={(e) => set('parentNom', e.target.value)} placeholder="Nom complet du parent" />
                </FormGroup>
                <FormGroup label="Contact principal *">
                  <Input value={modal.data.parentContact} onChange={(e) => set('parentContact', e.target.value)} placeholder="ex: +226 70 00 00 00" />
                </FormGroup>
                <FormGroup label="Contact secondaire">
                  <Input value={modal.data.parentContact2} onChange={(e) => set('parentContact2', e.target.value)} />
                </FormGroup>
                <FormGroup label="Profession du parent / tuteur">
                  <Input value={modal.data.parentProfession} onChange={(e) => set('parentProfession', e.target.value)} placeholder="ex: Commerçant, Enseignant…" />
                </FormGroup>
                <FormGroup label="Adresse *">
                  <Input value={modal.data.adresse} onChange={(e) => set('adresse', e.target.value)} placeholder="Quartier, ville…" />
                </FormGroup>
              </div>
            </div>

            {/* 🏥 Santé & allergies */}
            <div className="rounded-2xl border border-rose-200 border-l-4 border-l-rose-400 bg-rose-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-16px_rgba(26,26,26,0.20)]">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-rose-700">🏥 Santé & allergies</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Allergies connues">
                  <Input value={modal.data.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="ex: arachides, lait…" />
                </FormGroup>
                <FormGroup label="Info médicale importante">
                  <Input value={modal.data.infoMedicale} onChange={(e) => set('infoMedicale', e.target.value)} placeholder="ex: asthme, épilepsie…" />
                </FormGroup>
              </div>
            </div>

            {/* 💰 Paiements — facultatif, uniquement à l'inscription (édition d'une
                fiche existante : les paiements se gèrent depuis l'écran Paiements). */}
            {modal.isNew && (
              <div className="rounded-2xl border border-green-200 border-l-4 border-l-green-400 bg-green-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-16px_rgba(26,26,26,0.20)]">
                <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-green-700">
                  💰 Paiements <span className="font-medium normal-case text-green-500">(optionnel — si le parent règle maintenant)</span>
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <FormGroup label="Frais d'inscription (FCFA)">
                    <Input type="number" min="0" value={paiementInscription.montantInscription}
                      onChange={(e) => setPaiementInscription((p) => ({ ...p, montantInscription: e.target.value }))}
                      placeholder="ex: 15000" />
                  </FormGroup>
                  <FormGroup label="Frais de cuisine (FCFA)" hint="Ajoutés au paiement de scolarité">
                    <Input type="number" min="0" value={paiementInscription.montantCuisine}
                      onChange={(e) => setPaiementInscription((p) => ({ ...p, montantCuisine: e.target.value }))}
                      placeholder="ex: 5000" />
                  </FormGroup>
                </div>

                <div className="mt-3 rounded-xl border border-sky-100 bg-white/70 p-3">
                  <FormGroup label="Frais de scolarité (FCFA)">
                    <Input type="number" min="0" value={paiementInscription.montantScolarite}
                      onChange={(e) => setPaiementInscription((p) => ({ ...p, montantScolarite: e.target.value }))}
                      placeholder="ex: 25000" />
                  </FormGroup>

                  <p className="mb-1.5 mt-2 text-xs font-semibold text-gray-600">Cette scolarité est-elle payée par tranche ou en totalité ?</p>
                  <div className="flex items-center gap-2">
                    <button type="button"
                      onClick={() => setPaiementInscription((p) => ({ ...p, modeScolarite: p.modeScolarite === 'tranche' ? null : 'tranche' }))}
                      className={toggleScolariteClass(paiementInscription.modeScolarite === 'tranche', 'blue')}>
                      🧩 Par tranche
                    </button>
                    <button type="button"
                      onClick={() => setPaiementInscription((p) => ({ ...p, modeScolarite: p.modeScolarite === 'totalite' ? null : 'totalite', montantScolariteVerse: '' }))}
                      className={toggleScolariteClass(paiementInscription.modeScolarite === 'totalite', 'green')}>
                      ✅ Totalité
                    </button>
                  </div>

                  {paiementInscription.modeScolarite === 'tranche' && (
                    <FormGroup label="Montant versé maintenant (FCFA)" className="mt-2.5">
                      <Input type="number" min="0" value={paiementInscription.montantScolariteVerse}
                        onChange={(e) => setPaiementInscription((p) => ({ ...p, montantScolariteVerse: e.target.value }))}
                        placeholder="ex: 10000" autoFocus />
                    </FormGroup>
                  )}
                  {paiementInscription.modeScolarite === 'totalite' && Number(paiementInscription.montantScolarite) > 0 && (
                    <p className="mt-2.5 rounded-lg bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                      ✅ {formatMoney(Number(paiementInscription.montantScolarite) + (Number(paiementInscription.montantCuisine) || 0))} réglés en totalité (dont cuisine)
                    </p>
                  )}
                </div>

                <FormGroup label="Mode de paiement" className="mt-3">
                  <ModePaiementBoutons value={paiementInscription.modePaiement}
                    onChange={(v) => setPaiementInscription((p) => ({ ...p, modePaiement: v }))} />
                </FormGroup>
              </div>
            )}

            <FormGroup label="Notes">
              <textarea
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={modal.data.notes} onChange={(e) => set('notes', e.target.value)}
              />
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer cet enfant ?"
        size="sm"
        {...glassModalProps('#dc2626')}
        footer={
          <>
            <Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>Supprimer définitivement</Button>
          </>
        }
      >
        {toDelete && (
          <div className="space-y-4">
            <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_8px_20px_-8px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.35)]"
              style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.88) 0%, rgba(127,29,29,0.88) 100%)' }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: '#dc2626', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55' }}>
                <Trash2 size={22} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{toDelete.prenom} {toDelete.nom}</p>
                <p className="text-sm text-white/80">Suppression définitive de la fiche</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Vous allez supprimer cet enfant de la base de données. Cette action est <span className="font-semibold text-red-600">irréversible</span>.
            </p>
          </div>
        )}
      </Modal>

      {/* Modal détail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg"
        panelClassName="bg-gradient-to-br from-orange-200/85 via-orange-100/75 to-amber-300/75 backdrop-blur-2xl backdrop-saturate-200"
        title={detail ? `${detail.prenom} ${detail.nom}` : ''}>
        {detail && (
          <div className="space-y-4 text-sm">
            {/* En-tête glassmorphism : photo (modifiable) + identité bien visible */}
            <div className="relative flex flex-col items-center overflow-hidden rounded-2xl p-5 text-center text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(234,88,12,0.35),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
              style={{ background: 'linear-gradient(135deg, rgba(234,88,12,0.92) 0%, rgba(154,52,18,0.88) 100%)' }}>
              <div className="relative h-32 w-32 shrink-0">
                {detail.photo ? (
                  <img src={detail.photo} alt={`${detail.prenom} ${detail.nom}`} className="h-32 w-32 rounded-full border-4 border-white/80 object-cover shadow-lg" />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 text-4xl font-bold text-white shadow-lg backdrop-blur-sm">
                    {(detail.prenom?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <input ref={detailPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleDetailPhotoChange} />
                <button
                  type="button"
                  onClick={() => detailPhotoInputRef.current?.click()}
                  disabled={detailPhotoUploading}
                  title="Changer la photo"
                  className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-orange-600 text-white shadow hover:bg-orange-700 disabled:opacity-60"
                >
                  {detailPhotoUploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                </button>
              </div>
              <h3 className="mt-3 text-xl font-extrabold leading-snug">{detail.prenom} {detail.nom}</h3>
              <p className="mt-0.5 text-sm text-white/80">
                {calcAge(detail.dateNaissance) || detail.ageSaisi || '—'} · {PROGRAMMES_ENFANT.find((p) => p.id === (detail.programme || programmeDuGroupe(detail.groupe)))?.label} · {GROUPES_AGE.find((g) => g.id === detail.groupe)?.label || '—'}
              </p>
              <span className="mt-2 rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {STATUTS_ENFANT[detail.statut]?.label}
              </span>
            </div>

            {/* Statistiques */}
            {detailStats && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-2xl border border-white/50 bg-white/40 p-3 text-center shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150">
                  <UserCheck size={16} className="mx-auto text-green-600" />
                  <p className="mt-1 text-lg font-extrabold text-gray-900">{detailStats.joursPresents}</p>
                  <p className="text-[11px] text-gray-500">Jours présents</p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/40 p-3 text-center shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150">
                  <UserX size={16} className="mx-auto text-red-500" />
                  <p className="mt-1 text-lg font-extrabold text-gray-900">{detailStats.joursAbsents}</p>
                  <p className="text-[11px] text-gray-500">Absences{detailStats.joursExcuses > 0 ? ` (${detailStats.joursExcuses} exc.)` : ''}</p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/40 p-3 text-center shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150">
                  <CreditCard size={16} className={`mx-auto ${detailStats.impaye ? 'text-red-500' : 'text-green-600'}`} />
                  <p className={`mt-1 text-lg font-extrabold ${detailStats.impaye ? 'text-red-600' : 'text-gray-900'}`}>
                    {detailStats.impaye ? 'Impayé' : 'À jour'}
                  </p>
                  <p className="text-[11px] text-gray-500">Paiement ce mois</p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/40 p-3 text-center shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150">
                  <ShieldAlert size={16} className={`mx-auto ${detailStats.incidentsOuverts > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                  <p className="mt-1 text-lg font-extrabold text-gray-900">{detailStats.incidentsTotal}</p>
                  <p className="text-[11px] text-gray-500">Incident(s){detailStats.incidentsOuverts > 0 ? ` (${detailStats.incidentsOuverts} ouvert)` : ''}</p>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Card title="📋 Informations">
                <div className="space-y-1.5">
                  <div><span className="font-semibold text-gray-500">Sexe :</span> {detail.sexe === 'F' ? 'Fille' : 'Garçon'}</div>
                  <div><span className="font-semibold text-gray-500">Inscription :</span> {formatDateShort(detail.dateInscription)}</div>
                  <div>
                    <span className="font-semibold text-gray-500">Abonnement :</span>{' '}
                    {detail.typeAbonnement === 'court_sejour'
                      ? `Court séjour (${detail.dureeSemaines} sem.) — jusqu'au ${formatDateShort(dateFinCourtSejour(detail.dateInscription, detail.dureeSemaines))}`
                      : detail.typeAbonnement === 'annuel' ? 'Annuel' : 'Mensuel'}
                  </div>
                  {detail.typeAbonnement === 'court_sejour' && (() => {
                    const joursRestants = joursAvantFinCourtSejour(detail.dateInscription, detail.dureeSemaines)
                    if (joursRestants === null) return null
                    return joursRestants < 0 ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-2 py-1.5">
                        <p className="text-xs font-semibold text-red-700">⚠ Séjour terminé depuis {Math.abs(joursRestants)} jour(s)</p>
                        {detail.finSejourAlarme && !lectureSeule && (
                          <button onClick={() => resoudreFinSejour(detail)}
                            className="ml-auto rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-700">
                            Clôturer l'alerte
                          </button>
                        )}
                      </div>
                    ) : joursRestants <= 7 ? (
                      <p className="rounded-lg bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700">⏰ Fin du séjour dans {joursRestants} jour(s)</p>
                    ) : null
                  })()}
                  <div><span className="font-semibold text-gray-500">Adresse :</span> {detail.adresse || '—'}</div>
                </div>
              </Card>
              <Card title="👪 Parent / Tuteur">
                <div className="space-y-1.5">
                  <div><span className="font-semibold text-gray-500">Nom :</span> {detail.parentNom || '—'}</div>
                  <div><span className="font-semibold text-gray-500">Contact :</span> {detail.parentContact || '—'}</div>
                  {detail.parentContact2 && <div><span className="font-semibold text-gray-500">Contact 2 :</span> {detail.parentContact2}</div>}
                  <div><span className="font-semibold text-gray-500">Profession :</span> {detail.parentProfession || '—'}</div>
                </div>
              </Card>
            </div>

            {(detail.allergies || detail.infoMedicale) && (
              <Card title="🏥 Santé & allergies" className="border-orange-200">
                <div className="space-y-1">
                  {detail.allergies && <p><span className="font-semibold">Allergies :</span> {detail.allergies}</p>}
                  {detail.infoMedicale && <p><span className="font-semibold">Info médicale :</span> {detail.infoMedicale}</p>}
                </div>
              </Card>
            )}

            {detail.notes && (
              <Card title="📝 Notes">
                <p className="italic text-gray-500">{detail.notes}</p>
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

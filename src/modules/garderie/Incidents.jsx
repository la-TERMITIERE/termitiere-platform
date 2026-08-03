import { useMemo, useState } from 'react'
import { Plus, AlertTriangle, CheckCircle2, Bell, BellOff, BellRing, ShieldAlert, Lock, Thermometer, Pill, Syringe, Search, X, FileDown } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { FULL_ACCESS_ROLES } from '../../core/roles'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { TYPES_INCIDENT, GRAVITES_INCIDENT, TYPES_SOIN, VACCINS_STANDARD } from './data'
import { useGarderieStore } from './store/garderieStore'
import { genererRapportPDF } from '../../utils/exportPDF'

// Niveaux d'alarme : 0=aucune 1=surveillance 2=alerte 3=urgence
const NIVEAUX_ALARME = {
  0: { label: 'Aucune alarme',   icon: BellOff,   color: 'text-gray-400',  bg: '',                   badge: '' },
  1: { label: 'Surveillance',    icon: Bell,       color: 'text-yellow-500',bg: 'bg-yellow-50 border-yellow-200', badge: '🟡' },
  2: { label: 'Alerte',          icon: BellRing,   color: 'text-orange-500',bg: 'bg-orange-50 border-orange-200', badge: '🟠' },
  3: { label: 'Urgence',         icon: ShieldAlert,color: 'text-red-600',   bg: 'bg-red-50 border-red-300',       badge: '🔴' },
}

function niveauParDefaut(gravite) {
  if (gravite === 'grave')  return 3
  if (gravite === 'moyen')  return 2
  return 0
}

const emptyIncident = () => ({
  enfantId: '', enfantNom: '',
  type: 'accident', gravite: 'faible',
  date: todayStr(), heure: new Date().toTimeString().slice(0, 5),
  description: '', mesuresPrises: '', parentPrevenu: false,
  resolu: false, notes: '', alarme: 0
})

const emptySoin = () => ({
  enfantId: '', enfantNom: '',
  type: 'bobo',
  date: todayStr(), heure: new Date().toTimeString().slice(0, 5), heureSortie: '',
  description: '',
  medicament: '', dosage: '', temperature: '',
  administrePar: '',
  autorisationParent: false, parentPrevenu: false,
  suivi: false, notes: ''
})

// Durée passée à l'infirmerie, entre l'heure d'arrivée et l'heure de sortie (HH:MM)
function dureeInfirmerie(heureEntree, heureSortie) {
  if (!heureEntree || !heureSortie) return null
  const [h1, m1] = heureEntree.split(':').map(Number)
  const [h2, m2] = heureSortie.split(':').map(Number)
  let minutes = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (minutes < 0) minutes += 24 * 60 // passage après minuit
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`
}

// Construit un état de carnet vaccinal vide (tous vaccins non reçus)
function emptyCarnet() {
  const vaccins = {}
  VACCINS_STANDARD.forEach((v) => { vaccins[v.id] = { recu: false, date: '', notes: '' } })
  return vaccins
}

export default function Incidents() {
  const { user } = useAuth()
  const { data: incidents }    = useCollection('garderie_incidents')
  const { data: soins }        = useCollection('garderie_soins')
  const { data: enfants }      = useCollection('garderie_enfants')
  const { data: personnel }    = useCollection('garderie_personnel')
  const { data: journaliers }  = useCollection('garderie_journaliers')
  const { data: vaccinations } = useCollection('garderie_vaccinations')

  const [onglet, setOnglet] = useState('incidents')

  // ── Incidents ──
  const [modalIncident, setModalIncident] = useState(null)
  const [filtreGravite, setFiltreGravite] = useState('')
  const [filtreResolu, setFiltreResolu]   = useState('false')

  // ── Soins ──
  const [modalSoin, setModalSoin]     = useState(null)
  const [filtreType, setFiltreType]   = useState('')
  const [filtreSuivi, setFiltreSuivi] = useState('')

  // ── Vaccination ──
  const [rechercheVaccin, setRechercheVaccin] = useState('')
  const [carnetModal, setCarnetModal]         = useState(null) // { enfantId, enfantNom, vaccins }
  const [carnetSaving, setCarnetSaving]       = useState(false)

  const deletedEnfantIds = useGarderieStore((s) => s.deletedEnfantIds)

  const enfantsActifs = useMemo(
    () => enfants.filter((e) => e.statut === 'actif' && !deletedEnfantIds.has(e.id)),
    [enfants, deletedEnfantIds]
  )

  const personnelActif = useMemo(
    () => personnel.filter((p) => p.statut === 'actif'),
    [personnel]
  )

  // Sélecteur d'enfant partagé (Incidents + Soins) : inscrits + journaliers (dédupliqués par nom, le plus récent)
  const tousEnfantsSelectables = useMemo(() => {
    const jouSeen = new Set()
    const jouListe = [...journaliers]
      .sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1)
      .filter((j) => {
        const key = `${j.prenom} ${j.nom}`.toLowerCase()
        if (jouSeen.has(key)) return false
        jouSeen.add(key)
        return true
      })
    return [
      ...enfantsActifs.map((e) => ({ id: e.id, nom: `${e.prenom} ${e.nom}` })),
      ...jouListe.map((j) => ({ id: `jo_${j.id}`, nom: `${j.prenom} ${j.nom} (journalier)` }))
    ]
  }, [enfantsActifs, journaliers])

  // ══════════════════════ INCIDENTS ══════════════════════
  const listeIncidents = useMemo(() => {
    let rows = [...incidents]
    if (filtreGravite)        rows = rows.filter((i) => i.gravite === filtreGravite)
    if (filtreResolu !== '')  rows = rows.filter((i) => String(i.resolu) === filtreResolu)
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [incidents, filtreGravite, filtreResolu])

  async function handleSaveIncident() {
    const d = modalIncident.data
    if (!d.enfantId) return toast.error('Sélectionnez un enfant')
    if (!d.description.trim()) return toast.error('Description requise')

    if (modalIncident.isNew) {
      const id = genId()
      const alarmeAuto = niveauParDefaut(d.gravite)
      await setItem('garderie_incidents', id, { ...d, id, resolu: false, alarme: alarmeAuto })
      audit('garderie', 'INCIDENT_CREATE', d.enfantNom, { type: d.type, gravite: d.gravite })
      const graviteLabel = d.gravite === 'grave' ? '🔴 GRAVE' : d.gravite === 'moyen' ? '🟠 Moyen' : '🟡 Faible'
      notify({
        type: d.gravite === 'grave' ? 'demande' : 'info',
        title: `⚠️ Incident ${graviteLabel} — ${d.enfantNom}`,
        body: d.description?.slice(0, 80) || d.type,
        module: 'garderie',
        forRoles: d.gravite === 'grave' ? [...FULL_ACCESS_ROLES,'gerant','agent'] : [...FULL_ACCESS_ROLES,'gerant'],
        excludeUid: user.uid,
        link: '/garderie/incidents'
      })
      toast.success('Incident enregistré ✓')
    } else {
      await setItem('garderie_incidents', modalIncident.id, { ...d, id: modalIncident.id })
      audit('garderie', 'INCIDENT_EDIT', d.enfantNom)
      toast.success('Incident mis à jour ✓')
    }
    setModalIncident(null)
  }

  async function marquerResolu(i) {
    await setItem('garderie_incidents', i.id, { ...i, resolu: true, alarme: 0 })
    audit('garderie', 'INCIDENT_RESOLU', i.enfantNom)
    notify({ type: 'info', title: `✅ Incident résolu — ${i.enfantNom}`, body: i.description?.slice(0, 80) || '', module: 'garderie', forRoles: [...FULL_ACCESS_ROLES,'gerant'], excludeUid: user.uid, link: '/garderie/incidents' })
    toast.success('Incident résolu — alarme désactivée ✓')
  }

  async function changerAlarme(i, niveau) {
    // L'alarme ne peut être désactivée (0) que si l'incident est résolu
    if (niveau === 0 && !i.resolu) {
      toast.error('L\'alarme ne peut être désactivée qu\'en résolvant l\'incident')
      return
    }
    await setItem('garderie_incidents', i.id, { ...i, alarme: niveau })
    audit('garderie', 'INCIDENT_ALARME', i.enfantNom, { niveau })
    if (niveau > 0) {
      const n = NIVEAUX_ALARME[niveau]
      notify({
        type: niveau === 3 ? 'demande' : 'info',
        title: `${n.badge} Alarme ${n.label} — ${i.enfantNom}`,
        body: i.description?.slice(0, 80) || i.type,
        module: 'garderie',
        forRoles: niveau === 3 ? [...FULL_ACCESS_ROLES,'gerant','agent'] : [...FULL_ACCESS_ROLES,'gerant'],
        excludeUid: user.uid,
        link: '/garderie/incidents'
      })
      toast.success(`Alarme "${n.label}" activée`)
    }
  }

  const setIncident = (k, v) => setModalIncident((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  function onEnfantChangeIncident(id) {
    const found = tousEnfantsSelectables.find((x) => x.id === id)
    setModalIncident((m) => ({ ...m, data: { ...m.data, enfantId: id, enfantNom: found ? found.nom : '' } }))
  }

  // ══════════════════════ SOINS ══════════════════════
  const listeSoins = useMemo(() => {
    let rows = [...soins]
    if (filtreType)  rows = rows.filter((s) => s.type === filtreType)
    if (filtreSuivi !== '') rows = rows.filter((s) => String(!!s.suivi) === filtreSuivi)
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [soins, filtreType, filtreSuivi])

  const aSuivreCount = useMemo(() => soins.filter((s) => s.suivi).length, [soins])

  function onEnfantChangeSoin(id) {
    const found = tousEnfantsSelectables.find((x) => x.id === id)
    setModalSoin((m) => ({ ...m, data: { ...m.data, enfantId: id, enfantNom: found ? found.nom : '' } }))
  }

  const setSoin = (k, v) => setModalSoin((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  async function handleSaveSoin() {
    const d = modalSoin.data
    if (!d.enfantId) return toast.error('Sélectionnez un enfant')
    if (!d.description.trim()) return toast.error('Description du soin requise')
    if (d.type === 'medicament' && !d.autorisationParent) {
      return toast.error('Autorisation du parent requise pour administrer un médicament')
    }

    const payload = { ...d, temperature: d.temperature ? Number(d.temperature) : '' }

    if (modalSoin.isNew) {
      const id = genId()
      await setItem('garderie_soins', id, { ...payload, id })
      audit('garderie', 'SOIN_CREATE', d.enfantNom, { type: d.type })
      notify({
        type: 'info',
        title: `🩺 Soin enregistré — ${d.enfantNom}`,
        body: `${TYPES_SOIN.find((t) => t.id === d.type)?.label || d.type} — ${d.description.slice(0, 60)}`,
        module: 'garderie',
        forRoles: [...FULL_ACCESS_ROLES,'gerant'],
        excludeUid: user.uid,
        link: '/garderie/incidents'
      })
      toast.success('Soin enregistré ✓')
    } else {
      await setItem('garderie_soins', modalSoin.id, { ...payload, id: modalSoin.id })
      audit('garderie', 'SOIN_EDIT', d.enfantNom)
      toast.success('Soin mis à jour ✓')
    }
    setModalSoin(null)
  }

  async function marquerSuivi(s, valeur) {
    await setItem('garderie_soins', s.id, { ...s, suivi: valeur })
    audit('garderie', 'SOIN_SUIVI', s.enfantNom, { suivi: valeur })
    toast.success(valeur ? 'Marqué "à suivre"' : 'Suivi clôturé ✓')
  }

  async function marquerSortie(s) {
    const heureSortie = new Date().toTimeString().slice(0, 5)
    await setItem('garderie_soins', s.id, { ...s, heureSortie })
    audit('garderie', 'SOIN_SORTIE', s.enfantNom, { heureSortie })
    toast.success(`Sortie de l'infirmerie enregistrée (${heureSortie}) ✓`)
  }

  // ══════════════════════ CARNET DE VACCINATION ══════════════════════
  const carnetParEnfant = useMemo(() => {
    const map = {}
    vaccinations.forEach((v) => { map[v.enfantId] = v })
    return map
  }, [vaccinations])

  const enfantsVaccinFiltre = useMemo(() => {
    const q = rechercheVaccin.trim().toLowerCase()
    let rows = enfantsActifs
    if (q) rows = rows.filter((e) => `${e.prenom} ${e.nom}`.toLowerCase().includes(q))
    return [...rows].sort((a, b) => `${a.prenom} ${a.nom}` < `${b.prenom} ${b.nom}` ? -1 : 1)
  }, [enfantsActifs, rechercheVaccin])

  function progressionVaccin(enfantId) {
    const carnet = carnetParEnfant[enfantId]
    const total = VACCINS_STANDARD.length
    if (!carnet?.vaccins) return { recus: 0, total }
    const recus = VACCINS_STANDARD.filter((v) => carnet.vaccins[v.id]?.recu).length
    return { recus, total }
  }

  function ouvrirCarnet(enfant) {
    const existant = carnetParEnfant[enfant.id]
    setCarnetModal({
      enfantId: enfant.id,
      enfantNom: `${enfant.prenom} ${enfant.nom}`,
      vaccins: { ...emptyCarnet(), ...(existant?.vaccins || {}) },
      autres: existant?.autres || []
    })
  }

  function toggleVaccin(vaccinId, checked) {
    setCarnetModal((m) => ({
      ...m,
      vaccins: {
        ...m.vaccins,
        [vaccinId]: { ...m.vaccins[vaccinId], recu: checked, date: checked ? (m.vaccins[vaccinId]?.date || todayStr()) : '' }
      }
    }))
  }

  function setVaccinChamp(vaccinId, champ, valeur) {
    setCarnetModal((m) => ({
      ...m,
      vaccins: { ...m.vaccins, [vaccinId]: { ...m.vaccins[vaccinId], [champ]: valeur } }
    }))
  }

  // ── Vaccins hors-liste, ajoutés librement par l'utilisateur ──
  function ajouterVaccinPersonnalise() {
    setCarnetModal((m) => ({
      ...m,
      autres: [...(m.autres || []), { id: genId(), label: '', date: todayStr(), notes: '' }]
    }))
  }

  function setVaccinPersonnaliseChamp(id, champ, valeur) {
    setCarnetModal((m) => ({
      ...m,
      autres: (m.autres || []).map((a) => a.id === id ? { ...a, [champ]: valeur } : a)
    }))
  }

  function supprimerVaccinPersonnalise(id) {
    setCarnetModal((m) => ({ ...m, autres: (m.autres || []).filter((a) => a.id !== id) }))
  }

  async function handleSaveCarnet() {
    if (carnetSaving || !carnetModal) return
    setCarnetSaving(true)
    try {
      await setItem('garderie_vaccinations', carnetModal.enfantId, {
        id: carnetModal.enfantId,
        enfantId: carnetModal.enfantId,
        enfantNom: carnetModal.enfantNom,
        vaccins: carnetModal.vaccins,
        autres: (carnetModal.autres || []).filter((a) => a.label.trim()),
        updatedAt: Date.now()
      })
      audit('garderie', 'VACCINATION_SAVE', carnetModal.enfantNom)
      toast.success('Carnet de vaccination mis à jour ✓')
      setCarnetModal(null)
    } finally {
      setCarnetSaving(false)
    }
  }

  function exporterCarnetPDF(carnet) {
    const lignes = VACCINS_STANDARD.map((v) => {
      const etat = carnet.vaccins[v.id] || { recu: false, date: '', notes: '' }
      return [
        v.label, v.age,
        etat.recu ? '✓ Reçu' : '— En attente',
        etat.recu && etat.date ? formatDateShort(etat.date) : '—',
        etat.notes || ''
      ]
    })
    const autres = (carnet.autres || []).filter((a) => a.label.trim())
    autres.forEach((a) => {
      lignes.push([a.label, '—', '✓ Reçu', a.date ? formatDateShort(a.date) : '—', a.notes || ''])
    })
    genererRapportPDF({
      titre: `Carnet de vaccination — ${carnet.enfantNom}`,
      colonnes: ['Vaccin', 'Âge recommandé', 'Statut', 'Date', 'Notes'],
      lignes,
      fichier: `carnet-vaccination-${carnet.enfantNom.replace(/\s+/g, '-')}.pdf`,
      module: 'garderie'
    })
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <p className="font-semibold mb-0.5">⚕️ Santé & Infirmerie</p>
        <p>Incidents graves avec alarme, soins courants (température, bobos, médicaments) et carnet de vaccination — tout le suivi santé des enfants regroupé ici.</p>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'incidents',    label: '⚠️ Incidents' },
          { id: 'soins',        label: '🩹 Soins courants' },
          { id: 'vaccinations', label: '💉 Vaccination' }
        ].map((t) => (
          <button key={t.id} onClick={() => setOnglet(t.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              onglet === t.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════ ONGLET INCIDENTS ══════════════ */}
      {onglet === 'incidents' && <>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Gravité</label>
          <Select value={filtreGravite} onChange={(e) => setFiltreGravite(e.target.value)}>
            <option value="">Toutes</option>
            {Object.entries(GRAVITES_INCIDENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Statut</label>
          <Select value={filtreResolu} onChange={(e) => setFiltreResolu(e.target.value)}>
            <option value="">Tous</option>
            <option value="false">Non résolus</option>
            <option value="true">Résolus</option>
          </Select>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setModalIncident({ data: emptyIncident(), isNew: true })}>
            <Plus size={16} /> Signaler un incident
          </Button>
        </div>
      </div>

      {/* Bannière alarmes actives */}
      {listeIncidents.filter((i) => !i.resolu && (i.alarme || 0) >= 2).length > 0 && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 animate-pulse">
          <p className="font-bold text-red-700 flex items-center gap-2">
            <ShieldAlert size={18} />
            {listeIncidents.filter((i) => !i.resolu && (i.alarme || 0) === 3).length > 0 &&
              `🔴 ${listeIncidents.filter((i) => !i.resolu && (i.alarme || 0) === 3).length} URGENCE(S) — `}
            {listeIncidents.filter((i) => !i.resolu && (i.alarme || 0) === 2).length > 0 &&
              `🟠 ${listeIncidents.filter((i) => !i.resolu && (i.alarme || 0) === 2).length} ALERTE(S)`}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {listeIncidents.filter((i) => !i.resolu && (i.alarme || 0) >= 2).map((i) => (
              <span key={i.id} className="rounded-full bg-red-100 border border-red-300 px-2 py-0.5 text-xs font-semibold text-red-800">
                {NIVEAUX_ALARME[i.alarme || 0]?.badge} {i.enfantNom}
              </span>
            ))}
          </div>
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">🔔 Alarme</th>
              <th className="px-3 py-2 text-left">Enfant</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Date / Heure</th>
              <th className="px-3 py-2 text-left">Gravité</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-center">Parent</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listeIncidents.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-sm text-gray-400">Aucun incident enregistré.</td></tr>
            )}
            {listeIncidents.map((i) => {
              const niv = i.alarme || 0
              const alarmeInfo = NIVEAUX_ALARME[niv]
              const AlarmeIcon = alarmeInfo.icon
              return (
                <tr key={i.id} className={`transition-colors ${niv === 3 ? 'bg-red-50' : niv === 2 ? 'bg-orange-50' : niv === 1 ? 'bg-yellow-50/50' : ''}`}>
                  {/* Alarme */}
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-center gap-1">
                      <AlarmeIcon size={18} className={alarmeInfo.color} />
                      {!i.resolu && (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex gap-0.5">
                            {[1, 2, 3].map((n) => (
                              <button key={n}
                                onClick={() => changerAlarme(i, niv === n ? 0 : n)}
                                title={niv === n ? 'Résolvez l\'incident pour désactiver' : NIVEAUX_ALARME[n].label}
                                className={`w-4 h-4 rounded-full text-[8px] font-bold border transition-all ${
                                  niv === n
                                    ? n === 3 ? 'bg-red-500 border-red-600 text-white scale-110'
                                    : n === 2 ? 'bg-orange-500 border-orange-600 text-white scale-110'
                                    : 'bg-yellow-400 border-yellow-500 text-white scale-110'
                                    : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
                                }`}>
                                {n}
                              </button>
                            ))}
                          </div>
                          {niv > 0 && (
                            <span className="flex items-center gap-0.5 text-[8px] text-gray-400">
                              <Lock size={7} /> résoudre pour éteindre
                            </span>
                          )}
                        </div>
                      )}
                      {i.resolu && <span className="text-[9px] text-gray-400">résolu</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-semibold">{i.enfantNom || '—'}</td>
                  <td className="px-3 py-2">{TYPES_INCIDENT.find((t) => t.id === i.type)?.label || i.type}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{formatDateShort(i.date)} {i.heure}</td>
                  <td className="px-3 py-2"><Badge tone={GRAVITES_INCIDENT[i.gravite]?.tone}>{GRAVITES_INCIDENT[i.gravite]?.label}</Badge></td>
                  <td className="px-3 py-2 max-w-xs truncate text-gray-600">{i.description}</td>
                  <td className="px-3 py-2 text-center">
                    {i.parentPrevenu ? <CheckCircle2 size={16} className="text-green-500 mx-auto" /> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {!i.resolu && (
                        <button onClick={() => marquerResolu(i)}
                          className="rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 font-semibold">Résolu</button>
                      )}
                      <button onClick={() => setModalIncident({ data: { ...emptyIncident(), ...i }, isNew: false, id: i.id })}
                        className="rounded px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 font-semibold">Éditer</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
      </> }

      {/* ══════════════ ONGLET SOINS ══════════════ */}
      {onglet === 'soins' && <>
      {aSuivreCount > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <p className="font-bold text-amber-700 flex items-center gap-2">
            <Thermometer size={18} /> {aSuivreCount} soin(s) à suivre
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Type de soin</label>
          <Select value={filtreType} onChange={(e) => setFiltreType(e.target.value)}>
            <option value="">Tous</option>
            {TYPES_SOIN.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Suivi</label>
          <Select value={filtreSuivi} onChange={(e) => setFiltreSuivi(e.target.value)}>
            <option value="">Tous</option>
            <option value="true">À suivre</option>
            <option value="false">Clôturés</option>
          </Select>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setModalSoin({ data: emptySoin(), isNew: true })}>
            <Plus size={16} /> Enregistrer un soin
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Enfant</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Date / Heure</th>
              <th className="px-3 py-2 text-left">Temps à l'infirmerie</th>
              <th className="px-3 py-2 text-left">Détails</th>
              <th className="px-3 py-2 text-left">Administré par</th>
              <th className="px-3 py-2 text-center">Parent</th>
              <th className="px-3 py-2 text-left">Suivi</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {listeSoins.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-sm text-gray-400">Aucun soin enregistré.</td></tr>
            )}
            {listeSoins.map((s) => (
              <tr key={s.id} className="hover:bg-orange-50 transition-colors">
                <td className="px-3 py-2 font-semibold">{s.enfantNom || '—'}</td>
                <td className="px-3 py-2">{TYPES_SOIN.find((t) => t.id === s.type)?.label || s.type}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{formatDateShort(s.date)} {s.heure}</td>
                <td className="px-3 py-2 text-xs">
                  {s.heureSortie ? (
                    <span className="font-bold text-blue-700">{dureeInfirmerie(s.heure, s.heureSortie) || '—'}</span>
                  ) : (
                    <button onClick={() => marquerSortie(s)}
                      className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 hover:bg-blue-200">
                      Marquer la sortie
                    </button>
                  )}
                  {s.heureSortie && <p className="text-[10px] text-gray-400">{s.heure} → {s.heureSortie}</p>}
                </td>
                <td className="px-3 py-2 max-w-xs text-gray-600">
                  <p className="truncate">{s.description}</p>
                  <div className="flex flex-wrap gap-2 mt-0.5">
                    {s.temperature && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600">
                        <Thermometer size={10} /> {s.temperature}°C
                      </span>
                    )}
                    {s.medicament && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-purple-600">
                        <Pill size={10} /> {s.medicament}{s.dosage ? ` (${s.dosage})` : ''}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{s.administrePar || '—'}</td>
                <td className="px-3 py-2 text-center">
                  {s.parentPrevenu ? <CheckCircle2 size={16} className="text-green-500 mx-auto" /> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2">
                  {s.suivi ? (
                    <button onClick={() => marquerSuivi(s, false)}
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 hover:bg-amber-200">
                      🟡 À suivre
                    </button>
                  ) : (
                    <button onClick={() => marquerSuivi(s, true)}
                      className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700 hover:bg-green-200">
                      ✓ Clôturé
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => setModalSoin({ data: { ...emptySoin(), ...s }, isNew: false, id: s.id })}
                    className="rounded px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 font-semibold">Éditer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      </> }

      {/* ══════════════ ONGLET VACCINATIONS ══════════════ */}
      {onglet === 'vaccinations' && <>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
            <input
              className="rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              placeholder="Rechercher un enfant…"
              value={rechercheVaccin}
              onChange={(e) => setRechercheVaccin(e.target.value)}
            />
          </div>
          <span className="ml-auto text-xs text-gray-400">{enfantsVaccinFiltre.length} enfant(s)</span>
        </div>

        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Enfant</th>
                <th className="px-3 py-2 text-left">Progression du carnet</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {enfantsVaccinFiltre.length === 0 && (
                <tr><td colSpan={3} className="py-8 text-center text-sm text-gray-400">Aucun enfant trouvé.</td></tr>
              )}
              {enfantsVaccinFiltre.map((e) => {
                const { recus, total } = progressionVaccin(e.id)
                const complet = recus === total
                return (
                  <tr key={e.id} className="hover:bg-orange-50 transition-colors">
                    <td className="px-3 py-2 font-semibold">{e.prenom} {e.nom}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-40 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full rounded-full ${complet ? 'bg-green-500' : 'bg-orange-400'}`}
                            style={{ width: `${total ? (recus / total) * 100 : 0}%` }} />
                        </div>
                        <span className={`text-xs font-bold ${complet ? 'text-green-600' : 'text-gray-500'}`}>
                          {recus}/{total} {complet && '✓'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => ouvrirCarnet(e)}
                        className="flex items-center gap-1 rounded-lg bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700 hover:bg-orange-200 ml-auto">
                        <Syringe size={12} /> Ouvrir le carnet
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </> }

      {/* ── Modal : Incident ── */}
      <Modal open={!!modalIncident} onClose={() => setModalIncident(null)} size="lg"
        title={modalIncident?.isNew ? 'Signaler un incident' : 'Modifier l\'incident'}
        footer={<><Button variant="outline" onClick={() => setModalIncident(null)}>Annuler</Button><Button onClick={handleSaveIncident}>Enregistrer</Button></>}>
        {modalIncident && (
          <div className="space-y-3">
            <FormGroup label="Enfant concerné *">
              <Select value={modalIncident.data.enfantId} onChange={(e) => onEnfantChangeIncident(e.target.value)}>
                <option value="">— Choisir —</option>
                {tousEnfantsSelectables.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </Select>
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Type d'incident">
                <Select value={modalIncident.data.type} onChange={(e) => setIncident('type', e.target.value)}>
                  {TYPES_INCIDENT.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Gravité">
                <Select value={modalIncident.data.gravite} onChange={(e) => setIncident('gravite', e.target.value)}>
                  {Object.entries(GRAVITES_INCIDENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Date">
                <Input type="date" value={modalIncident.data.date} onChange={(e) => setIncident('date', e.target.value)} />
              </FormGroup>
              <FormGroup label="Heure">
                <Input type="time" value={modalIncident.data.heure} onChange={(e) => setIncident('heure', e.target.value)} />
              </FormGroup>
            </div>
            <FormGroup label="Description *">
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={3} value={modalIncident.data.description} onChange={(e) => setIncident('description', e.target.value)}
                placeholder="Décrivez l'incident de façon précise…" />
            </FormGroup>
            <FormGroup label="Mesures prises">
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={modalIncident.data.mesuresPrises} onChange={(e) => setIncident('mesuresPrises', e.target.value)}
                placeholder="Premiers secours, appel médecin, soins…" />
            </FormGroup>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!modalIncident.data.parentPrevenu} onChange={(e) => setIncident('parentPrevenu', e.target.checked)}
                  className="rounded text-orange-500" />
                Parent / tuteur prévenu
              </label>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal : Soin ── */}
      <Modal open={!!modalSoin} onClose={() => setModalSoin(null)} size="lg"
        title={modalSoin?.isNew ? '🩺 Enregistrer un soin' : 'Modifier le soin'}
        footer={<><Button variant="outline" onClick={() => setModalSoin(null)}>Annuler</Button><Button onClick={handleSaveSoin}>Enregistrer</Button></>}>
        {modalSoin && (
          <div className="space-y-3">
            <FormGroup label="Enfant concerné *">
              <Select value={modalSoin.data.enfantId} onChange={(e) => onEnfantChangeSoin(e.target.value)}>
                <option value="">— Choisir —</option>
                {tousEnfantsSelectables.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </Select>
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Type de soin">
                <Select value={modalSoin.data.type} onChange={(e) => setSoin('type', e.target.value)}>
                  {TYPES_SOIN.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Administré par">
                <Select value={modalSoin.data.administrePar} onChange={(e) => setSoin('administrePar', e.target.value)}>
                  <option value="">— Choisir —</option>
                  {personnelActif.map((p) => (
                    <option key={p.id} value={`${p.prenom} ${p.nom}`}>{p.prenom} {p.nom}</option>
                  ))}
                </Select>
              </FormGroup>
              <FormGroup label="Date">
                <Input type="date" value={modalSoin.data.date} onChange={(e) => setSoin('date', e.target.value)} />
              </FormGroup>
              <FormGroup label="Heure d'arrivée">
                <Input type="time" value={modalSoin.data.heure} onChange={(e) => setSoin('heure', e.target.value)} />
              </FormGroup>
              <FormGroup label="Heure de sortie de l'infirmerie">
                <Input type="time" value={modalSoin.data.heureSortie} onChange={(e) => setSoin('heureSortie', e.target.value)} />
                {modalSoin.data.heure && modalSoin.data.heureSortie && (
                  <p className="mt-1 text-xs font-semibold text-blue-600">
                    ⏱ Temps passé : {dureeInfirmerie(modalSoin.data.heure, modalSoin.data.heureSortie) || '—'}
                  </p>
                )}
              </FormGroup>
              {(modalSoin.data.type === 'temperature' || modalSoin.data.type === 'medicament') && (
                <FormGroup label="Température (°C)">
                  <Input type="number" step="0.1" value={modalSoin.data.temperature} onChange={(e) => setSoin('temperature', e.target.value)} placeholder="ex: 38.5" />
                </FormGroup>
              )}
              {modalSoin.data.type === 'medicament' && (
                <>
                  <FormGroup label="Médicament">
                    <Input value={modalSoin.data.medicament} onChange={(e) => setSoin('medicament', e.target.value)} placeholder="ex: Paracétamol" />
                  </FormGroup>
                  <FormGroup label="Dosage">
                    <Input value={modalSoin.data.dosage} onChange={(e) => setSoin('dosage', e.target.value)} placeholder="ex: 5 ml" />
                  </FormGroup>
                </>
              )}
            </div>
            <FormGroup label="Description *">
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={3} value={modalSoin.data.description} onChange={(e) => setSoin('description', e.target.value)}
                placeholder="Symptômes, motif du soin, observations…" />
            </FormGroup>
            <FormGroup label="Notes de suivi">
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={modalSoin.data.notes} onChange={(e) => setSoin('notes', e.target.value)}
                placeholder="Évolution, recommandations…" />
            </FormGroup>
            <div className="flex flex-wrap items-center gap-4">
              {modalSoin.data.type === 'medicament' && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!modalSoin.data.autorisationParent} onChange={(e) => setSoin('autorisationParent', e.target.checked)}
                    className="rounded text-orange-500" />
                  Autorisation du parent obtenue *
                </label>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!modalSoin.data.parentPrevenu} onChange={(e) => setSoin('parentPrevenu', e.target.checked)}
                  className="rounded text-orange-500" />
                Parent / tuteur prévenu
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!modalSoin.data.suivi} onChange={(e) => setSoin('suivi', e.target.checked)}
                  className="rounded text-orange-500" />
                Nécessite un suivi
              </label>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal : Carnet de vaccination (checklist) ── */}
      <Modal open={!!carnetModal} onClose={() => setCarnetModal(null)} size="lg" {...glassModalProps(COULEUR_MODULE.garderie)}
        title={carnetModal ? `💉 Carnet de vaccination — ${carnetModal.enfantNom}` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => exporterCarnetPDF(carnetModal)}>
              <FileDown size={15} /> Exporter en PDF
            </Button>
            <Button variant="outline" onClick={() => setCarnetModal(null)} disabled={carnetSaving}>Annuler</Button>
            <Button onClick={handleSaveCarnet} loading={carnetSaving}>Enregistrer le carnet</Button>
          </>
        }>
        {carnetModal && (
          <div className="space-y-2">
            {VACCINS_STANDARD.map((v) => {
              const etat = carnetModal.vaccins[v.id] || { recu: false, date: '', notes: '' }
              return (
                <div key={v.id} className={`rounded-lg border px-3 py-2 transition-colors ${etat.recu ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex flex-1 items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={etat.recu}
                        onChange={(e) => toggleVaccin(v.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-400" />
                      <span className={`text-sm font-semibold ${etat.recu ? 'text-green-800' : 'text-gray-700'}`}>{v.label}</span>
                      <span className="text-xs text-gray-400">({v.age})</span>
                    </label>
                    {etat.recu && <CheckCircle2 size={16} className="text-green-500 shrink-0" />}
                  </div>
                  {etat.recu && (
                    <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
                      <Input type="date" value={etat.date} onChange={(e) => setVaccinChamp(v.id, 'date', e.target.value)} />
                      <Input value={etat.notes} onChange={(e) => setVaccinChamp(v.id, 'notes', e.target.value)} placeholder="Notes (lot, centre de santé…)" />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Vaccins hors-liste, ajoutés librement */}
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase text-gray-500">Autres vaccins (hors liste)</p>
                <button type="button" onClick={ajouterVaccinPersonnalise}
                  className="flex items-center gap-1 rounded-lg bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700 hover:bg-orange-200">
                  <Plus size={12} /> Ajouter un vaccin
                </button>
              </div>
              {(carnetModal.autres || []).length === 0 && (
                <p className="text-xs text-gray-400">Aucun vaccin supplémentaire ajouté.</p>
              )}
              <div className="space-y-2">
                {(carnetModal.autres || []).map((a) => (
                  <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-2">
                    <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                      <Input value={a.label} onChange={(e) => setVaccinPersonnaliseChamp(a.id, 'label', e.target.value)}
                        placeholder="Nom du vaccin (ex: Fièvre typhoïde)" />
                      <button type="button" onClick={() => supprimerVaccinPersonnalise(a.id)}
                        className="rounded p-2 text-red-500 hover:bg-red-50"><X size={14} /></button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Input type="date" value={a.date} onChange={(e) => setVaccinPersonnaliseChamp(a.id, 'date', e.target.value)} />
                      <Input value={a.notes} onChange={(e) => setVaccinPersonnaliseChamp(a.id, 'notes', e.target.value)} placeholder="Notes" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

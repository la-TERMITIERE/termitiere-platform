import { useMemo, useState, useRef } from 'react'
import { Plus, Clock, CheckCircle2, LogOut, FilePen, Trash2, Timer, CalendarClock, ChevronLeft, ChevronRight, FileSpreadsheet, AlertCircle, Eye, Camera, X, Loader2, UserCheck, UserX, CalendarDays, Users } from 'lucide-react'
import { compresserPhotoProfil } from '../../utils/fichiers'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { POSTES_PERSONNEL } from './data'
import { exportRapportExcel } from '../../utils/excelReport'

const heureNow = () => new Date().toTimeString().slice(0, 5)

function calcDuree(debut, fin) {
  if (!debut || !fin) return null
  const [h1, m1] = debut.split(':').map(Number)
  const [h2, m2] = fin.split(':').map(Number)
  const totalMin = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (totalMin <= 0) return null
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2,'0') : '00'}` : `${m}min`
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const emptyPersonnel = () => ({
  nom: '', prenom: '', photo: '', poste: 'tata', telephone: '',
  dateEmbauche: todayStr(), horaire: '07:00 – 17:00',
  statut: 'actif', notes: ''
})

export default function Personnel() {
  const { user } = useAuth()
  const { data: personnel } = useCollection('garderie_personnel')
  const { data: presences } = useCollection('garderie_presences')

  const today = todayStr()
  const [dateFiltre, setDateFiltre] = useState(today)
  const [onglet, setOnglet]         = useState('pointage')
  const [modal, setModal]                 = useState(null)
  const [detail, setDetail]               = useState(null)
  const [pointageModal, setPointageModal] = useState(null)
  const [heureManuelle, setHeureManuelle] = useState('')
  const [toDelete, setToDelete]               = useState(null)
  const [saving, setSaving]                   = useState(false)
  const [deleting, setDeleting]               = useState(false)
  const [deletedIds, setDeletedIds]           = useState(new Set())
  const [absenceModal, setAbsenceModal]       = useState(null) // { p, pt }
  const [justification, setJustification]     = useState('')

  // Cache optimiste : mis à jour immédiatement au clic, avant que Firebase réponde
  const [cache, setCache] = useState({})

  const personnelActif = useMemo(
    () => personnel.filter((p) => p.statut === 'actif' && !deletedIds.has(p.id))
      .sort((a, b) => `${a.prenom} ${a.nom}` < `${b.prenom} ${b.nom}` ? -1 : 1),
    [personnel, deletedIds]
  )

  // Clé stable : une seule entrée par personnel par jour
  const presenceKey = (personnelId, date) => `${personnelId}__${date}`

  // Retourne le pointage : cache local en priorité, sinon Firebase
  const getPointage = (personnelId) => {
    const key = presenceKey(personnelId, dateFiltre)
    if (cache[key]) return cache[key]
    return presences.find((p) => p.personnelId === personnelId && p.date === dateFiltre)
  }

  // Met à jour le cache et la base
  function majCache(personnelId, data) {
    const key = presenceKey(personnelId, dateFiltre)
    setCache((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...data } }))
  }

  // Stats du jour sélectionné
  const stats = useMemo(() => {
    const pts = presences.filter((p) => p.date === dateFiltre && p.personnelId)
    const arrives  = pts.filter((p) => p.heureArrivee).length
    const repartis = pts.filter((p) => p.heureDepart).length
    return { arrives, repartis, total: personnelActif.length }
  }, [presences, dateFiltre, personnelActif])

  async function handleSave() {
    if (saving) return
    const d = modal.data
    if (!d.nom.trim() || !d.prenom.trim()) return toast.error('Nom et prénom requis')
    if (!d.poste) return toast.error('Poste requis')
    setSaving(true)
    try {
      if (modal.isNew) {
        const id = genId()
        await setItem('garderie_personnel', id, { ...d, id })
        audit('garderie', 'PERSONNEL_CREATE', `${d.prenom} ${d.nom}`, { poste: d.poste })
        toast.success('Membre du personnel ajouté ✓')
      } else {
        await updateItem('garderie_personnel', modal.id, d)
        audit('garderie', 'PERSONNEL_EDIT', `${d.prenom} ${d.nom}`)
        toast.success('Fiche mise à jour ✓')
      }
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!toDelete || deleting) return
    setDeleting(true)
    setDeletedIds((prev) => new Set([...prev, toDelete.id]))
    const target = toDelete
    setToDelete(null)
    try {
      // Étape 1 (critique) : statut 'supprime' en base — seule garantie fiable après
      // rechargement, puisque le masquage local (deletedIds) est éphémère.
      await setItem('garderie_personnel', target.id, { ...target, statut: 'supprime', id: target.id })
      audit('garderie', 'PERSONNEL_DELETE', `${target.prenom} ${target.nom}`)
      toast.success(`${target.prenom} ${target.nom} supprimé(e) ✓`)
      // Étape 2 (best-effort) : suppression complète — un échec ici n'est pas grave,
      // le statut 'supprime' suffit déjà à le garder caché.
      await removeItem('garderie_personnel', target.id).catch(() => {})
    } catch (err) {
      // Échec réel (ex. droits Firebase) : on démasque et on prévient l'utilisateur
      // au lieu de prétendre que la suppression a marché.
      setDeletedIds((prev) => { const next = new Set(prev); next.delete(target.id); return next })
      toast.error(`Échec de la suppression de ${target.prenom} ${target.nom} — réessayez.`)
    } finally {
      setDeleting(false)
    }
  }

  async function pointer(p, type) {
    const heure = heureNow()
    const existing = getPointage(p.id)
    const pid = `pres_${p.id}_${dateFiltre}`

    if (type === 'arrivee') {
      if (existing?.heureArrivee) return toast.info('Arrivée déjà enregistrée')
      // Mise à jour immédiate de l'affichage
      majCache(p.id, { id: pid, personnelId: p.id, date: dateFiltre, heureArrivee: heure, heureDepart: '', statut: 'present' })
      const payload = { id: pid, personnelId: p.id, date: dateFiltre, heureArrivee: heure, heureDepart: '', statut: 'present' }
      await setItem('garderie_presences', pid, payload)
      audit('garderie', 'PERSONNEL_POINTAGE_ARRIVEE', `${p.prenom} ${p.nom}`, { heure, date: dateFiltre })
      notify({ type: 'info', title: `🟢 Arrivée — ${p.prenom} ${p.nom}`, body: `${formatDateShort(dateFiltre)} à ${heure}`, module: 'garderie', forRoles: ['ge','gerante_garderie'], excludeUid: user.uid, link: '/garderie/personnel' })
      toast.success(`Arrivée de ${p.prenom} à ${heure} ✓`)
    } else {
      if (!existing?.heureArrivee) return toast.error('Enregistrez d\'abord l\'arrivée')
      // Mise à jour immédiate de l'affichage
      majCache(p.id, { ...existing, id: pid, heureDepart: heure })
      const payload = { ...existing, id: pid, heureDepart: heure }
      await setItem('garderie_presences', pid, payload)
      audit('garderie', 'PERSONNEL_POINTAGE_DEPART', `${p.prenom} ${p.nom}`, { heure, date: dateFiltre })
      notify({ type: 'info', title: `🔴 Départ — ${p.prenom} ${p.nom}`, body: `${formatDateShort(dateFiltre)} à ${heure}`, module: 'garderie', forRoles: ['ge','gerante_garderie'], excludeUid: user.uid, link: '/garderie/personnel' })
      toast.success(`Départ de ${p.prenom} à ${heure} ✓`)
    }
  }

  function ouvrirPointageManuel(p, pt, type) {
    const defaut = type === 'arrivee' ? (pt?.heureArrivee || heureNow())
                 : (pt?.heureDepart || heureNow())
    setHeureManuelle(defaut)
    setPointageModal({ p, pt, type })
  }

  async function confirmerPointageManuel() {
    if (!heureManuelle) return toast.error('Heure requise')
    const { p, pt, type } = pointageModal
    const pid = `pres_${p.id}_${dateFiltre}`

    if (type === 'arrivee') {
      const newData = { id: pid, personnelId: p.id, date: dateFiltre, heureArrivee: heureManuelle, heureDepart: pt?.heureDepart || '', statut: 'present' }
      majCache(p.id, newData)
      await setItem('garderie_presences', pid, newData)
      audit('garderie', 'PERSONNEL_POINTAGE_ARRIVEE', `${p.prenom} ${p.nom}`, { heure: heureManuelle, date: dateFiltre, manuel: true })
      notify({ type: 'info', title: `🟢 Arrivée — ${p.prenom} ${p.nom}`, body: `${formatDateShort(dateFiltre)} à ${heureManuelle}`, module: 'garderie', forRoles: ['ge','gerante_garderie'], excludeUid: user.uid, link: '/garderie/personnel' })
      toast.success(`Arrivée ${pt ? 'corrigée' : 'enregistrée'} à ${heureManuelle} ✓`)
    } else {
      if (!pt?.heureArrivee) return toast.error('Enregistrez d\'abord l\'arrivée')
      const newData = { ...pt, id: pid, heureDepart: heureManuelle }
      majCache(p.id, newData)
      await setItem('garderie_presences', pid, newData)
      audit('garderie', 'PERSONNEL_POINTAGE_DEPART', `${p.prenom} ${p.nom}`, { heure: heureManuelle, date: dateFiltre, manuel: true })
      notify({ type: 'info', title: `🔴 Départ — ${p.prenom} ${p.nom}`, body: `${formatDateShort(dateFiltre)} à ${heureManuelle}`, module: 'garderie', forRoles: ['ge','gerante_garderie'], excludeUid: user.uid, link: '/garderie/personnel' })
      toast.success(`Départ ${pt?.heureDepart ? 'corrigé' : 'enregistré'} à ${heureManuelle} ✓`)
    }
    setPointageModal(null)
  }

  async function enregistrerAbsence() {
    if (!absenceModal) return
    const { p } = absenceModal
    const pid = `pres_${p.id}_${dateFiltre}`
    const payload = { id: pid, personnelId: p.id, date: dateFiltre, statut: 'absent', heureArrivee: '', heureDepart: '', justification: justification.trim() }
    majCache(p.id, payload)
    await setItem('garderie_presences', pid, payload)
    audit('garderie', 'PERSONNEL_ABSENCE', `${p.prenom} ${p.nom}`, { date: dateFiltre, justification: justification.trim() })
    toast.success(`Absence de ${p.prenom} enregistrée ✓`)
    setAbsenceModal(null)
    setJustification('')
  }

  function exportXLSX() {
    const rows = personnelActif.map((p) => {
      const pt = getPointage(p.id)
      return {
        'Prénom Nom': `${p.prenom} ${p.nom}`,
        Poste: POSTES_PERSONNEL.find((x) => x.id === p.poste)?.label || p.poste,
        Date: formatDateShort(dateFiltre),
        Arrivée: pt?.heureArrivee || '—',
        Départ: pt?.heureDepart || '—',
        Durée: pt?.heureArrivee && pt?.heureDepart ? (calcDuree(pt.heureArrivee, pt.heureDepart) || '—') : '—',
        Statut: pt?.statut === 'absent' ? 'Absente' : pt?.heureDepart ? 'Repartie' : pt?.heureArrivee ? 'Présente' : 'Non pointée',
        Justification: pt?.statut === 'absent' ? (pt.justification || '—') : '—'
      }
    })
    exportRapportExcel({ theme: 'garderie',
      filename: `pointage-personnel-${dateFiltre}.xlsx`,
      sections: [{ id: 'pointage', name: 'Pointage',
        title: `Pointage du personnel — ${formatDateShort(dateFiltre)}`,
        subtitle: `${stats.arrives} arrivée(s) · ${stats.repartis} départ(s) · ${stats.total} membre(s)`,
        columns: [
          { key: 'Prénom Nom', label: 'Nom', width: 22 },
          { key: 'Poste', label: 'Poste', width: 24 },
          { key: 'Date', label: 'Date', width: 14 },
          { key: 'Arrivée', label: 'Arrivée', width: 12 },
          { key: 'Départ', label: 'Départ', width: 12 },
          { key: 'Durée', label: 'Durée', width: 10 },
          { key: 'Statut', label: 'Statut', width: 12 },
          { key: 'Justification', label: 'Justification absence', width: 28 }
        ], rows }]
    })
  }

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))
  const isToday = dateFiltre === today

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
      await updateItem('garderie_personnel', detail.id, { photo: dataURL })
      setDetail((d) => ({ ...d, photo: dataURL }))
      toast.success('Photo mise à jour ✓')
    } catch (err) {
      toast.error(err.message || 'Erreur lors du traitement de la photo')
    } finally {
      setDetailPhotoUploading(false)
    }
  }

  // ── Statistiques de la tata affichée dans la fiche détail ──
  function ancienneteLabel(dateEmbauche) {
    if (!dateEmbauche) return '—'
    const debut = new Date(dateEmbauche)
    const now = new Date()
    let annees = now.getFullYear() - debut.getFullYear()
    let mois = now.getMonth() - debut.getMonth()
    if (mois < 0) { annees--; mois += 12 }
    if (annees === 0) return `${mois} mois`
    if (mois === 0) return `${annees} an${annees > 1 ? 's' : ''}`
    return `${annees} an${annees > 1 ? 's' : ''} ${mois} mois`
  }

  const detailStats = useMemo(() => {
    if (!detail) return null
    const presPersonnel = presences.filter((p) => p.personnelId === detail.id)
    return {
      joursPresents: presPersonnel.filter((p) => p.statut === 'present').length,
      joursAbsents: presPersonnel.filter((p) => p.statut === 'absent').length,
      anciennete: ancienneteLabel(detail.dateEmbauche)
    }
  }, [detail, presences])

  return (
    <div className="space-y-5">

      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,57,14,0.35),0_8px_20px_-8px_rgba(232,57,14,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(232,57,14,0.85) 0%, rgba(245,168,0,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#E8390E', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Users size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Personnel & Tatas</h2>
          <p className="text-sm text-white/80">Équipe encadrante — fiches, horaires, historique</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 border-b border-gray-200">
        {[{ id: 'pointage', label: '📋 Pointage journalier' }, { id: 'fiches', label: '👩 Gérer les tatas' }].map((t) => (
          <button key={t.id} onClick={() => setOnglet(t.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${onglet === t.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Explication du fonctionnement */}
      {onglet === 'pointage' && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="font-semibold mb-0.5">💡 Comment ça fonctionne ?</p>
          <p>Les tatas enregistrées dans <strong>"Gérer les tatas"</strong> apparaissent <strong>automatiquement chaque jour</strong> ici. Tu n'as rien à ajouter — il suffit de cliquer <strong>Arrivée</strong> quand elles arrivent et <strong>Départ</strong> quand elles repartent.</p>
          {personnelActif.length === 0 && (
            <p className="mt-1 font-semibold text-blue-600">👉 Aucune tata enregistrée — allez dans l'onglet <strong>"Gérer les tatas"</strong> pour en ajouter.</p>
          )}
        </div>
      )}
      {onglet === 'fiches' && (
        <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
          <p className="font-semibold mb-0.5">💡 Gestion du personnel</p>
          <p>Ajoutez chaque tata <strong>une seule fois</strong>. Elle apparaîtra automatiquement dans le pointage tous les jours. Pour qu'une tata ne soit plus active, passez son statut à <strong>Inactif</strong>.</p>
        </div>
      )}

      {onglet === 'pointage' && (
        <>
          {/* Sélecteur de date */}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setDateFiltre(addDays(dateFiltre, -1))}
              className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronLeft size={16} /></button>
            <div>
              <Input type="date" value={dateFiltre} max={today}
                onChange={(e) => setDateFiltre(e.target.value)} />
            </div>
            <button onClick={() => setDateFiltre(addDays(dateFiltre, 1))} disabled={dateFiltre >= today}
              className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50 disabled:opacity-30"><ChevronRight size={16} /></button>
            {!isToday && (
              <button onClick={() => setDateFiltre(today)}
                className="rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-200">
                Aujourd'hui
              </button>
            )}

            {/* Stats rapides */}
            <div className="flex gap-4 ml-2 text-sm">
              <span className="font-semibold text-green-600">🟢 {stats.arrives} arrivée(s)</span>
              <span className="font-semibold text-red-500">🔴 {stats.repartis} départ(s)</span>
              <span className="text-gray-400">/ {stats.total} membres</span>
            </div>

            <div className="ml-auto">
              <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} /> Export</Button>
            </div>
          </div>

          {isToday && (
            <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-2 text-sm text-orange-800">
              <strong>Aujourd'hui :</strong> Cliquez <strong>Arrivée</strong> dès qu'une tata arrive, <strong>Départ</strong> quand elle repart. Utilisez <em>"saisir"</em> pour entrer une heure manuellement.
            </div>
          )}

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Nom</th>
                  <th className="px-3 py-2 text-left">Poste</th>
                  <th className="px-3 py-2 text-center">🟢 Arrivée</th>
                  <th className="px-3 py-2 text-center">🔴 Départ</th>
                  <th className="px-3 py-2 text-center">⏱ Durée</th>
                  <th className="px-3 py-2 text-left">Absence / Justification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {personnelActif.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-400">Aucun personnel actif.</td></tr>
                )}
                {personnelActif.map((p) => {
                  const pt = getPointage(p.id)
                  const duree = calcDuree(pt?.heureArrivee, pt?.heureDepart)
                  return (
                    <tr key={p.id} className={`transition-colors ${pt?.heureDepart ? 'bg-gray-50' : pt?.heureArrivee ? 'bg-green-50/60' : ''}`}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {p.photo ? (
                            <img src={p.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                              {(p.prenom?.[0] || '?').toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold">{p.prenom} {p.nom}</p>
                            <p className="text-xs text-gray-400">{p.horaire}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        {POSTES_PERSONNEL.find((x) => x.id === p.poste)?.label || p.poste}
                      </td>

                      {/* Arrivée */}
                      <td className="px-3 py-3 text-center">
                        {pt?.heureArrivee ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="flex items-center gap-1 text-base font-bold text-green-600">
                              <CheckCircle2 size={15} /> {pt.heureArrivee}
                            </span>
                            <button onClick={() => ouvrirPointageManuel(p, pt, 'arrivee')}
                              className="text-[10px] text-gray-400 hover:text-orange-500 underline">corriger</button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            {isToday && (
                              <button onClick={() => pointer(p, 'arrivee')}
                                className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">
                                <Clock size={12} /> Arrivée
                              </button>
                            )}
                            <button onClick={() => ouvrirPointageManuel(p, pt, 'arrivee')}
                              className="text-[10px] text-gray-400 hover:text-orange-500 underline">
                              {isToday ? 'saisir heure' : 'ajouter'}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Départ */}
                      <td className="px-3 py-3 text-center">
                        {pt?.heureDepart ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="flex items-center gap-1 text-base font-bold text-red-500">
                              <LogOut size={15} /> {pt.heureDepart}
                            </span>
                            <button onClick={() => ouvrirPointageManuel(p, pt, 'depart')}
                              className="text-[10px] text-gray-400 hover:text-orange-500 underline">corriger</button>
                          </div>
                        ) : pt?.heureArrivee ? (
                          <div className="flex flex-col items-center gap-1">
                            {isToday && (
                              <button onClick={() => pointer(p, 'depart')}
                                className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-200">
                                <LogOut size={12} /> Départ
                              </button>
                            )}
                            <button onClick={() => ouvrirPointageManuel(p, pt, 'depart')}
                              className="text-[10px] text-gray-400 hover:text-orange-500 underline">
                              {isToday ? 'saisir heure' : 'ajouter'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Durée */}
                      <td className="px-3 py-3 text-center">
                        {duree ? (
                          <span className="flex items-center justify-center gap-1 font-bold text-orange-600">
                            <Timer size={13} /> {duree}
                          </span>
                        ) : pt?.heureArrivee ? (
                          <span className="text-xs italic text-gray-400">En cours…</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Absence / Justification */}
                      <td className="px-3 py-3">
                        {pt?.statut === 'absent' ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
                              <AlertCircle size={12} /> Absente
                            </span>
                            {pt.justification ? (
                              <span className="text-xs text-gray-500 italic">{pt.justification}</span>
                            ) : (
                              <span className="text-xs text-gray-300 italic">Pas de justification</span>
                            )}
                            <button onClick={() => { setJustification(pt.justification || ''); setAbsenceModal({ p, pt }) }}
                              className="text-[10px] text-orange-500 hover:underline text-left">
                              modifier
                            </button>
                          </div>
                        ) : !pt?.heureArrivee ? (
                          <button
                            onClick={() => { setJustification(''); setAbsenceModal({ p, pt: null }) }}
                            className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100">
                            <AlertCircle size={12} /> Marquer absente
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {onglet === 'fiches' && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => setModal({ data: emptyPersonnel(), isNew: true })}>
              <Plus size={16} /> Ajouter un membre
            </Button>
          </div>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Nom</th>
                  <th className="px-3 py-2 text-left">Poste</th>
                  <th className="px-3 py-2 text-left">Téléphone</th>
                  <th className="px-3 py-2 text-left">Horaire</th>
                  <th className="px-3 py-2 text-left">Embauche</th>
                  <th className="px-3 py-2 text-left">Statut</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {personnel.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-400">Aucun membre du personnel.</td></tr>
                )}
                {[...personnel].filter((p) => !deletedIds.has(p.id) && p.statut !== 'supprime').sort((a, b) => `${a.prenom} ${a.nom}` < `${b.prenom} ${b.nom}` ? -1 : 1).map((p) => (
                  <tr key={p.id} onClick={() => setDetail(p)} className="cursor-pointer hover:bg-orange-50 transition-colors">
                    <td className="px-3 py-2 font-semibold">
                      <div className="flex items-center gap-2">
                        {p.photo ? (
                          <img src={p.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-600">
                            {(p.prenom?.[0] || '?').toUpperCase()}
                          </div>
                        )}
                        {p.prenom} {p.nom}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">{POSTES_PERSONNEL.find((x) => x.id === p.poste)?.label || p.poste}</td>
                    <td className="px-3 py-2 text-gray-500">{p.telephone || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{p.horaire || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">{formatDateShort(p.dateEmbauche)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={p.statut === 'actif' ? 'success' : 'neutral'}>
                        {p.statut === 'actif' ? 'Actif' : 'Inactif'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex gap-1">
                        <button title="Voir la fiche" onClick={() => setDetail(p)}
                          className="rounded p-1 hover:bg-gray-100">
                          <Eye size={14} />
                        </button>
                        <button title="Modifier la fiche"
                          onClick={() => setModal({ data: { ...emptyPersonnel(), ...p }, isNew: false, id: p.id })}
                          className="rounded p-1 text-orange-600 hover:bg-orange-50">
                          <FilePen size={14} />
                        </button>
                        <button title="Supprimer"
                          onClick={() => setToDelete(p)}
                          className="rounded p-1 text-red-500 hover:bg-red-50">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* Modal absence / justification */}
      <Modal
        open={!!absenceModal}
        onClose={() => setAbsenceModal(null)}
        size="sm"
        {...glassModalProps('#dc2626')}
        title="Signaler une absence"
        footer={
          <>
            <Button variant="outline" onClick={() => setAbsenceModal(null)}>Annuler</Button>
            <Button variant="danger" onClick={enregistrerAbsence}>Enregistrer l'absence</Button>
          </>
        }
      >
        {absenceModal && (
          <div className="space-y-4">
            <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_8px_20px_-8px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.35)]"
              style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.88) 0%, rgba(127,29,29,0.88) 100%)' }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: '#dc2626', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55' }}>
                <AlertCircle size={22} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{absenceModal.p.prenom} {absenceModal.p.nom}</p>
                <p className="text-sm text-white/80">{formatDateShort(dateFiltre)} — sera marquée absente</p>
              </div>
            </div>
            <FormGroup label="Motif / Justification (optionnel)">
              <textarea
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={3}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="ex: Maladie, congé, raison personnelle…"
                autoFocus
              />
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal pointage manuel */}
      <Modal open={!!pointageModal} onClose={() => setPointageModal(null)} size="sm"
        {...glassModalProps(pointageModal?.type === 'arrivee' ? '#16a34a' : '#dc2626')}
        title={pointageModal?.type === 'arrivee' ? 'Arrivée' : 'Départ'}
        footer={<><Button variant="outline" onClick={() => setPointageModal(null)}>Annuler</Button><Button onClick={confirmerPointageManuel}>Enregistrer</Button></>}>
        {pointageModal && (() => {
          const couleur = pointageModal.type === 'arrivee' ? '#16a34a' : '#dc2626'
          const Icone = pointageModal.type === 'arrivee' ? CheckCircle2 : LogOut
          return (
          <div className="space-y-4">
            <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_8px_20px_-8px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.35)]"
              style={{ background: `linear-gradient(135deg, ${couleur}e0 0%, ${couleur}b0 100%)` }}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: couleur, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55' }}>
                <Icone size={22} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold leading-tight">{pointageModal.p?.prenom} {pointageModal.p?.nom}</p>
                <p className="text-sm text-white/80">{formatDateShort(dateFiltre)}</p>
              </div>
            </div>
            {(pointageModal.pt?.heureArrivee || pointageModal.pt?.heureDepart) && (
              <div className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700">
                <CalendarClock size={14} className="inline mr-1" />
                {pointageModal.pt?.heureArrivee && `Arrivée : ${pointageModal.pt.heureArrivee}`}
                {pointageModal.pt?.heureArrivee && pointageModal.pt?.heureDepart && ' · '}
                {pointageModal.pt?.heureDepart && `Départ : ${pointageModal.pt.heureDepart}`}
              </div>
            )}
            <FormGroup label={pointageModal.type === 'arrivee' ? "Heure d'arrivée" : "Heure de départ"}>
              <Input type="time" value={heureManuelle} onChange={(e) => setHeureManuelle(e.target.value)} autoFocus />
            </FormGroup>
            <p className="text-xs text-gray-400">
              {pointageModal.pt ? 'Cette valeur remplacera le pointage existant.' : 'Un nouveau pointage sera créé.'}
            </p>
          </div>
          )
        })()}
      </Modal>

      {/* Modal confirmation suppression */}
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer ce membre du personnel ?"
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
                <p className="text-sm text-white/80">{POSTES_PERSONNEL.find((x) => x.id === toDelete.poste)?.label || toDelete.poste}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Vous allez supprimer ce membre du personnel de la base de données. Cette action est <span className="font-semibold text-red-600">irréversible</span>.
            </p>
          </div>
        )}
      </Modal>

      {/* Modal fiche personnel */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        {...glassModalProps(COULEUR_MODULE.garderie)}
        title={modal?.isNew ? 'Ajouter un membre' : 'Modifier la fiche'}
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={handleSave} loading={saving}>{modal?.isNew ? 'Ajouter' : 'Mettre à jour'}</Button></>}>
        {modal && (
          <div className="space-y-4">
            {/* Bandeau héro — même dégradé/badge lumineux que les en-têtes du module,
                avec la photo de profil intégrée (identique au formulaire Enfants) */}
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
                <p className="truncate text-lg font-extrabold leading-tight">
                  {modal.data.prenom || modal.data.nom ? `${modal.data.prenom} ${modal.data.nom}`.trim() : (modal.isNew ? 'Nouveau membre' : 'Fiche personnel')}
                </p>
                <p className="text-sm text-white/80">Photo JPG ou PNG — recadrée automatiquement en carré</p>
              </div>
            </div>

            {/* 📋 Identité */}
            <div className="rounded-2xl border border-orange-200 border-l-4 border-l-orange-400 bg-orange-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-16px_rgba(26,26,26,0.20)]">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-orange-700">📋 Identité</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Prénom *"><Input value={modal.data.prenom} onChange={(e) => set('prenom', e.target.value)} /></FormGroup>
                <FormGroup label="Nom *"><Input value={modal.data.nom} onChange={(e) => set('nom', e.target.value)} /></FormGroup>
                <FormGroup label="Téléphone"><Input value={modal.data.telephone} onChange={(e) => set('telephone', e.target.value)} /></FormGroup>
              </div>
            </div>

            {/* 🕐 Poste & Horaires */}
            <div className="rounded-2xl border border-sky-200 border-l-4 border-l-sky-400 bg-sky-50 p-3.5 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-16px_rgba(26,26,26,0.20)]">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sky-700">🕐 Poste & Horaires</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Poste *">
                  <Select value={modal.data.poste} onChange={(e) => set('poste', e.target.value)}>
                    {POSTES_PERSONNEL.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup label="Statut">
                  <Select value={modal.data.statut} onChange={(e) => set('statut', e.target.value)}>
                    <option value="actif">Actif</option>
                    <option value="inactif">Inactif</option>
                  </Select>
                </FormGroup>
                <FormGroup label="Date d'embauche"><Input type="date" value={modal.data.dateEmbauche} onChange={(e) => set('dateEmbauche', e.target.value)} /></FormGroup>
                <FormGroup label="Horaire habituel"><Input value={modal.data.horaire} onChange={(e) => set('horaire', e.target.value)} placeholder="ex: 07:00 – 17:00" /></FormGroup>
              </div>
            </div>

            <FormGroup label="Notes">
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={modal.data.notes} onChange={(e) => set('notes', e.target.value)} />
            </FormGroup>
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
              <p className="mt-0.5 text-sm text-white/80">{POSTES_PERSONNEL.find((x) => x.id === detail.poste)?.label || detail.poste}</p>
              <span className="mt-2 rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {detail.statut === 'actif' ? 'Actif' : 'Inactif'}
              </span>
            </div>

            {/* Statistiques */}
            {detailStats && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/50 bg-white/40 p-3 text-center shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150">
                  <UserCheck size={16} className="mx-auto text-green-600" />
                  <p className="mt-1 text-lg font-extrabold text-gray-900">{detailStats.joursPresents}</p>
                  <p className="text-[11px] text-gray-500">Jours présents</p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/40 p-3 text-center shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150">
                  <UserX size={16} className="mx-auto text-red-500" />
                  <p className="mt-1 text-lg font-extrabold text-gray-900">{detailStats.joursAbsents}</p>
                  <p className="text-[11px] text-gray-500">Absences</p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/40 p-3 text-center shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150">
                  <CalendarDays size={16} className="mx-auto text-orange-500" />
                  <p className="mt-1 text-lg font-extrabold text-gray-900">{detailStats.anciennete}</p>
                  <p className="text-[11px] text-gray-500">Ancienneté</p>
                </div>
              </div>
            )}

            <Card title="📋 Informations">
              <div className="space-y-1.5">
                <div><span className="font-semibold text-gray-500">Téléphone :</span> {detail.telephone || '—'}</div>
                <div><span className="font-semibold text-gray-500">Horaire habituel :</span> {detail.horaire || '—'}</div>
                <div><span className="font-semibold text-gray-500">Date d'embauche :</span> {formatDateShort(detail.dateEmbauche)}</div>
              </div>
            </Card>

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

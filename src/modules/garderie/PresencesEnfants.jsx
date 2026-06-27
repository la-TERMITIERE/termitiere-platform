import { useMemo, useState } from 'react'
import { CheckCircle2, XCircle, Clock, FileSpreadsheet, ChevronLeft, ChevronRight, LogOut, User, Search } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { GROUPES_AGE, STATUTS_PRESENCE } from './data'
import { exportRapportExcel } from '../../utils/excelReport'

const heureNow = () => new Date().toTimeString().slice(0, 5)

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function calcDuree(debut, fin) {
  if (!debut || !fin) return null
  const [h1, m1] = debut.split(':').map(Number)
  const [h2, m2] = fin.split(':').map(Number)
  const totalMin = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (totalMin <= 0) return null
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, '0') : '00'}` : `${m}min`
}

export default function PresencesEnfants() {
  const { user } = useAuth()
  const { data: enfants }   = useCollection('garderie_enfants')
  const { data: presences } = useCollection('garderie_presences')

  const today = todayStr()
  const [dateFiltre, setDateFiltre]   = useState(today)
  const [filtreGroupe, setFiltreGroupe] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [recherche, setRecherche]     = useState('')
  const [pointageModal, setPointageModal] = useState(null) // { enfant, presence, type }
  const [heureManuelle, setHeureManuelle] = useState('')
  const [recupPar, setRecupPar]       = useState('')

  // Cache optimiste — mise à jour immédiate sans attendre Firebase
  const [cache, setCache] = useState({})

  const isToday = dateFiltre === today

  // Clé stable par enfant par jour
  const presKey = (enfantId, date) => `enf_${enfantId}_${date}`

  const getPresence = (enfantId) => {
    const key = presKey(enfantId, dateFiltre)
    if (cache[key]) return cache[key]
    return presences.find((p) => p.enfantId === enfantId && p.date === dateFiltre && !p.personnelId)
  }

  function majCache(enfantId, data) {
    const key = presKey(enfantId, dateFiltre)
    setCache((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...data } }))
  }

  const enfantsActifs = useMemo(
    () => enfants.filter((e) => e.statut === 'actif'),
    [enfants]
  )

  const liste = useMemo(() => {
    let rows = [...enfantsActifs]
    if (filtreGroupe) rows = rows.filter((e) => e.groupe === filtreGroupe)
    if (filtreStatut) {
      rows = rows.filter((e) => {
        const p = getPresence(e.id)
        if (filtreStatut === 'present')   return p?.statut === 'present'
        if (filtreStatut === 'absent')    return p?.statut === 'absent'
        if (filtreStatut === 'excuse')    return p?.statut === 'excuse'
        if (filtreStatut === 'non_pointe') return !p
        return true
      })
    }
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((e) => `${e.prenom} ${e.nom} ${e.parentNom}`.toLowerCase().includes(q))
    }
    return rows.sort((a, b) => `${a.prenom} ${a.nom}` < `${b.prenom} ${b.nom}` ? -1 : 1)
  }, [enfantsActifs, filtreGroupe, filtreStatut, recherche, presences, cache, dateFiltre])

  const stats = useMemo(() => {
    const presents   = enfantsActifs.filter((e) => getPresence(e.id)?.statut === 'present').length
    const absents    = enfantsActifs.filter((e) => getPresence(e.id)?.statut === 'absent').length
    const excuses    = enfantsActifs.filter((e) => getPresence(e.id)?.statut === 'excuse').length
    const nonPointes = enfantsActifs.filter((e) => !getPresence(e.id)).length
    return { presents, absents, excuses, nonPointes, total: enfantsActifs.length }
  }, [enfantsActifs, presences, cache, dateFiltre])

  async function enregistrer(enfant, champs) {
    const existing = getPresence(enfant.id)
    const pid = presKey(enfant.id, dateFiltre)
    const newData = {
      id: pid,
      enfantId: enfant.id,
      enfantNom: `${enfant.prenom} ${enfant.nom}`,
      date: dateFiltre,
      statut: 'present',
      heureArrivee: '',
      heureDepart: '',
      recupPar: '',
      ...(existing || {}),
      ...champs,
      id: pid
    }
    majCache(enfant.id, newData)
    await setItem('garderie_presences', pid, newData)
  }

  async function marquerArrivee(enfant) {
    const existing = getPresence(enfant.id)
    if (existing?.heureArrivee) return toast.info('Arrivée déjà enregistrée — cliquez sur "corriger"')
    const heure = heureNow()
    await enregistrer(enfant, { statut: 'present', heureArrivee: heure })
    audit('garderie', 'PRESENCE_ARRIVEE', `${enfant.prenom} ${enfant.nom}`, { date: dateFiltre, heure })
    notify({ type: 'info', title: `✅ Arrivée — ${enfant.prenom} ${enfant.nom}`, body: `${formatDateShort(dateFiltre)} à ${heure}`, module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/presences' })
    toast.success(`Arrivée de ${enfant.prenom} à ${heure} ✓`)
  }

  async function marquerDepart(enfant) {
    const existing = getPresence(enfant.id)
    if (!existing?.heureArrivee) return toast.error('Enregistrez d\'abord l\'arrivée')
    const heure = heureNow()
    await enregistrer(enfant, { heureDepart: heure })
    audit('garderie', 'PRESENCE_DEPART', `${enfant.prenom} ${enfant.nom}`, { date: dateFiltre, heure })
    toast.success(`Départ de ${enfant.prenom} à ${heure} ✓`)
  }

  async function marquerAbsent(enfant, statut) {
    await enregistrer(enfant, { statut, heureArrivee: '', heureDepart: '' })
    audit('garderie', 'PRESENCE_STATUT', `${enfant.prenom} ${enfant.nom}`, { statut, date: dateFiltre })
    notify({ type: 'info', title: `📋 ${enfant.prenom} ${enfant.nom}`, body: statut === 'absent' ? 'Marqué(e) absent(e)' : 'Marqué(e) excusé(e)', module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/presences' })
    toast.success('Statut mis à jour ✓')
  }

  function ouvrirModal(enfant, type) {
    const pt = getPresence(enfant.id)
    const def = type === 'arrivee' ? (pt?.heureArrivee || heureNow())
              : type === 'depart'  ? (pt?.heureDepart  || heureNow())
              : ''
    setHeureManuelle(def)
    setRecupPar(pt?.recupPar || '')
    setPointageModal({ enfant, presence: pt, type })
  }

  async function confirmerModal() {
    const { enfant, presence, type } = pointageModal
    if (type === 'recup') {
      if (!recupPar.trim()) return toast.error('Indiquez le nom de la personne')
      await enregistrer(enfant, { recupPar: recupPar.trim() })
      toast.success(`Récupéré par ${recupPar.trim()} ✓`)
    } else {
      if (!heureManuelle) return toast.error('Heure requise')
      if (type === 'arrivee') {
        await enregistrer(enfant, { statut: 'present', heureArrivee: heureManuelle })
        audit('garderie', 'PRESENCE_ARRIVEE', `${enfant.prenom} ${enfant.nom}`, { date: dateFiltre, heure: heureManuelle, manuel: true })
        toast.success(`Arrivée ${presence?.heureArrivee ? 'corrigée' : 'enregistrée'} à ${heureManuelle} ✓`)
      } else {
        await enregistrer(enfant, { heureDepart: heureManuelle })
        audit('garderie', 'PRESENCE_DEPART', `${enfant.prenom} ${enfant.nom}`, { date: dateFiltre, heure: heureManuelle, manuel: true })
        toast.success(`Départ enregistré à ${heureManuelle} ✓`)
      }
    }
    setPointageModal(null)
  }

  function exportXLSX() {
    const rows = enfantsActifs.map((e) => {
      const p = getPresence(e.id)
      return {
        'Prénom Nom': `${e.prenom} ${e.nom}`,
        Groupe: GROUPES_AGE.find((g) => g.id === e.groupe)?.label || '—',
        Statut: p ? (STATUTS_PRESENCE[p.statut]?.label || p.statut) : 'Non pointé',
        Arrivée: p?.heureArrivee || '—',
        Départ: p?.heureDepart || '—',
        Durée: p?.heureArrivee && p?.heureDepart ? (calcDuree(p.heureArrivee, p.heureDepart) || '—') : '—',
        'Récupéré par': p?.recupPar || '—',
        'Parent / Tuteur': e.parentNom || '—',
        Contact: e.parentContact || '—'
      }
    })
    exportRapportExcel({ theme: 'garderie',
      filename: `presences-enfants-${dateFiltre}.xlsx`,
      sections: [{ id: 'presences', name: 'Présences',
        title: `Feuille de présences enfants — ${formatDateShort(dateFiltre)}`,
        subtitle: `${stats.presents} présent(s) · ${stats.absents} absent(s) · ${stats.excuses} excusé(s) · ${stats.nonPointes} non pointé(s)`,
        columns: [
          { key: 'Prénom Nom', label: 'Enfant', width: 22 },
          { key: 'Groupe', label: 'Groupe', width: 18 },
          { key: 'Statut', label: 'Statut', width: 14 },
          { key: 'Arrivée', label: 'Arrivée', width: 12 },
          { key: 'Départ', label: 'Départ', width: 12 },
          { key: 'Durée', label: 'Durée', width: 10 },
          { key: 'Récupéré par', label: 'Récupéré par', width: 22 },
          { key: 'Parent / Tuteur', label: 'Parent', width: 22 },
          { key: 'Contact', label: 'Contact', width: 16 }
        ], rows }]
    })
  }

  return (
    <div className="space-y-4">

      {/* Sélecteur de date + navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setDateFiltre(addDays(dateFiltre, -1))}
          className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50"><ChevronLeft size={15} /></button>
        <input type="date" value={dateFiltre} max={today}
          onChange={(e) => setDateFiltre(e.target.value)}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
        <button onClick={() => setDateFiltre(addDays(dateFiltre, 1))} disabled={dateFiltre >= today}
          className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50 disabled:opacity-30"><ChevronRight size={15} /></button>
        {!isToday && (
          <button onClick={() => setDateFiltre(today)}
            className="rounded-lg bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-200">
            Auj.
          </button>
        )}
        <div className="flex gap-2 text-xs ml-1">
          <span className="font-semibold text-green-600">✓{stats.presents}</span>
          <span className="font-semibold text-red-500">✗{stats.absents}</span>
          <span className="font-semibold text-yellow-600">~{stats.excuses}</span>
          <span className="text-gray-400">?{stats.nonPointes}/{stats.total}</span>
        </div>
        <div className="ml-auto">
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={15} /> Export</Button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
          <input className="rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            placeholder="Rechercher un enfant…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Groupe</label>
          <Select value={filtreGroupe} onChange={(e) => setFiltreGroupe(e.target.value)}>
            <option value="">Tous les groupes</option>
            {GROUPES_AGE.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Statut</label>
          <Select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
            <option value="">Tous</option>
            <option value="present">Présents</option>
            <option value="absent">Absents</option>
            <option value="excuse">Excusés</option>
            <option value="non_pointe">Non pointés</option>
          </Select>
        </div>
      </div>

      {isToday && (
        <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-2 text-sm text-orange-800">
          <strong>Aujourd'hui :</strong> Cliquez <strong>Arrivée</strong> à l'entrée de l'enfant, <strong>Départ</strong> à la sortie, et <strong>Récupéré par</strong> pour noter qui est venu le chercher.
        </div>
      )}

      {/* Tableau */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Enfant</th>
              <th className="px-3 py-2 text-left">Groupe</th>
              <th className="px-3 py-2 text-center">🟢 Arrivée</th>
              <th className="px-3 py-2 text-center">🔴 Départ</th>
              <th className="px-3 py-2 text-center">⏱ Durée</th>
              <th className="px-3 py-2 text-center">👤 Récupéré par</th>
              <th className="px-3 py-2 text-center">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-400">Aucun enfant trouvé.</td></tr>
            )}
            {liste.map((e) => {
              const p = getPresence(e.id)
              const duree = calcDuree(p?.heureArrivee, p?.heureDepart)
              const bgRow = p?.statut === 'present' ? 'bg-green-50/50'
                          : p?.statut === 'absent'  ? 'bg-red-50/50'
                          : p?.statut === 'excuse'  ? 'bg-yellow-50/50' : ''
              return (
                <tr key={e.id} className={`transition-colors ${bgRow}`}>

                  {/* Nom */}
                  <td className="px-3 py-3">
                    <p className="font-semibold">{e.prenom} {e.nom}</p>
                    <p className="text-xs text-gray-400">{e.parentNom || '—'}</p>
                  </td>

                  {/* Groupe */}
                  <td className="px-3 py-3 text-xs text-gray-500">
                    {GROUPES_AGE.find((g) => g.id === e.groupe)?.label || '—'}
                  </td>

                  {/* Arrivée */}
                  <td className="px-3 py-3 text-center">
                    {p?.heureArrivee ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="flex items-center gap-1 font-bold text-green-600">
                          <Clock size={13} /> {p.heureArrivee}
                        </span>
                        <button onClick={() => ouvrirModal(e, 'arrivee')}
                          className="text-[10px] text-gray-400 hover:text-orange-500 underline">corriger</button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        {isToday && (
                          <button onClick={() => marquerArrivee(e)}
                            className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">
                            <CheckCircle2 size={12} /> Arrivée
                          </button>
                        )}
                        <button onClick={() => ouvrirModal(e, 'arrivee')}
                          className="text-[10px] text-gray-400 hover:text-orange-500 underline">
                          {isToday ? 'saisir' : 'ajouter'}
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Départ */}
                  <td className="px-3 py-3 text-center">
                    {p?.heureDepart ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="flex items-center gap-1 font-bold text-red-500">
                          <LogOut size={13} /> {p.heureDepart}
                        </span>
                        <button onClick={() => ouvrirModal(e, 'depart')}
                          className="text-[10px] text-gray-400 hover:text-orange-500 underline">corriger</button>
                      </div>
                    ) : p?.heureArrivee ? (
                      <div className="flex flex-col items-center gap-1">
                        {isToday && (
                          <button onClick={() => marquerDepart(e)}
                            className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-200">
                            <LogOut size={12} /> Départ
                          </button>
                        )}
                        <button onClick={() => ouvrirModal(e, 'depart')}
                          className="text-[10px] text-gray-400 hover:text-orange-500 underline">
                          {isToday ? 'saisir' : 'ajouter'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Durée */}
                  <td className="px-3 py-3 text-center">
                    {duree ? (
                      <span className="font-bold text-orange-600 text-xs">{duree}</span>
                    ) : p?.heureArrivee ? (
                      <span className="text-xs italic text-gray-400">En cours…</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Récupéré par */}
                  <td className="px-3 py-3 text-center">
                    {p?.recupPar ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                          <User size={11} /> {p.recupPar}
                        </span>
                        <button onClick={() => ouvrirModal(e, 'recup')}
                          className="text-[10px] text-gray-400 hover:text-orange-500 underline">modifier</button>
                      </div>
                    ) : p?.statut === 'present' ? (
                      <button onClick={() => ouvrirModal(e, 'recup')}
                        className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 mx-auto">
                        <User size={10} /> Qui ?
                      </button>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>

                  {/* Statut + actions rapides */}
                  <td className="px-3 py-3 text-center">
                    {p?.statut ? (
                      <div className="flex flex-col items-center gap-1">
                        <Badge tone={STATUTS_PRESENCE[p.statut]?.tone}>
                          {STATUTS_PRESENCE[p.statut]?.label}
                        </Badge>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Badge tone="neutral">Non pointé</Badge>
                        <div className="flex gap-1 mt-1">
                          <button onClick={() => marquerAbsent(e, 'absent')}
                            className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-200">
                            Absent
                          </button>
                          <button onClick={() => marquerAbsent(e, 'excuse')}
                            className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700 hover:bg-yellow-200">
                            Excusé
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* Modal saisie manuelle */}
      <Modal
        open={!!pointageModal}
        onClose={() => setPointageModal(null)}
        size="sm"
        title={
          pointageModal?.type === 'arrivee' ? `🟢 Arrivée — ${pointageModal?.enfant?.prenom} ${pointageModal?.enfant?.nom}`
          : pointageModal?.type === 'depart' ? `🔴 Départ — ${pointageModal?.enfant?.prenom} ${pointageModal?.enfant?.nom}`
          : `👤 Récupéré par — ${pointageModal?.enfant?.prenom} ${pointageModal?.enfant?.nom}`
        }
        footer={
          <><Button variant="outline" onClick={() => setPointageModal(null)}>Annuler</Button>
          <Button onClick={confirmerModal}>Enregistrer</Button></>
        }>
        {pointageModal && (
          <div className="space-y-3">
            <div className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700">
              📅 {formatDateShort(dateFiltre)}
              {pointageModal.presence?.heureArrivee && ` · Arrivée : ${pointageModal.presence.heureArrivee}`}
              {pointageModal.presence?.heureDepart && ` · Départ : ${pointageModal.presence.heureDepart}`}
              {pointageModal.presence?.recupPar && ` · Récupéré par : ${pointageModal.presence.recupPar}`}
            </div>

            {pointageModal.type === 'recup' ? (
              <FormGroup label="Nom de la personne qui récupère l'enfant *">
                <Input
                  value={recupPar}
                  onChange={(e) => setRecupPar(e.target.value)}
                  placeholder="ex: Maman Kofi, Papa Ama, Tante Akosua…"
                  autoFocus
                />
              </FormGroup>
            ) : (
              <FormGroup label={pointageModal.type === 'arrivee' ? "Heure d'arrivée" : "Heure de départ"}>
                <Input type="time" value={heureManuelle}
                  onChange={(e) => setHeureManuelle(e.target.value)} autoFocus />
              </FormGroup>
            )}

            {/* Infos enfant */}
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <p>Parent : <strong>{pointageModal.enfant?.parentNom || '—'}</strong></p>
              <p>Contact : <strong>{pointageModal.enfant?.parentContact || '—'}</strong></p>
              {pointageModal.enfant?.allergies && (
                <p className="text-orange-600 mt-1">⚠ Allergies : {pointageModal.enfant.allergies}</p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

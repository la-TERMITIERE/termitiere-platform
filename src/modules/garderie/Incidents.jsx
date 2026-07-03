import { useMemo, useState } from 'react'
import { Plus, AlertTriangle, CheckCircle2, Bell, BellOff, BellRing, ShieldAlert, Lock } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { TYPES_INCIDENT, GRAVITES_INCIDENT } from './data'
import { useGarderieStore } from './store/garderieStore'
import { journaliersActifsSurDate } from './logic'

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

const empty = () => ({
  enfantId: '', enfantNom: '',
  type: 'accident', gravite: 'faible',
  date: todayStr(), heure: new Date().toTimeString().slice(0, 5),
  description: '', mesuresPrises: '', parentPrevenu: false,
  resolu: false, notes: '', alarme: 0
})

export default function Incidents() {
  const { user } = useAuth()
  const { data: incidents }   = useCollection('garderie_incidents')
  const { data: enfants }     = useCollection('garderie_enfants')
  const { data: journaliers } = useCollection('garderie_journaliers')

  const [modal, setModal]         = useState(null)
  const [filtreGravite, setFiltreGravite] = useState('')
  const [filtreResolu, setFiltreResolu]   = useState('false')

  const deletedEnfantIds = useGarderieStore((s) => s.deletedEnfantIds)
  const today = todayStr()

  const enfantsActifs = useMemo(
    () => enfants.filter((e) => e.statut === 'actif' && !deletedEnfantIds.has(e.id)),
    [enfants, deletedEnfantIds]
  )

  // Liste complète pour le sélecteur : inscrits + TOUS les journaliers enregistrés
  const tousEnfantsSelectables = useMemo(() => {
    // Dédupliquer les journaliers par nom (garder le plus récent)
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
      ...enfantsActifs.map((e) => ({ id: e.id, nom: `${e.prenom} ${e.nom}`, type: 'inscrit' })),
      ...jouListe.map((j) => ({ id: `jo_${j.id}`, nom: `${j.prenom} ${j.nom} (journalier)`, type: 'journalier' }))
    ]
  }, [enfantsActifs, journaliers])

  const liste = useMemo(() => {
    let rows = [...incidents]
    if (filtreGravite)        rows = rows.filter((i) => i.gravite === filtreGravite)
    if (filtreResolu !== '')  rows = rows.filter((i) => String(i.resolu) === filtreResolu)
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [incidents, filtreGravite, filtreResolu])

  async function handleSave() {
    const d = modal.data
    if (!d.enfantId) return toast.error('Sélectionnez un enfant')
    if (!d.description.trim()) return toast.error('Description requise')

    if (modal.isNew) {
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
        forRoles: d.gravite === 'grave' ? ['super_admin','pau','ge','gerant','agent'] : ['super_admin','pau','ge','gerant'],
        excludeUid: user.uid,
        link: '/garderie/incidents'
      })
      toast.success('Incident enregistré ✓')
    } else {
      await setItem('garderie_incidents', modal.id, { ...d, id: modal.id })
      audit('garderie', 'INCIDENT_EDIT', d.enfantNom)
      toast.success('Incident mis à jour ✓')
    }
    setModal(null)
  }

  async function marquerResolu(i) {
    await setItem('garderie_incidents', i.id, { ...i, resolu: true, alarme: 0 })
    audit('garderie', 'INCIDENT_RESOLU', i.enfantNom)
    notify({ type: 'info', title: `✅ Incident résolu — ${i.enfantNom}`, body: i.description?.slice(0, 80) || '', module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/incidents' })
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
        forRoles: niveau === 3 ? ['super_admin','pau','ge','gerant','agent'] : ['super_admin','pau','ge','gerant'],
        excludeUid: user.uid,
        link: '/garderie/incidents'
      })
      toast.success(`Alarme "${n.label}" activée`)
    }
  }

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  function onEnfantChange(id) {
    const found = tousEnfantsSelectables.find((x) => x.id === id)
    setModal((m) => ({ ...m, data: { ...m.data, enfantId: id, enfantNom: found ? found.nom : '' } }))
  }

  return (
    <div className="space-y-5">
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
          <Button onClick={() => setModal({ data: empty(), isNew: true })}>
            <Plus size={16} /> Signaler un incident
          </Button>
        </div>
      </div>

      {/* Bannière alarmes actives */}
      {liste.filter((i) => !i.resolu && (i.alarme || 0) >= 2).length > 0 && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 animate-pulse">
          <p className="font-bold text-red-700 flex items-center gap-2">
            <ShieldAlert size={18} />
            {liste.filter((i) => !i.resolu && (i.alarme || 0) === 3).length > 0 &&
              `🔴 ${liste.filter((i) => !i.resolu && (i.alarme || 0) === 3).length} URGENCE(S) — `}
            {liste.filter((i) => !i.resolu && (i.alarme || 0) === 2).length > 0 &&
              `🟠 ${liste.filter((i) => !i.resolu && (i.alarme || 0) === 2).length} ALERTE(S)`}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {liste.filter((i) => !i.resolu && (i.alarme || 0) >= 2).map((i) => (
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
            {liste.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-sm text-gray-400">Aucun incident enregistré.</td></tr>
            )}
            {liste.map((i) => {
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
                      <button onClick={() => setModal({ data: { ...empty(), ...i }, isNew: false, id: i.id })}
                        className="rounded px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 font-semibold">Éditer</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} size="lg"
        title={modal?.isNew ? 'Signaler un incident' : 'Modifier l\'incident'}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button onClick={handleSave}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <FormGroup label="Enfant concerné *">
              <Select value={modal.data.enfantId} onChange={(e) => onEnfantChange(e.target.value)}>
                <option value="">— Choisir —</option>
                {tousEnfantsSelectables.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </Select>
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Type d'incident">
                <Select value={modal.data.type} onChange={(e) => set('type', e.target.value)}>
                  {TYPES_INCIDENT.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Gravité">
                <Select value={modal.data.gravite} onChange={(e) => set('gravite', e.target.value)}>
                  {Object.entries(GRAVITES_INCIDENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Date">
                <Input type="date" value={modal.data.date} onChange={(e) => set('date', e.target.value)} />
              </FormGroup>
              <FormGroup label="Heure">
                <Input type="time" value={modal.data.heure} onChange={(e) => set('heure', e.target.value)} />
              </FormGroup>
            </div>
            <FormGroup label="Description *">
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={3} value={modal.data.description} onChange={(e) => set('description', e.target.value)}
                placeholder="Décrivez l'incident de façon précise…" />
            </FormGroup>
            <FormGroup label="Mesures prises">
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={modal.data.mesuresPrises} onChange={(e) => set('mesuresPrises', e.target.value)}
                placeholder="Premiers secours, appel médecin, soins…" />
            </FormGroup>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!modal.data.parentPrevenu} onChange={(e) => set('parentPrevenu', e.target.checked)}
                  className="rounded text-orange-500" />
                Parent / tuteur prévenu
              </label>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Plus, AlertTriangle, CheckCircle2 } from 'lucide-react'
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

const empty = () => ({
  enfantId: '', enfantNom: '',
  type: 'accident', gravite: 'faible',
  date: todayStr(), heure: new Date().toTimeString().slice(0, 5),
  description: '', mesuresPrises: '', parentPrevenu: false,
  resolu: false, notes: ''
})

export default function Incidents() {
  const { user } = useAuth()
  const { data: incidents } = useCollection('garderie_incidents')
  const { data: enfants }   = useCollection('garderie_enfants')

  const [modal, setModal]         = useState(null)
  const [filtreGravite, setFiltreGravite] = useState('')
  const [filtreResolu, setFiltreResolu]   = useState('false')

  const enfantsActifs = useMemo(() => enfants.filter((e) => e.statut === 'actif'), [enfants])

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
      await setItem('garderie_incidents', id, { ...d, id, resolu: false })
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
    await setItem('garderie_incidents', i.id, { ...i, resolu: true })
    audit('garderie', 'INCIDENT_RESOLU', i.enfantNom)
    notify({ type: 'info', title: `✅ Incident résolu — ${i.enfantNom}`, body: i.description?.slice(0, 80) || '', module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/incidents' })
    toast.success('Incident marqué comme résolu ✓')
  }

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  function onEnfantChange(id) {
    const e = enfantsActifs.find((x) => x.id === id)
    setModal((m) => ({ ...m, data: { ...m.data, enfantId: id, enfantNom: e ? `${e.prenom} ${e.nom}` : '' } }))
  }

  return (
    <div className="space-y-4">
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

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Enfant</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Date / Heure</th>
              <th className="px-3 py-2 text-left">Gravité</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Parent prévenu</th>
              <th className="px-3 py-2 text-left">Résolu</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-sm text-gray-400">Aucun incident enregistré.</td></tr>
            )}
            {liste.map((i) => (
              <tr key={i.id} className={`transition-colors ${!i.resolu && i.gravite === 'grave' ? 'bg-red-50' : ''}`}>
                <td className="px-3 py-2 font-semibold">{i.enfantNom || '—'}</td>
                <td className="px-3 py-2">{TYPES_INCIDENT.find((t) => t.id === i.type)?.label || i.type}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{formatDateShort(i.date)} {i.heure}</td>
                <td className="px-3 py-2"><Badge tone={GRAVITES_INCIDENT[i.gravite]?.tone}>{GRAVITES_INCIDENT[i.gravite]?.label}</Badge></td>
                <td className="px-3 py-2 max-w-xs truncate text-gray-600">{i.description}</td>
                <td className="px-3 py-2 text-center">
                  {i.parentPrevenu ? <CheckCircle2 size={16} className="text-green-500 mx-auto" /> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  {i.resolu
                    ? <CheckCircle2 size={16} className="text-green-500 mx-auto" />
                    : <AlertTriangle size={16} className="text-orange-400 mx-auto" />
                  }
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
            ))}
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
                {enfantsActifs.map((e) => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
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
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!modal.data.resolu} onChange={(e) => set('resolu', e.target.checked)}
                  className="rounded text-orange-500" />
                Incident résolu
              </label>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

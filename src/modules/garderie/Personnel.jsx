import { useMemo, useState } from 'react'
import { Plus, Clock, CheckCircle2, LogOut } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { POSTES_PERSONNEL } from './data'

const heureNow = () => new Date().toTimeString().slice(0, 5)

const emptyPersonnel = () => ({
  nom: '', prenom: '', poste: 'tata', telephone: '',
  dateEmbauche: todayStr(), horaire: '07:00 – 17:00',
  statut: 'actif', notes: ''
})

export default function Personnel() {
  const { user } = useAuth()
  const { data: personnel } = useCollection('garderie_personnel')
  const { data: presences } = useCollection('garderie_presences')

  const today = todayStr()

  const [modal, setModal]  = useState(null)
  const [filtre, setFiltre] = useState('actif')

  const liste = useMemo(() => {
    let rows = [...personnel]
    if (filtre) rows = rows.filter((p) => p.statut === filtre)
    return rows.sort((a, b) => `${a.prenom} ${a.nom}` < `${b.prenom} ${b.nom}` ? -1 : 1)
  }, [personnel, filtre])

  const pointageAujourdhui = (personnelId) =>
    presences.find((p) => p.personnelId === personnelId && p.date === today)

  async function handleSave() {
    const d = modal.data
    if (!d.nom.trim() || !d.prenom.trim()) return toast.error('Nom et prénom requis')
    if (!d.poste) return toast.error('Poste requis')
    if (modal.isNew) {
      const id = genId()
      await addItem('garderie_personnel', { ...d, id })
      audit('garderie', 'PERSONNEL_CREATE', `${d.prenom} ${d.nom}`, { poste: d.poste })
      toast.success('Membre du personnel ajouté ✓')
    } else {
      await updateItem('garderie_personnel', modal.id, d)
      audit('garderie', 'PERSONNEL_EDIT', `${d.prenom} ${d.nom}`)
      toast.success('Fiche mise à jour ✓')
    }
    setModal(null)
  }

  async function pointer(p, type) {
    const heure = heureNow()
    const existing = pointageAujourdhui(p.id)
    if (type === 'arrivee') {
      if (existing) return toast.info('Déjà pointé à l\'arrivée')
      const id = genId()
      await addItem('garderie_presences', { id, personnelId: p.id, date: today, heureArrivee: heure, statut: 'present' })
      audit('garderie', 'PERSONNEL_POINTAGE_ARRIVEE', `${p.prenom} ${p.nom}`, { heure })
      notify({ type: 'info', title: `🟢 Arrivée — ${p.prenom} ${p.nom}`, body: `Pointage arrivée à ${heure}`, module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/personnel' })
      toast.success(`Arrivée de ${p.prenom} enregistrée à ${heure}`)
    } else {
      if (!existing) return toast.error('Aucun pointage d\'arrivée enregistré')
      await updateItem('garderie_presences', existing.id, { heureDepart: heure })
      audit('garderie', 'PERSONNEL_POINTAGE_DEPART', `${p.prenom} ${p.nom}`, { heure })
      notify({ type: 'info', title: `🔴 Départ — ${p.prenom} ${p.nom}`, body: `Pointage départ à ${heure}`, module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/personnel' })
      toast.success(`Départ de ${p.prenom} enregistré à ${heure}`)
    }
  }

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Statut</label>
          <Select value={filtre} onChange={(e) => setFiltre(e.target.value)}>
            <option value="">Tous</option>
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
          </Select>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setModal({ data: emptyPersonnel(), isNew: true })}>
            <Plus size={16} /> Ajouter un membre
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-700">
        Utilisez les boutons <strong>Arrivée</strong> / <strong>Départ</strong> pour enregistrer le pointage du jour.
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Nom</th>
              <th className="px-3 py-2 text-left">Poste</th>
              <th className="px-3 py-2 text-left">Téléphone</th>
              <th className="px-3 py-2 text-left">Horaire</th>
              <th className="px-3 py-2 text-left">Pointage aujourd'hui</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-400">Aucun membre du personnel.</td></tr>
            )}
            {liste.map((p) => {
              const pt = pointageAujourdhui(p.id)
              return (
                <tr key={p.id} className="hover:bg-orange-50 transition-colors">
                  <td className="px-3 py-2 font-semibold">{p.prenom} {p.nom}</td>
                  <td className="px-3 py-2">{POSTES_PERSONNEL.find((x) => x.id === p.poste)?.label || p.poste}</td>
                  <td className="px-3 py-2 text-gray-500">{p.telephone || '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{p.horaire || '—'}</td>
                  <td className="px-3 py-2">
                    {pt ? (
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 size={14} className="text-green-500" />
                        <span>{pt.heureArrivee}</span>
                        {pt.heureDepart && <span className="text-gray-400">→ {pt.heureDepart}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Non pointé</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={p.statut === 'actif' ? 'success' : 'neutral'}>
                      {p.statut === 'actif' ? 'Actif' : 'Inactif'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {p.statut === 'actif' && !pt && (
                        <Button size="xs" onClick={() => pointer(p, 'arrivee')}>
                          <Clock size={12} /> Arrivée
                        </Button>
                      )}
                      {p.statut === 'actif' && pt && !pt.heureDepart && (
                        <Button size="xs" variant="outline" onClick={() => pointer(p, 'depart')}>
                          <LogOut size={12} /> Départ
                        </Button>
                      )}
                      <button onClick={() => setModal({ data: { ...emptyPersonnel(), ...p }, isNew: false, id: p.id })}
                        className="rounded px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 font-semibold">
                        Éditer
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        title={modal?.isNew ? 'Ajouter un membre du personnel' : 'Modifier la fiche'}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button onClick={handleSave}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Prénom *"><Input value={modal.data.prenom} onChange={(e) => set('prenom', e.target.value)} /></FormGroup>
              <FormGroup label="Nom *"><Input value={modal.data.nom} onChange={(e) => set('nom', e.target.value)} /></FormGroup>
              <FormGroup label="Poste *">
                <Select value={modal.data.poste} onChange={(e) => set('poste', e.target.value)}>
                  {POSTES_PERSONNEL.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Téléphone"><Input value={modal.data.telephone} onChange={(e) => set('telephone', e.target.value)} /></FormGroup>
              <FormGroup label="Date d'embauche"><Input type="date" value={modal.data.dateEmbauche} onChange={(e) => set('dateEmbauche', e.target.value)} /></FormGroup>
              <FormGroup label="Horaire habituel"><Input value={modal.data.horaire} onChange={(e) => set('horaire', e.target.value)} placeholder="ex: 07:00 – 17:00" /></FormGroup>
              <FormGroup label="Statut">
                <Select value={modal.data.statut} onChange={(e) => set('statut', e.target.value)}>
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                </Select>
              </FormGroup>
            </div>
            <FormGroup label="Notes">
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={modal.data.notes} onChange={(e) => set('notes', e.target.value)} />
            </FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}

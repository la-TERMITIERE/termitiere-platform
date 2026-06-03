// Livraisons — liste filtrable + création + suivi (marquer livré).
import { useMemo, useState } from 'react'
import { Plus, CheckCircle2, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, nowHM, formatDateShort } from '../../utils/formatters'
import { STATUTS_LIVRAISON } from './store/logistiqueStore'

const empty = () => ({ date: todayStr(), vehiculeId: '', chauffeurId: '', origine: '', destination: '', marchandise: '', poids: 0, client: '', statut: 'planifiee', heureDepart: '', heureArrivee: '', notes: '' })

export default function Livraisons() {
  const { data: livraisons } = useCollection('logistique_livraisons')
  const { data: vehicules } = useCollection('logistique_vehicules')
  const [filtre, setFiltre] = useState('')
  const [modal, setModal] = useState(null)

  const liste = useMemo(
    () => [...livraisons].filter((l) => !filtre || l.statut === filtre).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [livraisons, filtre]
  )
  const immat = (id) => vehicules.find((v) => v.id === id)?.immatriculation || '—'

  async function save() {
    const l = modal.data
    if (!l.destination.trim()) return toast.error('Destination requise')
    if (modal.id) { await updateItem('logistique_livraisons', modal.id, l); toast.success('Livraison modifiée ✓') }
    else { await addItem('logistique_livraisons', l); await audit('logistique', 'LIVRAISON', `${l.origine} → ${l.destination}`); toast.success('Livraison planifiée ✓') }
    setModal(null)
  }
  async function marquerLivree(l) {
    await updateItem('logistique_livraisons', l.id, { statut: 'livree', heureArrivee: nowHM() })
    toast.success('Livraison marquée comme livrée ✓')
  }
  async function supprimer(l) { if (confirm('Supprimer cette livraison ?')) { await removeItem('logistique_livraisons', l.id); toast.success('Supprimée') } }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="max-w-xs" value={filtre} onChange={(e) => setFiltre(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_LIVRAISON).map(([v, o]) => <option key={v} value={v}>{o.label}</option>)}
        </Select>
        <Button className="ml-auto" onClick={() => setModal({ data: empty(), id: null })}><Plus size={16} /> Nouvelle livraison</Button>
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'vehiculeId', label: 'Véhicule', render: (r) => immat(r.vehiculeId) },
            { key: 'trajet', label: 'Trajet', render: (r) => `${r.origine || '?'} → ${r.destination || '?'}` },
            { key: 'marchandise', label: 'Marchandise' },
            { key: 'client', label: 'Client' },
            { key: 'statut', label: 'Statut', render: (r) => <Badge tone={STATUTS_LIVRAISON[r.statut]?.tone}>{STATUTS_LIVRAISON[r.statut]?.label}</Badge> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                {r.statut !== 'livree' && r.statut !== 'annulee' && <button title="Marquer livré" onClick={() => marquerLivree(r)} className="rounded p-1.5 text-green-600 hover:bg-green-50"><CheckCircle2 size={16} /></button>}
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">✏️</button>
                <button onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            ) }
          ]}
          rows={liste}
          empty="Aucune livraison."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} size="lg" title={modal?.id ? 'Modifier la livraison' : 'Nouvelle livraison'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Date"><Input type="date" value={modal.data.date} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, date: e.target.value } }))} /></FormGroup>
            <FormGroup label="Véhicule"><Select value={modal.data.vehiculeId} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, vehiculeId: e.target.value } }))}><option value="">— Choisir —</option>{vehicules.map((v) => <option key={v.id} value={v.id}>{v.immatriculation} ({v.statut})</option>)}</Select></FormGroup>
            <FormGroup label="Chauffeur"><Input value={modal.data.chauffeurId} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, chauffeurId: e.target.value } }))} /></FormGroup>
            <FormGroup label="Client / destinataire"><Input value={modal.data.client} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, client: e.target.value } }))} /></FormGroup>
            <FormGroup label="Origine"><Input value={modal.data.origine} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, origine: e.target.value } }))} /></FormGroup>
            <FormGroup label="Destination" required><Input value={modal.data.destination} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, destination: e.target.value } }))} /></FormGroup>
            <FormGroup label="Marchandise"><Input value={modal.data.marchandise} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, marchandise: e.target.value } }))} /></FormGroup>
            <FormGroup label="Poids (kg)"><Input type="number" min="0" value={modal.data.poids} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, poids: parseFloat(e.target.value) || 0 } }))} /></FormGroup>
            <FormGroup label="Heure de départ"><Input type="time" value={modal.data.heureDepart} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, heureDepart: e.target.value } }))} /></FormGroup>
            <FormGroup label="Statut"><Select value={modal.data.statut} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, statut: e.target.value } }))} options={Object.entries(STATUTS_LIVRAISON).map(([v, o]) => ({ value: v, label: o.label }))} /></FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}

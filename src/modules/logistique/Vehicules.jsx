// Véhicules — CRUD avec statut coloré.
import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { formatNumber, formatDateShort, todayStr } from '../../utils/formatters'
import { STATUTS_VEHICULE, TYPES_VEHICULE } from './store/logistiqueStore'

const empty = () => ({ immatriculation: '', marque: '', modele: '', type: 'camion', statut: 'disponible', chauffeurId: '', derniereRevision: todayStr(), kilometrage: 0, notes: '' })

export default function Vehicules() {
  const { canManage } = useAuth()
  const { data: vehicules } = useCollection('logistique_vehicules')
  const [modal, setModal] = useState(null)

  async function save() {
    const v = modal.data
    if (!v.immatriculation.trim()) return toast.error('Immatriculation requise')
    if (modal.id) { await updateItem('logistique_vehicules', modal.id, v); toast.success('Véhicule modifié ✓') }
    else { await addItem('logistique_vehicules', v); await audit('logistique', 'VEHICULE', v.immatriculation); toast.success('Véhicule ajouté ✓') }
    setModal(null)
  }
  async function supprimer(v) { if (confirm(`Supprimer ${v.immatriculation} ?`)) { await removeItem('logistique_vehicules', v.id); toast.success('Supprimé') } }

  return (
    <div className="space-y-4">
      {canManage() && <div className="flex justify-end"><Button onClick={() => setModal({ data: empty(), id: null })}><Plus size={16} /> Ajouter un véhicule</Button></div>}
      <Card className="p-0">
        <Table
          columns={[
            { key: 'immatriculation', label: 'Immat.' },
            { key: 'vehicule', label: 'Véhicule', render: (r) => `${r.marque || ''} ${r.modele || ''}`.trim() || '—' },
            { key: 'type', label: 'Type', render: (r) => TYPES_VEHICULE.find((t) => t.value === r.type)?.label },
            { key: 'statut', label: 'Statut', render: (r) => <Badge tone={STATUTS_VEHICULE[r.statut]?.tone}>{STATUTS_VEHICULE[r.statut]?.label}</Badge> },
            { key: 'kilometrage', label: 'Km', align: 'right', render: (r) => formatNumber(r.kilometrage) },
            { key: 'derniereRevision', label: 'Révision', render: (r) => formatDateShort(r.derniereRevision) },
            ...(canManage() ? [{ key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>
                <button onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            ) }] : [])
          ]}
          rows={vehicules}
          empty="Aucun véhicule enregistré."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le véhicule' : 'Nouveau véhicule'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Immatriculation" required><Input value={modal.data.immatriculation} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, immatriculation: e.target.value } }))} /></FormGroup>
            <FormGroup label="Type"><Select value={modal.data.type} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, type: e.target.value } }))} options={TYPES_VEHICULE} /></FormGroup>
            <FormGroup label="Marque"><Input value={modal.data.marque} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, marque: e.target.value } }))} /></FormGroup>
            <FormGroup label="Modèle"><Input value={modal.data.modele} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, modele: e.target.value } }))} /></FormGroup>
            <FormGroup label="Statut"><Select value={modal.data.statut} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, statut: e.target.value } }))} options={Object.entries(STATUTS_VEHICULE).map(([v, o]) => ({ value: v, label: o.label }))} /></FormGroup>
            <FormGroup label="Chauffeur assigné"><Input value={modal.data.chauffeurId} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, chauffeurId: e.target.value } }))} /></FormGroup>
            <FormGroup label="Dernière révision"><Input type="date" value={modal.data.derniereRevision} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, derniereRevision: e.target.value } }))} /></FormGroup>
            <FormGroup label="Kilométrage"><Input type="number" min="0" value={modal.data.kilometrage} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, kilometrage: parseInt(e.target.value) || 0 } }))} /></FormGroup>
            <FormGroup label="Notes" className="col-span-2"><textarea className="input-base" rows={2} value={modal.data.notes} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, notes: e.target.value } }))} /></FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}

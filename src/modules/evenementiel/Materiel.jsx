// Matériel de location — catalogue avec stock dispo / réservé / maintenance + tarif journalier.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney, formatNumber } from '../../utils/formatters'

const empty = () => ({ nom: '', total: 0, reserve: 0, maintenance: 0, tarifJour: 0 })

export default function Materiel() {
  const { data: materiel } = useCollection('evenementiel_materiel')
  const [modal, setModal] = useState(null)

  async function save() {
    const m = modal.data
    if (!m.nom.trim()) return toast.error('Nom requis')
    if (modal.id) await updateItem('evenementiel_materiel', modal.id, m)
    else await addItem('evenementiel_materiel', m)
    toast.success('Enregistré ✓'); setModal(null)
  }
  async function supprimer(m) { if (confirm(`Supprimer ${m.nom} ?`)) { await removeItem('evenementiel_materiel', m.id); toast.success('Supprimé') } }
  const dispo = (m) => Math.max(0, (m.total || 0) - (m.reserve || 0) - (m.maintenance || 0))

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button style={{ background: '#7c3aed' }} onClick={() => setModal({ data: empty(), id: null })}><Plus size={16} /> Ajouter du matériel</Button></div>
      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Article' },
            { key: 'total', label: 'Total', align: 'center', render: (r) => formatNumber(r.total) },
            { key: 'dispo', label: 'Disponible', align: 'center', render: (r) => <Badge tone={dispo(r) > 0 ? 'success' : 'danger'}>{dispo(r)}</Badge> },
            { key: 'reserve', label: 'Réservé', align: 'center', render: (r) => formatNumber(r.reserve) },
            { key: 'maintenance', label: 'Maintenance', align: 'center', render: (r) => formatNumber(r.maintenance) },
            { key: 'tarifJour', label: 'Tarif / jour', align: 'right', render: (r) => formatMoney(r.tarifJour) },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">✏️</button>
                <button onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            ) }
          ]}
          rows={materiel}
          empty="Aucun matériel au catalogue."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier' : 'Nouveau matériel'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button style={{ background: '#7c3aed' }} onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Nom" required className="col-span-2"><Input value={modal.data.nom} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, nom: e.target.value } }))} placeholder="Tables, chaises, tentes…" /></FormGroup>
            <FormGroup label="Quantité totale"><Input type="number" min="0" value={modal.data.total} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, total: parseInt(e.target.value) || 0 } }))} /></FormGroup>
            <FormGroup label="Tarif / jour (FCFA)"><Input type="number" min="0" value={modal.data.tarifJour} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, tarifJour: parseInt(e.target.value) || 0 } }))} /></FormGroup>
            <FormGroup label="Réservé"><Input type="number" min="0" value={modal.data.reserve} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, reserve: parseInt(e.target.value) || 0 } }))} /></FormGroup>
            <FormGroup label="En maintenance"><Input type="number" min="0" value={modal.data.maintenance} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, maintenance: parseInt(e.target.value) || 0 } }))} /></FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}

// Clients logistique & événementiel.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isReadOnlyRole } from '../../core/roles'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'

const empty = () => ({ nom: '', telephone: '', email: '', adresse: '' })

export default function Clients() {
  const { data: clients } = useCollection('logistique_clients')
  const role = useAuth((s) => s.role)
  const lectureSeule = isReadOnlyRole(role)
  const [modal, setModal] = useState(null)

  async function save() {
    const c = modal.data
    if (!c.nom.trim()) return toast.error('Nom requis')
    if (modal.id) await updateItem('logistique_clients', modal.id, c)
    else await addItem('logistique_clients', c)
    toast.success('Enregistré ✓')
    setModal(null)
  }

  return (
    <div className="space-y-4">
      {!lectureSeule && <div className="flex justify-end"><Button onClick={() => setModal({ data: empty(), id: null })}><Plus size={16} /> Nouveau client</Button></div>}
      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Nom' },
            { key: 'telephone', label: 'Téléphone' },
            { key: 'email', label: 'E-mail' },
            { key: 'actions', label: '', align: 'right', render: (r) => lectureSeule ? null : (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 hover:bg-gray-100">✏️</button>
                <button onClick={() => { if (confirm(`Supprimer ${r.nom} ?`)) removeItem('logistique_clients', r.id) }} className="text-red-500"><Trash2 size={16} /></button>
              </div>
            ) }
          ]}
          rows={clients}
          empty="Aucun client."
        />
      </Card>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier' : 'Nouveau client'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <>
            <FormGroup label="Nom" required><Input value={modal.data.nom} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, nom: e.target.value } }))} /></FormGroup>
            <FormGroup label="Téléphone"><Input value={modal.data.telephone} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, telephone: e.target.value } }))} /></FormGroup>
            <FormGroup label="E-mail"><Input value={modal.data.email} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, email: e.target.value } }))} /></FormGroup>
            <FormGroup label="Adresse"><Input value={modal.data.adresse} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, adresse: e.target.value } }))} /></FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}

// Employés — CRUD complet.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { useDepartements } from './useDepartements'

const empty = () => ({ nom: '', poste: '', departement: '', dateEmbauche: todayStr(), salaire: 0, contact: '' })

export default function Employes() {
  const { data: employes } = useCollection('rh_employes')
  const { data: postes } = useCollection('rh_postes')
  const { noms: departements } = useDepartements()
  const [modal, setModal] = useState(null)

  async function save() {
    const e = modal.data
    if (!e.nom.trim()) return toast.error('Nom requis')
    if (modal.id) await updateItem('rh_employes', modal.id, e)
    else await addItem('rh_employes', e)
    toast.success('Enregistré ✓'); setModal(null)
  }
  async function supprimer(e) { if (confirm(`Supprimer ${e.nom} ?`)) { await removeItem('rh_employes', e.id); toast.success('Supprimé') } }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button style={{ background: '#ea580c' }} onClick={() => setModal({ data: empty(), id: null })}><Plus size={16} /> Ajouter un employé</Button></div>
      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Nom' },
            { key: 'poste', label: 'Poste' },
            { key: 'departement', label: 'Département' },
            { key: 'dateEmbauche', label: 'Embauche', render: (r) => formatDateShort(r.dateEmbauche) },
            { key: 'salaire', label: 'Salaire', align: 'right', render: (r) => formatMoney(r.salaire) },
            { key: 'contact', label: 'Contact' },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">✏️</button>
                <button onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            ) }
          ]}
          rows={employes}
          empty="Aucun employé."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier' : 'Nouvel employé'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button style={{ background: '#ea580c' }} onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Nom" required className="col-span-2"><Input value={modal.data.nom} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, nom: e.target.value } }))} /></FormGroup>
            <FormGroup label="Poste">
              <Input list="rh-postes-liste" value={modal.data.poste} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, poste: e.target.value } }))} />
              <datalist id="rh-postes-liste">{postes.map((p) => <option key={p.id} value={p.intitule} />)}</datalist>
            </FormGroup>
            <FormGroup label="Département"><Select value={modal.data.departement} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, departement: e.target.value } }))} options={[{ value: '', label: '— Non affecté —' }, ...departements.map((d) => ({ value: d, label: d }))]} /></FormGroup>
            <FormGroup label="Date d'embauche"><Input type="date" value={modal.data.dateEmbauche} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, dateEmbauche: e.target.value } }))} /></FormGroup>
            <FormGroup label="Salaire (FCFA)"><Input type="number" min="0" value={modal.data.salaire} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, salaire: parseInt(e.target.value) || 0 } }))} /></FormGroup>
            <FormGroup label="Contact" className="col-span-2"><Input value={modal.data.contact} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, contact: e.target.value } }))} /></FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}

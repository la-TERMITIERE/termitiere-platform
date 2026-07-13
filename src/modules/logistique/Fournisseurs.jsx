// Fournisseurs — CRUD + note qualité + alerte inactivité (>30 j).
import { useState } from 'react'
import { Plus, Trash2, Star, AlertTriangle } from 'lucide-react'
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
import { formatDateShort, addDays, todayStr } from '../../utils/formatters'

const empty = () => ({ nom: '', contact: '', adresse: '', specialite: '', delaiMoyen: 0, note: 5, derniereCommande: '' })

export default function Fournisseurs() {
  const { data: fournisseurs } = useCollection('logistique_fournisseurs')
  const role = useAuth((s) => s.role)
  const lectureSeule = isReadOnlyRole(role)
  const [modal, setModal] = useState(null)

  async function save() {
    const f = modal.data
    if (!f.nom.trim()) return toast.error('Nom requis')
    if (modal.id) await updateItem('logistique_fournisseurs', modal.id, f)
    else await addItem('logistique_fournisseurs', f)
    toast.success('Enregistré ✓'); setModal(null)
  }
  async function supprimer(f) { if (confirm(`Supprimer ${f.nom} ?`)) { await removeItem('logistique_fournisseurs', f.id); toast.success('Supprimé') } }
  const inactif = (f) => f.derniereCommande && addDays(f.derniereCommande, 30) < todayStr()

  return (
    <div className="space-y-4">
      {!lectureSeule && <div className="flex justify-end"><Button onClick={() => setModal({ data: empty(), id: null })}><Plus size={16} /> Ajouter un fournisseur</Button></div>}
      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Nom', render: (r) => <span className="flex items-center gap-2">{r.nom}{inactif(r) && <AlertTriangle size={14} className="text-amber-500" title="Inactif > 30 j" />}</span> },
            { key: 'specialite', label: 'Spécialité' },
            { key: 'contact', label: 'Contact' },
            { key: 'delaiMoyen', label: 'Délai (j)', align: 'center' },
            { key: 'note', label: 'Qualité', align: 'center', render: (r) => <span className="inline-flex items-center gap-0.5 text-amber-500">{r.note}<Star size={13} fill="currentColor" /></span> },
            { key: 'derniereCommande', label: 'Dernière cmd', render: (r) => formatDateShort(r.derniereCommande) },
            { key: 'actions', label: '', align: 'right', render: (r) => lectureSeule ? null : (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">✏️</button>
                <button onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            ) }
          ]}
          rows={fournisseurs}
          empty="Aucun fournisseur."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier' : 'Nouveau fournisseur'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Nom" required className="col-span-2"><Input value={modal.data.nom} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, nom: e.target.value } }))} /></FormGroup>
            <FormGroup label="Spécialité"><Input value={modal.data.specialite} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, specialite: e.target.value } }))} /></FormGroup>
            <FormGroup label="Contact"><Input value={modal.data.contact} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, contact: e.target.value } }))} /></FormGroup>
            <FormGroup label="Adresse" className="col-span-2"><Input value={modal.data.adresse} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, adresse: e.target.value } }))} /></FormGroup>
            <FormGroup label="Délai moyen (jours)"><Input type="number" min="0" value={modal.data.delaiMoyen} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, delaiMoyen: parseInt(e.target.value) || 0 } }))} /></FormGroup>
            <FormGroup label="Note qualité (1-5)"><Input type="number" min="1" max="5" value={modal.data.note} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, note: parseInt(e.target.value) || 1 } }))} /></FormGroup>
            <FormGroup label="Dernière commande" className="col-span-2"><Input type="date" value={modal.data.derniereCommande} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, derniereCommande: e.target.value } }))} /></FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}

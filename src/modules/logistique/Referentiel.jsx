// Référentiel matériel — catalogue, coût d'achat, tarif location, unité.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useLogistiqueStore } from './store/referentielStore'
import { toast } from '../../core/notifications'
import { genId, formatMoney } from '../../utils/formatters'
import { CAT_MATERIEL } from './data'

export default function Referentiel() {
  const { materiel, saveMateriel, removeMateriel } = useLogistiqueStore()
  const [modal, setModal] = useState(null)

  function openNew() {
    setModal({ isNew: true, id: '', nom: '', cat: CAT_MATERIEL[0], unite: 'unités', coutAchat: 0, tarifLocation: 0 })
  }

  function submit() {
    if (!modal.nom.trim()) return toast.error('Nom requis')
    const id = modal.isNew
      ? (modal.nom.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20) + '_' + genId().slice(0, 3))
      : modal.id
    saveMateriel({
      id, nom: modal.nom.trim(), cat: modal.cat,
      unite: modal.unite || 'unités',
      coutAchat: parseInt(modal.coutAchat) || 0,
      tarifLocation: parseInt(modal.tarifLocation) || 0
    })
    toast.success('Enregistré ✓')
    setModal(null)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Gérez le catalogue matériel : coût d'achat, tarif de location et unité. La liste complète pourra être importée ultérieurement.</p>
      <div className="flex justify-end"><Button onClick={openNew}><Plus size={16} /> Ajouter du matériel</Button></div>
      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Matériel' },
            { key: 'cat', label: 'Catégorie', render: (r) => <Badge tone="neutral">{r.cat}</Badge> },
            { key: 'unite', label: 'Unité' },
            { key: 'coutAchat', label: 'Coût achat', align: 'right', render: (r) => formatMoney(r.coutAchat) },
            { key: 'tarifLocation', label: 'Tarif location', align: 'right', render: (r) => formatMoney(r.tarifLocation) },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ ...r, isNew: false })} className="rounded p-1.5 hover:bg-gray-100">✏️</button>
                <button onClick={() => { if (confirm(`Supprimer ${r.nom} ?`)) removeMateriel(r.id) }} className="text-red-500"><Trash2 size={16} /></button>
              </div>
            ) }
          ]}
          rows={materiel}
          empty="Aucun matériel."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.isNew ? 'Nouveau matériel' : 'Modifier'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={submit}>Enregistrer</Button></>}>
        {modal && (
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Nom" required className="col-span-2"><Input value={modal.nom} onChange={(e) => setModal((m) => ({ ...m, nom: e.target.value }))} /></FormGroup>
            <FormGroup label="Catégorie">
              <Select value={modal.cat} onChange={(e) => setModal((m) => ({ ...m, cat: e.target.value }))}>
                {CAT_MATERIEL.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormGroup>
            <FormGroup label="Unité"><Input value={modal.unite} onChange={(e) => setModal((m) => ({ ...m, unite: e.target.value }))} /></FormGroup>
            <FormGroup label="Coût d'achat (FCFA)"><Input type="number" min="0" value={modal.coutAchat} onChange={(e) => setModal((m) => ({ ...m, coutAchat: e.target.value }))} /></FormGroup>
            <FormGroup label="Tarif location / jour (FCFA)"><Input type="number" min="0" value={modal.tarifLocation} onChange={(e) => setModal((m) => ({ ...m, tarifLocation: e.target.value }))} /></FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}

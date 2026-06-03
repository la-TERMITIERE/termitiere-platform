// Stock matériel logistique — inventaire avec entrées/sorties et alerte seuil.
import { useState } from 'react'
import { Plus, Trash2, ArrowDownUp, AlertTriangle } from 'lucide-react'
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
import { toast } from '../../core/notifications'
import { formatNumber } from '../../utils/formatters'

const empty = () => ({ nom: '', quantite: 0, seuil: 5, unite: 'unité' })

export default function StockMateriel() {
  const { data: stock } = useCollection('logistique_stock')
  const [modal, setModal] = useState(null)
  const [mvt, setMvt] = useState(null) // { item, sens }

  async function save() {
    const s = modal.data
    if (!s.nom.trim()) return toast.error('Nom requis')
    if (modal.id) await updateItem('logistique_stock', modal.id, s)
    else await addItem('logistique_stock', s)
    toast.success('Enregistré ✓'); setModal(null)
  }
  async function appliquerMvt(qte, motif) {
    const delta = (mvt.sens === 'entree' ? 1 : -1) * (parseInt(qte) || 0)
    const nouvelle = Math.max(0, (mvt.item.quantite || 0) + delta)
    await updateItem('logistique_stock', mvt.item.id, { quantite: nouvelle })
    toast.success(`${mvt.sens === 'entree' ? 'Entrée' : 'Sortie'} enregistrée (${motif || '—'})`)
    setMvt(null)
  }
  async function supprimer(s) { if (confirm(`Supprimer ${s.nom} ?`)) { await removeItem('logistique_stock', s.id); toast.success('Supprimé') } }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setModal({ data: empty(), id: null })}><Plus size={16} /> Ajouter un article</Button></div>
      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Article' },
            { key: 'quantite', label: 'Quantité', align: 'center', render: (r) => `${formatNumber(r.quantite)} ${r.unite || ''}` },
            { key: 'seuil', label: 'Seuil min', align: 'center' },
            { key: 'etat', label: 'État', align: 'center', render: (r) => r.quantite <= r.seuil ? <Badge tone="warning"><AlertTriangle size={12} /> Bas</Badge> : <Badge tone="success">OK</Badge> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button title="Mouvement" onClick={() => setMvt({ item: r, sens: 'entree' })} className="rounded p-1.5 text-secondary hover:bg-sky-50"><ArrowDownUp size={16} /></button>
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">✏️</button>
                <button onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            ) }
          ]}
          rows={stock}
          empty="Aucun matériel en stock."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier' : 'Nouvel article'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Nom" required className="col-span-2"><Input value={modal.data.nom} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, nom: e.target.value } }))} placeholder="Palettes, sangles, bâches…" /></FormGroup>
            <FormGroup label="Quantité"><Input type="number" min="0" value={modal.data.quantite} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, quantite: parseInt(e.target.value) || 0 } }))} /></FormGroup>
            <FormGroup label="Unité"><Input value={modal.data.unite} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, unite: e.target.value } }))} /></FormGroup>
            <FormGroup label="Seuil minimum"><Input type="number" min="0" value={modal.data.seuil} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, seuil: parseInt(e.target.value) || 0 } }))} /></FormGroup>
          </div>
        )}
      </Modal>

      <MvtModal mvt={mvt} onClose={() => setMvt(null)} onApply={appliquerMvt} setSens={(sens) => setMvt((m) => ({ ...m, sens }))} />
    </div>
  )
}

function MvtModal({ mvt, onClose, onApply, setSens }) {
  const [qte, setQte] = useState(1)
  const [motif, setMotif] = useState('')
  return (
    <Modal open={!!mvt} onClose={onClose} title={`Mouvement — ${mvt?.item?.nom || ''}`}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={() => onApply(qte, motif)}>Valider</Button></>}>
      {mvt && (
        <>
          <FormGroup label="Sens"><Select value={mvt.sens} onChange={(e) => setSens(e.target.value)} options={[{ value: 'entree', label: 'Entrée (+)' }, { value: 'sortie', label: 'Sortie (−)' }]} /></FormGroup>
          <FormGroup label="Quantité"><Input type="number" min="1" value={qte} onChange={(e) => setQte(e.target.value)} /></FormGroup>
          <FormGroup label="Motif"><Input value={motif} onChange={(e) => setMotif(e.target.value)} /></FormGroup>
        </>
      )}
    </Modal>
  )
}

// Référentiel matériel — catalogue, coût d'achat, tarif location, unité.
import { useState } from 'react'
import { Plus, Trash2, Package } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useLogistiqueStore } from './store/referentielStore'
import { useAuth } from '../../hooks/useAuth'
import { isReadOnlyRole, isFullAccessRole } from '../../core/roles'
import { toast } from '../../core/notifications'
import { genId, formatMoney } from '../../utils/formatters'
import { CAT_MATERIEL } from './data'
import { COULEUR_MODULE } from '../../utils/color'

export default function Referentiel() {
  const { materiel, saveMateriel, removeMateriel, evenements, saveEvenements } = useLogistiqueStore()
  const role = useAuth((s) => s.role)
  const lectureSeule = isReadOnlyRole(role)
  const [modal, setModal] = useState(null)
  const [newEv, setNewEv] = useState('')

  function addEvenement() {
    const v = newEv.trim()
    if (!v) return
    if (evenements.some((e) => e.toLowerCase() === v.toLowerCase())) { setNewEv(''); return toast.error('Déjà dans la liste') }
    saveEvenements([...evenements, v])
    setNewEv('')
    toast.success('Événement ajouté ✓')
  }
  function removeEvenement(ev) {
    saveEvenements(evenements.filter((e) => e !== ev))
  }

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
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.9) 0%, rgba(26,26,26,0.85) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR_MODULE.logistique, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Package size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Référentiel matériel</h2>
          <p className="text-sm text-white/80">{materiel.length} article(s)</p>
        </div>
        {!lectureSeule && (
          <button onClick={openNew}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/30 bg-white/15 px-3 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25">
            <Plus size={14} /> Ajouter
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500">Gérez le catalogue matériel : coût d'achat, tarif de location et unité. La liste complète pourra être importée ultérieurement.</p>
      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Matériel' },
            { key: 'cat', label: 'Catégorie', render: (r) => <Badge tone="neutral">{r.cat}</Badge> },
            { key: 'unite', label: 'Unité' },
            { key: 'coutAchat', label: 'Coût achat', align: 'right', render: (r) => formatMoney(r.coutAchat) },
            { key: 'tarifLocation', label: 'Tarif location', align: 'right', render: (r) => formatMoney(r.tarifLocation) },
            { key: 'actions', label: '', align: 'right', render: (r) => lectureSeule ? null : (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ ...r, isNew: false })} className="rounded p-1.5 hover:bg-gray-100">✏️</button>
                {isFullAccessRole(role) && (
                  <button onClick={() => { if (confirm(`Supprimer ${r.nom} ?`)) removeMateriel(r.id) }} className="text-red-500"><Trash2 size={16} /></button>
                )}
              </div>
            ) }
          ]}
          rows={materiel}
          empty="Aucun matériel."
        />
      </Card>

      <Card title="Types d'événements">
        <p className="mb-3 text-sm text-gray-500">Liste proposée lors de la saisie d'une prestation (mariage, funérailles…). Sert aux statistiques « quel événement sollicite le plus » dans le Pilotage.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {evenements.map((ev) => (
            <span key={ev} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
              {ev}
              {isFullAccessRole(role) && <button onClick={() => removeEvenement(ev)} className="text-gray-400 hover:text-red-500" title="Retirer"><Trash2 size={13} /></button>}
            </span>
          ))}
          {!evenements.length && <span className="text-sm text-gray-400">Aucun type d'événement.</span>}
        </div>
        {!lectureSeule && (
          <div className="flex gap-2">
            <Input value={newEv} onChange={(e) => setNewEv(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addEvenement()} placeholder="Nouveau type d'événement…" className="max-w-xs" />
            <Button variant="outline" onClick={addEvenement}><Plus size={16} /> Ajouter</Button>
          </div>
        )}
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

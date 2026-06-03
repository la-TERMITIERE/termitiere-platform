// Événements — vue Kanban (drag & drop entre statuts) + vue liste + modal détail.
import { useMemo, useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Plus, LayoutGrid, List, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import Table from '../../shared/ui/Table'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { STATUTS_EVENEMENT, ORDRE_STATUTS, TYPES_EVENEMENT, labelType, SERVICES } from './store/evenementielStore'

const empty = () => ({
  titre: '', type: 'mariage', dateDebut: todayStr(), dateFin: todayStr(), lieu: '',
  client: { nom: '', tel: '', email: '', adresse: '' },
  nombrePersonnes: 0, budget: 0, acompte: 0, statut: 'prospect', services: [], notes: ''
})

export default function Evenements() {
  const { data: evenements } = useCollection('evenementiel_evenements')
  const [vue, setVue] = useState('kanban')
  const [modal, setModal] = useState(null)

  const parStatut = useMemo(() => {
    const map = {}; ORDRE_STATUTS.forEach((s) => (map[s] = []))
    evenements.forEach((e) => { if (map[e.statut]) map[e.statut].push(e) })
    return map
  }, [evenements])

  async function onDragEnd(result) {
    const { destination, draggableId, source } = result
    if (!destination || destination.droppableId === source.droppableId) return
    await updateItem('evenementiel_evenements', draggableId, { statut: destination.droppableId })
    await audit('evenementiel', 'STATUT', `${draggableId} → ${destination.droppableId}`)
    toast.success(`Statut → ${STATUTS_EVENEMENT[destination.droppableId].label}`)
  }

  async function save() {
    const e = modal.data
    if (!e.titre.trim()) return toast.error('Titre requis')
    if (modal.id) await updateItem('evenementiel_evenements', modal.id, e)
    else { await addItem('evenementiel_evenements', e); await audit('evenementiel', 'EVENEMENT', e.titre) }
    toast.success('Enregistré ✓'); setModal(null)
  }
  async function supprimer(e) { if (confirm(`Supprimer « ${e.titre} » ?`)) { await removeItem('evenementiel_evenements', e.id); toast.success('Supprimé') } }
  const toggleService = (s) => setModal((m) => {
    const has = m.data.services.includes(s)
    return { ...m, data: { ...m.data, services: has ? m.data.services.filter((x) => x !== s) : [...m.data.services, s] } }
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-white p-1">
          <button onClick={() => setVue('kanban')} className={`flex items-center gap-1 rounded px-3 py-1.5 text-sm font-semibold ${vue === 'kanban' ? 'bg-evenementiel text-white' : 'text-gray-600'}`}><LayoutGrid size={15} /> Kanban</button>
          <button onClick={() => setVue('liste')} className={`flex items-center gap-1 rounded px-3 py-1.5 text-sm font-semibold ${vue === 'liste' ? 'bg-evenementiel text-white' : 'text-gray-600'}`}><List size={15} /> Liste</button>
        </div>
        <Button className="ml-auto" style={{ background: '#7c3aed' }} onClick={() => setModal({ data: empty(), id: null })}><Plus size={16} /> Nouvel événement</Button>
      </div>

      {vue === 'kanban' ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {ORDRE_STATUTS.map((statut) => (
              <Droppable droppableId={statut} key={statut}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="rounded-xl bg-gray-100/70 p-2">
                    <p className="mb-2 flex items-center justify-between px-1 text-xs font-bold uppercase text-gray-600">
                      <span style={{ color: STATUTS_EVENEMENT[statut].color }}>{STATUTS_EVENEMENT[statut].label}</span>
                      <span className="rounded-full bg-white px-1.5">{parStatut[statut].length}</span>
                    </p>
                    <div className="space-y-2">
                      {parStatut[statut].map((e, i) => (
                        <Draggable draggableId={e.id} index={i} key={e.id}>
                          {(prov) => (
                            <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                              onClick={() => setModal({ data: { ...empty(), ...e }, id: e.id })}
                              className="cursor-pointer rounded-lg bg-white p-2.5 shadow-sm hover:shadow"
                              style={{ borderLeft: `3px solid ${STATUTS_EVENEMENT[statut].color}`, ...prov.draggableProps.style }}>
                              <p className="text-sm font-semibold text-gray-800">{e.titre}</p>
                              <p className="text-xs text-gray-400">{labelType(e.type)}</p>
                              <p className="mt-1 text-xs text-gray-500">{formatDateShort(e.dateDebut)}</p>
                              <p className="text-xs font-semibold" style={{ color: '#7c3aed' }}>{formatMoney(e.budget)}</p>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      ) : (
        <Card className="p-0">
          <Table
            columns={[
              { key: 'titre', label: 'Titre' },
              { key: 'type', label: 'Type', render: (r) => labelType(r.type) },
              { key: 'dateDebut', label: 'Date', render: (r) => formatDateShort(r.dateDebut) },
              { key: 'client', label: 'Client', render: (r) => r.client?.nom },
              { key: 'budget', label: 'Budget', align: 'right', render: (r) => formatMoney(r.budget) },
              { key: 'statut', label: 'Statut', render: (r) => <Badge tone={STATUTS_EVENEMENT[r.statut]?.tone}>{STATUTS_EVENEMENT[r.statut]?.label}</Badge> },
              { key: 'actions', label: '', align: 'right', render: (r) => (
                <div className="flex justify-end gap-1">
                  <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">✏️</button>
                  <button onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                </div>
              ) }
            ]}
            rows={[...evenements].sort((a, b) => (a.dateDebut < b.dateDebut ? 1 : -1))}
            empty="Aucun événement."
          />
        </Card>
      )}

      {/* Modal détail / édition */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="lg" title={modal?.id ? 'Événement' : 'Nouvel événement'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button style={{ background: '#7c3aed' }} onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Titre" required className="col-span-2"><Input value={modal.data.titre} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, titre: e.target.value } }))} /></FormGroup>
              <FormGroup label="Type"><Select value={modal.data.type} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, type: e.target.value } }))} options={TYPES_EVENEMENT} /></FormGroup>
              <FormGroup label="Statut"><Select value={modal.data.statut} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, statut: e.target.value } }))} options={ORDRE_STATUTS.map((s) => ({ value: s, label: STATUTS_EVENEMENT[s].label }))} /></FormGroup>
              <FormGroup label="Date début"><Input type="date" value={modal.data.dateDebut} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, dateDebut: e.target.value } }))} /></FormGroup>
              <FormGroup label="Date fin"><Input type="date" value={modal.data.dateFin} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, dateFin: e.target.value } }))} /></FormGroup>
              <FormGroup label="Lieu" className="col-span-2"><Input value={modal.data.lieu} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, lieu: e.target.value } }))} /></FormGroup>
              <FormGroup label="Client"><Input value={modal.data.client.nom} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, client: { ...m.data.client, nom: e.target.value } } }))} /></FormGroup>
              <FormGroup label="Téléphone"><Input value={modal.data.client.tel} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, client: { ...m.data.client, tel: e.target.value } } }))} /></FormGroup>
              <FormGroup label="Nombre de personnes"><Input type="number" min="0" value={modal.data.nombrePersonnes} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, nombrePersonnes: parseInt(e.target.value) || 0 } }))} /></FormGroup>
              <FormGroup label="Budget (FCFA)"><Input type="number" min="0" value={modal.data.budget} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, budget: parseInt(e.target.value) || 0 } }))} /></FormGroup>
              <FormGroup label="Acompte reçu"><Input type="number" min="0" value={modal.data.acompte} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, acompte: parseInt(e.target.value) || 0 } }))} /></FormGroup>
              <FormGroup label="Solde restant"><Input readOnly className="bg-gray-100" value={formatMoney((modal.data.budget || 0) - (modal.data.acompte || 0))} /></FormGroup>
            </div>
            <FormGroup label="Prestations incluses">
              <div className="flex flex-wrap gap-2">
                {SERVICES.map((s) => (
                  <button key={s} type="button" onClick={() => toggleService(s)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${modal.data.services.includes(s) ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </FormGroup>
            <FormGroup label="Notes internes"><textarea className="input-base" rows={2} value={modal.data.notes} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, notes: e.target.value } }))} /></FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}

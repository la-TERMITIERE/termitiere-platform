// Clients logistique & événementiel.
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import { useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isReadOnlyRole, isFullAccessRole } from '../../core/roles'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { COULEUR_MODULE } from '../../utils/color'

const empty = () => ({ nom: '', telephone: '', email: '', adresse: '' })

export default function Clients() {
  const { data: clients } = useCollection('logistique_clients')
  const role = useAuth((s) => s.role)
  const lectureSeule = isReadOnlyRole(role)
  const [recherche, setRecherche] = useState('')
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
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.9) 0%, rgba(26,26,26,0.85) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR_MODULE.logistique, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Users size={28} color="white" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Clients</h2>
          <p className="text-sm text-white/80">{clients.length} client(s)</p>
        </div>
        <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un client…" />
        {!lectureSeule && (
          <button onClick={() => setModal({ data: empty(), id: null })}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/30 bg-white/15 px-3 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/25">
            <Plus size={14} /> Nouveau client
          </button>
        )}
      </div>
      <Card className="p-0">
        <Table searchBy={['nom', 'contact', 'telephone']} searchQuery={recherche}
          columns={[
            { key: 'nom', label: 'Nom' },
            { key: 'telephone', label: 'Téléphone' },
            { key: 'email', label: 'E-mail' },
            { key: 'actions', label: '', align: 'right', render: (r) => lectureSeule ? null : (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 hover:bg-gray-100">✏️</button>
                {isFullAccessRole(role) && (
                  <button onClick={() => { if (confirm(`Supprimer ${r.nom} ?`)) removeItem('logistique_clients', r.id) }} className="text-red-500"><Trash2 size={16} /></button>
                )}
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

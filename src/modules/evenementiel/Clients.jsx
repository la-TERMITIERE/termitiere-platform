// Clients briqueterie.
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
import { isReadOnlyRole } from '../../core/roles'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'

const empty = () => ({ nom: '', telephone: '', adresse: '', profession: '' })

// Professions courantes (statistiques) — l'utilisateur peut aussi saisir la sienne.
const PROFESSIONS = ['Maçon', 'Architecte', 'Entrepreneur BTP', 'Ingénieur', 'Promoteur immobilier', 'Particulier', 'Revendeur', 'Autre']

export default function Clients() {
  const { data: clients } = useCollection('evenementiel_clients')
  const role = useAuth((s) => s.role)
  const lectureSeule = isReadOnlyRole(role)
  const [modal, setModal] = useState(null)

  async function save() {
    const c = modal.data
    if (!c.nom.trim()) return toast.error('Nom requis')
    if (modal.id) await updateItem('evenementiel_clients', modal.id, c)
    else await addItem('evenementiel_clients', c)
    toast.success('Enregistré ✓')
    setModal(null)
  }

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(124,58,237,0.35),0_8px_20px_-8px_rgba(124,58,237,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.85) 0%, rgba(76,29,149,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#7c3aed', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Users size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Clients</h2>
          <p className="text-sm text-white/80">Répertoire des clients de la Briqueterie</p>
        </div>
      </div>

      {!lectureSeule && <div className="flex justify-end"><Button onClick={() => setModal({ data: empty(), id: null })}><Plus size={16} /> Nouveau client</Button></div>}
      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Nom' },
            { key: 'profession', label: 'Profession', render: (r) => r.profession || '—' },
            { key: 'telephone', label: 'Téléphone' },
            { key: 'adresse', label: 'Adresse' },
            { key: 'actions', label: '', align: 'right', render: (r) => lectureSeule ? null : (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 hover:bg-gray-100">✏️</button>
                <button onClick={() => { if (confirm(`Supprimer ${r.nom} ?`)) removeItem('evenementiel_clients', r.id) }} className="text-red-500"><Trash2 size={16} /></button>
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
            <FormGroup label="Profession" hint="pour les statistiques (qui achète le plus)">
              <Input list="briq-professions" value={modal.data.profession || ''} placeholder="ex : Maçon, Architecte…"
                onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, profession: e.target.value } }))} />
              <datalist id="briq-professions">
                {PROFESSIONS.map((p) => <option key={p} value={p} />)}
              </datalist>
            </FormGroup>
            <FormGroup label="Téléphone"><Input value={modal.data.telephone} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, telephone: e.target.value } }))} /></FormGroup>
            <FormGroup label="Adresse"><Input value={modal.data.adresse} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, adresse: e.target.value } }))} /></FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}

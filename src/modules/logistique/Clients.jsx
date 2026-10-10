// Clients logistique & événementiel.
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import { useState } from 'react'
import { Trash2, Users, Pencil, Phone, Mail, Eye } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import ActionIcone from '../../shared/ui/ActionIcone'
import AvatarNom from '../../shared/ui/AvatarNom'
import ClientDetailModal from './ClientDetailModal'
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
  const [detail, setDetail] = useState(null)
  const [saving, setSaving] = useState(false)

  const cle = (x) => `${(x.nom || '').trim().toLowerCase()}|${(x.telephone || '').replace(/ /g, '')}`

  async function save() {
    if (saving) return // un second clic pendant l'enregistrement créait une fiche en double
    const c = modal.data
    if (!c.nom.trim()) return toast.error('Nom requis')
    if (clients.some((x) => x.id !== modal.id && cle(x) === cle(c))) return toast.error('Ce client existe déjà (même nom et même téléphone)')
    setSaving(true)
    try {
      if (modal.id) await updateItem('logistique_clients', modal.id, c)
      else await addItem('logistique_clients', c)
      toast.success('Enregistré ✓')
      setModal(null)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
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
      </div>
      <p className="text-sm text-gray-500">Les clients s'ajoutent automatiquement quand vous créez une prestation ou une location : inutile de les saisir ici avant.</p>
      <Card className="p-0">
        <Table searchBy={['nom', 'contact', 'telephone']} searchQuery={recherche} onRowClick={(r) => setDetail(r)}
          columns={[
            { key: 'nom', label: 'Nom', render: (r) => (
              <span className="flex items-center gap-2.5">
                <AvatarNom nom={r.nom} accent={COULEUR_MODULE.logistique} />
                <span className="font-semibold">{r.nom}</span>
              </span>
            ) },
            { key: 'telephone', label: 'Téléphone', render: (r) => r.telephone
              ? <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-gray-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]"><Phone size={12} className="text-red-500" />{r.telephone}</span>
              : <span className="text-gray-300">:</span> },
            { key: 'email', label: 'E-mail', render: (r) => r.email
              ? <span className="inline-flex items-center gap-1.5 text-xs text-gray-600"><Mail size={12} className="text-red-500" />{r.email}</span>
              : <span className="text-gray-300">:</span> },
            { key: 'actions', label: '', align: 'right', render: (r) => lectureSeule ? null : (
              <div className="flex justify-end gap-1">
                <ActionIcone icone={Eye} tone="voir" title="Voir la fiche" onClick={() => setDetail(r)} />
                <ActionIcone icone={Pencil} tone="modifier" title="Modifier" onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} />
                {isFullAccessRole(role) && (
                  <ActionIcone icone={Trash2} tone="supprimer" title="Supprimer" onClick={() => { if (confirm(`Supprimer ${r.nom} ?`)) removeItem('logistique_clients', r.id) }} />
                )}
              </div>
            ) }
          ]}
          rows={clients}
          empty="Aucun client pour le moment : ils apparaîtront dès la première prestation." emptyIcon={Users}
        />
      </Card>
      <ClientDetailModal client={detail} onClose={() => setDetail(null)} />

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier' : 'Nouveau client'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save} loading={saving}>Enregistrer</Button></>}>
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

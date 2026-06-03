// Gestion des utilisateurs de la plateforme (portail, admin uniquement).
// Permet d'attribuer à chaque utilisateur ses droits d'accès aux modules.
import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, ShieldCheck } from 'lucide-react'
import Card from '../shared/ui/Card'
import Button from '../shared/ui/Button'
import Modal from '../shared/ui/Modal'
import Table from '../shared/ui/Table'
import Badge from '../shared/ui/Badge'
import FormGroup from '../shared/forms/FormGroup'
import Input from '../shared/forms/Input'
import Select from '../shared/forms/Select'
import { useUsersStore } from '../core/users'
import { isFirebaseConfigured } from '../core/firebase'
import { toast } from '../core/notifications'
import { MODULES } from '../shared/modules'

const ROLES = [
  { value: 'admin', label: 'Administrateur' },
  { value: 'controleur', label: 'Contrôleur' },
  { value: 'agent', label: 'Agent' }
]

const empty = () => ({ nom: '', login: '', pass: '', role: 'agent', modules: [], secteur: '', actif: true })

export default function Utilisateurs() {
  const { users, loading, load, saveUser, removeUser } = useUsersStore()
  const [modal, setModal] = useState(null) // { data, isNew }

  useEffect(() => { load() }, [load])

  function openNew() { setModal({ data: empty(), isNew: true }) }
  function openEdit(u) { setModal({ data: { ...empty(), ...u, pass: u.pass || '' }, isNew: false }) }

  function toggleModule(id) {
    setModal((m) => {
      const has = m.data.modules.includes(id)
      return { ...m, data: { ...m.data, modules: has ? m.data.modules.filter((x) => x !== id) : [...m.data.modules, id] } }
    })
  }

  async function submit() {
    const u = modal.data
    if (!u.nom.trim() || !u.login.trim()) return toast.error('Nom et identifiant requis')
    if (modal.isNew && users.some((x) => x.login === u.login)) return toast.error('Cet identifiant existe déjà')
    if (modal.isNew && !u.pass && !isFirebaseConfigured) return toast.error('Définissez un mot de passe')
    // L'admin a accès à tous les modules par défaut
    const modules = u.role === 'admin' ? MODULES.map((m) => m.id) : u.modules
    await saveUser({ ...u, modules })
    toast.success(modal.isNew ? 'Utilisateur créé ✓' : 'Utilisateur mis à jour ✓')
    setModal(null)
  }

  async function supprimer(u) {
    if (u.login === 'admin') return toast.error("Le compte admin principal ne peut pas être supprimé")
    if (!confirm(`Supprimer l'utilisateur « ${u.nom} » ?`)) return
    await removeUser(u)
    toast.success('Utilisateur supprimé')
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck size={24} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold text-gray-900">Gestion des utilisateurs</h1>
          <p className="text-sm text-gray-500">Attribuez les rôles et les accès aux modules.</p>
        </div>
        <Button onClick={openNew}><Plus size={16} /> Nouvel utilisateur</Button>
      </div>

      {isFirebaseConfigured && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Mode Firebase : la création du compte d'authentification se fait dans la console Firebase.
          Ici vous gérez les profils et les droits d'accès (collection <code>users</code>).
        </div>
      )}

      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Nom' },
            { key: 'login', label: 'Identifiant', render: (r) => <span className="font-mono text-xs">{r.login}</span> },
            { key: 'role', label: 'Rôle', render: (r) => <Badge tone={r.role === 'admin' ? 'primary' : r.role === 'controleur' ? 'info' : 'neutral'}>{r.role}</Badge> },
            { key: 'modules', label: 'Accès modules', render: (r) => (
              <div className="flex flex-wrap gap-1">
                {r.role === 'admin'
                  ? <Badge tone="primary">Tous</Badge>
                  : (r.modules || []).length
                    ? (r.modules || []).map((id) => {
                        const m = MODULES.find((x) => x.id === id)
                        return <span key={id} className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: m?.color || '#888' }}>{m?.nom || id}</span>
                      })
                    : <span className="text-xs text-gray-400">Aucun</span>}
              </div>
            ) },
            { key: 'actif', label: 'Statut', align: 'center', render: (r) => r.actif === false ? <Badge tone="danger">Inactif</Badge> : <Badge tone="success">Actif</Badge> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => openEdit(r)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>
                <button onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            ) }
          ]}
          rows={users}
          rowKey="login"
          loading={loading}
          empty={loading ? 'Chargement…' : 'Aucun utilisateur.'}
        />
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.isNew ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={submit}>Enregistrer</Button></>}
      >
        {modal && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Nom complet" required><Input value={modal.data.nom} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, nom: e.target.value } }))} /></FormGroup>
              <FormGroup label="Identifiant" required>
                <Input value={modal.data.login} disabled={!modal.isNew} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, login: e.target.value.trim() } }))} />
              </FormGroup>
              <FormGroup label="Rôle"><Select value={modal.data.role} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, role: e.target.value } }))} options={ROLES} /></FormGroup>
              <FormGroup label="Secteur"><Input value={modal.data.secteur} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, secteur: e.target.value } }))} /></FormGroup>
              {!isFirebaseConfigured && (
                <FormGroup label={modal.isNew ? 'Mot de passe' : 'Réinitialiser le mot de passe'} className="col-span-2" hint={modal.isNew ? '' : 'Laissez vide pour conserver l\'actuel'}>
                  <Input type="text" value={modal.data.pass} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, pass: e.target.value } }))} placeholder="••••••" />
                </FormGroup>
              )}
            </div>

            <FormGroup label="Accès aux modules">
              {modal.data.role === 'admin' ? (
                <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary-dark">
                  L'administrateur a accès à tous les modules.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {MODULES.map((m) => {
                    const active = modal.data.modules.includes(m.id)
                    return (
                      <button key={m.id} type="button" onClick={() => toggleModule(m.id)}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
                        style={active
                          ? { background: m.color, borderColor: m.color, color: '#fff' }
                          : { borderColor: '#e5e7eb', color: '#475569' }}>
                        <m.icon size={16} /> {m.nom}
                      </button>
                    )
                  })}
                </div>
              )}
            </FormGroup>

            <FormGroup label="Compte actif">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={modal.data.actif !== false} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, actif: e.target.checked } }))} />
                Autoriser la connexion
              </label>
            </FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}

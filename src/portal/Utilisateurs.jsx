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
import { ROLES, isViewAllRole, roleLabel, roleTone } from '../core/roles'
import { CAT_ANIMAUX } from '../modules/agro/data'
import { SITES } from '../modules/logistique/site/useSite'

// Par défaut, un agent peut saisir TOUTES les catégories (l'admin restreint en
// décochant). Un agent hérité (sans ce champ) conserve donc l'accès complet.
// De même, un compte Maxi Logistique accède par défaut aux deux sites (Lomé & Kara).
const empty = () => ({ nom: '', login: '', pass: '', role: 'agent', modules: [], agroCategories: [...CAT_ANIMAUX], logistiqueSites: SITES.map((s) => s.id), secteur: '', poste: '', telephone: '', actif: true })

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

  // Matrice de droits de saisie par catégorie d'animaux (Maxi-Agro).
  function toggleAgroCat(cat) {
    setModal((m) => {
      const cur = m.data.agroCategories || []
      const has = cur.includes(cat)
      return { ...m, data: { ...m.data, agroCategories: has ? cur.filter((x) => x !== cat) : [...cur, cat] } }
    })
  }

  // Sites Maxi Logistique autorisés (Lomé / Kara).
  function toggleLogSite(id) {
    setModal((m) => {
      const cur = m.data.logistiqueSites || []
      const has = cur.includes(id)
      return { ...m, data: { ...m.data, logistiqueSites: has ? cur.filter((x) => x !== id) : [...cur, id] } }
    })
  }

  async function submit() {
    const u = modal.data
    if (!u.nom.trim() || !u.login.trim()) return toast.error('Nom et identifiant requis')
    if (modal.isNew && users.some((x) => x.login === u.login)) return toast.error('Cet identifiant existe déjà')
    if (modal.isNew && !u.pass) return toast.error('Définissez un mot de passe')
    // Les rôles « voit tout » (super-admin, PAU, GE, superviseur) reçoivent tous les modules.
    const modules = isViewAllRole(u.role) ? MODULES.map((m) => m.id) : u.modules
    try {
      await saveUser({ ...u, modules })
      toast.success(modal.isNew ? 'Utilisateur créé ✓' : 'Utilisateur mis à jour ✓')
      setModal(null)
    } catch (e) {
      toast.error("Échec de l'enregistrement : " + (e?.message || e))
    }
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
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          🟢 Synchronisation cloud active : les comptes et les droits sont partagés
          en temps réel entre tous les appareils.
        </div>
      )}

      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Nom' },
            { key: 'poste', label: 'Poste', render: (r) => r.poste || <span className="text-xs text-gray-400">—</span> },
            { key: 'login', label: 'Identifiant', render: (r) => <span className="font-mono text-xs">{r.login}</span> },
            { key: 'role', label: 'Rôle', render: (r) => <Badge tone={roleTone(r.role)}>{roleLabel(r.role)}</Badge> },
            { key: 'modules', label: 'Accès modules', render: (r) => (
              <div className="flex flex-wrap gap-1">
                {isViewAllRole(r.role)
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
              <FormGroup label="Poste (fonction dans l'entreprise)" className="col-span-2" hint="Ex. Comptable, Responsable RH, Gérant… — affiché notamment quand cette personne est choisie comme bénéficiaire d'un décaissement.">
                <Input value={modal.data.poste} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, poste: e.target.value } }))} placeholder="ex: Comptable" />
              </FormGroup>
              <FormGroup label="Téléphone WhatsApp" className="col-span-2" hint="Format international, ex. 22890094949 — pour les alertes WhatsApp">
                <Input value={modal.data.telephone} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, telephone: e.target.value } }))} placeholder="22890000000" />
              </FormGroup>
              <FormGroup label={modal.isNew ? 'Mot de passe' : 'Réinitialiser le mot de passe'} className="col-span-2" hint={modal.isNew ? '' : 'Laissez vide pour conserver l\'actuel'}>
                <Input type="text" value={modal.data.pass} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, pass: e.target.value } }))} placeholder="••••••" />
              </FormGroup>
            </div>

            <FormGroup label="Accès aux modules">
              {isViewAllRole(modal.data.role) ? (
                <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary-dark">
                  Ce rôle ({roleLabel(modal.data.role)}) voit tous les modules{modal.data.role === 'superviseur' ? ' (en lecture seule)' : ''}.
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

            {/* Matrice de droits de saisie par espèce (Maxi-Agro) — agents uniquement */}
            {modal.data.role === 'agent' && modal.data.modules.includes('agro') && (
              <FormGroup label="Droits de saisie par espèce (Maxi-Agro)"
                hint="Cochez les catégories que cet agent peut saisir. Aucune cochée = l'agent ne saisit aucune espèce.">
                <div className="flex flex-wrap gap-2">
                  {CAT_ANIMAUX.map((cat) => {
                    const active = (modal.data.agroCategories || []).includes(cat)
                    return (
                      <button key={cat} type="button" onClick={() => toggleAgroCat(cat)}
                        className="rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors"
                        style={active
                          ? { background: '#2EAA3F', borderColor: '#2EAA3F', color: '#fff' }
                          : { borderColor: '#e5e7eb', color: '#475569' }}>
                        {active ? '✓ ' : ''}{cat}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1 text-[11px] text-gray-400">
                  Astuce : laissez tout décoché et l'agent n'aura accès à aucune saisie d'animaux ; cochez une ou plusieurs catégories pour l'autoriser.
                </p>
              </FormGroup>
            )}

            {/* Sites Maxi Logistique (Lomé / Kara) — rôles non « voit tout » ayant le module */}
            {!isViewAllRole(modal.data.role) && modal.data.modules.includes('logistique') && (
              <FormGroup label="Sites Maxi Logistique autorisés"
                hint="Choisissez le(s) site(s) auxquels ce compte a accès. Aucun coché = accès à aucun site logistique.">
                <div className="flex flex-wrap gap-2">
                  {SITES.map((s) => {
                    const active = (modal.data.logistiqueSites || []).includes(s.id)
                    return (
                      <button key={s.id} type="button" onClick={() => toggleLogSite(s.id)}
                        className="rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors"
                        style={active
                          ? { background: s.accent, borderColor: s.accent, color: '#fff' }
                          : { borderColor: '#e5e7eb', color: '#475569' }}>
                        {active ? '✓ ' : ''}{s.emoji} {s.label}
                      </button>
                    )
                  })}
                </div>
              </FormGroup>
            )}

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

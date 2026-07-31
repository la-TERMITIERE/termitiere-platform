// Gestion des utilisateurs de la plateforme (portail, admin uniquement).
// Permet d'attribuer à chaque utilisateur ses droits d'accès aux modules.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, ShieldCheck, Eye } from 'lucide-react'
import Card from '../shared/ui/Card'
import Button from '../shared/ui/Button'
import Modal from '../shared/ui/Modal'
import Table from '../shared/ui/Table'
import Badge from '../shared/ui/Badge'
import FormGroup from '../shared/forms/FormGroup'
import Input from '../shared/forms/Input'
import Select from '../shared/forms/Select'
import ChampAutocomplete from '../shared/forms/ChampAutocomplete'
import { useUsersStore } from '../core/users'
import { isFirebaseConfigured } from '../core/firebase'
import { toast } from '../core/notifications'
import { MODULES, MODULE_NAV } from '../shared/modules'
import { ROLES, isViewAllRole, isReadOnlyRole, roleLabel, roleTone, canManagePartenaires } from '../core/roles'
import { CAT_ANIMAUX } from '../modules/agro/data'
import { SITES } from '../modules/logistique/site/useSite'

// Par défaut, un agent peut saisir TOUTES les catégories (l'admin restreint en
// décochant). Un agent hérité (sans ce champ) conserve donc l'accès complet.
// De même, un compte Maxi Logistique accède par défaut aux deux sites (Lomé & Kara).
const empty = () => ({ nom: '', login: '', pass: '', role: 'agent', modules: [], agroCategories: [...CAT_ANIMAUX], logistiqueSites: SITES.map((s) => s.id), gerePartenaires: false, secteur: '', poste: '', telephone: '', actif: true })

// Suggestions par défaut — complétées par les valeurs déjà utilisées par les autres comptes.
// Secteurs = noms des modules de la plateforme (reste synchronisé si un module est ajouté/renommé).
const SECTEURS_DEFAUT = MODULES.map((m) => m.nom)
const POSTES_DEFAUT = ['Gérant', 'Comptable', 'Responsable RH', 'Chef de projet', 'Chef de chantier', 'Secrétaire', 'Agent de saisie', 'Superviseur', 'Tata', 'Chauffeur', 'Magasinier']

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`
}

export default function Utilisateurs() {
  const { users, loading, load, saveUser, removeUser } = useUsersStore()
  const [modal, setModal] = useState(null) // { data, isNew }
  const [detailUser, setDetailUser] = useState(null)

  useEffect(() => { load() }, [load])

  // Suggestions Secteur/Poste : valeurs par défaut + celles déjà saisies par d'autres comptes.
  const secteursSuggestions = useMemo(() =>
    [...new Set([...SECTEURS_DEFAUT, ...users.map((u) => u.secteur).filter(Boolean)])].sort((a, b) => a.localeCompare(b)),
  [users])
  const postesSuggestions = useMemo(() =>
    [...new Set([...POSTES_DEFAUT, ...users.map((u) => u.poste).filter(Boolean)])].sort((a, b) => a.localeCompare(b)),
  [users])

  function openNew() { setModal({ data: empty(), isNew: true }) }
  function openEdit(u) { setModal({ data: { ...empty(), ...u, pass: u.pass || '' }, isNew: false }) }

  // Volets visibles par cet utilisateur dans un module donné — même règle que la
  // nav réelle (cf. Sidebar.jsx → canSeeNav) : rôle explicite (`roles`) ou permission
  // individuelle (`perm`, ex. gerePartenaires) ; sans l'un ou l'autre, ouvert à tous.
  function voletsVisibles(u, moduleId) {
    const canSee = (item) => {
      if (item.roles && item.roles.includes(u.role)) return true
      if (item.perm === 'partenaires' && canManagePartenaires(u.role, u)) return true
      return !item.roles && !item.perm
    }
    return (MODULE_NAV[moduleId] || []).filter(canSee)
  }

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
                <button onClick={() => setDetailUser(r)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" title="Voir les détails d'accès"><Eye size={16} /></button>
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
              <FormGroup label="Secteur">
                <ChampAutocomplete
                  value={modal.data.secteur}
                  onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, secteur: v } }))}
                  suggestions={secteursSuggestions}
                />
              </FormGroup>
              <FormGroup label="Poste (fonction dans l'entreprise)" className="col-span-2" hint="Ex. Comptable, Responsable RH, Gérant… — affiché notamment quand cette personne est choisie comme bénéficiaire d'un décaissement.">
                <ChampAutocomplete
                  value={modal.data.poste}
                  onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, poste: v } }))}
                  suggestions={postesSuggestions}
                  placeholder="ex: Comptable"
                />
              </FormGroup>
              <FormGroup label="Téléphone WhatsApp" className="col-span-2" hint="Format international, ex. 22890094949 — pour les alertes WhatsApp">
                <Input value={modal.data.telephone} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, telephone: e.target.value } }))} placeholder="22890000000" />
              </FormGroup>
              <FormGroup label={modal.isNew ? 'Mot de passe' : 'Réinitialiser le mot de passe'} className="col-span-2" hint={modal.isNew ? '' : 'Laissez vide pour conserver l\'actuel'}>
                <Input type="text" value={modal.data.pass} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, pass: e.target.value } }))} placeholder="••••••" />
              </FormGroup>
            </div>

            <FormGroup label="Accès aux modules">
              {modal.data.role === 'partenaire' && (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  🤝 <strong>Partenaire</strong> : lecture seule stricte. Il consultera uniquement les modules cochés
                  ci-dessous (tableaux de bord, pilotage, historiques) sans pouvoir rien créer, modifier ou approuver.
                </p>
              )}
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

            {/* Droit de gérer l'onglet « Partenaires » (contacts externes) — hors rôles « voit tout » qui l'ont déjà */}
            {!isViewAllRole(modal.data.role) && (
              <FormGroup label="Gestion des partenaires"
                hint="Donne la main à cet utilisateur pour créer / modifier les partenaires (contacts externes) dans ses modules. Ce ne sont pas des employés.">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={modal.data.gerePartenaires === true} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, gerePartenaires: e.target.checked } }))} />
                  Autoriser la gestion des partenaires
                </label>
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

      <Modal
        open={!!detailUser}
        onClose={() => setDetailUser(null)}
        title={detailUser ? `Accès de ${detailUser.nom}` : ''}
        footer={<Button variant="ghost" onClick={() => setDetailUser(null)}>Fermer</Button>}
        overlayClassName="bg-gradient-to-br from-[#1A1A1A]/75 via-[#6B1A10]/55 to-[#BC3C31]/45 backdrop-blur-sm"
        panelClassName="relative overflow-hidden border border-white/60 bg-white/75 backdrop-blur-2xl"
      >
        {detailUser && (
          <div className="relative space-y-4">
            {/* Halos décoratifs LA TERMITIÈRE — rouge brique + anthracite */}
            <div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full opacity-40 blur-3xl" style={{ background: '#BC3C31' }} />
            <div className="pointer-events-none absolute -bottom-24 -left-16 -z-10 h-56 w-56 rounded-full opacity-30 blur-3xl" style={{ background: '#1A1A1A' }} />

            {/* En-tête utilisateur — carte verre dépoli */}
            <div
              className="flex items-center gap-3 rounded-xl border p-3 shadow-sm backdrop-blur-md"
              style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.35))', borderColor: 'rgba(188,60,49,0.22)' }}
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-extrabold text-white shadow-md ring-2 ring-white/60"
                style={{ background: 'linear-gradient(135deg, #D9594B, #8F2A20)' }}
              >
                {(detailUser.nom || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-900">{detailUser.nom}</p>
                <p className="truncate text-xs text-gray-500">{detailUser.poste || detailUser.login}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Badge tone={roleTone(detailUser.role)}>{roleLabel(detailUser.role)}</Badge>
                {isReadOnlyRole(detailUser.role) && <Badge tone="info">Lecture seule</Badge>}
                {isViewAllRole(detailUser.role) && <Badge tone="primary">Tous les modules</Badge>}
              </div>
            </div>

            {(isViewAllRole(detailUser.role) ? MODULES : MODULES.filter((m) => (detailUser.modules || []).includes(m.id))).length === 0 && (
              <p className="rounded-xl border border-dashed border-gray-200 bg-white/60 p-4 text-center text-sm text-gray-400 backdrop-blur-md">
                Aucun accès module attribué.
              </p>
            )}

            {/* Cartes modules — verre dépoli léger */}
            {(isViewAllRole(detailUser.role) ? MODULES : MODULES.filter((m) => (detailUser.modules || []).includes(m.id))).map((m) => {
              const volets = voletsVisibles(detailUser, m.id)
              return (
                <div key={m.id} className="overflow-hidden rounded-xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-md transition-shadow hover:shadow-md">
                  <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ background: hexToRgba(m.color, 0.1), borderBottom: `1px solid ${hexToRgba(m.color, 0.18)}` }}>
                    <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow-sm" style={{ background: m.color }}>
                      <m.icon size={12} /> {m.nom}
                    </span>
                    {m.id === 'logistique' && (
                      <span className="text-xs font-medium text-gray-500">
                        {(detailUser.logistiqueSites || []).length ? detailUser.logistiqueSites.join(' · ') : 'aucun site'}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold shadow-sm" style={{ color: m.color }}>
                      {volets.length} volet{volets.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  {volets.length ? (
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 p-3">
                      {volets.map((v) => (
                        <li key={v.to} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-white">
                          <v.icon size={14} className="shrink-0 text-gray-400" />
                          <span className="truncate">{v.label}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="p-3 text-xs text-gray-400">Aucun volet accessible.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}

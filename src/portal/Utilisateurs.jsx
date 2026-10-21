// Gestion des utilisateurs de la plateforme (portail, admin uniquement).
// Permet d'attribuer à chaque utilisateur ses droits d'accès aux modules.
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, ShieldCheck, Eye, UserPlus, Users, UserCheck, UserX, Lock } from 'lucide-react'
import { glassModalProps, avatarGradient, icone3D } from '../utils/color'
import AccesUtilisateur from './AccesUtilisateur'
import StatCard from '../shared/ui/StatCard'
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
import { useAuth } from '../hooks/useAuth'
import { isFirebaseConfigured } from '../core/firebase'
import { toast } from '../core/notifications'
import { MODULES } from '../shared/modules'
import { ROLES, isViewAllRole, isReadOnlyRole, roleLabel, roleTone } from '../core/roles'
import { CAT_ANIMAUX } from '../modules/agro/data'
import { SITES } from '../modules/logistique/site/useSite'
import { SITES as GYM_SITES } from '../modules/gym/site/useSite'

// Par défaut, un agent peut saisir TOUTES les catégories (l'admin restreint en
// décochant). Un agent hérité (sans ce champ) conserve donc l'accès complet.
// De même, un compte Maxi Logistique / MAXI-GYM accède par défaut aux deux sites (Lomé & Kara).
const empty = () => ({ nom: '', login: '', pass: '', role: 'agent', modules: [], agroCategories: [...CAT_ANIMAUX], logistiqueSites: SITES.map((s) => s.id), gymSites: GYM_SITES.map((s) => s.id), gerePartenaires: false, droitsModules: {}, secteur: '', poste: '', telephone: '', actif: true })

// Suggestions par défaut — complétées par les valeurs déjà utilisées par les autres comptes.
// Secteurs = noms des modules de la plateforme (reste synchronisé si un module est ajouté/renommé).
const SECTEURS_DEFAUT = MODULES.map((m) => m.nom)
const POSTES_DEFAUT = ['Gérant', 'Comptable', 'Responsable RH', 'Chef de projet', 'Chef de chantier', 'Secrétaire', 'Agent de saisie', 'Superviseur', 'Tata', 'Chauffeur', 'Magasinier']

export default function Utilisateurs() {
  const { users, loading, load, saveUser, removeUser } = useUsersStore()
  const moi = useAuth((s) => s.user)
  const roleMoi = useAuth((s) => s.role)
  // Info a la main sur tous les comptes, y compris l'admin principal (suppression, désactivation) ; les autres rôles ne touchent pas à ce compte.
  const compteAdminProtege = (u) => u.login === 'admin' && roleMoi !== 'info'
  const [basculeEnCours, setBasculeEnCours] = useState(null) // login dont le statut est en cours de changement
  const [modal, setModal] = useState(null) // { data, isNew }
  const [detailLogin, setDetailLogin] = useState(null)
  // La fiche d'accès relit toujours l'utilisateur dans la liste : un droit modifié s'affiche aussitôt.
  const detailUser = useMemo(() => users.find((u) => u.login === detailLogin) || null, [users, detailLogin])

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

  // Sites MAXI-GYM autorisés (Lomé / Kara).
  function toggleGymSite(id) {
    setModal((m) => {
      const cur = m.data.gymSites || []
      const has = cur.includes(id)
      return { ...m, data: { ...m.data, gymSites: has ? cur.filter((x) => x !== id) : [...cur, id] } }
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

  const nbActifs = users.filter((u) => u.actif !== false).length
  const nbInactifs = users.length - nbActifs
  const nbLecture = users.filter((u) => isReadOnlyRole(u.role) || Object.values(u.droitsModules || {}).includes('lecture')).length

  // Interrupteur Actif / Inactif d'un compte (petit, en haut à droite de la carte).
  function statutSwitch(r) {
    const actif = r.actif !== false
    const protege = compteAdminProtege(r) || r.login === moi?.login
    return (
      <button type="button" role="switch" aria-checked={actif} disabled={protege || basculeEnCours === r.login}
        onClick={(e) => { e.stopPropagation(); basculerActif(r) }}
        title={protege ? (r.login === moi?.login ? 'Vous ne pouvez pas désactiver votre propre compte' : 'Seul Info peut désactiver ce compte') : actif ? 'Cliquer pour désactiver le compte' : 'Cliquer pour réactiver le compte'}
        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border py-0.5 pl-1 pr-2 text-[11px] font-extrabold backdrop-blur-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${actif ? 'border-emerald-300/70 bg-emerald-100/70 text-emerald-700' : 'border-red-300/70 bg-red-100/70 text-red-700'}`}>
        <span className={`relative h-3.5 w-6 rounded-full transition-colors ${actif ? 'bg-emerald-500' : 'bg-red-400'}`}>
          <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-all ${actif ? 'left-3' : 'left-0.5'}`} />
        </span>
        {actif ? 'Actif' : 'Inactif'}
      </button>
    )
  }

  // Active ou désactive un compte : un compte inactif ne peut plus se connecter (et une session ouverte est fermée).
  // On ne peut pas désactiver le compte admin principal ni son propre compte.
  async function basculerActif(u) {
    if (compteAdminProtege(u)) return toast.error("Seul Info peut désactiver le compte admin principal")
    if (u.login === moi?.login) return toast.error('Vous ne pouvez pas désactiver votre propre compte')
    const desactiver = u.actif !== false
    if (desactiver && !confirm(`Désactiver le compte de « ${u.nom} » ?
Cette personne ne pourra plus se connecter.`)) return
    setBasculeEnCours(u.login)
    try {
      await saveUser({ ...u, actif: !desactiver })
      toast.success(desactiver ? `Compte de ${u.nom} désactivé` : `Compte de ${u.nom} réactivé ✓`)
    } catch (e) {
      toast.error('Échec : ' + (e?.message || e))
    } finally { setBasculeEnCours(null) }
  }

  async function supprimer(u) {
    if (compteAdminProtege(u)) return toast.error("Seul Info peut supprimer le compte admin principal")
    if (u.login === moi?.login) return toast.error('Vous ne pouvez pas supprimer votre propre compte')
    if (!confirm(`Supprimer l'utilisateur « ${u.nom} » ?`)) return
    // Sans ce try/catch, un refus des règles de la base échouait en SILENCE :
    // ni message d'erreur, ni confirmation — la suppression semblait simplement
    // « ne rien faire ». On affiche désormais la cause, comme pour la création.
    try {
      await removeUser(u)
      toast.success('Utilisateur supprimé')
    } catch (e) {
      toast.error('Échec de la suppression : ' + (e?.message || e))
    }
  }

  return (
    <div className="relative mx-auto max-w-5xl space-y-4">
      {/* Halos colorés derrière les cartes : donnent au verre dépoli quelque chose à flouter */}
      <div className="pointer-events-none absolute -left-24 top-40 -z-10 h-72 w-72 rounded-full opacity-30 blur-3xl" style={{ background: '#BC3C31' }} />
      <div className="pointer-events-none absolute -right-20 top-[28rem] -z-10 h-80 w-80 rounded-full opacity-25 blur-3xl" style={{ background: '#E8850F' }} />
      <div className="pointer-events-none absolute bottom-10 left-1/3 -z-10 h-64 w-64 rounded-full opacity-20 blur-3xl" style={{ background: '#0ea5e9' }} />
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-[2rem] p-4 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25),inset_0_1px_0_0_rgba(255,255,255,0.35),0_20px_40px_-16px_rgba(0,0,0,0.5),0_36px_72px_-20px_rgba(188,60,49,0.4)] backdrop-blur-2xl backdrop-saturate-200 sm:flex-row sm:items-center sm:gap-4 sm:p-6"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.92) 0%, rgba(90,20,16,0.92) 100%)' }}>
        <div className="pointer-events-none absolute -right-10 -top-14 h-56 w-56 rounded-full opacity-[0.15]" style={{ background: '#ffffff' }} />
        <div className="pointer-events-none absolute -bottom-16 left-1/4 h-40 w-40 rounded-full opacity-[0.08]" style={{ background: '#ffffff' }} />
        <div className="relative flex items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
            style={{ background: '#BC3C31', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55' }}
          >
            <ShieldCheck size={26} color="white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-extrabold sm:text-xl">Gestion des utilisateurs</h1>
            <p className="truncate text-sm text-white/80">{users.length} compte{users.length > 1 ? 's' : ''} : rôles et accès aux modules</p>
          </div>
        </div>
        <Button onClick={openNew} variant="ghost" className="relative w-full hover:opacity-90 sm:ml-auto sm:w-auto" style={{ background: '#ffffff', color: '#BC3C31' }}><Plus size={16} /> Nouvel utilisateur</Button>
      </div>

      {isFirebaseConfigured && (
        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 px-4 py-2.5 text-xs font-medium text-emerald-700 shadow-sm backdrop-blur-xl dark:bg-emerald-500/10 dark:text-emerald-400">
          🟢 Synchronisation cloud active : les comptes et les droits sont partagés
          en temps réel entre tous les appareils.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard glass title="Comptes" value={users.length} icon={Users} accent="#BC3C31" />
        <StatCard glass title="Actifs" value={nbActifs} icon={UserCheck} accent="#16a34a" />
        <StatCard glass title="Inactifs" value={nbInactifs} icon={UserX} accent="#dc2626" />
        <StatCard glass title="Avec lecture seule" value={nbLecture} icon={Lock} accent="#64748b" />
      </div>

      <p className="w-fit rounded-full border border-white/60 bg-white/50 px-3 py-1 text-xs font-medium text-gray-600 shadow-sm backdrop-blur-xl">Cliquez sur un utilisateur pour voir ses modules, ses volets et régler ses droits (lecture seule ou écriture) module par module.</p>

      <Card className="overflow-hidden !border-white/60 !bg-white/45 p-0 shadow-[0_20px_40px_-20px_rgba(188,60,49,0.35),inset_0_1px_0_0_rgba(255,255,255,0.7)] backdrop-blur-2xl backdrop-saturate-150">
        <Table searchBy={['nom', 'login', 'email']} onRowClick={(r) => setDetailLogin(r.login)}
          columns={[
            { key: 'nom', label: 'Utilisateur', render: (r) => (
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white ring-2 ring-white dark:ring-white/10"
                  style={{ background: avatarGradient(r.login || r.nom), boxShadow: '0 6px 12px -4px rgba(15,23,42,0.45), inset 0 2px 2px rgba(255,255,255,0.55), inset 0 -3px 5px rgba(0,0,0,0.25)' }}>
                  {(r.nom || '').trim().charAt(0).toUpperCase() || '?'}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-800 dark:text-gray-100">{r.nom}</p>
                  <p className="truncate text-xs text-gray-400 dark:text-gray-500">{r.poste || '—'}</p>
                </div>
              </div>
            ) },
            { key: 'login', label: 'Identifiant', render: (r) => <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">{r.login}</span> },
            { key: 'role', label: 'Rôle', render: (r) => <Badge tone={roleTone(r.role)}>{roleLabel(r.role)}</Badge> },
            { key: 'modules', label: 'Accès modules', render: (r) => {
              // Rôle « voit tout » : « Tous » tant qu'aucun module ne lui est retiré ; sinon, la liste de ceux qui lui restent.
              const retires = r.modulesRetires || []
              if (isViewAllRole(r.role) && !retires.length) return <Badge tone="primary">Tous</Badge>
              const ids = isViewAllRole(r.role) ? MODULES.map((m) => m.id).filter((id) => !retires.includes(id)) : (r.modules || [])
              if (!ids.length) return <span className="text-xs text-gray-400 dark:text-gray-500">Aucun</span>
              const lecture = (id) => r.droitsModules?.[id] === 'lecture'
              return (
                <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
                  {ids.slice(0, 3).map((id) => {
                    const m = MODULES.find((x) => x.id === id)
                    return (
                      <span key={id} title={`${m?.nom || id}${lecture(id) ? ' : lecture seule' : ''}`}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/80 bg-white/70 py-0.5 pl-0.5 pr-2 text-[10px] font-bold text-gray-700 shadow-sm backdrop-blur-md">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={icone3D(m?.color || '#888')}>{m?.icon && <m.icon size={11} />}</span>
                        {m?.nom || id}{lecture(id) && <Eye size={10} className="text-sky-600" />}
                      </span>
                    )
                  })}
                  {ids.length > 3 && <span title={ids.slice(3).map((id) => MODULES.find((x) => x.id === id)?.nom || id).join(', ')} className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">+{ids.length - 3}</span>}
                </div>
              )
            } },
            { key: 'actif', label: 'Statut', align: 'center', render: (r) => statutSwitch(r) },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={(e) => { e.stopPropagation(); setDetailLogin(r.login) }} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200" title="Voir les détails d'accès"><Eye size={16} /></button>
                <button onClick={(e) => { e.stopPropagation(); openEdit(r) }} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200" title="Modifier"><Pencil size={16} /></button>
                <button onClick={(e) => { e.stopPropagation(); supprimer(r) }} className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10" title="Supprimer"><Trash2 size={16} /></button>
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
        {...glassModalProps('#BC3C31')}
      >
        {modal && (
          <>
            {/* En-tête — aperçu du nom en direct */}
            <div className="relative mb-4 flex items-center gap-3 overflow-hidden rounded-2xl p-3.5 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
              style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.9) 0%, rgba(90,20,16,0.9) 100%)' }}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: '#BC3C31', boxShadow: '0 0 0 3px #ffffff, 0 0 10px 3px #ffffff55' }}>
                {modal.isNew ? <UserPlus size={20} color="white" /> : <Pencil size={18} color="white" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-extrabold leading-snug">{modal.data.nom || (modal.isNew ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur')}</p>
                <p className="text-xs text-white/80">{roleLabel(modal.data.role)}{modal.data.poste ? ` · ${modal.data.poste}` : ''}</p>
              </div>
            </div>

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
              <FormGroup label="Poste (fonction dans l'entreprise)" className="col-span-2" hint="Ex. Comptable, Responsable RH, Gérant… : affiché notamment quand cette personne est choisie comme bénéficiaire d'un décaissement.">
                <ChampAutocomplete
                  value={modal.data.poste}
                  onChange={(v) => setModal((m) => ({ ...m, data: { ...m.data, poste: v } }))}
                  suggestions={postesSuggestions}
                  placeholder="ex: Comptable"
                />
              </FormGroup>
              <FormGroup label="Téléphone WhatsApp" className="col-span-2" hint="Format international, ex. 22890094949 : pour les alertes WhatsApp">
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
              {modal.data.role === 'superviseur' && (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  👁️ <strong>Superviseur</strong> : lecture seule stricte, comme le Partenaire. Il ne voit QUE les
                  modules cochés ci-dessous : cochez-les pour lui donner accès.
                </p>
              )}
              {isViewAllRole(modal.data.role) ? (
                <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary-dark">
                  Ce rôle ({roleLabel(modal.data.role)}) voit tous les modules. Pour en retirer un module ou un volet à ce compte, ouvrez sa fiche d'accès (clic sur la ligne).
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

            {/* Salles MAXI-GYM (Lomé / Kara) — rôles non « voit tout » ayant le module */}
            {!isViewAllRole(modal.data.role) && modal.data.modules.includes('gym') && (
              <FormGroup label="Salles MAXI-GYM autorisées"
                hint="Choisissez la ou les salles auxquelles ce compte a accès. Aucune cochée = accès à aucune salle.">
                <div className="flex flex-wrap gap-2">
                  {GYM_SITES.map((s) => {
                    const active = (modal.data.gymSites || []).includes(s.id)
                    return (
                      <button key={s.id} type="button" onClick={() => toggleGymSite(s.id)}
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

      <AccesUtilisateur user={detailUser} onClose={() => setDetailLogin(null)} onSave={saveUser} />
    </div>
  )
}

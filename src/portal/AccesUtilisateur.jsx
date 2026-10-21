// Fiche d'accès d'un utilisateur : tous les modules et volets auxquels il a accès, avec, pour chaque module, un
// petit interrupteur « Lecture » / « CRUD ». Le réglage est enregistré tout de suite
// (`droitsModules` sur le profil) et appliqué par la couche de données (core/db.js).
import { useMemo, useState } from 'react'
import { Eye, EyeOff, Pencil, Lock, ShieldCheck, Layers, LayoutGrid, Phone, BadgeCheck, Ban, X, Plus, Check } from 'lucide-react'
import Modal from '../shared/ui/Modal'
import Button from '../shared/ui/Button'
import Badge from '../shared/ui/Badge'
import { avatarGradient } from '../utils/color'
import { toast } from '../core/notifications'
import { useAuth } from '../hooks/useAuth'
import { MODULES, MODULE_NAV } from '../shared/modules'
import { isViewAllRole, isReadOnlyRole, roleLabel, roleTone, canManagePartenaires, lectureImposeeParRole, moduleRoleOk, moduleRetire, voletRetire } from '../core/roles'

const rgba = (hex, a) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${a})`
}

// Volets visibles par cet utilisateur dans un module : même règle que la nav réelle (Sidebar → canSeeNav).
// Les entrées `{ heading }` ne sont que des séparateurs de section : on les écarte.
function voletsVisibles(u, moduleId) {
  const canSee = (item) => {
    if (item.roles && item.roles.includes(u.role)) return true
    if (item.perm === 'partenaires' && canManagePartenaires(u.role, u)) return true
    return !item.roles && !item.perm
  }
  return (MODULE_NAV[moduleId] || []).filter((item) => !item.heading).filter(canSee)
}

// Petit interrupteur à deux positions, dans l'en-tête du module : « Lecture » ou « CRUD » (créer, modifier, supprimer).
// Un curseur de verre coloré glisse d'une position à l'autre (gris pour Lecture, couleur du module pour CRUD).
function InterrupteurDroit({ ecriture, verrouille, couleur, onChange, occupe }) {
  const bouton = (id, Icone, texte, aide) => {
    const actif = ecriture === id
    return (
      <button type="button" disabled={verrouille || occupe} onClick={() => onChange(id)} aria-pressed={actif} title={aide}
        className={`relative z-10 flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1 text-[11px] font-extrabold transition-colors duration-300 disabled:cursor-not-allowed ${actif ? 'text-white' : 'text-gray-500 hover:text-gray-700'}`}>
        <Icone size={11} /> {texte}
      </button>
    )
  }
  const fond = ecriture ? `linear-gradient(135deg, ${couleur}, ${rgba(couleur, 0.78)})` : 'linear-gradient(135deg, #64748b, #94a3b8)'
  const lueur = ecriture ? rgba(couleur, 0.55) : 'rgba(100,116,139,0.5)'
  return (
    <div className={`relative ml-auto flex w-[9.5rem] shrink-0 items-center rounded-full border border-white/80 bg-white/55 p-0.5 shadow-[inset_0_1px_3px_rgba(15,23,42,0.1)] backdrop-blur-md ${verrouille ? 'opacity-60' : ''}`}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] overflow-hidden rounded-full transition-all duration-300 ease-out"
        style={{ background: fond, transform: ecriture ? 'translateX(100%)' : 'translateX(0)', boxShadow: `0 4px 10px -3px ${lueur}, inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 3px rgba(0,0,0,0.15)` }}>
        <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
      </span>
      {bouton(false, Eye, 'Lecture', 'Lecture seule : consulter sans rien modifier')}
      {bouton(true, Pencil, 'CRUD', 'Lecture et écriture : créer, modifier, supprimer')}
    </div>
  )
}

export default function AccesUtilisateur({ user, onClose, onSave }) {
  const [occupe, setOccupe] = useState(null) // id du module en cours d'enregistrement, ou 'tout'

  const moi = useAuth((st) => st.user)
  const tousModules = user ? isViewAllRole(user.role) : false
  // Rôle « voit tout » : tous les modules sauf ceux que Info lui a retirés. Autres rôles : les modules cochés sur le compte.
  const modules = useMemo(
    () => (!user ? [] : MODULES.filter((m) => moduleRoleOk(m.id, user.role) && (tousModules ? !moduleRetire(user, m.id) : (user.modules || []).includes(m.id)))),
    [user, tousModules]
  )
  // Modules que ce rôle pourrait avoir mais que le compte n'a pas (ou plus) : proposés à l'ajout.
  const nonAttribues = useMemo(
    () => (!user ? [] : MODULES.filter((m) => moduleRoleOk(m.id, user.role) && !modules.some((x) => x.id === m.id))),
    [user, modules]
  )
  const droits = user?.droitsModules || {}
  const enEcriture = (m) => !lectureImposeeParRole(user.role, m.id) && droits[m.id] !== 'lecture'
  const nbVolets = useMemo(() => (user ? modules.reduce((t, m) => t + voletsVisibles(user, m.id).filter((v) => !voletRetire(user, m.id, v.to)).length, 0) : 0), [user, modules])
  const nbLecture = user ? modules.filter((m) => !enEcriture(m)).length : 0

  // Enregistre le nouveau jeu de droits. On ne garde que les modules à « lecture » : absent = écriture selon le rôle.
  async function appliquer(nouveauxDroits, cle, message) {
    setOccupe(cle)
    try {
      await onSave({ ...user, droitsModules: nouveauxDroits })
      toast.success(message)
    } catch (e) {
      toast.error("Échec de l'enregistrement : " + (e?.message || e))
    } finally { setOccupe(null) }
  }

  // Retraits et ajouts de modules et de volets. On refuse de se modifier soi-même : un compte ne doit pas pouvoir se couper l'accès.
  function modifierAcces(modif, cle, message) {
    if (user.login === moi?.login) return toast.error('Vous ne pouvez pas modifier vos propres accès')
    setOccupe(cle)
    onSave({ ...user, ...modif })
      .then(() => toast.success(message))
      .catch((e) => toast.error("Échec de l'enregistrement : " + (e?.message || e)))
      .finally(() => setOccupe(null))
  }

  function retirerModule(m) {
    if (!confirm(`Retirer le module ${m.nom} à ${user.nom} ?\nIl ne le verra plus du tout.`)) return
    if (tousModules) modifierAcces({ modulesRetires: [...(user.modulesRetires || []), m.id] }, m.id, `${m.nom} retiré ✓`)
    else modifierAcces({ modules: (user.modules || []).filter((x) => x !== m.id) }, m.id, `${m.nom} retiré ✓`)
  }

  function ajouterModule(m) {
    if (tousModules) modifierAcces({ modulesRetires: (user.modulesRetires || []).filter((x) => x !== m.id) }, m.id, `${m.nom} rendu ✓`)
    else modifierAcces({ modules: [...(user.modules || []), m.id] }, m.id, `${m.nom} ajouté ✓`)
  }

  // Un volet retiré disparaît du menu et sa page n'est plus ouvrable. Le volet d'accueil du module reste toujours.
  function basculerVolet(m, v) {
    if (v.to === m.path) return
    const actuels = user.voletsRetires?.[m.id] || []
    const retire = actuels.includes(v.to)
    const suite = { ...(user.voletsRetires || {}), [m.id]: retire ? actuels.filter((x) => x !== v.to) : [...actuels, v.to] }
    if (!suite[m.id].length) delete suite[m.id]
    modifierAcces({ voletsRetires: suite }, `${m.id}:${v.to}`, retire ? `${v.label} rendu ✓` : `${v.label} retiré ✓`)
  }

  function changerModule(m, ecriture) {
    const suite = { ...droits }
    if (ecriture) delete suite[m.id]
    else suite[m.id] = 'lecture'
    appliquer(suite, m.id, ecriture ? `${m.nom} : lecture et écriture ✓` : `${m.nom} : lecture seule ✓`)
  }

  function toutChanger(ecriture) {
    const suite = {}
    if (!ecriture) modules.forEach((m) => { suite[m.id] = 'lecture' })
    appliquer(suite, 'tout', ecriture ? 'Tous les modules : lecture et écriture ✓' : 'Tous les modules : lecture seule ✓')
  }

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      size="lg"
      title={user ? `Accès de ${user.nom}` : ''}
      footer={<Button variant="ghost" onClick={onClose}>Fermer</Button>}
      overlayClassName="bg-gradient-to-br from-[#1A1A1A]/75 via-[#6B1A10]/55 to-[#BC3C31]/45 backdrop-blur-sm"
      panelClassName="relative overflow-hidden border border-white/60 bg-white/75 backdrop-blur-2xl"
    >
      {user && (
        <div className="relative space-y-4">
          <style>{`
            @keyframes acc-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
            @media (prefers-reduced-motion: reduce) { .acc-anim { animation: none !important; } }
          `}</style>
          <div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full opacity-40 blur-3xl" style={{ background: '#BC3C31' }} />
          <div className="pointer-events-none absolute -bottom-24 -left-16 -z-10 h-56 w-56 rounded-full opacity-30 blur-3xl" style={{ background: '#1A1A1A' }} />

          {/* En-tête : identité */}
          <div className="acc-anim relative overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.35)]"
            style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.95) 0%, rgba(90,20,16,0.95) 100%)', animation: 'acc-entree 0.4s ease-out both' }}>
            <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/15" />
            <div className="relative flex flex-wrap items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-extrabold text-white ring-[3px] ring-white/80"
                style={{ background: avatarGradient(user.login || user.nom), boxShadow: '0 0 14px 3px #ffffff55' }}>
                {(user.nom || '').trim().charAt(0).toUpperCase() || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-extrabold leading-tight">{user.nom}</p>
                <p className="truncate text-sm text-white/80">{user.poste || user.login}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                  <span className="rounded-full bg-white/20 px-2 py-0.5 font-mono">{user.login}</span>
                  {user.telephone && <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5"><Phone size={10} /> {user.telephone}</span>}
                  {user.actif === false
                    ? <span className="flex items-center gap-1 rounded-full bg-red-500/80 px-2 py-0.5"><Ban size={10} /> Inactif</span>
                    : <span className="flex items-center gap-1 rounded-full bg-emerald-500/80 px-2 py-0.5"><BadgeCheck size={10} /> Actif</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Badge tone={roleTone(user.role)}>{roleLabel(user.role)}</Badge>
                {isReadOnlyRole(user.role) && <Badge tone="info">Lecture seule</Badge>}
                {tousModules && <Badge tone="primary">Tous les modules</Badge>}
              </div>
            </div>
          </div>

          {/* Synthèse */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icone: Layers, titre: 'Modules', valeur: modules.length, couleur: '#BC3C31' },
              { icone: LayoutGrid, titre: 'Volets', valeur: nbVolets, couleur: '#0ea5e9' },
              { icone: Lock, titre: 'En lecture seule', valeur: nbLecture, couleur: '#64748b' }
            ].map((t, i) => (
              <div key={t.titre} className="acc-anim rounded-2xl border border-white/70 bg-white/60 p-3 shadow-sm backdrop-blur-md"
                style={{ animation: `acc-entree 0.4s ease-out ${0.08 * (i + 1)}s both` }}>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${t.couleur}, ${rgba(t.couleur, 0.75)})`, boxShadow: `0 6px 12px -4px ${rgba(t.couleur, 0.5)}` }}>
                  <t.icone size={14} />
                </span>
                <p className="mt-1.5 text-2xl font-black leading-none text-gray-800">{t.valeur}</p>
                <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">{t.titre}</p>
              </div>
            ))}
          </div>

          {modules.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gray-500">
                <ShieldCheck size={14} /> Droits par module
              </p>
              <div className="flex gap-1.5">
                <button type="button" disabled={!!occupe} onClick={() => toutChanger(false)}
                  className="flex items-center gap-1 rounded-full border border-slate-300 bg-white/70 px-3 py-1 text-[11px] font-bold text-slate-600 backdrop-blur-md transition-colors hover:bg-white disabled:opacity-50">
                  <Eye size={12} /> Tout en lecture seule
                </button>
                <button type="button" disabled={!!occupe} onClick={() => toutChanger(true)}
                  className="flex items-center gap-1 rounded-full border border-[#BC3C31]/40 bg-white/70 px-3 py-1 text-[11px] font-bold text-[#BC3C31] backdrop-blur-md transition-colors hover:bg-white disabled:opacity-50">
                  <Pencil size={12} /> Tout en écriture
                </button>
              </div>
            </div>
          )}

          {modules.length === 0 && (
            <p className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-5 text-center text-sm text-gray-400 backdrop-blur-md">
              Aucun accès module attribué.
            </p>
          )}

          {/* Un module : volets accessibles + interrupteur de droit */}
          {modules.map((m, i) => {
            const volets = voletsVisibles(user, m.id)
            const verrouille = lectureImposeeParRole(user.role, m.id)
            const ecriture = enEcriture(m)
            const sites = m.id === 'logistique' ? user.logistiqueSites : m.id === 'gym' ? user.gymSites : null
            return (
              <div key={m.id} className="acc-anim overflow-hidden rounded-2xl border border-white/70 bg-white/70 shadow-sm backdrop-blur-md transition-shadow hover:shadow-lg"
                style={{ animation: `acc-entree 0.45s ease-out ${0.35 + i * 0.06}s both` }}>
                <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5" style={{ background: rgba(m.color, 0.1), borderBottom: `1px solid ${rgba(m.color, 0.18)}` }}>
                  <span className="relative flex items-center gap-1.5 overflow-hidden rounded-full py-1 pl-1 pr-3 text-[11px] font-extrabold tracking-wide text-white"
                    style={{ background: `linear-gradient(135deg, ${m.color}, ${rgba(m.color, 0.78)})`, boxShadow: `0 6px 14px -5px ${rgba(m.color, 0.6)}, inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.2)` }}>
                    <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
                    <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_2px_4px_rgba(0,0,0,0.25)]"><m.icon size={11} /></span>
                    <span className="relative">{m.nom}</span>
                  </span>
                  {sites && (
                    <span className="text-xs font-medium text-gray-500">
                      {sites.length ? sites.join(' · ') : m.id === 'gym' ? 'aucune salle' : 'aucun site'}
                    </span>
                  )}
                  <InterrupteurDroit ecriture={ecriture} verrouille={verrouille} couleur={m.color} occupe={occupe === m.id || occupe === 'tout'}
                    onChange={(e) => changerModule(m, e)} />
                  <button type="button" onClick={() => retirerModule(m)} disabled={!!occupe} title="Retirer ce module à ce compte"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-200 bg-white/70 text-red-500 backdrop-blur-md transition-colors hover:bg-red-50 disabled:opacity-50">
                    <X size={13} />
                  </button>
                </div>
                <div className="space-y-3 p-3">
                  {verrouille && (
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                      <Lock size={11} className="shrink-0" />
                      {isReadOnlyRole(user.role) ? `Le rôle ${roleLabel(user.role)} est en lecture seule partout.` : 'Dans MAXI-GYM, seuls les agents, Info et Assistant PAU peuvent écrire.'}
                    </p>
                  )}
                  {volets.length ? (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {volets.map((v) => {
                          const retire = voletRetire(user, m.id, v.to)
                          const accueil = v.to === m.path
                          return (
                            <button key={v.to} type="button" onClick={() => basculerVolet(m, v)} disabled={!!occupe || accueil}
                              title={accueil ? "L'accueil du module ne peut pas être retiré" : retire ? 'Volet retiré : cliquer pour le rendre' : 'Cliquer pour retirer ce volet à ce compte'}
                              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm transition-all ${retire ? 'border-dashed border-gray-300 bg-gray-100/70 text-gray-400 line-through' : 'bg-white/80 text-gray-700 hover:-translate-y-0.5 hover:bg-white'} ${accueil ? 'cursor-default' : ''}`}
                              style={retire ? undefined : { borderColor: rgba(m.color, 0.25) }}>
                              {retire ? <EyeOff size={12} className="shrink-0" /> : <v.icon size={12} style={{ color: m.color }} className="shrink-0" />} {v.label}
                              {/* Coche verte : le compte a accès à ce volet ; croix grise : volet retiré */}
                              {retire
                                ? <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-300 text-white no-underline"><X size={10} strokeWidth={3} /></span>
                                : <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_2px_4px_-1px_rgba(16,185,129,0.6),inset_0_1px_0_rgba(255,255,255,0.5)]"><Check size={10} strokeWidth={3.5} /></span>}
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-[10px] font-medium text-gray-400">Cliquez sur un volet pour le retirer ou le rendre à ce compte.</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">Aucun volet accessible.</p>
                  )}
                </div>
              </div>
            )
          })}

          {nonAttribues.length > 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white/50 p-3 backdrop-blur-md">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-gray-500">{tousModules ? 'Modules retirés à ce compte' : 'Modules non attribués'}</p>
              <div className="flex flex-wrap gap-1.5">
                {nonAttribues.map((m) => (
                  <button key={m.id} type="button" onClick={() => ajouterModule(m)} disabled={!!occupe}
                    className="flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 py-1 pl-1 pr-2.5 text-[11px] font-bold text-gray-600 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white disabled:opacity-50">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full opacity-60" style={{ background: m.color, color: '#fff' }}><m.icon size={11} /></span>
                    {m.nom} <Plus size={12} className="text-emerald-600" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

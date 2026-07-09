// Navigation latérale : en-tête marque + nav portail + nav intra-module + footer utilisateur.
// Mobile : panneau coulissant avec overlay. Desktop : fixe 260px.
import { NavLink, useLocation } from 'react-router-dom'
import { Home, LayoutDashboard, LogOut, Users, UserCircle, X } from 'lucide-react'
import { MODULES, MODULE_NAV, getModule } from '../modules'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import { roleLabel, canManagePartenaires } from '../../core/roles'
import { estActif } from '../workflow'
import { ACTIONS_PAR_VOLET } from '../../modules/projet/vues'

export default function Sidebar({ open, onClose }) {
  const location = useLocation()
  const { user, role, hasModule, isAdmin, logout } = useAuth()

  // Module actif déduit du premier segment de l'URL
  const parts = location.pathname.split('/')
  const seg = parts[1]
  const activeModule = getModule(seg)
  // Maxi Logistique : sous-application (site) déduite du 2e segment.
  const LOG_SITES = { lome: 'Lomé', kara: 'Kara' }
  const logSite = activeModule?.id === 'logistique' && LOG_SITES[parts[2]] ? parts[2] : null

  // Badge demandes AGRO : factures en attente d'approbation ou d'ajustement d'écart.
  const { data: facturesAgro } = useCollection('agro_factures')
  const { data: demandesLog } = useCollection('logistique_demandes')
  const { data: demandesBriq } = useCollection('evenementiel_demandes')

  // Badges "nouveauté" E-G.Pro : ce que d'autres ont ajouté depuis ma dernière visite du volet.
  const { data: auditProjet }  = useCollection('audit_global')
  const { data: derniereVues } = useCollection('projet_dernieres_vues')
  const projetBadges = {}
  if (activeModule?.id === 'projet') {
    const monUid = user?.uid
    Object.entries(ACTIONS_PAR_VOLET).forEach(([cle, actions]) => {
      const vu = derniereVues.find((v) => v.userId === monUid && v.section === cle)?.vu || 0
      projetBadges[cle] = auditProjet.filter((a) =>
        a.module === 'projet' && actions.includes(a.action) && a.userId !== monUid && a.timestamp > vu
      ).length
    })
  }

  const badges = {
    agroDemandes: facturesAgro.filter((f) => f.statut === 'sortie_demandee' || f.statut === 'modif_demandee').length,
    logistiqueDemandes: demandesLog.filter((d) => estActif(d.statut) && (!logSite || (d.site || 'lome') === logSite)).length,
    briqueterieDemandes: demandesBriq.filter((d) => estActif(d.statut)).length,
    ...projetBadges
  }

  const accentColor = activeModule?.color || '#BC3C31'

  const linkBase =
    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all'
  const navClass = ({ isActive }) =>
    `${linkBase} ${isActive
      ? 'bg-white/20 text-white shadow-[0_16px_32px_-12px_rgba(0,0,0,0.45),0_4px_10px_-4px_rgba(0,0,0,0.3)]'
      : 'text-white/80 hover:bg-white/10 hover:text-white hover:shadow-[0_12px_24px_-12px_rgba(0,0,0,0.35)]'
    }`

  // Filtre les liens de navigation selon le rôle (`roles`) et les permissions
  // par utilisateur (`perm`, ex. « partenaires » = accès donné par la direction).
  const canSeeNav = (item) =>
    (!item.roles || item.roles.includes(role)) &&
    (!item.perm || (item.perm === 'partenaires' && canManagePartenaires(role, user)))
  let moduleNav = (activeModule ? MODULE_NAV[activeModule.id] || [] : []).filter(canSeeNav)

  // Maxi Logistique : la nav intra-module n'a de sens qu'à l'intérieur d'un site.
  // On préfixe alors chaque destination par /logistique/<site>/…
  if (activeModule?.id === 'logistique') {
    moduleNav = logSite
      ? moduleNav.map((item) => ({
          ...item,
          to: item.to === '/logistique' ? `/logistique/${logSite}` : item.to.replace('/logistique/', `/logistique/${logSite}/`)
        }))
      : []
  }

  const moduleTitle = activeModule ? (logSite ? `${activeModule.nom} · ${LOG_SITES[logSite]}` : activeModule.nom) : "Toujours dans l'action"

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col text-white transition-transform duration-200
          md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: activeModule?.sidebarGradient || `linear-gradient(180deg, ${shade(accentColor, -18)}, ${accentColor})` }}
      >
        {/* En-tête marque */}
        <div
          className="mx-3 mt-3 rounded-2xl px-4 pt-5 pb-3"
          style={{
            position: 'relative', zIndex: 1,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 14px 24px -12px rgba(0,0,0,0.45)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>

            {/* Logo rond avec bordure qui clignote légèrement */}
            <style>{`
              @keyframes sb-glow {
                0%   { box-shadow: 0 0 0 2px #ffffffaa, 0 0 6px 1px ${accentColor}44; }
                50%  { box-shadow: 0 0 0 3px #ffffff,   0 0 12px 4px ${accentColor}88; }
                100% { box-shadow: 0 0 0 2px #ffffffaa, 0 0 6px 1px ${accentColor}44; }
              }
            `}</style>
            <div style={{ position: 'relative', flexShrink: 0, width: 48, height: 48 }}>
              <span style={{
                position: 'absolute', inset: -4, borderRadius: '50%',
                animation: 'sb-glow 2.5s ease-in-out infinite'
              }} />
              <img src="/termitiere-logo.png" alt="La Termitière"
                onError={(e) => { e.target.src = '/logo-mark.png' }}
                style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', background: 'white', padding: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', display: 'block' }} />
            </div>

            {/* Nom + module — sans truncate ni min-w-0 */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, lineHeight: 1.2, letterSpacing: 0.5, color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                LA TERMITIÈRE
              </p>
              <p style={{ margin: 0, marginTop: 2, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.65)' }}>
                {moduleTitle}
              </p>
            </div>

            <button onClick={onClose} className="md:hidden" aria-label="Fermer" style={{ flexShrink: 0 }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {/* Nav portail */}
          <NavLink to="/" end className={navClass} onClick={onClose}>
            <Home size={18} /> Accueil
          </NavLink>
          <NavLink to="/dashboard" className={navClass} onClick={onClose}>
            <LayoutDashboard size={18} /> Tableau de bord global
          </NavLink>
          {/* Gestion des utilisateurs : portail uniquement, admin seulement */}
          {isAdmin() && !activeModule && (
            <NavLink to="/utilisateurs" className={navClass} onClick={onClose}>
              <Users size={18} /> Utilisateurs
            </NavLink>
          )}
          {!activeModule && (
            <NavLink to="/mon-compte" className={navClass} onClick={onClose}>
              <UserCircle size={18} /> Mon compte
            </NavLink>
          )}

          {/* Liste des modules : visible uniquement sur le portail (pas dans une appli) */}
          {!activeModule && (
            <>
              <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-white/50">
                Modules
              </p>
              {MODULES.filter((m) => hasModule(m.id)).map((m) => (
                <NavLink key={m.id} to={m.path} className={navClass} onClick={onClose}>
                  <m.icon size={18} /> {m.nom}
                  {badges.agroDemandes > 0 && m.id === 'agro' && (
                    <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold">
                      {badges.agroDemandes}
                    </span>
                  )}
                </NavLink>
              ))}
            </>
          )}

          {/* Nav intra-module : seuls les onglets de l'appli active */}
          {activeModule && moduleNav.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                {moduleTitle}
              </p>
              {moduleNav.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navClass} onClick={onClose}>
                  <item.icon size={18} /> {item.label}
                  {item.badgeKey && badges[item.badgeKey] > 0 && (
                    <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold">
                      {badges[item.badgeKey]}
                    </span>
                  )}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* Footer utilisateur */}
        <div className="border-t border-white/15 p-3">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 font-bold">
              {(user?.nom || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.nom}</p>
              <p className="truncate text-xs text-white/70">{roleLabel(role)}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/15 px-3 py-2 text-sm font-semibold shadow-[0_10px_20px_-10px_rgba(0,0,0,0.4)] transition-all hover:bg-white/25"
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>
    </>
  )
}

// Assombrit/éclaircit une couleur hex de `percent` (négatif = plus sombre).
function shade(hex, percent) {
  const n = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const r = Math.max(0, Math.min(255, (n >> 16) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

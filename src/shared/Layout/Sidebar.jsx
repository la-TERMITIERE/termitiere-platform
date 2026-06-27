// Navigation latérale : en-tête marque + nav portail + nav intra-module + footer utilisateur.
// Mobile : panneau coulissant avec overlay. Desktop : fixe 260px.
import { NavLink, useLocation } from 'react-router-dom'
import { Home, LayoutDashboard, LogOut, Users, UserCircle, X } from 'lucide-react'
import { MODULES, MODULE_NAV, getModule } from '../modules'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import { roleLabel } from '../../core/roles'
import { estActif } from '../workflow'

export default function Sidebar({ open, onClose }) {
  const location = useLocation()
  const { user, role, hasModule, isAdmin, logout } = useAuth()

  // Module actif déduit du premier segment de l'URL
  const seg = location.pathname.split('/')[1]
  const activeModule = getModule(seg)

  // Badge demandes AGRO en attente
  const { data: demandesAgro } = useCollection('agro_demandes')
  const { data: demandesLog } = useCollection('logistique_demandes')
  const { data: demandesBriq } = useCollection('evenementiel_demandes')
  const badges = {
    agroDemandes: demandesAgro.filter((d) => estActif(d.statut)).length,
    logistiqueDemandes: demandesLog.filter((d) => estActif(d.statut)).length,
    briqueterieDemandes: demandesBriq.filter((d) => estActif(d.statut)).length
  }

  const accentColor = activeModule?.color || '#BC3C31'

  const linkBase =
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
  const navClass = ({ isActive }) =>
    `${linkBase} ${isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`

  const moduleNav = activeModule ? MODULE_NAV[activeModule.id] || [] : []

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
        <div className="flex flex-col items-center px-4 pt-5 pb-3 gap-2">
          <div className="flex w-full items-center justify-between">
            {/* Logo rond avec bordure qui pulse — couleur selon le module actif */}
            <div className="relative flex shrink-0 items-center justify-center">
              <span className="absolute h-14 w-14 rounded-full animate-pulse"
                style={{ boxShadow: `0 0 0 3px #ffffff, 0 0 14px 5px ${accentColor}88` }} />
              <img src="/termitiere-logo.png" alt="La Termitière"
                onError={(e) => { e.target.src = '/logo-mark.png' }}
                className="h-12 w-12 rounded-full object-cover bg-white p-1 shadow-lg"
                style={{ ring: `2px solid #ffffff` }} />
            </div>

            {/* Nom + module */}
            <div className="min-w-0 flex-1 pl-3">
              <p
                className="truncate text-sm font-extrabold leading-tight"
                style={{ background: `linear-gradient(90deg, #ffffff 0%, ${accentColor} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
              >
                LA TERMITIÈRE
              </p>
              {activeModule ? (
                <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-white/60 mt-0.5">
                  {activeModule.nom}
                </p>
              ) : (
                <p className="truncate text-[10px] font-medium uppercase tracking-wide text-white/60 mt-0.5">
                  Toujours dans l'action
                </p>
              )}
            </div>

            <button onClick={onClose} className="md:hidden shrink-0" aria-label="Fermer le menu">
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
                {activeModule.nom}
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25"
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

// Barre supérieure : logo + nom entreprise coloré selon le module actif.
import { Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { getModule, MODULE_NAV } from '../modules'
import NotificationBell from './NotificationBell'

// Config visuelle complète par module (couleur principale + secondaire)
const MODULE_THEME = {
  agro:        { color: '#2EAA3F', color2: '#1a6e27', logo: '/maxi-agro-logo.png',       nom: 'MAXI AGRO',             showModuleLogo: true  },
  logistique:  { color: '#BC3C31', color2: '#1A1A1A', logo: '/logo_maxi_logistique.png', nom: 'Maxi Logistique',       showModuleLogo: true  },
  garderie:    { color: '#E8390E', color2: '#F5A800', logo: '/garderie-logo.png',         nom: 'Garderie La Termitière',showModuleLogo: true  },
  evenementiel:{ color: '#7c3aed', color2: '#4c1d95', logo: null,                         nom: 'BRIQUETERIE',           showModuleLogo: false },
  foncier:     { color: '#059669', color2: '#065f46', logo: null,                         nom: 'FONCIER',               showModuleLogo: false },
  rh:          { color: '#ea580c', color2: '#9a3412', logo: null,                         nom: 'COMPTABILITÉ',          showModuleLogo: false },
  default:     { color: '#BC3C31', color2: '#1A1A1A', logo: null,                         nom: 'LA TERMITIÈRE',         showModuleLogo: false }
}

export default function Topbar({ onMenuToggle, user }) {
  const location = useLocation()
  const seg = location.pathname.split('/')[1]
  const mod = getModule(seg)

  const theme = MODULE_THEME[seg] || MODULE_THEME.default
  const { color, color2 } = theme

  // Rubrique active
  let subLabel = 'Accueil'
  if (mod) {
    const nav = MODULE_NAV[mod.id] || []
    const match = [...nav].sort((a, b) => b.to.length - a.to.length)
      .find((n) => location.pathname === n.to || (!n.end && location.pathname.startsWith(n.to)))
    const label = match?.label || ''
    subLabel = (label === 'Dashboard' || label === 'Tableau de bord') ? mod.nom : label ? label : mod.nom
  } else if (location.pathname === '/dashboard') {
    subLabel = 'Tableau de bord global'
  } else if (location.pathname === '/utilisateurs') {
    subLabel = 'Gestion des utilisateurs'
  } else if (location.pathname === '/mon-compte') {
    subLabel = 'Mon compte'
  }

  return (
    <header
      className="z-30 flex h-14 shrink-0 items-center gap-3 px-4 shadow-sm border-b"
      style={{
        background: `linear-gradient(135deg, ${color}12 0%, ${color2}08 100%)`,
        borderBottomColor: color + '40'
      }}
    >
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-1.5 hover:bg-black/5 md:hidden"
        style={{ color }}
        aria-label="Ouvrir le menu"
      >
        <Menu size={22} />
      </button>

      <div className="flex flex-1 items-center gap-3 min-w-0">
        {theme.showModuleLogo ? (
          /* Modules avec leur propre logo */
          <>
            <img src={theme.logo} alt={theme.nom} className="h-9 w-auto object-contain" />
            <div className="min-w-0">
              <span
                className="block truncate text-base font-extrabold leading-tight"
                style={{ background: `linear-gradient(90deg, ${color} 0%, ${color2} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
              >
                {theme.nom}
              </span>
              <span className="block text-[10px] font-semibold truncate" style={{ color: color + 'cc' }}>
                {subLabel}
              </span>
            </div>
          </>
        ) : (
          /* Portail + modules sans logo propre : logo La Termitière rond */
          <>
            <div className="relative shrink-0 flex items-center justify-center">
              <span
                className="absolute h-10 w-10 rounded-full animate-pulse"
                style={{ boxShadow: `0 0 0 2px ${color}, 0 0 10px 4px ${color}44` }}
              />
              <img
                src="/termitiere-logo.png"
                alt="La Termitière"
                onError={(e) => { e.target.src = '/logo-mark.png' }}
                className="h-8 w-8 rounded-full object-cover bg-white p-0.5 shadow"
              />
            </div>
            <div className="min-w-0">
              <span
                className="block truncate text-sm font-extrabold leading-tight"
                style={{ background: `linear-gradient(90deg, ${color} 0%, ${color2} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
              >
                LA TERMITIÈRE
              </span>
              <span className="block text-[10px] font-semibold truncate" style={{ color: color + 'bb' }}>
                {subLabel}
              </span>
            </div>
          </>
        )}
      </div>

      <NotificationBell />
      <div className="hidden items-center gap-2 sm:flex">
        <span className="text-sm font-medium text-gray-600">{user?.nom}</span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize"
          style={{ background: color + '18', color }}
        >
          {user?.role}
        </span>
      </div>
    </header>
  )
}

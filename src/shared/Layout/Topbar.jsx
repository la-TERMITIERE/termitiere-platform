// Barre supérieure — styles inline pour garantir le rendu dès le 1er chargement.
import { Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { getModule, MODULE_NAV } from '../modules'
import NotificationBell from './NotificationBell'
import { MODULE_THEME } from './moduleTheme'
import { useCollection } from '../../hooks/useFirestore'

export default function Topbar({ onMenuToggle, user }) {
  const location = useLocation()
  const seg = location.pathname.split('/')[1]
  const mod = getModule(seg)
  const theme = MODULE_THEME[seg] || MODULE_THEME.default
  const { color, color2, logo, nom } = theme
  const hasModuleLogo = !!logo

  // E-G.Pro : au fond du parcours secteur → projet → catégorie, on affiche le NOM
  // DU PROJET plutôt que le libellé générique « Projets » — plus utile pour se
  // repérer une fois dans le détail. `/projet/projets/<secteur>/<projetId>[/...]`.
  const projetsMatch = location.pathname.match(/^\/projet\/projets\/([^/]+)\/([^/]+)/)
  const projetIdCourant = projetsMatch && projetsMatch[1] !== 'liste' ? projetsMatch[2] : null
  const { data: projetsPourTitre } = useCollection(projetIdCourant ? 'projets' : null)
  const projetCourant = projetIdCourant ? projetsPourTitre.find((p) => p.id === projetIdCourant) : null

  // Rubrique active
  let subLabel = 'Accueil'
  if (mod) {
    const nav = MODULE_NAV[mod.id] || []
    const match = [...nav].sort((a, b) => b.to.length - a.to.length)
      .find((n) => location.pathname === n.to || (!n.end && location.pathname.startsWith(n.to)))
    const label = match?.label || ''
    subLabel = (!label || label === 'Dashboard' || label === 'Tableau de bord') ? nom : label
    if (projetCourant) subLabel = projetCourant.nom
  } else if (location.pathname === '/dashboard') {
    subLabel = 'Tableau de bord global'
  } else if (location.pathname === '/utilisateurs') {
    subLabel = 'Gestion des utilisateurs'
  } else if (location.pathname === '/mon-compte') {
    subLabel = 'Mon compte'
  } else if (location.pathname === '/parametres') {
    subLabel = 'Paramètres'
  }

  return (
    <header className="backdrop-blur-xl backdrop-saturate-150" style={{
      display: 'flex', alignItems: 'center', gap: 12,
      height: 68, padding: '0 20px', flexShrink: 0, zIndex: 30,
      margin: '12px 16px 6px',
      borderRadius: 24,
      background: `linear-gradient(135deg, ${color}22 0%, ${color2}14 100%)`,
      border: `1px solid ${color}45`,
      boxShadow: `0 14px 28px -10px ${color}40, 0 4px 10px -4px ${color}30, inset 0 1px 0 0 rgba(255,255,255,0.5)`
    }}>

      {/* Bouton menu mobile */}
      <button onClick={onMenuToggle}
        style={{ color, padding: 6, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}
        className="md:hidden" aria-label="Menu">
        <Menu size={22} />
      </button>

      {/* Logo + Nom module */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>

        {/* Tous les logos dans un cercle avec bordure qui clignote légèrement */}
        <style>{`
          @keyframes border-glow {
            0%   { box-shadow: 0 0 0 1.5px ${color}cc, 0 0 6px 1px ${color}33; }
            50%  { box-shadow: 0 0 0 2.5px ${color}, 0 0 10px 3px ${color}55; }
            100% { box-shadow: 0 0 0 1.5px ${color}cc, 0 0 6px 1px ${color}33; }
          }
        `}</style>
        <div style={{ position: 'relative', flexShrink: 0, width: 38, height: 38 }}>
          <span style={{
            position: 'absolute', inset: -4, borderRadius: '50%',
            animation: 'border-glow 2.5s ease-in-out infinite'
          }} />
          {hasModuleLogo ? (
            <img src={logo} alt={nom}
              style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', background: 'white', padding: 3, boxShadow: '0 1px 4px rgba(0,0,0,0.15)', display: 'block' }} />
          ) : mod?.icon ? (
            <div style={{
              width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: color, boxShadow: '0 1px 4px rgba(0,0,0,0.15)', flexShrink: 0
            }}>
              <mod.icon size={18} color="white" strokeWidth={2.25} />
            </div>
          ) : (
            <div style={{
              width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: color, boxShadow: '0 1px 4px rgba(0,0,0,0.15)', flexShrink: 0
            }}>
              <span style={{ color: 'white', fontWeight: 800, fontSize: 13, letterSpacing: '-0.5px', textAlign: 'center', lineHeight: 1, padding: '0 2px' }}>
                {nom.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Texte */}
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: color }}>
            {nom}
          </p>
          <p style={{ margin: 0, marginTop: 1, fontSize: 10, fontWeight: 600, color: color, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subLabel}
          </p>
        </div>
      </div>

      {/* Cloche + utilisateur */}
      <NotificationBell />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="hidden sm:flex">
        <span className="text-gray-600 dark:text-gray-300" style={{ fontSize: 14, fontWeight: 500 }}>{user?.nom}</span>
        <span style={{ background: color + '18', color, borderRadius: 9999, padding: '2px 8px', fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
          {user?.role}
        </span>
      </div>
    </header>
  )
}

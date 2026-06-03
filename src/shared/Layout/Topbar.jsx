// Barre supérieure : bouton menu (mobile), titre de page, infos utilisateur.
import { Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { getModule, MODULE_NAV } from '../modules'

export default function Topbar({ onMenuToggle, user }) {
  const location = useLocation()
  const seg = location.pathname.split('/')[1]
  const mod = getModule(seg)

  // Titre = libellé de l'entrée de nav active, sinon nom du module / portail
  let title = 'Portail'
  if (mod) {
    const nav = MODULE_NAV[mod.id] || []
    const match = [...nav].sort((a, b) => b.to.length - a.to.length)
      .find((n) => location.pathname === n.to || (!n.end && location.pathname.startsWith(n.to)))
    title = match ? `${mod.nom} — ${match.label}` : mod.nom
  } else if (location.pathname === '/dashboard') {
    title = 'Tableau de bord global'
  } else if (location.pathname === '/utilisateurs') {
    title = 'Gestion des utilisateurs'
  }

  return (
    <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 shadow-sm">
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 md:hidden"
        aria-label="Ouvrir le menu"
      >
        <Menu size={22} />
      </button>
      <h1 className="flex-1 truncate text-base font-bold text-gray-800">{title}</h1>
      <div className="hidden items-center gap-2 sm:flex">
        <span className="text-sm font-medium text-gray-600">{user?.nom}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold capitalize text-primary-dark">
          {user?.role}
        </span>
      </div>
    </header>
  )
}

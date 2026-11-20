// RH : barre d'onglets en verre au-dessus d'un volet appartenant à un groupe (Équipe, Temps, Paie).
// Chaque onglet est un lien vers le volet : les adresses d'origine continuent de fonctionner.
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { voletRetire } from '../../core/roles'
import { groupeDeChemin } from './groupes'

export default function RhOnglets() {
  const { pathname } = useLocation()
  const user = useAuth((s) => s.user)
  const groupe = groupeDeChemin(pathname)
  if (!groupe) return null
  const onglets = groupe.onglets.filter((o) => !voletRetire(user, 'rh', o.to))
  if (onglets.length < 2) return null
  return (
    <nav aria-label="Volets du groupe" className="rh-onglets ed-entree mb-4 flex w-fit max-w-full flex-wrap gap-0.5 rounded-full p-1">
      {onglets.map((o) => {
        const actif = pathname === o.to || pathname.startsWith(o.to + '/')
        const Ic = o.icone
        return (
          <Link key={o.to} to={o.to} aria-current={actif ? 'page' : undefined} data-actif={actif}
            className="rh-onglet inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold">
            <Ic size={15} aria-hidden="true" />{o.label}
          </Link>
        )
      })}
    </nav>
  )
}

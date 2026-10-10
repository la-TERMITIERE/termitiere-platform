// État vide d'une liste : grosse icône 3D qui flotte, avec un halo qui pulse doucement.
// Styles et animations : `.ev-*` dans index.css.
import { Inbox } from 'lucide-react'
import { icone3D } from '../../utils/color'

export default function EtatVide({ icone: Icone = Inbox, texte = 'Aucune donnée', accent = '#BC3C31', className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-3 py-10 ${className}`}>
      <div className="relative">
        <span aria-hidden="true" className="ev-halo absolute inset-0 rounded-3xl" style={{ background: accent }} />
        <span className="ev-flotte relative flex h-16 w-16 items-center justify-center rounded-3xl" style={icone3D(accent)}>
          <Icone size={30} />
        </span>
      </div>
      <p className="text-sm font-semibold text-gray-400 dark:text-gray-500">{texte}</p>
    </div>
  )
}

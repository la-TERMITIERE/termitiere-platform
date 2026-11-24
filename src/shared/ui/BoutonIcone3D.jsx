// Bouton à icône seule en relief (style 3D) : dégradé de la couleur, reflet en haut, ombre en bas. Au survol il se soulève, à l'appui il s'enfonce,
// et au clic l'icône rebondit (elle se tasse, grossit puis revient). La légende est dans l'infobulle et pour les lecteurs d'écran.
import { useState } from 'react'
import { icone3D } from '../../utils/color'

export default function BoutonIcone3D({ icone: Icone, label, couleur = '#475569', onClick, disabled = false, taille = 17, className = '' }) {
  const [rebond, setRebond] = useState(0)
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled}
      onClick={(e) => { setRebond((n) => n + 1); onClick?.(e) }}
      style={icone3D(couleur)}
      className={`icone-3d flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/40 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${className}`}>
      {/* `key` relance l'animation à chaque clic */}
      <span key={rebond} className={`flex items-center justify-center ${rebond ? 'bv-clic-icone' : ''}`}><Icone size={taille} aria-hidden="true" /></span>
    </button>
  )
}

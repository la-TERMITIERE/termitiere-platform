// Icône ℹ avec bulle d'explication au survol.
// La bulle est rendue via un portail (document.body) et positionnée en `fixed`
// d'après la position réelle de l'icône à l'écran — sinon elle se retrouve
// coupée dès que l'icône est utilisée dans un conteneur à `overflow: hidden`
// (ex. un titre avec `truncate`), ce qui la rend invisible au survol.
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

export default function InfoBulle({ texte, className = '' }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)

  const afficher = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      // La bulle (w-56 = 224px) est centrée sur l'icône via -translate-x-1/2 — on
      // borne le centre pour qu'elle ne déborde jamais de l'écran (utile sur mobile,
      // près des bords gauche/droit).
      const half = 112, margin = 8
      const left = Math.max(half + margin, Math.min(r.left + r.width / 2, window.innerWidth - half - margin))
      setPos({ top: r.top, left })
    }
    setVisible(true)
  }
  const cacher = () => setVisible(false)

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={afficher}
        onMouseLeave={cacher}
        onFocus={afficher}
        onBlur={cacher}
        className="text-gray-300 hover:text-teal-500 transition-colors focus:outline-none"
        aria-label="Explication du calcul"
      >
        <Info size={13} />
      </button>

      {visible && createPortal(
        <span
          className="fixed z-[999] w-56 -translate-x-1/2 -translate-y-full rounded-lg bg-gray-800 px-3 py-2 text-[11px] text-white shadow-lg leading-relaxed pointer-events-none"
          style={{ top: pos.top - 8, left: pos.left }}
        >
          {texte}
          {/* Flèche */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
        </span>,
        document.body
      )}
    </span>
  )
}

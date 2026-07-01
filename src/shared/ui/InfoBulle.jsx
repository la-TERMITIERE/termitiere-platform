// Icône ℹ avec bulle d'explication au survol.
import { useState } from 'react'
import { Info } from 'lucide-react'

export default function InfoBulle({ texte, className = '' }) {
  const [visible, setVisible] = useState(false)

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="text-gray-300 hover:text-teal-500 transition-colors focus:outline-none"
        aria-label="Explication du calcul"
      >
        <Info size={13} />
      </button>

      {visible && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 w-56 rounded-lg bg-gray-800 px-3 py-2 text-[11px] text-white shadow-lg leading-relaxed pointer-events-none">
          {texte}
          {/* Flèche */}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
        </span>
      )}
    </span>
  )
}

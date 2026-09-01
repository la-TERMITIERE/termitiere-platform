// Champ saisie libre + suggestions filtrées en direct — remplace les <input list>/<datalist>
// (comportement inégal selon navigateur, notamment sur mobile) et les champs "select + saisie
// libre" par un seul champ cohérent : on tape librement, une liste de suggestions apparaît en
// dessous et se filtre au fur et à mesure, cliquer dessus remplit le champ automatiquement.
import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'

// Tailwind ne détecte que des classes écrites en toutes lettres dans le code (pas de
// concaténation de chaîne) — on ne peut donc pas construire "focus:ring-${accent}-400"
// dynamiquement. On passe par cette table pour que chaque teinte reste bien générée.
const ACCENTS = {
  teal:   { ring: 'focus:ring-teal-400',   hoverText: 'hover:text-teal-600',   hoverBg: 'hover:bg-teal-50' },
  amber:  { ring: 'focus:ring-amber-400',  hoverText: 'hover:text-amber-600',  hoverBg: 'hover:bg-amber-50' },
  green:  { ring: 'focus:ring-green-400',  hoverText: 'hover:text-green-600',  hoverBg: 'hover:bg-green-50' },
  violet: { ring: 'focus:ring-violet-400', hoverText: 'hover:text-violet-600', hoverBg: 'hover:bg-violet-50' },
  orange: { ring: 'focus:ring-orange-400', hoverText: 'hover:text-orange-600', hoverBg: 'hover:bg-orange-50' }
}

export default function ChampAutocomplete({
  value, onChange, suggestions = [], placeholder = '', className, maxSuggestions = 8,
  getLabel = (s) => s, onSelect, emptyLabel = 'Aucune suggestion — votre saisie sera utilisée.',
  accent = 'teal', autoFocus = false
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const a = ACCENTS[accent] || ACCENTS.teal

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtrees = useMemo(() => {
    const q = (value || '').trim().toLowerCase()
    const liste = q ? suggestions.filter((s) => getLabel(s).toLowerCase().includes(q)) : suggestions
    return liste.slice(0, maxSuggestions)
  }, [suggestions, value, maxSuggestions, getLabel])

  const choisir = (s) => {
    onChange(getLabel(s))
    onSelect?.(s)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-1">
        <input
          autoFocus={autoFocus}
          className={className || `min-w-0 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${a.ring}`}
          placeholder={placeholder}
          value={value || ''}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {suggestions.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)}
            className={`rounded-lg border border-gray-200 px-2 text-gray-400 ${a.hoverText}`}>
            <ChevronDown size={14} />
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          {!filtrees.length
            ? <p className="px-3 py-2 text-xs text-gray-400">{emptyLabel}</p>
            : <ul className="max-h-48 overflow-y-auto py-1">
                {filtrees.map((s, i) => (
                  <li key={getLabel(s) + i}
                    className={`cursor-pointer px-3 py-2 text-sm text-gray-700 ${a.hoverBg}`}
                    onMouseDown={(e) => { e.preventDefault(); choisir(s) }}>
                    {getLabel(s)}
                  </li>
                ))}
              </ul>
          }
        </div>
      )}
    </div>
  )
}

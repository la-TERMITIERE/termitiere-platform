// Carte KPI : titre, valeur, écart mis en avant (optionnel), icône, accent.
// - `variation` (nombre signé) : si fourni, l'ÉCART devient l'élément dominant
//   (gros, coloré, fléché) et la valeur globale passe au second plan (gris).
// - `onClick` : rend la carte cliquable (ouvre un détail) avec chevron + survol.
import { TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'

export default function StatCard({
  title, value, sub, variation, variationLabel,
  icon: Icon, accent = '#16a34a', onClick
}) {
  const hasVar = variation !== undefined && variation !== null && variation !== ''
  const up = Number(variation) >= 0
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`card group flex w-full items-center gap-4 p-4 text-left ${
        onClick ? 'cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md' : ''
      }`}
    >
      {Icon && (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ background: accent + '1a', color: accent }}
        >
          <Icon size={24} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
        {hasVar ? (
          <div className="flex items-baseline gap-2">
            <span className={`inline-flex items-center gap-0.5 text-2xl font-extrabold ${up ? 'text-green-600' : 'text-red-600'}`}>
              {up ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              {up ? '+' : ''}{variation}
            </span>
            <span className="text-sm font-semibold text-gray-400">{value}</span>
          </div>
        ) : (
          <p className="text-2xl font-extrabold text-gray-900">{value}</p>
        )}
        {(variationLabel || sub) && (
          <p className="mt-0.5 truncate text-xs text-gray-400">{variationLabel || sub}</p>
        )}
      </div>
      {onClick && (
        <ChevronRight size={18} className="shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
      )}
    </Comp>
  )
}

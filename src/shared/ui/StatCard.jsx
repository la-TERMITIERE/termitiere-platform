// Carte KPI : titre, valeur, écart mis en avant (optionnel), icône, accent.
// - `variation` (nombre signé) : si fourni, l'ÉCART devient l'élément dominant
//   (gros, coloré, fléché) et la valeur globale passe au second plan (gris).
// - `onClick` : rend la carte cliquable (ouvre un détail) avec chevron + survol.
import { TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'

export default function StatCard({
  title, value, sub, variation, variationLabel,
  icon: Icon, accent = '#16a34a', onClick, valueColor
}) {
  const hasVar = variation !== undefined && variation !== null && variation !== ''
  const up = Number(variation) >= 0
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`card group flex w-full items-center gap-2.5 p-3 text-left transition-all sm:gap-3.5 sm:p-4 ${
        onClick ? 'cursor-pointer hover:-translate-y-1 hover:shadow-[0_32px_60px_-16px_rgba(26,26,26,0.22),0_10px_20px_-6px_rgba(26,26,26,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]' : ''
      }`}
    >
      {Icon && (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12"
          style={{ background: accent + '1a', color: accent }}
        >
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
      )}
      {/* min-w-0 partout : sans lui, un montant long pousse la carte au lieu d'être tronqué. */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs" title={title}>{title}</p>
        {hasVar ? (
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className={`inline-flex shrink-0 items-center gap-0.5 text-xl font-extrabold leading-tight sm:text-2xl ${up ? 'text-green-600' : 'text-red-600'}`}>
              {up ? <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" /> : <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5" />}
              {up ? '+' : ''}{variation}
            </span>
            <span className="break-words text-xs font-semibold text-gray-400 sm:text-sm" title={String(value ?? '')}>{value}</span>
          </div>
        ) : (
          // Pas de troncature : un montant long passe à la ligne / rétrécit, mais
          // reste TOUJOURS entièrement lisible (demande direction — plus de « 7 M… »).
          <p className="break-words text-lg font-extrabold leading-tight sm:text-xl" style={{ color: valueColor || '#111827' }} title={String(value ?? '')}>{value}</p>
        )}
        {(variationLabel || sub) && (
          <p className="mt-0.5 truncate text-[11px] text-gray-400" title={variationLabel || sub}>{variationLabel || sub}</p>
        )}
      </div>
      {onClick && (
        <ChevronRight size={16} className="hidden shrink-0 text-gray-300 transition-colors group-hover:text-gray-500 sm:block" />
      )}
    </Comp>
  )
}

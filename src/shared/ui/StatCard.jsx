// Carte KPI : titre, valeur, écart mis en avant (optionnel), icône, accent.
// - `variation` (nombre signé) : si fourni, l'ÉCART devient l'élément dominant
//   (gros, coloré, fléché) et la valeur globale passe au second plan (gris).
// - `onClick` : rend la carte cliquable (ouvre un détail) avec chevron + survol.
import { TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'

export default function StatCard({
  title, value, sub, variation, variationLabel,
  icon: Icon, accent = '#16a34a', onClick, valueColor, glass = false
}) {
  const hasVar = variation !== undefined && variation !== null && variation !== ''
  const up = Number(variation) >= 0
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`card group relative flex w-full items-center gap-2.5 overflow-hidden p-3 text-left transition-all sm:gap-3.5 sm:p-4 ${
        glass ? 'border-white/50 backdrop-blur-xl' : ''
      } ${
        onClick ? 'cursor-pointer hover:-translate-y-1 hover:shadow-[0_32px_60px_-16px_rgba(26,26,26,0.22),0_10px_20px_-6px_rgba(26,26,26,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]' : ''
      }`}
      // Teinte translucide propre à l'accent de la carte (prioritaire sur le
      // fond opaque de `.card` grâce au style inline) + reflet diagonal, même
      // recette « verre » que la nav mobile — indispensable pour que l'effet
      // se voie même posé sur un fond de page clair/uni.
      style={glass ? { background: `linear-gradient(135deg, ${accent}1f 0%, #ffffffcc 70%)` } : undefined}
    >
      {glass && (
        <span aria-hidden="true" className="pointer-events-none absolute -inset-x-6 -top-8 h-14 -rotate-6 bg-gradient-to-b from-white/80 via-white/20 to-transparent" />
      )}
      {Icon && (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12"
          // En mode `glass`, l'icône passe d'un pavé pastel plat à un badge dégradé
          // « 3D » (liseré clair en haut, ombre interne sombre en bas, ombre portée
          // teintée) — même recette bombée/glossy que les autres badges du dashboard.
          style={glass
            ? {
                background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                color: '#fff',
                boxShadow: `0 6px 14px -4px ${accent}66, inset 0 2px 2px rgba(255,255,255,0.55), inset 0 -3px 5px rgba(0,0,0,0.25)`
              }
            : { background: accent + '1a', color: accent }}
        >
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
      )}
      {/* min-w-0 partout : sans lui, un montant long pousse la carte au lieu d'être tronqué. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1.5">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs" title={title}>{title}</p>
          {/* L'écart est une PASTILLE discrète : la valeur reste l'élément dominant
              et lisible (avant, l'écart écrasait la valeur → peu ergonomique). */}
          {hasVar && (
            <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${up ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {up ? '+' : ''}{variation}
            </span>
          )}
        </div>
        {/* Pas de troncature : un montant long passe à la ligne / rétrécit, mais
            reste TOUJOURS entièrement lisible (demande direction — plus de « 7 M… »). */}
        <p className="break-words text-lg font-extrabold leading-tight sm:text-xl" style={{ color: valueColor || '#111827' }} title={String(value ?? '')}>{value}</p>
        {(variationLabel || sub) && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-gray-400" title={variationLabel || sub}>{variationLabel || sub}</p>
        )}
      </div>
      {onClick && (
        <ChevronRight size={16} className="hidden shrink-0 text-gray-300 transition-colors group-hover:text-gray-500 sm:block" />
      )}
    </Comp>
  )
}

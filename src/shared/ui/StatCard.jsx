// Carte KPI : titre, valeur, variation optionnelle, icône, accent de couleur.
import { TrendingUp, TrendingDown } from 'lucide-react'

export default function StatCard({ title, value, sub, variation, icon: Icon, accent = '#16a34a' }) {
  const hasVar = variation !== undefined && variation !== null
  const up = Number(variation) >= 0
  return (
    <div className="card p-4 flex items-center gap-4">
      {Icon && (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{ background: accent + '1a', color: accent }}
        >
          <Icon size={24} />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
        <p className="text-2xl font-extrabold text-gray-900">{value}</p>
        <div className="flex items-center gap-2">
          {sub && <span className="text-xs text-gray-400">{sub}</span>}
          {hasVar && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-green-600' : 'text-red-600'}`}>
              {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {up ? '+' : ''}{variation}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

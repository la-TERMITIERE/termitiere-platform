// Sélecteur de période réutilisable : menu déroulant de presets + plage
// personnalisée (calendrier). Renvoie { start, end } (chaînes 'YYYY-MM-DD') et
// le `node` à afficher. Utilisé par le Dashboard, les Analyses et le Journal.
import { useMemo, useState } from 'react'
import { todayStr, addDays } from '../../utils/formatters'

const PRESETS = [
  { v: '7', label: '7 derniers jours' },
  { v: '30', label: '30 derniers jours' },
  { v: '90', label: '90 derniers jours' },
  { v: '180', label: '180 derniers jours' },
  { v: '365', label: 'Cette année (1 an)' },
  { v: 'all', label: 'Tout l\'historique' },
  { v: 'custom', label: 'Plage personnalisée…' }
]

export function usePeriodSelect(defaultPreset = '30') {
  const [preset, setPreset] = useState(defaultPreset)
  const [from, setFrom] = useState(addDays(todayStr(), -30))
  const [to, setTo] = useState(todayStr())

  const { start, end } = useMemo(() => {
    if (preset === 'all') return { start: '0000-01-01', end: '9999-12-31' }
    if (preset === 'custom') return { start: from, end: to }
    return { start: addDays(todayStr(), -parseInt(preset)), end: todayStr() }
  }, [preset, from, to])

  const node = (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-600">Période</label>
        <select
          className="input-base w-auto font-semibold"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          {PRESETS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
        </select>
      </div>
      {preset === 'custom' && (
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Du</label>
            <input type="date" className="input-base w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Au</label>
            <input type="date" className="input-base w-auto" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  )

  return { start, end, preset, node }
}

// MAXI-AGRO : anneau de répartition de l'effectif. Total au centre, segments arrondis séparés par un liseré blanc,
// légende détaillée à côté (couleur, effectif, part en %, barre) et survol relié dans les deux sens :
// passer sur un segment éclaire sa ligne, passer sur une ligne écarte son segment.
import { useMemo, useState } from 'react'
import { Doughnut } from 'react-chartjs-2'
import '../../utils/chartSetup'
import { formatNumber } from '../../utils/formatters'

// Une couleur presque noire écrase le reste de l'anneau : on l'adoucit en ardoise.
function adoucir(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum < 0.22 ? '#334155' : hex
}

// rows : [{ label, color, total }]
export default function AnneauRepartition({ rows, unite = 'têtes', titreCentre = 'Effectif' }) {
  const [actif, setActif] = useState(null)
  const lignes = useMemo(() => [...rows].map((r) => ({ ...r, color: adoucir(r.color) })).sort((a, b) => b.total - a.total), [rows])
  const total = lignes.reduce((s, r) => s + r.total, 0)
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0)
  const vus = lignes.filter((r) => r.total > 0)

  const data = {
    labels: vus.map((r) => r.label),
    datasets: [{
      data: vus.map((r) => r.total),
      backgroundColor: vus.map((r) => r.color),
      borderColor: '#ffffff', borderWidth: 3, borderRadius: 8, spacing: 1,
      offset: vus.map((r) => (r.label === actif ? 12 : 0)), hoverOffset: 10
    }]
  }
  const options = {
    maintainAspectRatio: false, cutout: '68%',
    animation: { animateRotate: true, duration: 1000, easing: 'easeOutQuart' },
    onHover: (_e, els) => setActif(els.length ? vus[els[0].index]?.label ?? null : null),
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a', padding: 10, cornerRadius: 10, displayColors: true, boxPadding: 4,
        callbacks: { label: (c) => ` ${c.label} : ${formatNumber(c.parsed)} ${unite} (${pct(c.parsed)} %)` }
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative mx-auto h-56 w-full max-w-[15rem]" onMouseLeave={() => setActif(null)}>
        <Doughnut data={data} options={options} />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">{titreCentre}</span>
          <span className="whitespace-nowrap text-3xl font-black leading-none tabular-nums text-gray-900">{formatNumber(total)}</span>
          <span className="mt-0.5 text-xs font-semibold text-gray-500">{unite}</span>
        </div>
      </div>

      {/* Légende réduite : couleur et nom seulement (les effectifs et les pourcentages sont dans l'infobulle au survol) */}
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1" onMouseLeave={() => setActif(null)}>
        {lignes.map((r) => (
          <li key={r.label} onMouseEnter={() => r.total > 0 && setActif(r.label)}
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold transition-opacity ${r.total === 0 ? 'opacity-50' : ''} ${actif && actif !== r.label ? 'opacity-40' : 'text-gray-700'}`}>
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

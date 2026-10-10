// Graphiques du Dashboard Briqueterie, refaits : barres à dégradé et coins arrondis avec leur valeur
// au-dessus, anneau de stock avec le total au centre, infobulles sombres, animation d'ouverture et
// puces de synthèse sous chaque graphique (lisibles aussi sur mobile).
import { Bar, Doughnut } from 'react-chartjs-2'
import { BarChart3, PieChart } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Compteur from '../../shared/ui/Compteur'
import { icone3D } from '../../utils/color'
import { formatNumber } from '../../utils/formatters'

const ACCENT = '#475569'

const TITRE = ({ icone: Icone, titre, sous }) => (
  <div className="mb-3 flex items-center gap-2.5">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(ACCENT)}><Icone size={17} /></span>
    <div>
      <h3 className="text-base font-bold leading-tight text-gray-800 dark:text-gray-100">{titre}</h3>
      {sous && <p className="text-[11px] text-gray-400">{sous}</p>}
    </div>
  </div>
)

const INFOBULLE = {
  backgroundColor: '#0f172a', padding: 10, cornerRadius: 10, displayColors: false,
  titleFont: { weight: '700' }, bodyFont: { weight: '600' }
}

// Dégradé vertical d'une barre (clair en haut, foncé en bas), calculé à la zone du graphique.
const degrade = (haut, bas) => (ctx) => {
  const { chart } = ctx
  const { chartArea, ctx: c } = chart
  if (!chartArea) return haut
  const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top)
  g.addColorStop(0, bas)
  g.addColorStop(1, haut)
  return g
}

// La valeur s'écrit au-dessus de chaque barre.
const valeursSurBarres = {
  id: 'valeursSurBarres',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    chart.getDatasetMeta(0).data.forEach((barre, i) => {
      const v = chart.data.datasets[0].data[i]
      ctx.save()
      ctx.fillStyle = '#334155'
      ctx.font = '700 12px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(formatNumber(v), barre.x, barre.y - 7)
      ctx.restore()
    })
  }
}

// Le total du stock s'écrit au centre de l'anneau.
const totalAuCentre = (total) => ({
  id: 'totalAuCentre',
  afterDraw(chart) {
    const { ctx, chartArea: { left, right, top, bottom } } = chart
    const x = (left + right) / 2
    const y = (top + bottom) / 2
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#1e293b'
    ctx.font = '800 21px Inter, system-ui, sans-serif'
    ctx.fillText(formatNumber(total), x, y - 6)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 11px Inter, system-ui, sans-serif'
    ctx.fillText('briques en stock', x, y + 14)
    ctx.restore()
  }
})

export function VueEnsembleCard({ prodMois, stockPret, stockSechage, caillasses }) {
  const barres = [
    { label: 'Production', valeur: prodMois, haut: '#94a3b8', bas: '#334155' },
    { label: 'Prêtes', valeur: stockPret, haut: '#4ade80', bas: '#15803d' },
    { label: 'En séchage', valeur: stockSechage, haut: '#fcd34d', bas: '#b45309' },
    { label: 'Caillasses', valeur: caillasses, haut: '#cbd5e1', bas: '#64748b' }
  ]
  const data = {
    labels: barres.map((b) => b.label),
    datasets: [{
      data: barres.map((b) => b.valeur),
      backgroundColor: (ctx) => { const b = barres[ctx.dataIndex]; return b ? degrade(b.haut, b.bas)(ctx) : '#94a3b8' },
      borderRadius: 12, borderSkipped: false, maxBarThickness: 52
    }]
  }
  const options = {
    maintainAspectRatio: false,
    layout: { padding: { top: 20 } },
    animation: { duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: { ...INFOBULLE, callbacks: { label: (c) => `${formatNumber(c.parsed.y)} brique(s)` } }
    },
    scales: {
      y: { beginAtZero: true, border: { display: false }, grid: { color: 'rgba(100,116,139,0.16)', borderDash: [4, 4] }, ticks: { maxTicksLimit: 5, callback: (v) => formatNumber(v) } },
      x: { border: { display: false }, grid: { display: false }, ticks: { font: { weight: '600' } } }
    }
  }
  return (
    <Card>
      <TITRE icone={BarChart3} titre="Vue d'ensemble" sous="Production, stock prêt, séchage et caillasses" />
      <div className="h-44"><Bar data={data} options={options} plugins={[valeursSurBarres]} /></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {barres.map((b) => (
          <div key={b.label} className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/65 px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${b.haut}, ${b.bas})` }} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[10px] font-bold uppercase text-gray-400">{b.label}</span>
              <span className="block text-sm font-extrabold text-gray-800"><Compteur valeur={b.valeur} format={formatNumber} /></span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function StockDonutCard({ parType, couleurs }) {
  const total = parType.reduce((s, p) => s + (p.stock || 0), 0)
  const data = {
    labels: parType.map((p) => p.nom),
    datasets: [{
      data: parType.map((p) => p.stock),
      backgroundColor: parType.map((_, i) => couleurs[i % couleurs.length]),
      borderColor: '#ffffff', borderWidth: 3, borderRadius: 6, hoverOffset: 8
    }]
  }
  const options = {
    maintainAspectRatio: false,
    cutout: '70%',
    animation: { animateRotate: true, duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 10, font: { size: 10, weight: '600' } } },
      tooltip: { ...INFOBULLE, callbacks: { label: (c) => `${formatNumber(c.parsed)} brique(s) · ${total ? Math.round((c.parsed / total) * 100) : 0} %` } }
    }
  }
  return (
    <Card>
      <TITRE icone={PieChart} titre="Stock par catégorie" sous="Répartition des briques en stock" />
      <div className="h-60">
        {parType.length && total > 0
          ? <Doughnut data={data} options={options} plugins={[totalAuCentre(total)]} />
          : <p className="py-20 text-center text-sm text-gray-400">Aucun stock : commencez par une production</p>}
      </div>
    </Card>
  )
}

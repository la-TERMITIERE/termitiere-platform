// Graphiques du Dashboard Logistique, refaits : anneau du stock avec le total au centre et légende
// cliquable (ouvre la catégorie), barres à dégradé avec leur valeur au-dessus, infobulles sombres,
// animation d'ouverture et puces de synthèse (lisibles aussi sur mobile).
import { Bar, Doughnut } from 'react-chartjs-2'
import { BarChart3, PieChart, Inbox } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Compteur from '../../shared/ui/Compteur'
import EtatVide from '../../shared/ui/EtatVide'
import { COULEUR_MODULE, icone3D } from '../../utils/color'
import { formatNumber } from '../../utils/formatters'

const ACCENT = COULEUR_MODULE.logistique

const TITRE = ({ icone: Icone, titre, sous }) => (
  <div className="mb-3 flex items-center gap-2.5">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(ACCENT)}><Icone size={17} /></span>
    <div className="min-w-0">
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
    ctx.font = '800 22px Inter, system-ui, sans-serif'
    ctx.fillText(formatNumber(total), x, y - 6)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 11px Inter, system-ui, sans-serif'
    ctx.fillText('articles en stock', x, y + 14)
    ctx.restore()
  }
})

export function StockCategorieCard({ parCat, onOuvrir }) {
  const total = parCat.reduce((s, p) => s + (p.stock || 0), 0)
  const data = {
    labels: parCat.map((p) => p.cat),
    datasets: [{
      data: parCat.map((p) => p.stock),
      backgroundColor: parCat.map((p) => p.color),
      borderColor: '#ffffff', borderWidth: 3, borderRadius: 6, hoverOffset: 8
    }]
  }
  const options = {
    maintainAspectRatio: false,
    cutout: '70%',
    animation: { animateRotate: true, duration: 900, easing: 'easeOutQuart' },
    onClick: (_, els) => { if (els.length && onOuvrir) onOuvrir(parCat[els[0].index]) },
    onHover: (e, els) => { const c = e.native?.target; if (c) c.style.cursor = els.length ? 'pointer' : 'default' },
    plugins: {
      legend: { display: false },
      tooltip: { ...INFOBULLE, callbacks: { label: (c) => `${formatNumber(c.parsed)} article(s) · ${total ? Math.round((c.parsed / total) * 100) : 0} %` } }
    }
  }
  return (
    <Card>
      <TITRE icone={PieChart} titre="Répartition du stock" sous="Par catégorie : touchez une part pour voir les articles" />
      {parCat.length && total > 0 ? (
        <>
          <div className="h-52"><Doughnut data={data} options={options} plugins={[totalAuCentre(total)]} /></div>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {parCat.map((p) => (
              <span key={p.cat} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/65 px-2.5 py-1 text-[11px] font-bold uppercase text-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}aa)` }} />
                {p.cat}
              </span>
            ))}
          </div>
        </>
      ) : (
        <EtatVide icone={Inbox} texte="Aucun stock enregistré : commencez par la saisie magasin" accent={ACCENT} className="!py-10" />
      )}
    </Card>
  )
}

export function FluxPeriodeCard({ achats, sorties, retOk, periode }) {
  const barres = [
    { label: 'Achats', valeur: achats, haut: '#4ade80', bas: '#15803d' },
    { label: 'Sorties', valeur: sorties, haut: '#fcd34d', bas: '#b45309' },
    { label: 'Retours OK', valeur: retOk, haut: '#7dd3fc', bas: '#0369a1' }
  ]
  const vide = barres.every((b) => !b.valeur)
  const data = {
    labels: barres.map((b) => b.label),
    datasets: [{
      data: barres.map((b) => b.valeur),
      backgroundColor: (ctx) => { const b = barres[ctx.dataIndex]; return b ? degrade(b.haut, b.bas)(ctx) : '#94a3b8' },
      borderRadius: 12, borderSkipped: false, maxBarThickness: 56
    }]
  }
  const options = {
    maintainAspectRatio: false,
    layout: { padding: { top: 20 } },
    animation: { duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: { ...INFOBULLE, callbacks: { label: (c) => `${formatNumber(c.parsed.y)} article(s)` } }
    },
    scales: {
      y: { beginAtZero: true, border: { display: false }, grid: { color: 'rgba(100,116,139,0.16)', borderDash: [4, 4] }, ticks: { precision: 0, maxTicksLimit: 5, callback: (v) => formatNumber(v) } },
      x: { border: { display: false }, grid: { display: false }, ticks: { font: { weight: '600' } } }
    }
  }
  return (
    <Card>
      <TITRE icone={BarChart3} titre="Flux de la période" sous={periode} />
      {vide ? (
        <EtatVide icone={Inbox} texte="Aucun mouvement sur cette période" accent={ACCENT} className="!py-10" />
      ) : (
        <div className="h-52"><Bar data={data} options={options} plugins={[valeursSurBarres]} /></div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
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

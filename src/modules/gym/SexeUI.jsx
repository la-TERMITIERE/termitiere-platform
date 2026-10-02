// MAXI-GYM — éléments d'UI liés au sexe des clients (proportion femmes / hommes).
import '../../utils/chartSetup'
import { Doughnut } from 'react-chartjs-2'
import { SEXES, sexeInfo } from './data'

// Boutons Femme / Homme pour les formulaires (séance, abonnement, fiche client).
export function SexeBoutons({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {SEXES.map((s) => {
        const actif = value === s.id
        return (
          <button key={s.id} type="button" onClick={() => onChange(s.id)}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-bold transition-all ${actif ? 'text-white shadow-[0_6px_14px_-4px_rgba(0,0,0,0.35)]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
            style={actif ? { background: s.couleur, borderColor: s.couleur } : undefined}>
            <span className="text-base leading-none">{s.symbole}</span> {s.label}
          </button>
        )
      })}
    </div>
  )
}

// Filtre Tous / Femmes / Hommes posé directement sur le bandeau héro (glassmorphism).
// « Non précisé » n'apparaît que s'il reste des enregistrements sans sexe renseigné.
export function SexeFiltre({ value, onChange, inconnus = 0 }) {
  const options = [['', 'Tous'], ...SEXES.map((s) => [s.id, `${s.symbole} ${s.court}`]), ...(inconnus > 0 ? [['inconnu', `? Non précisé (${inconnus})`]] : [])]
  return (
    <div className="flex flex-wrap gap-1 rounded-2xl border border-white/30 bg-white/15 p-1 backdrop-blur-sm">
      {options.map(([v, l]) => (
        <button key={v || 'tous'} type="button" onClick={() => onChange(v)}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${value === v ? 'bg-white text-orange-700' : 'text-white/80 hover:bg-white/20'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

// Petite pastille ♀ / ♂ pour les tableaux.
export function SexeBadge({ sexe }) {
  const s = sexeInfo(sexe)
  if (!s) return <span className="text-gray-300">—</span>
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm" style={{ background: s.couleur }} title={s.label}>
      {s.symbole}
    </span>
  )
}

// Plugin Chart.js « donut 3D » : épaisseur (anneau extrudé vers le bas, teinte plus
// sombre) + reflet brillant sur chaque part, sans incliner le graphique : le disque
// reste DROIT mais se lit comme un vrai relief.
const assombrir = (hex, t) => {
  const n = parseInt(hex.replace('#', ''), 16)
  const m = (v) => Math.round(v * (1 - t))
  return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`
}
const PROFONDEUR_DONUT = 16
const donut3D = {
  id: 'donut3D',
  beforeDatasetsDraw(chart, _a, opts) {
    const p = opts?.profondeur ?? PROFONDEUR_DONUT
    const { ctx } = chart
    const couleurs = chart.data.datasets[0].backgroundColor
    chart.getDatasetMeta(0).data.forEach((arc, i) => {
      const { x, y, startAngle, endAngle, innerRadius, outerRadius } = arc.getProps(['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], true)
      if (!(endAngle - startAngle > 0)) return
      ctx.save()
      ctx.fillStyle = assombrir(couleurs[i], 0.38)
      for (let d = p; d >= 1; d -= 1) {
        ctx.beginPath()
        ctx.arc(x, y + d, outerRadius, startAngle, endAngle)
        ctx.arc(x, y + d, innerRadius, endAngle, startAngle, true)
        ctx.closePath(); ctx.fill()
      }
      ctx.restore()
    })
  },
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    chart.getDatasetMeta(0).data.forEach((arc) => {
      const { x, y, startAngle, endAngle, innerRadius, outerRadius } = arc.getProps(['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], true)
      if (!(endAngle - startAngle > 0)) return
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, outerRadius, startAngle, endAngle)
      ctx.arc(x, y, innerRadius, endAngle, startAngle, true)
      ctx.closePath()
      const g = ctx.createLinearGradient(x - outerRadius, y - outerRadius, x + outerRadius, y + outerRadius)
      g.addColorStop(0, 'rgba(255,255,255,0.55)')
      g.addColorStop(0.45, 'rgba(255,255,255,0.08)')
      g.addColorStop(1, 'rgba(0,0,0,0.18)')
      ctx.fillStyle = g
      ctx.fill()
      ctx.restore()
    })
  }
}

// Donut Femmes / Hommes (personnes distinctes) en 3D. `mini` : format Dashboard.
export function SexeDonut({ stats, mini = false }) {
  const taille = mini ? 170 : 270
  const data = {
    labels: SEXES.map((s) => s.court),
    datasets: [{
      data: [stats.F.personnes, stats.H.personnes],
      backgroundColor: SEXES.map((s) => s.couleur), borderColor: '#ffffff', borderWidth: mini ? 2 : 3, hoverOffset: mini ? 3 : 8
    }]
  }
  const options = {
    responsive: true, maintainAspectRatio: false, cutout: '60%',
    layout: { padding: { top: 6, left: 8, right: 8, bottom: PROFONDEUR_DONUT + 4 } },
    plugins: {
      legend: { display: false },
      donut3D: { profondeur: mini ? 9 : PROFONDEUR_DONUT },
      tooltip: { callbacks: { label: (c) => ` ${c.label} : ${c.parsed} personne${c.parsed > 1 ? 's' : ''}` } }
    }
  }
  return (
    <div className="relative shrink-0" style={{ width: taille, height: taille, filter: 'drop-shadow(0 12px 8px rgba(0,0,0,0.16))' }}>
      <Doughnut data={data} options={options} plugins={[donut3D]} />
      {/* Centre du trou : centre de l'anneau, décalé vers le haut de la profondeur du relief. */}
      <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center justify-center" style={{ top: 0, bottom: PROFONDEUR_DONUT }}>
        <span className={`${mini ? 'text-2xl' : 'text-4xl'} font-extrabold leading-none text-gray-800`}>{stats.connus}</span>
        <span className={`${mini ? 'text-[10px]' : 'text-xs'} font-semibold text-gray-400`}>personne{stats.connus > 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}

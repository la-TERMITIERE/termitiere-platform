// Style commun des graphiques E-DÉPENSES : dégradés, infobulles sombres arrondies, axes compacts, animation d'ouverture.
// Utilisé par Analyses et Flux de trésorerie, pour que tous les graphiques aient la même allure.
const hexA = (hex, a) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// Barres : dégradé vertical (clair en bas, couleur pleine en haut).
export const degradeBarre = (couleur) => (context) => {
  const { chart } = context
  const { ctx, chartArea } = chart
  if (!chartArea) return hexA(couleur, 0.85)
  const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top)
  g.addColorStop(0, hexA(couleur, 0.35))
  g.addColorStop(1, hexA(couleur, 0.95))
  return g
}

// Aires sous une courbe : la couleur s'estompe vers le bas.
export const degradeZone = (couleur, haut = 0.32) => (context) => {
  const { chart } = context
  const { ctx, chartArea } = chart
  if (!chartArea) return hexA(couleur, 0.15)
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
  g.addColorStop(0, hexA(couleur, haut))
  g.addColorStop(1, hexA(couleur, 0))
  return g
}

export const fmtFcfa = (n) => Number(n || 0).toLocaleString('fr-FR')

// Valeur d'axe compacte : 1 250 000 → « 1,3 M », 45 000 → « 45 k ».
export const compact = (v) => {
  const n = Number(v) || 0
  const a = Math.abs(n)
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`
  if (a >= 1e3) return `${Math.round(n / 1e3).toLocaleString('fr-FR')} k`
  return String(n)
}

const infobulle = {
  backgroundColor: 'rgba(26, 26, 26, 0.92)',
  titleColor: '#fff',
  bodyColor: '#f1f5f9',
  padding: 12,
  cornerRadius: 12,
  boxPadding: 6,
  usePointStyle: true,
  titleFont: { weight: '700', size: 13 },
  bodyFont: { size: 12 },
  caretSize: 6
}

// Options de base d'un graphique cartésien (barres / courbes). `legende` : légende native en bas, avec puces rondes.
export function optionsGraphique({ legende = true, empile = false, extra = {} } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 1000, easing: 'easeOutQuart' },
    layout: { padding: { top: 6, right: 4 } },
    plugins: {
      legend: legende
        ? { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 16, font: { size: 11, weight: '600' } } }
        : { display: false },
      tooltip: { ...infobulle, callbacks: { label: (ctx) => ` ${ctx.dataset.label} : ${fmtFcfa(ctx.parsed.y)} FCFA` } }
    },
    scales: {
      x: { stacked: empile, grid: { display: false }, border: { display: false }, ticks: { font: { size: 11, weight: '600' } } },
      y: {
        stacked: empile, beginAtZero: true, border: { display: false },
        ticks: { callback: compact, font: { size: 11 }, maxTicksLimit: 6 },
        grid: { color: (c) => (c.tick.value === 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)'), lineWidth: 1 }
      }
    },
    ...extra
  }
}

// Courbe lissée avec points creux qui grossissent au survol.
export const styleCourbe = (couleur, { zone = true, trait = 3, pointille = false } = {}) => ({
  borderColor: couleur,
  backgroundColor: zone ? degradeZone(couleur) : 'transparent',
  fill: zone,
  tension: 0.38,
  borderWidth: trait,
  borderDash: pointille ? [6, 4] : [],
  pointRadius: 4,
  pointHoverRadius: 7,
  pointBackgroundColor: '#fff',
  pointBorderColor: couleur,
  pointBorderWidth: 2
})

// Barre arrondie à dégradé.
export const styleBarre = (couleur) => ({
  backgroundColor: degradeBarre(couleur),
  borderColor: couleur,
  borderWidth: 0,
  borderRadius: 8,
  borderSkipped: false,
  maxBarThickness: 38
})

// Plugin : texte au centre d'un anneau (total + libellé).
export const texteCentreAnneau = (valeur, libelle) => ({
  id: 'texteCentre',
  afterDraw(chart) {
    const { ctx, chartArea } = chart
    if (!chartArea) return
    const x = (chartArea.left + chartArea.right) / 2
    const y = (chartArea.top + chartArea.bottom) / 2
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#1e293b'
    ctx.font = '800 18px system-ui, sans-serif'
    ctx.fillText(valeur, x, y - 6)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillText(libelle, x, y + 14)
    ctx.restore()
  }
})

export { infobulle }

// Dashboard MAXI-AGRO.
// - KPI par catégorie (y compris catégories personnalisées) — cartes cliquables
//   ouvrant le détail par espèce + distribution visuelle.
// - Sélecteur de période : menu déroulant de presets + plage personnalisée (calendrier).
import { useMemo, useState } from 'react'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import { ChevronRight, Layers } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import LoadingSpinner from '../../shared/ui/LoadingSpinner'
import { useCollection } from '../../hooks/useFirestore'
import { useAgroStore } from './store/agroStore'
import { CAT_ANIMAUX, catColor } from './data'
import { mouvementsCategorie } from './logic'
import { formatNumber, todayStr, addDays, formatDateShort } from '../../utils/formatters'

const PRESETS = [
  { v: '7', label: '7 derniers jours' },
  { v: '30', label: '30 derniers jours' },
  { v: '90', label: '90 derniers jours' },
  { v: '180', label: '180 derniers jours' },
  { v: '365', label: 'Cette année (1 an)' },
  { v: 'custom', label: 'Plage personnalisée…' }
]

export default function Dashboard() {
  const { data: inventaires, loading } = useCollection('agro_inventaires')
  const especes = useAgroStore((s) => s.especes)

  // ── Sélection de période ──
  const [preset, setPreset] = useState('30')
  const [from, setFrom] = useState(addDays(todayStr(), -30))
  const [to, setTo] = useState(todayStr())
  const [catDetail, setCatDetail] = useState(null) // catégorie ouverte en détail

  // Fenêtre [start, end] effective
  const { start, end } = useMemo(() => {
    if (preset === 'custom') return { start: from, end: to }
    return { start: addDays(todayStr(), -parseInt(preset)), end: todayStr() }
  }, [preset, from, to])

  const tri = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1)), [inventaires])
  const dernier = tri[0]
  const veille = tri[1]
  const invPeriode = useMemo(() => tri.filter((i) => i.date >= start && i.date <= end), [tri, start, end])

  // Catégories animales présentes (base + personnalisées)
  const cats = useMemo(() => {
    const custom = [...new Set(especes.map((e) => e.cat))].filter((c) => !CAT_ANIMAUX.includes(c))
    return [...CAT_ANIMAUX, ...custom].filter((c) => especes.some((e) => e.cat === c))
  }, [especes])

  // Total final + entrées/sorties du jour vs veille (séparément) par catégorie
  const parCat = useMemo(() => {
    const totalCat = (inv, cat) =>
      especes.filter((e) => e.cat === cat).reduce((s, e) => s + (inv?.animaux?.[e.id]?.fin || 0), 0)
    return cats.map((cat) => {
      const mJour = mouvementsCategorie(dernier, especes, cat)
      const mVeille = mouvementsCategorie(veille, especes, cat)
      return {
        cat,
        total: totalCat(dernier, cat),
        entreesJour: mJour.entrees,
        sortiesJour: mJour.sorties,
        diffEntrees: veille ? mJour.entrees - mVeille.entrees : null,
        diffSorties: veille ? mJour.sorties - mVeille.sorties : null,
        color: catColor(cat)
      }
    })
  }, [cats, especes, dernier, veille])

  // Évolution effectif total sur la fenêtre
  const evolution = useMemo(() => {
    const pts = [...invPeriode].sort((a, b) => (a.date < b.date ? -1 : 1))
    return {
      labels: pts.map((i) => i.date?.slice(5)),
      datasets: [{
        label: 'Effectif total',
        data: pts.map((i) => Object.values(i.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)),
        borderColor: '#BC3C31',
        backgroundColor: 'rgba(188,60,49,0.12)',
        fill: true,
        tension: 0.3
      }]
    }
  }, [invPeriode])

  const repartition = {
    labels: parCat.map((p) => p.cat),
    datasets: [{ data: parCat.map((p) => p.total), backgroundColor: parCat.map((p) => p.color) }]
  }

  // Taux mortalité / croissance sur la fenêtre
  const taux = useMemo(() => {
    let naiss = 0, dec = 0
    invPeriode.forEach((i) => Object.values(i.animaux || {}).forEach((a) => { naiss += a.naiss || 0; dec += a.dec || 0 }))
    const base = Object.values(dernier?.animaux || {}).reduce((s, a) => s + (a.init || 0), 0) || 1
    return { mortalite: ((dec / base) * 100).toFixed(1), croissance: (((naiss - dec) / base) * 100).toFixed(1), naiss, dec }
  }, [invPeriode, dernier])

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-5">
      {/* Sélecteur de période */}
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
        <span className="ml-auto text-xs text-gray-400">
          {formatDateShort(start)} → {formatDateShort(end)} · {invPeriode.length} saisie(s)
        </span>
      </div>

      {/* KPI catégories — cliquables */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {parCat.map((p) => (
          <button
            key={p.cat}
            onClick={() => setCatDetail(p.cat)}
            className="card group flex items-center gap-4 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: p.color + '1a', color: p.color }}>
              <Layers size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{p.cat}</p>
              <p className="text-2xl font-extrabold text-gray-900">{formatNumber(p.total)}</p>
              {veille && (
                <div className="mt-0.5 space-y-0.5 text-[11px] font-semibold leading-tight">
                  <p className={p.diffEntrees >= 0 ? 'text-sky-600' : 'text-sky-800'}>
                    Entrées : {p.diffEntrees >= 0 ? '+' : ''}{p.diffEntrees} vs veille
                    <span className="font-normal text-gray-400"> ({p.entreesJour} auj.)</span>
                  </p>
                  <p className={p.diffSorties >= 0 ? 'text-amber-600' : 'text-amber-800'}>
                    Sorties : {p.diffSorties >= 0 ? '+' : ''}{p.diffSorties} vs veille
                    <span className="font-normal text-gray-400"> ({p.sortiesJour} auj.)</span>
                  </p>
                </div>
              )}
            </div>
            <ChevronRight size={18} className="text-gray-300 transition-colors group-hover:text-gray-500" />
          </button>
        ))}
      </div>

      {/* Graphiques */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Évolution des effectifs" className="lg:col-span-2">
          <div className="h-72">
            {evolution.labels.length
              ? <Line data={evolution} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
              : <p className="py-10 text-center text-sm text-gray-400">Aucune saisie sur la période.</p>}
          </div>
        </Card>
        <Card title="Répartition par catégorie">
          <div className="h-72">
            {parCat.some((p) => p.total > 0)
              ? <Doughnut data={repartition} options={{ maintainAspectRatio: false }} />
              : <p className="py-10 text-center text-sm text-gray-400">Aucun effectif.</p>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat title="Taux de mortalité" value={`${taux.mortalite} %`} sub={`${taux.dec} décès`} color="#dc2626" />
        <MiniStat title="Taux de croissance" value={`${taux.croissance} %`} sub={`${taux.naiss} naissances`} color="#16a34a" />
        <MiniStat title="Saisies enregistrées" value={inventaires.length} color="#0284c7" />
        <MiniStat title="Dernière saisie" value={dernier?.date ? formatDateShort(dernier.date) : '—'} sub={dernier?.agentNom} color="#7c3aed" />
      </div>

      {/* Détail catégorie */}
      <CategorieDetail
        cat={catDetail}
        onClose={() => setCatDetail(null)}
        especes={especes}
        dernier={dernier}
        invPeriode={invPeriode}
      />
    </div>
  )
}

function MiniStat({ title, value, sub, color }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// Modal de détail d'une catégorie : tableau par espèce + distribution + mouvements période.
function CategorieDetail({ cat, onClose, especes, dernier, invPeriode }) {
  const data = useMemo(() => {
    if (!cat) return null
    const list = especes.filter((e) => e.cat === cat)
    const lignes = list.map((e) => {
      const d = dernier?.animaux?.[e.id] || {}
      // Mouvements cumulés sur la période
      let naiss = 0, ent = 0, sor = 0, dec = 0
      invPeriode.forEach((inv) => {
        const a = inv.animaux?.[e.id]
        if (a) { naiss += a.naiss || 0; ent += a.ent || 0; sor += a.sor || 0; dec += a.dec || 0 }
      })
      return { nom: e.nom, prix: e.prix, init: d.init || 0, naissJour: d.naiss || 0, fin: d.fin || 0, naiss, ent, sor, dec }
    })
    const totalFin = lignes.reduce((s, l) => s + l.fin, 0)
    return { lignes, totalFin, color: catColor(cat) }
  }, [cat, especes, dernier, invPeriode])

  const distribution = data && {
    labels: data.lignes.map((l) => l.nom),
    datasets: [{
      label: 'Effectif final',
      data: data.lignes.map((l) => l.fin),
      backgroundColor: data.color
    }]
  }

  return (
    <Modal open={!!cat} onClose={onClose} size="xl" title={`Détail — ${cat || ''}`}>
      {data && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Effectif total de la catégorie : <strong className="text-gray-800">{formatNumber(data.totalFin)} têtes</strong>
            <span className="text-gray-400"> · répartis sur {data.lignes.length} espèce(s)</span>
          </p>

          {/* Tableau par espèce */}
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Espèce</th>
                  <th className="px-2 py-2 text-center">EF Initial</th>
                  <th className="px-2 py-2 text-center">Naiss.</th>
                  <th className="px-2 py-2 text-center">Entrées</th>
                  <th className="px-2 py-2 text-center">Sorties</th>
                  <th className="px-2 py-2 text-center">Décès</th>
                  <th className="px-2 py-2 text-center">EF Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.lignes.map((l) => (
                  <tr key={l.nom}>
                    <td className="px-3 py-1.5 font-semibold">{l.nom}</td>
                    <td className="px-2 py-1.5 text-center">{l.init}</td>
                    <td className="px-2 py-1.5 text-center text-green-600">{l.naiss}</td>
                    <td className="px-2 py-1.5 text-center text-sky-600">{l.ent}</td>
                    <td className="px-2 py-1.5 text-center text-amber-600">{l.sor}</td>
                    <td className="px-2 py-1.5 text-center text-red-600">{l.dec}</td>
                    <td className="px-2 py-1.5 text-center font-bold" style={{ color: data.color }}>{l.fin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Distribution visuelle */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Distribution des effectifs</p>
            <div className="h-56">
              {data.totalFin > 0
                ? <Bar data={distribution} options={{ maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }} />
                : <p className="py-10 text-center text-sm text-gray-400">Aucun effectif enregistré pour cette catégorie.</p>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

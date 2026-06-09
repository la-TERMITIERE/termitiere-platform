// Dashboard MAXI-AGRO.
// - KPI par catégorie — cartes cliquables (détail par espèce + distribution visuelle).
// - Mini-stats en bas : mortalité + naissances CLIQUABLES (détails + formule),
//   saisie du jour CLIQUABLE (détails qui a fait quoi).
// - Sélecteur de période : presets + plage personnalisée.
import { useMemo, useState } from 'react'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import { ChevronRight, Layers, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import LoadingSpinner from '../../shared/ui/LoadingSpinner'
import { useCollection } from '../../hooks/useFirestore'
import { useAgroStore } from './store/agroStore'
import { CAT_ANIMAUX, catColor } from './data'
import { mouvementsCategorie } from './logic'
import { formatNumber, formatMoney, todayStr, addDays, formatDateShort, formatDateTime } from '../../utils/formatters'

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

  const [preset, setPreset] = useState('30')
  const [from, setFrom] = useState(addDays(todayStr(), -30))
  const [to, setTo] = useState(todayStr())
  const [catDetail, setCatDetail] = useState(null)
  const [mortaliteOpen, setMortaliteOpen] = useState(false)
  const [naissancesOpen, setNaissancesOpen] = useState(false)
  const [saisieJourOpen, setSaisieJourOpen] = useState(false)

  const { start, end } = useMemo(() => {
    if (preset === 'custom') return { start: from, end: to }
    return { start: addDays(todayStr(), -parseInt(preset)), end: todayStr() }
  }, [preset, from, to])

  const tri = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1)), [inventaires])
  const dernier = tri[0]
  const veille = tri[1]
  const invPeriode = useMemo(() => tri.filter((i) => i.date >= start && i.date <= end), [tri, start, end])

  // Saisie du jour (peut être null si pas encore saisie aujourd'hui)
  const saisieJour = useMemo(() => inventaires.find((i) => i.date === todayStr()), [inventaires])

  // Catégories animales présentes (base + personnalisées)
  const cats = useMemo(() => {
    const custom = [...new Set(especes.map((e) => e.cat))].filter((c) => !CAT_ANIMAUX.includes(c))
    return [...CAT_ANIMAUX, ...custom].filter((c) => especes.some((e) => e.cat === c))
  }, [especes])

  // Total final + entrées/sorties par catégorie (aujourd'hui ET veille pour comparaison)
  const parCat = useMemo(() => {
    const totalCat = (inv, cat) =>
      especes.filter((e) => e.cat === cat).reduce((s, e) => s + (inv?.animaux?.[e.id]?.fin || 0), 0)
    return cats.map((cat) => {
      const mJour = mouvementsCategorie(dernier, especes, cat)
      const mVeille = mouvementsCategorie(veille, especes, cat)
      return {
        cat,
        total: totalCat(dernier, cat),
        totalVeille: veille ? totalCat(veille, cat) : null,
        entreesJour: mJour.entrees,
        sortiesJour: mJour.sorties,
        entVeille: veille ? mVeille.entrees : null,
        sorVeille: veille ? mVeille.sorties : null,
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
    return { mortalite: ((dec / base) * 100).toFixed(1), croissance: (((naiss - dec) / base) * 100).toFixed(1), naiss, dec, base }
  }, [invPeriode, dernier])

  // Détails décès sur la période (avec motifs)
  const decesDetail = useMemo(() => {
    const result = []
    invPeriode.forEach((inv) => {
      especes.forEach((e) => {
        const a = inv.animaux?.[e.id]
        if (!a) return
        // Depuis les sorties détaillées
        const sorties = a.sorties || []
        const decSorties = sorties.filter((l) => l.type === 'Décès' && (parseInt(l.qte) || 0) > 0)
        if (decSorties.length) {
          decSorties.forEach((l) => result.push({
            date: inv.date, espece: e.nom, cat: e.cat,
            qte: parseInt(l.qte) || 0, motif: l.label || '—', agent: l.agentNom || inv.agentNom || '—'
          }))
        } else if ((a.dec || 0) > 0) {
          // Fallback sur le total agrégé si pas de détail
          result.push({ date: inv.date, espece: e.nom, cat: e.cat, qte: a.dec, motif: '—', agent: inv.agentNom || '—' })
        }
      })
    })
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [invPeriode, especes])

  // Détails naissances sur la période
  const naissancesDetail = useMemo(() => {
    const result = []
    invPeriode.forEach((inv) => {
      especes.forEach((e) => {
        const a = inv.animaux?.[e.id]
        if (!a) return
        const entrees = a.entrees || []
        const naissEntrees = entrees.filter((l) => l.type === 'Naissance' && (parseInt(l.qte) || 0) > 0)
        if (naissEntrees.length) {
          naissEntrees.forEach((l) => result.push({
            date: inv.date, espece: e.nom, cat: e.cat,
            qte: parseInt(l.qte) || 0, agent: l.agentNom || inv.agentNom || '—'
          }))
        } else if ((a.naiss || 0) > 0) {
          result.push({ date: inv.date, espece: e.nom, cat: e.cat, qte: a.naiss, agent: inv.agentNom || '—' })
        }
      })
    })
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [invPeriode, especes])

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

      {/* KPI catégories — cliquables, données J-1 en sous-titre */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {parCat.map((p) => {
          const delta = p.totalVeille !== null ? p.total - p.totalVeille : null
          return (
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
                <div className="flex items-baseline gap-1">
                  <p className="text-2xl font-extrabold text-gray-900">{formatNumber(p.total)}</p>
                  {delta !== null && (
                    <span className={`text-xs font-semibold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {delta > 0 ? <TrendingUp size={13} className="inline" /> : delta < 0 ? <TrendingDown size={13} className="inline" /> : <Minus size={13} className="inline" />}
                      {delta > 0 ? '+' : ''}{delta}
                    </span>
                  )}
                </div>
                {p.totalVeille !== null && (
                  <div className="mt-0.5 space-y-0.5 text-[11px] leading-tight">
                    <p className="text-gray-400">Hier : <span className="font-semibold text-gray-600">{formatNumber(p.totalVeille)}</span></p>
                    <p className="text-sky-600 font-medium">
                      Entrées J-1 : {p.entVeille ?? 0} → Auj. : {p.entreesJour}
                    </p>
                    <p className="text-amber-600 font-medium">
                      Sorties J-1 : {p.sorVeille ?? 0} → Auj. : {p.sortiesJour}
                    </p>
                  </div>
                )}
              </div>
              <ChevronRight size={18} className="text-gray-300 transition-colors group-hover:text-gray-500" />
            </button>
          )
        })}
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

      {/* Mini-stats cliquables */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStatBtn
          title="Taux de mortalité"
          value={`${taux.mortalite} %`}
          sub={`${taux.dec} décès — cliquer pour détails`}
          color="#dc2626"
          onClick={() => setMortaliteOpen(true)}
        />
        <MiniStatBtn
          title="Taux de croissance"
          value={`${taux.croissance} %`}
          sub={`${taux.naiss} naissances — cliquer pour détails`}
          color="#16a34a"
          onClick={() => setNaissancesOpen(true)}
        />
        <MiniStatBtn
          title="Saisie du jour"
          value={saisieJour ? '✓ Effectuée' : '— Non faite'}
          sub={saisieJour ? `${formatDateTime(saisieJour.savedAt)} — cliquer pour détails` : 'Aucune saisie aujourd\'hui'}
          color={saisieJour ? '#0284c7' : '#94a3b8'}
          onClick={saisieJour ? () => setSaisieJourOpen(true) : undefined}
        />
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Dernière saisie</p>
          <p className="text-2xl font-extrabold text-purple-700">{dernier?.date ? formatDateShort(dernier.date) : '—'}</p>
          {dernier?.agentNom && <p className="text-xs text-gray-400">{dernier.agentNom}</p>}
        </div>
      </div>

      {/* Détail catégorie */}
      <CategorieDetail
        cat={catDetail}
        onClose={() => setCatDetail(null)}
        especes={especes}
        dernier={dernier}
        invPeriode={invPeriode}
      />

      {/* Modal : détails décès avec motifs */}
      <Modal open={mortaliteOpen} onClose={() => setMortaliteOpen(false)} size="lg" title="Détails — Taux de mortalité">
        <div className="space-y-4">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            Taux mortalité : <strong>{taux.mortalite} %</strong> — {taux.dec} décès sur la période
          </p>
          <p className="text-xs text-gray-400 italic">
            Formule : Taux de mortalité = (Nombre de décès / Effectif initial) × 100<br />
            Effectif initial retenu : {formatNumber(taux.base)} têtes (EF initial de la dernière saisie)
          </p>
          {decesDetail.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Aucun décès enregistré sur la période.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Espèce</th>
                    <th className="px-3 py-2 text-left">Catégorie</th>
                    <th className="px-2 py-2 text-center">Qté</th>
                    <th className="px-3 py-2 text-left">Motif</th>
                    <th className="px-3 py-2 text-left">Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {decesDetail.map((d, i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                      <td className="px-3 py-1.5 font-mono text-xs">{formatDateShort(d.date)}</td>
                      <td className="px-3 py-1.5 font-semibold">{d.espece}</td>
                      <td className="px-3 py-1.5 text-gray-500">{d.cat}</td>
                      <td className="px-2 py-1.5 text-center font-bold text-red-600">{d.qte}</td>
                      <td className="px-3 py-1.5 text-gray-700">{d.motif}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-400">{d.agent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal : détails naissances */}
      <Modal open={naissancesOpen} onClose={() => setNaissancesOpen(false)} size="lg" title="Détails — Naissances & Croissance">
        <div className="space-y-4">
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            Taux de croissance : <strong>{taux.croissance} %</strong> — {taux.naiss} naissances sur la période
          </p>
          <p className="text-xs text-gray-400 italic">
            Formule : Taux de croissance = ((Naissances − Décès) / Effectif initial) × 100<br />
            Effectif initial retenu : {formatNumber(taux.base)} têtes (EF initial de la dernière saisie)
          </p>
          {naissancesDetail.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Aucune naissance enregistrée sur la période.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Espèce</th>
                    <th className="px-3 py-2 text-left">Catégorie</th>
                    <th className="px-2 py-2 text-center">Nés</th>
                    <th className="px-3 py-2 text-left">Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {naissancesDetail.map((n, i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                      <td className="px-3 py-1.5 font-mono text-xs">{formatDateShort(n.date)}</td>
                      <td className="px-3 py-1.5 font-semibold">{n.espece}</td>
                      <td className="px-3 py-1.5 text-gray-500">{n.cat}</td>
                      <td className="px-2 py-1.5 text-center font-bold text-green-600">{n.qte}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-400">{n.agent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal : saisie du jour */}
      {saisieJour && (
        <Modal open={saisieJourOpen} onClose={() => setSaisieJourOpen(false)} size="xl" title={`Saisie du jour — ${formatDateShort(todayStr())}`}>
          <div className="space-y-4">
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
              Enregistrée le {formatDateTime(saisieJour.savedAt)} par <strong>{saisieJour.agentNom}</strong>
            </p>
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
                    <th className="px-3 py-2 text-left">Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {especes.map((e) => {
                    const a = saisieJour.animaux?.[e.id]
                    if (!a && (a?.fin || 0) === 0 && (a?.init || 0) === 0) return null
                    return (
                      <tr key={e.id}>
                        <td className="px-3 py-1.5 font-semibold">{e.nom}</td>
                        <td className="px-2 py-1.5 text-center">{a?.init || 0}</td>
                        <td className="px-2 py-1.5 text-center text-green-600">{a?.naiss || 0}</td>
                        <td className="px-2 py-1.5 text-center text-sky-600">{a?.ent || 0}</td>
                        <td className="px-2 py-1.5 text-center text-amber-600">{a?.sor || 0}</td>
                        <td className="px-2 py-1.5 text-center text-red-600">{a?.dec || 0}</td>
                        <td className="px-2 py-1.5 text-center font-bold text-primary">{a?.fin || 0}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-400">
                          {[...(a?.entrees || []), ...(a?.sorties || [])]
                            .map((l) => l.agentNom).filter(Boolean)[0] || saisieJour.agentNom || '—'}
                        </td>
                      </tr>
                    )
                  }).filter(Boolean)}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function MiniStatBtn({ title, value, sub, color, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`card p-4 text-left transition-all ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : 'cursor-default'}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <p className="text-xl font-extrabold" style={{ color }}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </button>
  )
}

// Modal de détail d'une catégorie : tableau par espèce + distribution + mouvements période.
function CategorieDetail({ cat, onClose, especes, dernier, invPeriode }) {
  const data = useMemo(() => {
    if (!cat) return null
    const list = especes.filter((e) => e.cat === cat)
    const lignes = list.map((e) => {
      const d = dernier?.animaux?.[e.id] || {}
      let naiss = 0, ent = 0, sor = 0, dec = 0
      invPeriode.forEach((inv) => {
        const a = inv.animaux?.[e.id]
        if (a) { naiss += a.naiss || 0; ent += a.ent || 0; sor += a.sor || 0; dec += a.dec || 0 }
      })
      return { nom: e.nom, prix: e.prix, init: d.init || 0, fin: d.fin || 0, naiss, ent, sor, dec }
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

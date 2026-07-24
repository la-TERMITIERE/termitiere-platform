// Pilotage & Analyse — BRIQUETERIE (vue direction / investisseurs).
// Indicateurs clés de performance filtrables par PÉRIODE et par TYPE de brique :
// chiffre d'affaires, ventes de la période, écoulement, prix moyen et clients
// servis. Détail par type de brique + matières premières.
import { useMemo, useState } from 'react'
import { Doughnut, Bar } from 'react-chartjs-2'
import {
  BadgeDollarSign, TrendingUp, TrendingDown, ShoppingCart,
  Percent, Users, Boxes
} from 'lucide-react'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useBriqueterieStore } from './store/referentielStore'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { estActif } from '../../shared/workflow'
import { formatMoney, formatNumber, formatDateShort, addDays } from '../../utils/formatters'

const TOUTES = '__TOUTES__'
const PALETTE = ['#7c3aed', '#6366f1', '#0284c7', '#0d9488', '#16a34a', '#ca8a04', '#db2777', '#ea580c', '#0891b2', '#4f46e5']

export default function Pilotage() {
  const briques = useBriqueterieStore((s) => s.briques)
  const matieres = useBriqueterieStore((s) => s.matieres)
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: factures } = useCollection('evenementiel_factures')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: demandes } = useCollection('evenementiel_demandes')

  const { start, end, preset, node: periodNode } = usePeriodSelect('30')
  const [scope, setScope] = useState(TOUTES)
  const [modal, setModal] = useState(null)

  const inPeriode = (d) => (d || '') >= start && (d || '') <= end
  const dernier = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [inventaires])

  // Période précédente de MÊME durée — socle des indicateurs de tendance.
  const comparable = preset !== 'all'
  const dayCount = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(dayCount - 1))
  const inPrev = (d) => comparable && (d || '') >= prevStart && (d || '') <= prevEnd

  const types = useMemo(() => briques.filter((b) => b.id !== 'caillasses'), [briques])
  const idSet = useMemo(() => new Set(types.map((b) => b.id)), [types])
  const byName = useMemo(() => {
    const m = {}; types.forEach((b) => { m[(b.nom || '').trim().toLowerCase()] = b.id }); return m
  }, [types])
  const ligneBrique = (l) => (l.articleId && idSet.has(l.articleId)) ? l.articleId : byName[(l.article || '').trim().toLowerCase()]

  const facturesP = useMemo(() => factures.filter((f) => inPeriode(f.date)), [factures, start, end])
  const productionsP = useMemo(() => productions.filter((p) => inPeriode(p.date)), [productions, start, end])

  // Détail par TYPE de brique sur la période : CA, ventes (vol.), production, stock.
  const parType = useMemo(() => types.map((b, i) => {
    let ca = 0, ventes = 0
    facturesP.forEach((f) => (f.lignes || []).forEach((l) => {
      if (ligneBrique(l) !== b.id) return
      const qte = parseInt(l.qte) || 0
      ca += l.total || qte * (parseFloat(l.prixUnit) || 0)
      ventes += qte
    }))
    let prod = 0
    productionsP.forEach((p) => (p.lignes || []).forEach((l) => { if (l.briqueId === b.id) prod += parseInt(l.qte) || 0 }))
    return {
      id: b.id, nom: b.nom, color: PALETTE[i % PALETTE.length],
      ca, ventes, prod,
      pret: dernier?.briques?.[b.id]?.pret || 0,
      sechage: dernier?.briques?.[b.id]?.sechage || 0
    }
  }), [types, facturesP, productionsP, dernier])

  const typeRow = scope === TOUTES ? null : parType.find((t) => t.id === scope)
  const scopeLabel = scope === TOUTES ? 'Tous types de briques' : (typeRow?.nom || scope)
  const rowsScope = scope === TOUTES ? parType : parType.filter((t) => t.id === scope)

  // Totaux du périmètre.
  const caTotal = scope === TOUTES ? facturesP.reduce((s, f) => s + (f.totalTTC || 0), 0) : (typeRow?.ca || 0)
  const nbFactures = scope === TOUTES
    ? facturesP.length
    : facturesP.filter((f) => (f.lignes || []).some((l) => ligneBrique(l) === scope)).length
  const prodTotal = scope === TOUTES ? productionsP.reduce((s, p) => s + (p.totalBriques || 0), 0) : (typeRow?.prod || 0)
  const ventesVol = rowsScope.reduce((s, t) => s + t.ventes, 0)
  const stockPret = rowsScope.reduce((s, t) => s + t.pret, 0)
  const stockSechage = rowsScope.reduce((s, t) => s + t.sechage, 0)

  const panierMoyen = nbFactures ? caTotal / nbFactures : 0
  const prixMoyen = ventesVol ? caTotal / ventesVol : 0
  const tauxEcoulement = prodTotal ? (ventesVol / prodTotal) * 100 : 0

  // Ventes de la période — commandes enregistrées, restreintes au type filtré.
  const venteDansScope = (v) => scope === TOUTES || (v.lignes || []).some((l) => l.briqueId === scope)
  const ventesP = useMemo(
    () => ventes.filter((v) => inPeriode(v.date) && venteDansScope(v)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [ventes, start, end, scope]
  )
  const ventesMontant = ventesP.reduce((s, v) => s + (v.total || 0), 0)

  // Clients servis : clients distincts facturés sur la période, avec leur poids.
  const clientsServis = useMemo(() => {
    const map = {}
    facturesP.forEach((f) => {
      const nom = (f.client?.nom || '').trim() || '—'
      const montant = scope === TOUTES
        ? (f.totalTTC || 0)
        : (f.lignes || []).filter((l) => ligneBrique(l) === scope)
            .reduce((a, l) => a + (l.total || (parseInt(l.qte) || 0) * (parseFloat(l.prixUnit) || 0)), 0)
      if (scope !== TOUTES && montant <= 0) return
      const cur = map[nom] || { nom, montant: 0, nb: 0 }
      cur.montant += montant; cur.nb += 1
      map[nom] = cur
    })
    return Object.values(map).sort((a, b) => b.montant - a.montant)
  }, [facturesP, scope])

  // Matières (global) : consommées & coût d'achat sur la période.
  const mat = useMemo(() => {
    const conso = {}; const ent = {}; let cout = 0
    inventaires.filter((i) => inPeriode(i.date)).forEach((i) => Object.entries(i.matieres || {}).forEach(([id, m]) => {
      cout += m.coutEntrees || 0
      ent[id] = (ent[id] || 0) + (m.ent != null ? m.ent : (m.entrees || []).reduce((s, l) => s + (parseFloat(l.qte) || 0), 0))
      conso[id] = (conso[id] || 0) + (m.conso != null ? m.conso : (m.consommations || []).reduce((s, l) => s + (parseFloat(l.qte) || 0), 0))
    }))
    return { conso, ent, cout }
  }, [inventaires, start, end])

  const autorisations = demandes.filter((d) => estActif(d.statut)).length

  // ── Période précédente (mêmes règles de périmètre) → deltas décisionnels ──
  const caOf = (facts) => scope === TOUTES
    ? facts.reduce((s, f) => s + (f.totalTTC || 0), 0)
    : facts.reduce((s, f) => s + (f.lignes || []).filter((l) => ligneBrique(l) === scope).reduce((a, l) => a + (l.total || (parseInt(l.qte) || 0) * (parseFloat(l.prixUnit) || 0)), 0), 0)
  const volOf = (facts) => facts.reduce((s, f) => s + (f.lignes || []).reduce((a, l) => { const id = ligneBrique(l); return (scope === TOUTES ? !!id : id === scope) ? a + (parseInt(l.qte) || 0) : a }, 0), 0)
  const prodOf = (prods) => prods.reduce((s, p) => s + (scope === TOUTES ? (p.totalBriques || 0) : (p.lignes || []).filter((l) => l.briqueId === scope).reduce((a, l) => a + (parseInt(l.qte) || 0), 0)), 0)

  const facturesPrev = useMemo(() => comparable ? factures.filter((f) => inPrev(f.date)) : [], [factures, prevStart, prevEnd, comparable])
  const productionsPrev = useMemo(() => comparable ? productions.filter((p) => inPrev(p.date)) : [], [productions, prevStart, prevEnd, comparable])
  const caPrev = caOf(facturesPrev)
  const ventesPrev = volOf(facturesPrev)
  const prodPrev = prodOf(productionsPrev)
  const prixPrev = ventesPrev ? caPrev / ventesPrev : 0
  const ecoulPrev = prodPrev ? (ventesPrev / prodPrev) * 100 : 0
  const nbVentesPrev = comparable ? ventes.filter((v) => inPrev(v.date) && venteDansScope(v)).length : 0
  const nbClientsPrev = comparable
    ? new Set(facturesPrev.map((f) => (f.client?.nom || '').trim() || '—')).size
    : 0
  const pct = (cur, prev) => (comparable && prev > 0) ? ((cur - prev) / prev) * 100 : null

  // Graphiques.
  const caParTypeChart = {
    labels: parType.filter((t) => t.ca > 0).map((t) => t.nom),
    datasets: [{ data: parType.filter((t) => t.ca > 0).map((t) => t.ca), backgroundColor: parType.filter((t) => t.ca > 0).map((t) => t.color) }]
  }
  const prodVentesChart = {
    labels: rowsScope.map((t) => t.nom),
    datasets: [
      { label: 'Production', data: rowsScope.map((t) => t.prod), backgroundColor: '#7c3aed' },
      { label: 'Ventes', data: rowsScope.map((t) => t.ventes), backgroundColor: '#16a34a' }
    ]
  }
  // Hero BI : CA par sous-période, période actuelle VS précédente (momentum).
  const caTrend = useMemo(() => {
    let s0 = start, e0 = end
    if (!comparable || start < '2000-01-01') {
      const ds = factures.map((f) => f.date).filter(Boolean).sort()
      s0 = ds[0] || end; e0 = ds[ds.length - 1] || end
    }
    const s = new Date(s0), e = new Date(e0)
    const span = Math.max(1, Math.round((e - s) / 86400000) + 1)
    const gran = span <= 14 ? 'day' : span <= 92 ? 'week' : 'month'
    const iso = (d) => d.toISOString().slice(0, 10)
    const dm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    const buckets = []
    if (gran === 'day') {
      for (let i = 0; i < span; i++) { const d = new Date(s); d.setDate(d.getDate() + i); buckets.push({ from: iso(d), to: iso(d), label: dm(d) }) }
    } else if (gran === 'week') {
      let cur = new Date(s)
      while (cur <= e) { const from = new Date(cur); const to = new Date(cur); to.setDate(to.getDate() + 6); buckets.push({ from: iso(from), to: iso(to > e ? e : to), label: dm(from) }); cur.setDate(cur.getDate() + 7) }
    } else {
      let cur = new Date(s.getFullYear(), s.getMonth(), 1)
      while (cur <= e) { const from = new Date(cur.getFullYear(), cur.getMonth(), 1); const to = new Date(cur.getFullYear(), cur.getMonth() + 1, 0); buckets.push({ from: iso(from < s ? s : from), to: iso(to > e ? e : to), label: cur.toLocaleDateString('fr-FR', { month: 'short' }) }); cur.setMonth(cur.getMonth() + 1) }
    }
    const caIn = (from, to) => caOf(factures.filter((f) => (f.date || '') >= from && (f.date || '') <= to))
    const cur = buckets.map((b) => caIn(b.from, b.to))
    const prev = (comparable && start >= '2000-01-01') ? buckets.map((b) => caIn(addDays(b.from, -dayCount), addDays(b.to, -dayCount))) : null
    return { labels: buckets.map((b) => b.label), cur, prev }
  }, [factures, start, end, scope, comparable, dayCount])
  const caDelta = pct(caTotal, caPrev)

  const kpis = [
    { id: 'ca', title: 'Chiffre d\'affaires', value: formatMoney(caTotal), delta: pct(caTotal, caPrev), up: true, sub: comparable ? `préc. ${formatMoney(caPrev)}` : `${nbFactures} facture(s)`, icon: BadgeDollarSign, color: '#7c3aed' },
    { id: 'ventesTot', title: 'Ventes de la période', value: formatNumber(ventesP.length), delta: pct(ventesP.length, nbVentesPrev), up: true, sub: formatMoney(ventesMontant), icon: ShoppingCart, color: '#15803d' },
    { id: 'ecoul', title: 'Taux d\'écoulement', value: `${tauxEcoulement.toFixed(0)} %`, deltaPP: comparable ? (tauxEcoulement - ecoulPrev) : null, up: true, sub: 'ventes ÷ production', icon: Percent, color: '#0d9488' },
    { id: 'prix', title: 'Prix moyen / brique', value: formatMoney(prixMoyen), delta: pct(prixMoyen, prixPrev), up: true, sub: 'CA ÷ volume vendu', icon: TrendingUp, color: '#0891b2' },
    { id: 'clients', title: 'Clients servis', value: formatNumber(clientsServis.length), delta: pct(clientsServis.length, nbClientsPrev), up: true, sub: `${formatNumber(nbFactures)} facture(s)`, icon: Users, color: '#0891b2' }
  ]

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-r from-violet-700 to-violet-900 p-4 text-white shadow-lg">
        <Boxes size={22} />
        <div>
          <h2 className="text-base font-extrabold">Pilotage &amp; Analyse — Briqueterie</h2>
          <p className="text-xs text-white/80">Indicateurs clés de performance · par type de brique · par période</p>
        </div>
        <div className="w-full sm:ml-auto sm:w-auto [&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:text-white [&_.input-base]:font-semibold [&_label]:text-white">
          {periodNode}
        </div>
      </div>

      {/* Filtre par type de brique */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-bold uppercase tracking-wide text-gray-400">Type :</span>
        <ScopeTab active={scope === TOUTES} color="#374151" onClick={() => setScope(TOUTES)}>Tous</ScopeTab>
        {parType.map((t) => (
          <ScopeTab key={t.id} active={scope === t.id} color={t.color} onClick={() => setScope(t.id)}>{t.nom}</ScopeTab>
        ))}
      </div>
      <p className="-mt-3 text-xs font-semibold text-gray-500">Indicateurs — {scopeLabel} · {formatDateShort(start)} → {formatDateShort(end)}</p>

      {/* KPI décisionnels avec variation vs période précédente */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => {
          const raw = k.delta != null ? k.delta : (k.deltaPP != null ? k.deltaPP : null)
          const positive = (raw ?? 0) >= 0
          const good = k.up ? positive : !positive
          const chip = k.delta != null ? `${positive ? '+' : ''}${k.delta.toFixed(1)} %` : (k.deltaPP != null ? `${positive ? '+' : ''}${k.deltaPP.toFixed(1)} pt` : null)
          return (
          <button key={k.id} type="button" onClick={() => setModal(k.id)}
            className="card group p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <div className="mb-2 flex items-center justify-between gap-1">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: k.color + '18', color: k.color }}><k.icon size={18} /></div>
              {chip && (
                <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${good ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{chip}
                </span>
              )}
            </div>
            {/* truncate + title : un montant long est coupé proprement, lisible au survol. */}
            <p className="truncate text-[10px] font-bold uppercase tracking-wide text-gray-500" title={k.title}>{k.title}</p>
            <p className="truncate text-lg font-extrabold leading-tight text-gray-900 sm:text-xl" title={String(k.value)}>{k.value}</p>
            {k.sub && <p className="mt-0.5 truncate text-[10px] text-gray-400" title={k.sub}>{k.sub}</p>}
          </button>
        )})}
      </div>
      {comparable && <p className="-mt-3 text-[11px] text-gray-400">▲▼ variation vs période précédente équivalente ({formatDateShort(prevStart)} → {formatDateShort(prevEnd)})</p>}

      {/* Hero BI : CA par sous-période, actuel vs précédent */}
      <Card title="Chiffre d'affaires par sous-période — actuel vs précédent">
        <div className="h-64">
          {caTrend.cur.some((v) => v > 0) || (caTrend.prev || []).some((v) => v > 0) ? (
            <Bar data={{
              labels: caTrend.labels,
              datasets: [
                { label: 'Période actuelle', data: caTrend.cur, backgroundColor: '#7c3aed', borderRadius: 4, maxBarThickness: 34 },
                ...(caTrend.prev ? [{ label: 'Période précédente', data: caTrend.prev, backgroundColor: '#ddd0f5', borderRadius: 4, maxBarThickness: 34 }] : [])
              ]
            }} options={{
              maintainAspectRatio: false,
              plugins: {
                legend: { display: !!caTrend.prev, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: (c) => `${c.dataset.label} : ${formatMoney(c.parsed.y)}` } }
              },
              scales: { y: { ticks: { callback: (v) => formatNumber(v) } } }
            }} />
          ) : <p className="py-16 text-center text-sm text-gray-400">Aucune facture sur la période</p>}
        </div>
        {caDelta != null && (
          <p className={`mt-2 text-sm font-semibold ${caDelta >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {caDelta >= 0 ? '▲' : '▼'} CA {caDelta >= 0 ? 'en hausse' : 'en baisse'} de {Math.abs(caDelta).toFixed(1)} % vs période précédente
            <span className="font-normal text-gray-400"> ({formatMoney(caPrev)} → {formatMoney(caTotal)})</span>
          </p>
        )}
      </Card>

      {/* Répartition du CA + Production vs Ventes */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="CA par type de brique">
          <div className="h-64">
            {parType.some((t) => t.ca > 0) ? <Doughnut data={caParTypeChart} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } }} /> : <p className="py-16 text-center text-sm text-gray-400">Aucune facture sur la période</p>}
          </div>
        </Card>
        <Card title="Production vs Ventes" className="lg:col-span-2">
          <div className="h-64">
            {rowsScope.length ? <Bar data={prodVentesChart} options={{ maintainAspectRatio: false }} /> : <p className="py-16 text-center text-sm text-gray-400">Aucune donnée</p>}
          </div>
        </Card>
      </div>

      {/* Détail par type */}
      <Card title="Détail par type de brique — période">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-2 py-2 text-center">Production</th>
                <th className="px-2 py-2 text-center">Ventes</th>
                <th className="px-2 py-2 text-center">Prêt</th>
                <th className="px-2 py-2 text-center">Séchage</th>
                <th className="px-2 py-2 text-right">Chiffre d'affaires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parType.map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setScope(t.id)}>
                  <td className="px-3 py-1.5 font-semibold" style={{ color: t.color }}>{t.nom}</td>
                  <td className="px-2 py-1.5 text-center text-violet-700">{formatNumber(t.prod)}</td>
                  <td className="px-2 py-1.5 text-center text-green-600">{formatNumber(t.ventes)}</td>
                  <td className="px-2 py-1.5 text-center font-bold">{formatNumber(t.pret)}</td>
                  <td className="px-2 py-1.5 text-center text-amber-600">{formatNumber(t.sechage)}</td>
                  <td className="px-2 py-1.5 text-right font-bold text-sky-700">{formatMoney(t.ca)}</td>
                </tr>
              ))}
              {!parType.length && <tr><td colSpan={6} className="py-6 text-center text-gray-400">Aucun type de brique.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Matières premières : arrivages, consommation, stock */}
      <Card title="Matières premières — arrivages, consommation, stock">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr><th className="px-3 py-2 text-left">Matière</th><th className="px-3 py-2 text-center text-green-700">Arrivages</th><th className="px-3 py-2 text-center text-orange-700">Consommée</th><th className="px-3 py-2 text-center">Stock actuel</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matieres.map((m) => {
                const ent = mat.ent[m.id] || 0
                const conso = mat.conso[m.id] || 0
                const stock = dernier?.matieres?.[m.id]?.fin || 0
                return (
                  <tr key={m.id}>
                    <td className="px-3 py-1.5 font-semibold">{m.nom} <span className="text-[10px] font-normal text-gray-400">({m.unite})</span></td>
                    <td className="px-3 py-1.5 text-center font-bold text-green-700">{ent ? '+' + formatNumber(Math.round(ent * 10) / 10) : '—'}</td>
                    <td className="px-3 py-1.5 text-center font-bold text-orange-700">{conso ? '−' + formatNumber(Math.round(conso * 10) / 10) : '—'}</td>
                    <td className="px-3 py-1.5 text-center text-base font-extrabold text-violet-700">{formatNumber(Math.round(stock * 10) / 10)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">Coût matières achetées sur la période : <strong>{formatMoney(mat.cout)}</strong> — marge brute indicative : CA − coût matières.</p>
      </Card>

      <PilotageModal id={modal} onClose={() => setModal(null)} scopeLabel={scopeLabel}
        data={{ facturesP, productionsP, parType, ligneBrique, scope, ventesP, ventesMontant, clientsServis }} />
    </div>
  )
}

function ScopeTab({ active, color, onClick, children }) {
  return (
    <button onClick={onClick} type="button"
      className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors"
      style={active ? { background: color, color: '#fff' } : { background: '#f1f5f9', color: '#475569' }}>
      {children}
    </button>
  )
}

function PilotageModal({ id, onClose, scopeLabel, data }) {
  if (!id) return null
  const titles = {
    ca: 'Factures de la période', panier: 'Factures de la période', prix: 'Factures de la période',
    prod: 'Productions de la période', ecoul: 'Productions de la période',
    ventesTot: 'Ventes de la période', clients: 'Clients servis',
    ventes: 'Ventes par type', pret: 'Stock par type', autos: 'Autorisations', prodType: 'Détail'
  }
  let content = null
  if (id === 'ventesTot') {
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase">
          <tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">N°</th><th className="p-2 text-left">Client</th><th className="p-2 text-center">Briques</th><th className="p-2 text-right">Montant</th></tr>
        </thead>
        <tbody>{data.ventesP.map((v) => (
          <tr key={v.id} className="border-t">
            <td className="p-2">{formatDateShort(v.date)}</td>
            <td className="p-2 font-mono text-xs text-gray-500">{v.num}</td>
            <td className="p-2">{v.clientNom || '—'}</td>
            <td className="p-2 text-center font-semibold">{formatNumber((v.lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0))}</td>
            <td className="p-2 text-right font-bold text-green-700">{formatMoney(v.total || 0)}</td>
          </tr>
        ))}{!data.ventesP.length && <tr><td colSpan={5} className="p-4 text-center text-gray-400">Aucune vente sur la période.</td></tr>}</tbody>
        {data.ventesP.length > 0 && (
          <tfoot><tr className="border-t bg-gray-50">
            <td colSpan={4} className="p-2 text-right text-xs font-bold uppercase text-gray-500">Montant total</td>
            <td className="p-2 text-right text-base font-extrabold text-green-700">{formatMoney(data.ventesMontant)}</td>
          </tr></tfoot>
        )}
      </table>
    )
  } else if (id === 'clients') {
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase">
          <tr><th className="p-2 text-left">Client</th><th className="p-2 text-center">Factures</th><th className="p-2 text-right">Montant</th></tr>
        </thead>
        <tbody>{data.clientsServis.map((c) => (
          <tr key={c.nom} className="border-t">
            <td className="p-2 font-semibold">{c.nom}</td>
            <td className="p-2 text-center">{formatNumber(c.nb)}</td>
            <td className="p-2 text-right font-bold text-sky-700">{formatMoney(c.montant)}</td>
          </tr>
        ))}{!data.clientsServis.length && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Aucun client facturé.</td></tr>}</tbody>
      </table>
    )
  } else if (['ca', 'panier', 'prix'].includes(id)) {
    const rows = [...data.facturesP].sort((a, b) => (a.date < b.date ? 1 : -1))
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">Date</th><th className="p-2">Client</th><th className="p-2 text-right">Montant TTC</th></tr></thead>
        <tbody>{rows.map((f) => (
          <tr key={f.id} className="border-t"><td className="p-2">{formatDateShort(f.date)}</td><td className="p-2">{f.client?.nom || '—'}</td><td className="p-2 text-right font-bold">{formatMoney(f.totalTTC || 0)}</td></tr>
        ))}{!rows.length && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Aucune facture.</td></tr>}</tbody>
      </table>
    )
  } else if (['prod', 'ecoul'].includes(id)) {
    const rows = [...data.productionsP].sort((a, b) => (a.date < b.date ? 1 : -1))
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">Date</th><th className="p-2 text-center">Briques</th><th className="p-2 text-center">Caillasses</th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id} className="border-t"><td className="p-2">{formatDateShort(p.date)}</td><td className="p-2 text-center font-bold text-violet-700">{formatNumber(p.totalBriques || 0)}</td><td className="p-2 text-center text-gray-500">{formatNumber(p.caillasses || 0)}</td></tr>
        ))}{!rows.length && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Aucune production.</td></tr>}</tbody>
      </table>
    )
  } else {
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2 text-left">Type</th><th className="p-2 text-center">Production</th><th className="p-2 text-center">Ventes</th><th className="p-2 text-center">Prêt</th><th className="p-2 text-right">CA</th></tr></thead>
        <tbody>{data.parType.map((t) => (
          <tr key={t.id} className="border-t"><td className="p-2 font-semibold" style={{ color: t.color }}>{t.nom}</td><td className="p-2 text-center">{formatNumber(t.prod)}</td><td className="p-2 text-center text-green-600">{formatNumber(t.ventes)}</td><td className="p-2 text-center font-bold">{formatNumber(t.pret)}</td><td className="p-2 text-right font-bold text-sky-700">{formatMoney(t.ca)}</td></tr>
        ))}</tbody>
      </table>
    )
  }
  return (
    <Modal open onClose={onClose} size="lg" title={`${titles[id] || 'Détail'} — ${scopeLabel}`}
      panelClassName="bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-300/75 backdrop-blur-2xl backdrop-saturate-200">
      <div className="max-h-[60vh] overflow-auto rounded-lg bg-white">{content}</div>
    </Modal>
  )
}

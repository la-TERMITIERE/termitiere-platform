// Pilotage & Analyse — BRIQUETERIE (vue direction / investisseurs).
// Indicateurs clés de performance filtrables par PÉRIODE et par TYPE de brique :
// chiffre d'affaires, production, ventes (volume), écoulement, stock, rebut
// (caillasses), matières & marge brute indicative. Détail par type de brique.
import { useMemo, useState } from 'react'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import {
  BadgeDollarSign, Factory, Package, TrendingUp, Layers, Coins,
  Percent, Recycle, ShoppingCart, Send, ClipboardList, Boxes
} from 'lucide-react'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useBriqueterieStore } from './store/referentielStore'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { estActif } from '../../shared/workflow'
import { formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'

const TOUTES = '__TOUTES__'
const PALETTE = ['#7c3aed', '#6366f1', '#0284c7', '#0d9488', '#16a34a', '#ca8a04', '#db2777', '#ea580c', '#0891b2', '#4f46e5']

export default function Pilotage() {
  const briques = useBriqueterieStore((s) => s.briques)
  const matieres = useBriqueterieStore((s) => s.matieres)
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: factures } = useCollection('evenementiel_factures')
  const { data: demandes } = useCollection('evenementiel_demandes')

  const { start, end, node: periodNode } = usePeriodSelect('30')
  const [scope, setScope] = useState(TOUTES)
  const [modal, setModal] = useState(null)

  const inPeriode = (d) => (d || '') >= start && (d || '') <= end
  const dernier = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [inventaires])

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

  // Rebut (caillasses) — global : produites sur la période + stock actuel.
  const caillassesProd = productionsP.reduce((s, p) => s + (parseInt(p.caillasses) || 0), 0)
  const caillassesStock = dernier?.briques?.caillasses?.caillasses || 0
  const tauxRebut = (prodTotal + caillassesProd) > 0 ? (caillassesProd / (prodTotal + caillassesProd)) * 100 : 0

  // Matières (global) : consommées & coût d'achat sur la période, marge brute indicative.
  const mat = useMemo(() => {
    const conso = {}; const ent = {}; let cout = 0
    productionsP.forEach((p) => Object.entries(p.consommation || {}).forEach(([id, q]) => { conso[id] = (conso[id] || 0) + (parseFloat(q) || 0) }))
    inventaires.filter((i) => inPeriode(i.date)).forEach((i) => Object.entries(i.matieres || {}).forEach(([id, m]) => {
      cout += m.coutEntrees || 0
      ent[id] = (ent[id] || 0) + (m.ent != null ? m.ent : (m.entrees || []).reduce((s, l) => s + (parseFloat(l.qte) || 0), 0))
    }))
    return { conso, ent, cout }
  }, [productionsP, inventaires, start, end])
  const margeBrute = caTotal - mat.cout
  const tauxMarge = caTotal ? (margeBrute / caTotal) * 100 : 0

  const autorisations = demandes.filter((d) => estActif(d.statut)).length

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
  const evoCA = useMemo(() => {
    const map = {}
    facturesP.forEach((f) => {
      const montant = scope === TOUTES ? (f.totalTTC || 0) : (f.lignes || []).filter((l) => ligneBrique(l) === scope).reduce((s, l) => s + (l.total || (parseInt(l.qte) || 0) * (parseFloat(l.prixUnit) || 0)), 0)
      if (f.date && montant) map[f.date] = (map[f.date] || 0) + montant
    })
    const keys = Object.keys(map).sort()
    let cumul = 0
    return {
      labels: keys.map((k) => k.slice(5)),
      datasets: [{ label: 'CA cumulé', data: keys.map((k) => (cumul += map[k])), borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.12)', fill: true, tension: 0.3, pointRadius: 2 }]
    }
  }, [facturesP, scope])

  const kpis = [
    { id: 'ca', title: 'Chiffre d\'affaires', value: formatMoney(caTotal), sub: `${nbFactures} facture(s)`, icon: BadgeDollarSign, color: '#7c3aed' },
    { id: 'prod', title: 'Production', value: formatNumber(prodTotal), sub: 'briques produites', icon: Factory, color: '#6366f1' },
    { id: 'ventes', title: 'Ventes (volume)', value: formatNumber(ventesVol), sub: 'briques facturées', icon: ShoppingCart, color: '#16a34a' },
    { id: 'ecoul', title: 'Taux d\'écoulement', value: `${tauxEcoulement.toFixed(0)} %`, sub: 'ventes / production', icon: Percent, color: '#0d9488' },
    { id: 'panier', title: 'Panier moyen', value: formatMoney(panierMoyen), sub: 'par facture', icon: Coins, color: '#0284c7' },
    { id: 'prix', title: 'Prix moyen / brique', value: formatMoney(prixMoyen), sub: 'CA / volume vendu', icon: TrendingUp, color: '#0891b2' },
    { id: 'pret', title: 'Stock prêt à vendre', value: formatNumber(stockPret), sub: `${formatNumber(stockSechage)} en séchage`, icon: Package, color: '#16a34a' },
    { id: 'marge', title: 'Marge brute (est.)', value: formatMoney(margeBrute), sub: `${tauxMarge.toFixed(0)} % · matières ${formatMoney(mat.cout)}`, icon: Layers, color: margeBrute >= 0 ? '#15803d' : '#dc2626' },
    { id: 'rebut', title: 'Rebut (caillasses)', value: `${tauxRebut.toFixed(1)} %`, sub: `${formatNumber(caillassesProd)} prod. · ${formatNumber(caillassesStock)} en stock`, icon: Recycle, color: '#64748b' },
    { id: 'autos', title: 'Autorisations', value: autorisations, sub: 'sorties à traiter', icon: Send, color: autorisations ? '#d97706' : '#64748b' }
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

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <button key={k.id} type="button" onClick={() => setModal(k.id)}
            className="card group p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: k.color + '18', color: k.color }}><k.icon size={18} /></div>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{k.title}</p>
            <p className="text-xl font-extrabold text-gray-900">{k.value}</p>
            {k.sub && <p className="mt-0.5 text-[10px] text-gray-400">{k.sub}</p>}
          </button>
        ))}
      </div>

      {/* Graphiques */}
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

      <Card title="Évolution du chiffre d'affaires">
        <div className="h-56">
          {evoCA.labels.length ? <Line data={evoCA} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /> : <p className="py-16 text-center text-sm text-gray-400">Aucune facture sur la période</p>}
        </div>
      </Card>

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
        data={{ facturesP, productionsP, parType, ligneBrique, scope }} />
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
    ca: 'Factures de la période', panier: 'Factures de la période', prix: 'Factures de la période', marge: 'Factures de la période',
    prod: 'Productions de la période', ecoul: 'Productions de la période',
    ventes: 'Ventes par type', pret: 'Stock par type', rebut: 'Productions & rebut', autos: 'Autorisations', prodType: 'Détail'
  }
  let content = null
  if (['ca', 'panier', 'prix', 'marge'].includes(id)) {
    const rows = [...data.facturesP].sort((a, b) => (a.date < b.date ? 1 : -1))
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">Date</th><th className="p-2">Client</th><th className="p-2 text-right">Montant TTC</th></tr></thead>
        <tbody>{rows.map((f) => (
          <tr key={f.id} className="border-t"><td className="p-2">{formatDateShort(f.date)}</td><td className="p-2">{f.client?.nom || '—'}</td><td className="p-2 text-right font-bold">{formatMoney(f.totalTTC || 0)}</td></tr>
        ))}{!rows.length && <tr><td colSpan={3} className="p-4 text-center text-gray-400">Aucune facture.</td></tr>}</tbody>
      </table>
    )
  } else if (['prod', 'ecoul', 'rebut'].includes(id)) {
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
    <Modal open onClose={onClose} size="lg" title={`${titles[id] || 'Détail'} — ${scopeLabel}`}>
      <div className="max-h-[60vh] overflow-auto">{content}</div>
    </Modal>
  )
}

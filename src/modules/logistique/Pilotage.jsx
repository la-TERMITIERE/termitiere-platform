// Pilotage & Analyse — MAXI LOGISTIQUE (par SITE, vue direction / investisseurs).
// Indicateurs clés filtrables par PÉRIODE et par CATÉGORIE de matériel :
// chiffre d'affaires, prestations, panier moyen, matériel loué (rotation), taux de
// casse / perte, valeur du parc, stock. Détail par catégorie de matériel.
import { useMemo, useState } from 'react'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import {
  BadgeDollarSign, ClipboardList, Coins, RotateCcw, AlertTriangle,
  Boxes, Warehouse, Percent, TrendingUp, Send, Truck
} from 'lucide-react'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useLogistiqueStore } from './store/referentielStore'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { estActif } from '../../shared/workflow'
import { formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
import { CAT_MATERIEL, catColor } from './data'
import { useSite, matchSite, siteLabel } from './site/useSite'

const TOUTES = '__TOUTES__'

export default function Pilotage() {
  const materiel = useLogistiqueStore((s) => s.materiel)
  const site = useSite()
  const { data: allInventaires } = useCollection('logistique_inventaires')
  const { data: allPrestations } = useCollection('logistique_prestations')
  const { data: allFactures } = useCollection('logistique_factures')
  const { data: allDemandes } = useCollection('logistique_demandes')
  const { data: allRetours } = useCollection('logistique_retours')

  const inventaires = useMemo(() => allInventaires.filter((i) => matchSite(i, site)), [allInventaires, site])
  const prestations = useMemo(() => allPrestations.filter((p) => matchSite(p, site)), [allPrestations, site])
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const demandes = useMemo(() => allDemandes.filter((d) => matchSite(d, site)), [allDemandes, site])
  const retours = useMemo(() => allRetours.filter((r) => matchSite(r, site)), [allRetours, site])

  const { start, end, node: periodNode } = usePeriodSelect('30')
  const [scope, setScope] = useState(TOUTES)
  const [modal, setModal] = useState(null)

  const inPeriode = (d) => (d || '') >= start && (d || '') <= end
  const dernier = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [inventaires])

  // Catégorie d'un matériel (par id) — pour rattacher CA / sorties / retours.
  const catOf = useMemo(() => {
    const m = {}; materiel.forEach((x) => { m[x.id] = x.cat }); return m
  }, [materiel])
  const cats = useMemo(() => {
    const custom = [...new Set(materiel.map((m) => m.cat))].filter((c) => !CAT_MATERIEL.includes(c))
    return [...CAT_MATERIEL, ...custom].filter((c) => materiel.some((m) => m.cat === c))
  }, [materiel])
  const inScope = (cat) => scope === TOUTES || cat === scope
  const scopeLabel = scope === TOUTES ? 'Toutes catégories' : scope

  // CA = factures APPROUVÉES (autorisation de sortie certifiée) de la période.
  const facturesP = useMemo(() => factures.filter((f) => f.statut === 'approuvee' && inPeriode(f.date)), [factures, start, end])
  const prestationsP = useMemo(() => prestations.filter((p) => inPeriode(p.date)), [prestations, start, end])
  const retoursP = useMemo(() => retours.filter((r) => inPeriode(r.date)), [retours, start, end])

  // Montant d'une facture rapporté au périmètre (total, ou lignes de la catégorie).
  const montantScope = (f) => scope === TOUTES
    ? (f.totalTTC || 0)
    : (f.lignes || []).filter((l) => inScope(catOf[l.materielId] || l.cat)).reduce((s, l) => s + (l.montant || 0), 0)

  const caTotal = facturesP.reduce((s, f) => s + montantScope(f), 0)
  const nbPrestations = scope === TOUTES
    ? prestationsP.length
    : prestationsP.filter((p) => (p.lignes || []).some((l) => inScope(catOf[l.materielId] || l.cat))).length
  const panierMoyen = nbPrestations ? caTotal / nbPrestations : 0

  // Matériel loué (volume de sorties) sur la période, par catégorie.
  const loueParCat = useMemo(() => {
    const map = {}
    prestationsP.forEach((p) => (p.lignes || []).forEach((l) => {
      if (!l.materielId) return
      const cat = catOf[l.materielId] || l.cat || 'AUTRES'
      map[cat] = (map[cat] || 0) + (parseInt(l.qte) || 0)
    }))
    return map
  }, [prestationsP, catOf])
  const loueTotal = Object.entries(loueParCat).reduce((s, [cat, q]) => s + (inScope(cat) ? q : 0), 0)

  // Retours : OK vs casse/perte (taux de casse — indicateur de perte pour investisseurs).
  const retoursScope = retoursP.filter((r) => inScope(catOf[r.materielId] || 'AUTRES'))
  const retourOk = retoursScope.filter((r) => r.type === 'OK').reduce((s, r) => s + (parseInt(r.qte) || 0), 0)
  const retourCasse = retoursScope.filter((r) => r.type === 'Cassé').reduce((s, r) => s + (parseInt(r.qte) || 0), 0)
  const retourPerdu = retoursScope.filter((r) => r.type === 'Perdu').reduce((s, r) => s + (parseInt(r.qte) || 0), 0)
  const totalRetours = retourOk + retourCasse + retourPerdu
  const tauxCasse = totalRetours ? ((retourCasse + retourPerdu) / totalRetours) * 100 : 0

  // Stock & valeur du parc (par catégorie).
  const parCat = useMemo(() => cats.map((cat) => {
    const items = materiel.filter((m) => m.cat === cat)
    const stock = items.reduce((s, m) => s + (dernier?.materiels?.[m.id]?.fin || 0), 0)
    const valeur = items.reduce((s, m) => s + (dernier?.materiels?.[m.id]?.fin || 0) * (m.coutAchat || 0), 0)
    let ca = 0
    facturesP.forEach((f) => (f.lignes || []).forEach((l) => { if ((catOf[l.materielId] || l.cat) === cat) ca += l.montant || 0 }))
    return { cat, color: catColor(cat), stock, valeur, loue: loueParCat[cat] || 0, ca }
  }), [cats, materiel, dernier, facturesP, loueParCat, catOf])

  const rowsScope = scope === TOUTES ? parCat : parCat.filter((p) => p.cat === scope)
  const stockTotal = rowsScope.reduce((s, p) => s + p.stock, 0)
  const valeurParc = rowsScope.reduce((s, p) => s + p.valeur, 0)
  const rotation = valeurParc > 0 ? (caTotal / valeurParc) * 100 : 0
  const autorisations = demandes.filter((d) => estActif(d.statut)).length

  // Graphiques.
  const caParCatChart = {
    labels: parCat.filter((p) => p.ca > 0).map((p) => p.cat),
    datasets: [{ data: parCat.filter((p) => p.ca > 0).map((p) => p.ca), backgroundColor: parCat.filter((p) => p.ca > 0).map((p) => p.color) }]
  }
  const stockValeurChart = {
    labels: rowsScope.map((p) => p.cat),
    datasets: [{ label: 'Valeur du parc', data: rowsScope.map((p) => p.valeur), backgroundColor: rowsScope.map((p) => p.color) }]
  }
  const evoCA = useMemo(() => {
    const map = {}
    facturesP.forEach((f) => { const m = montantScope(f); if (f.date && m) map[f.date] = (map[f.date] || 0) + m })
    const keys = Object.keys(map).sort()
    let cumul = 0
    return {
      labels: keys.map((k) => k.slice(5)),
      datasets: [{ label: 'CA cumulé', data: keys.map((k) => (cumul += map[k])), borderColor: '#BC3C31', backgroundColor: 'rgba(188,60,49,0.12)', fill: true, tension: 0.3, pointRadius: 2 }]
    }
  }, [facturesP, scope])

  const topClients = useMemo(() => {
    const map = {}
    facturesP.forEach((f) => { const m = montantScope(f); if (m <= 0) return; const nom = f.clientNom || 'Inconnu'; map[nom] = (map[nom] || 0) + m })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [facturesP, scope])

  const kpis = [
    { id: 'ca', title: 'Chiffre d\'affaires', value: formatMoney(caTotal), sub: `${facturesP.length} facture(s) approuvée(s)`, icon: BadgeDollarSign, color: '#BC3C31' },
    { id: 'presta', title: 'Prestations', value: nbPrestations, sub: 'sur la période', icon: ClipboardList, color: '#0284c7' },
    { id: 'panier', title: 'Panier moyen', value: formatMoney(panierMoyen), sub: 'par prestation', icon: Coins, color: '#7c3aed' },
    { id: 'loue', title: 'Matériel loué', value: formatNumber(loueTotal), sub: 'pièces sorties', icon: Truck, color: '#0d9488' },
    { id: 'rotation', title: 'Rotation du parc', value: `${rotation.toFixed(0)} %`, sub: 'CA / valeur parc', icon: TrendingUp, color: '#16a34a' },
    { id: 'parc', title: 'Valeur du parc', value: formatMoney(valeurParc), sub: `${formatNumber(stockTotal)} pièces en stock`, icon: Warehouse, color: '#0891b2' },
    { id: 'casse', title: 'Taux de casse / perte', value: `${tauxCasse.toFixed(1)} %`, sub: `${formatNumber(retourCasse + retourPerdu)} sur ${formatNumber(totalRetours)} retours`, icon: AlertTriangle, color: tauxCasse > 5 ? '#dc2626' : '#64748b' },
    { id: 'retok', title: 'Retours OK', value: formatNumber(retourOk), sub: 'matériel réintégré', icon: RotateCcw, color: '#16a34a' },
    { id: 'stock', title: 'Stock disponible', value: formatNumber(stockTotal), sub: scopeLabel, icon: Boxes, color: '#64748b' },
    { id: 'autos', title: 'Autorisations', value: autorisations, sub: 'sorties à traiter', icon: Send, color: autorisations ? '#d97706' : '#64748b' }
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-r from-[#BC3C31] to-[#6B1A10] p-4 text-white shadow-lg">
        <Boxes size={22} />
        <div>
          <h2 className="text-base font-extrabold">Pilotage &amp; Analyse — Maxi Logistique · {siteLabel(site)}</h2>
          <p className="text-xs text-white/80">Indicateurs clés de performance · par catégorie · par période</p>
        </div>
        <div className="w-full sm:ml-auto sm:w-auto [&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:text-white [&_.input-base]:font-semibold [&_label]:text-white">
          {periodNode}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-bold uppercase tracking-wide text-gray-400">Catégorie :</span>
        <ScopeTab active={scope === TOUTES} color="#374151" onClick={() => setScope(TOUTES)}>Toutes</ScopeTab>
        {cats.map((c) => (
          <ScopeTab key={c} active={scope === c} color={catColor(c)} onClick={() => setScope(c)}>{c}</ScopeTab>
        ))}
      </div>
      <p className="-mt-3 text-xs font-semibold text-gray-500">Indicateurs — {scopeLabel} · {formatDateShort(start)} → {formatDateShort(end)}</p>

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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="CA par catégorie">
          <div className="h-64">
            {parCat.some((p) => p.ca > 0) ? <Doughnut data={caParCatChart} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } }} /> : <p className="py-16 text-center text-sm text-gray-400">Aucune facture approuvée sur la période</p>}
          </div>
        </Card>
        <Card title="Valeur du parc par catégorie" className="lg:col-span-2">
          <div className="h-64">
            {rowsScope.some((p) => p.valeur > 0) ? <Bar data={stockValeurChart} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /> : <p className="py-16 text-center text-sm text-gray-400">Aucun stock valorisé</p>}
          </div>
        </Card>
      </div>

      <Card title="Évolution du chiffre d'affaires">
        <div className="h-56">
          {evoCA.labels.length ? <Line data={evoCA} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /> : <p className="py-16 text-center text-sm text-gray-400">Aucune facture approuvée sur la période</p>}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Détail par catégorie de matériel — période">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Catégorie</th>
                  <th className="px-2 py-2 text-center">Loué</th>
                  <th className="px-2 py-2 text-center">Stock</th>
                  <th className="px-2 py-2 text-right">Valeur parc</th>
                  <th className="px-2 py-2 text-right">CA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parCat.map((p) => (
                  <tr key={p.cat} className="cursor-pointer hover:bg-gray-50" onClick={() => setScope(p.cat)}>
                    <td className="px-3 py-1.5 font-semibold" style={{ color: p.color }}>{p.cat}</td>
                    <td className="px-2 py-1.5 text-center text-teal-700">{formatNumber(p.loue)}</td>
                    <td className="px-2 py-1.5 text-center font-bold">{formatNumber(p.stock)}</td>
                    <td className="px-2 py-1.5 text-right text-gray-600">{formatMoney(p.valeur)}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-red-700">{formatMoney(p.ca)}</td>
                  </tr>
                ))}
                {!parCat.length && <tr><td colSpan={5} className="py-6 text-center text-gray-400">Aucune catégorie.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Top 5 clients (CA période)">
          {topClients.length ? (
            <div className="space-y-2">
              {topClients.map(([nom, ca], i) => (
                <div key={nom} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{nom}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${(ca / topClients[0][1]) * 100}%` }} />
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-red-700">{formatMoney(ca)}</span>
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-sm text-gray-400">Aucune facture approuvée</p>}
        </Card>
      </div>

      <PilotageModal id={modal} onClose={() => setModal(null)} scopeLabel={scopeLabel}
        data={{ facturesP, prestationsP, retoursScope, parCat, montantScope }} />
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
    ca: 'Factures approuvées', panier: 'Prestations', rotation: 'Factures approuvées', parc: 'Parc par catégorie', stock: 'Parc par catégorie',
    presta: 'Prestations', loue: 'Prestations', casse: 'Retours (casse / perte)', retok: 'Retours OK', autos: 'Détail'
  }
  let content = null
  if (['ca', 'rotation'].includes(id)) {
    const rows = [...data.facturesP].sort((a, b) => (a.date < b.date ? 1 : -1))
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">Date</th><th className="p-2">Client</th><th className="p-2">Prestation</th><th className="p-2 text-right">Montant</th></tr></thead>
        <tbody>{rows.map((f) => (
          <tr key={f.id} className="border-t"><td className="p-2">{formatDateShort(f.date)}</td><td className="p-2">{f.clientNom || '—'}</td><td className="p-2 text-xs text-gray-500">{f.prestationNum || '—'}</td><td className="p-2 text-right font-bold">{formatMoney(data.montantScope(f))}</td></tr>
        ))}{!rows.length && <tr><td colSpan={4} className="p-4 text-center text-gray-400">Aucune facture approuvée.</td></tr>}</tbody>
      </table>
    )
  } else if (['presta', 'loue', 'panier'].includes(id)) {
    const rows = [...data.prestationsP].sort((a, b) => (a.date < b.date ? 1 : -1))
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">N°</th><th className="p-2">Client</th><th className="p-2">Période</th><th className="p-2 text-right">Montant</th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id} className="border-t"><td className="p-2 font-mono text-xs">{p.num}</td><td className="p-2">{p.clientNom}</td><td className="p-2 text-xs">{formatDateShort(p.dateDebut)} → {formatDateShort(p.dateFin)}</td><td className="p-2 text-right font-bold">{formatMoney(p.total || 0)}</td></tr>
        ))}{!rows.length && <tr><td colSpan={4} className="p-4 text-center text-gray-400">Aucune prestation.</td></tr>}</tbody>
      </table>
    )
  } else if (['casse', 'retok'].includes(id)) {
    const rows = [...data.retoursScope].sort((a, b) => (a.date < b.date ? 1 : -1))
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">Date</th><th className="p-2">Matériel</th><th className="p-2 text-center">Qté</th><th className="p-2">État</th><th className="p-2">Motif</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className="border-t"><td className="p-2">{formatDateShort(r.date)}</td><td className="p-2 font-semibold">{r.materielNom}</td><td className="p-2 text-center">{r.qte}</td><td className={`p-2 font-semibold ${r.type === 'OK' ? 'text-green-600' : 'text-red-600'}`}>{r.type}</td><td className="p-2 text-gray-500">{r.motif || '—'}</td></tr>
        ))}{!rows.length && <tr><td colSpan={5} className="p-4 text-center text-gray-400">Aucun retour.</td></tr>}</tbody>
      </table>
    )
  } else {
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2 text-left">Catégorie</th><th className="p-2 text-center">Loué</th><th className="p-2 text-center">Stock</th><th className="p-2 text-right">Valeur</th><th className="p-2 text-right">CA</th></tr></thead>
        <tbody>{data.parCat.map((p) => (
          <tr key={p.cat} className="border-t"><td className="p-2 font-semibold" style={{ color: p.color }}>{p.cat}</td><td className="p-2 text-center">{formatNumber(p.loue)}</td><td className="p-2 text-center font-bold">{formatNumber(p.stock)}</td><td className="p-2 text-right">{formatMoney(p.valeur)}</td><td className="p-2 text-right font-bold text-red-700">{formatMoney(p.ca)}</td></tr>
        ))}</tbody>
      </table>
    )
  }
  return (
    <Modal open onClose={onClose} size="lg" title={`${titles[id] || 'Détail'} — ${scopeLabel}`}
      panelClassName="bg-gradient-to-br from-red-200/85 via-red-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200">
      <div className="max-h-[60vh] overflow-auto rounded-lg bg-white">{content}</div>
    </Modal>
  )
}

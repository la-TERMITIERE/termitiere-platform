// Dashboard MAXI-AGRO — pilotage par ESPÈCE.
// - Filtre par catégorie (onglets dynamiques) : Toutes, Ovins, Bovins, Caprins,
//   Canards, Dindons, Pintades, Poulets (+ catégories personnalisées).
// - Pour la catégorie sélectionnée : Effectif, Mortalité, Morbidité, Croissance,
//   Ventes (volume) et Chiffre d'affaires (réservé à la hiérarchie).
// - Le CA n'est compté que sur les factures CERTIFIÉES.
import { useMemo, useState } from 'react'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import { TrendingUp, TrendingDown, Boxes, HeartPulse, Stethoscope, Sprout, ShoppingCart, Wallet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import LoadingSpinner from '../../shared/ui/LoadingSpinner'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { canViewFinance } from '../../core/roles'
import { useAgroStore } from './store/agroStore'
import { CAT_ANIMAUX, catColor, factureStatut } from './data'
import { agregerAchatsVentes, previsionSerie } from './logic'
import { formatNumber, formatMoney, todayStr, addDays, formatDateShort } from '../../utils/formatters'

const PRESETS = [
  { v: 'journalier', label: 'Journalier (aujourd\'hui)' },
  { v: '7', label: 'Hebdomadaire (7 jours)' },
  { v: '30', label: 'Mensuel (30 jours)' },
  { v: '90', label: '90 derniers jours' },
  { v: '180', label: '180 derniers jours' },
  { v: '365', label: 'Cette année (1 an)' },
  { v: 'custom', label: 'Plage personnalisée…' }
]
const TOUTES = '__TOUTES__'

export default function Dashboard() {
  const { role } = useAuth()
  const showFinance = canViewFinance(role)
  const { data: inventaires, loading } = useCollection('agro_inventaires')
  const { data: factures } = useCollection('agro_factures')
  const especes = useAgroStore((s) => s.especes)
  const aliments = useAgroStore((s) => s.aliments)

  const [preset, setPreset] = useState('journalier')
  const [from, setFrom] = useState(addDays(todayStr(), -30))
  const [to, setTo] = useState(todayStr())
  const [scope, setScope] = useState(TOUTES)
  const [modalKey, setModalKey] = useState(null) // 'mortalite' | 'morbidite' | 'croissance' | 'ventes' | 'ca'

  const isDaily = preset === 'journalier'

  const { start, end } = useMemo(() => {
    if (preset === 'journalier') return { start: todayStr(), end: todayStr() }
    if (preset === 'custom') return { start: from, end: to }
    return { start: addDays(todayStr(), -parseInt(preset)), end: todayStr() }
  }, [preset, from, to])

  const tri = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1)), [inventaires])
  const dernier = tri[0]
  const invPeriode = useMemo(() => tri.filter((i) => i.date >= start && i.date <= end), [tri, start, end])

  // Catégories présentes (base + personnalisées).
  const cats = useMemo(() => {
    const custom = [...new Set(especes.map((e) => e.cat))].filter((c) => !CAT_ANIMAUX.includes(c))
    return [...CAT_ANIMAUX, ...custom].filter((c) => especes.some((e) => e.cat === c))
  }, [especes])

  // Espèces du périmètre courant (toutes, ou une catégorie).
  const especesScope = useMemo(
    () => (scope === TOUTES ? especes : especes.filter((e) => e.cat === scope)),
    [especes, scope]
  )

  // Indicateurs du périmètre : effectif, base, malades, naissances, décès, taux.
  const ind = useMemo(() => {
    let effectif = 0, base = 0, malades = 0
    especesScope.forEach((e) => {
      const a = dernier?.animaux?.[e.id]
      effectif += a?.fin || 0; base += a?.init || 0; malades += a?.malades || 0
    })
    let naiss = 0, dec = 0
    invPeriode.forEach((inv) => especesScope.forEach((e) => {
      const a = inv.animaux?.[e.id]
      if (a) { naiss += a.naiss || 0; dec += a.dec || 0 }
    }))
    const baseSafe = base || 1
    return {
      effectif, base, malades, naiss, dec,
      mortalite: (dec / baseSafe) * 100,
      croissance: ((naiss - dec) / baseSafe) * 100,
      morbidite: effectif ? (malades / effectif) * 100 : 0
    }
  }, [especesScope, dernier, invPeriode])

  // Ventes (volume) du périmètre + comparaison période précédente.
  const ventes = useMemo(() => {
    const nbDays = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
    const prevEnd = addDays(start, -1)
    const prevStart = addDays(prevEnd, -(nbDays - 1))
    const inScope = (v) => scope === TOUTES || v.cat === scope
    const cur = agregerAchatsVentes(invPeriode, especes, aliments).ventes.filter(inScope)
    const prevInv = tri.filter((i) => i.date >= prevStart && i.date <= prevEnd)
    const prev = agregerAchatsVentes(prevInv, especes, aliments).ventes.filter(inScope)
    const sum = (arr) => arr.reduce((s, v) => s + v.qte, 0)
    return { courant: sum(cur), precedent: sum(prev), liste: cur.sort((a, b) => b.date.localeCompare(a.date)), prevStart, prevEnd }
  }, [invPeriode, especes, aliments, tri, start, end, scope])

  // Chiffre d'affaires (factures CERTIFIÉES) du périmètre + comparaison.
  const ca = useMemo(() => {
    const certifs = factures.filter((f) => factureStatut(f) === 'certifiee')
    const montant = (f) => scope === TOUTES
      ? (f.totalTTC || 0)
      : (f.lignes || []).filter((l) => l.articleCat === scope).reduce((s, l) => s + (l.total || 0), 0)
    const sumIn = (s, e) => certifs.filter((f) => f.date >= s && f.date <= e).reduce((acc, f) => acc + montant(f), 0)
    const nbDays = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
    const prevEnd = addDays(start, -1)
    const prevStart = addDays(prevEnd, -(nbDays - 1))
    const liste = certifs.filter((f) => f.date >= start && f.date <= end && montant(f) > 0).sort((a, b) => (a.date < b.date ? 1 : -1))
    return { courant: sumIn(start, end), precedent: sumIn(prevStart, prevEnd), liste, prevStart, prevEnd }
  }, [factures, start, end, scope])

  // Série de morbidité (scope) + prévision 7 jours.
  const morbiditeSerie = useMemo(() => {
    const pts = [...invPeriode].sort((a, b) => (a.date < b.date ? -1 : 1))
    return {
      labels: pts.map((i) => i.date?.slice(5)),
      values: pts.map((inv) => {
        let mal = 0, eff = 0
        especesScope.forEach((e) => { const a = inv.animaux?.[e.id]; mal += a?.malades || 0; eff += a?.fin || 0 })
        return eff ? +((mal / eff) * 100).toFixed(2) : 0
      })
    }
  }, [invPeriode, especesScope])
  const morbiditePrevision = useMemo(() => previsionSerie(morbiditeSerie.values, 7), [morbiditeSerie])
  const morbiditeChart = useMemo(() => {
    const hist = morbiditeSerie.values
    const prev = morbiditePrevision.map((v) => +v.toFixed(2))
    const lastHist = hist.length ? hist[hist.length - 1] : 0
    return {
      labels: [...morbiditeSerie.labels, ...prev.map((_, i) => `J+${i + 1}`)],
      datasets: [
        { label: 'Morbidité (%)', data: [...hist, ...new Array(prev.length).fill(null)], borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,0.12)', fill: true, tension: 0.3, pointRadius: 2 },
        { label: 'Prévision (%)', data: [...new Array(Math.max(0, hist.length - 1)).fill(null), lastHist, ...prev], borderColor: '#9333ea', borderDash: [5, 4], fill: false, tension: 0.3, pointRadius: 2 }
      ]
    }
  }, [morbiditeSerie, morbiditePrevision])

  // Répartition (effectif par catégorie) — toujours global.
  const repartition = useMemo(() => {
    const rows = cats.map((c) => ({
      cat: c, color: catColor(c),
      total: especes.filter((e) => e.cat === c).reduce((s, e) => s + (dernier?.animaux?.[e.id]?.fin || 0), 0)
    }))
    return { rows, data: { labels: rows.map((r) => r.cat), datasets: [{ data: rows.map((r) => r.total), backgroundColor: rows.map((r) => r.color) }] } }
  }, [cats, especes, dernier])

  // Détail par espèce du périmètre (table + barres).
  const especeRows = useMemo(() => especesScope.map((e) => {
    const a = dernier?.animaux?.[e.id] || {}
    let naiss = 0, dec = 0
    invPeriode.forEach((inv) => { const x = inv.animaux?.[e.id]; if (x) { naiss += x.naiss || 0; dec += x.dec || 0 } })
    return { nom: e.nom, cat: e.cat, init: a.init || 0, fin: a.fin || 0, malades: a.malades || 0, naiss, dec, prix: e.prix }
  }), [especesScope, dernier, invPeriode])

  // Détails décès / naissances (scope) pour les modales.
  const decesDetail = useMemo(() => {
    const out = []
    invPeriode.forEach((inv) => especesScope.forEach((e) => {
      const a = inv.animaux?.[e.id]; if (!a) return
      const dl = (a.sorties || []).filter((l) => l.type === 'Décès' && (parseInt(l.qte) || 0) > 0)
      if (dl.length) dl.forEach((l) => out.push({ date: inv.date, espece: e.nom, qte: parseInt(l.qte) || 0, motif: l.label || '—', agent: l.agentNom || inv.agentNom || '—' }))
      else if ((a.dec || 0) > 0) out.push({ date: inv.date, espece: e.nom, qte: a.dec, motif: '—', agent: inv.agentNom || '—' })
    }))
    return out.sort((a, b) => b.date.localeCompare(a.date))
  }, [invPeriode, especesScope])

  const naissancesDetail = useMemo(() => {
    const out = []
    invPeriode.forEach((inv) => especesScope.forEach((e) => {
      const a = inv.animaux?.[e.id]; if (!a) return
      const nl = (a.entrees || []).filter((l) => l.type === 'Naissance' && (parseInt(l.qte) || 0) > 0)
      if (nl.length) nl.forEach((l) => out.push({ date: inv.date, espece: e.nom, qte: parseInt(l.qte) || 0, agent: l.agentNom || inv.agentNom || '—' }))
      else if ((a.naiss || 0) > 0) out.push({ date: inv.date, espece: e.nom, qte: a.naiss, agent: inv.agentNom || '—' })
    }))
    return out.sort((a, b) => b.date.localeCompare(a.date))
  }, [invPeriode, especesScope])

  const scopeLabel = scope === TOUTES ? 'Toutes les catégories' : scope

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-4 text-white flex items-center gap-4" style={{ background: 'linear-gradient(135deg, #2EAA3F 0%, #1a6e27 100%)' }}>
        <img src="/maxi-agro-logo.png" alt="Maxi Agro" className="h-16 w-auto object-contain rounded-lg bg-white p-1 shadow" />
        <div>
          <h2 className="text-lg font-extrabold drop-shadow">MAXI AGRO</h2>
          <p className="text-sm text-green-100">Élevage · Stock · Facturation · Analyses</p>
        </div>
      </div>

      {/* Période */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Période</label>
          <select className="input-base w-auto font-semibold" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {PRESETS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
          </select>
        </div>
        {preset === 'custom' && (
          <div className="flex items-end gap-2">
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Du</label><input type="date" className="input-base w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs font-semibold text-gray-600">Au</label><input type="date" className="input-base w-auto" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
        )}
        <span className="ml-auto text-xs text-gray-400">{formatDateShort(start)} → {formatDateShort(end)} · {invPeriode.length} saisie(s)</span>
      </div>

      {/* Onglets par espèce / catégorie */}
      <div className="flex flex-wrap gap-1.5">
        <ScopeTab active={scope === TOUTES} color="#374151" onClick={() => setScope(TOUTES)}>Toutes</ScopeTab>
        {cats.map((c) => (
          <ScopeTab key={c} active={scope === c} color={catColor(c)} onClick={() => setScope(c)}>{c}</ScopeTab>
        ))}
      </div>

      {/* Indicateurs du périmètre */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Indicateurs — {scopeLabel}</p>
        <div className={`grid grid-cols-2 gap-3 ${showFinance ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
          <Indic title="Effectif en stock" value={formatNumber(ind.effectif)} icon={Boxes} color="#2563eb" sub={`${especesScope.length} espèce(s)`} />
          <Indic title="Taux de mortalité" value={`${ind.mortalite.toFixed(1)} %`} icon={HeartPulse} color="#dc2626" sub={`${ind.dec} décès`} onClick={() => setModalKey('mortalite')} />
          <Indic title="Taux de morbidité" value={`${ind.morbidite.toFixed(1)} %`} icon={Stethoscope} color="#d97706" sub={`${ind.malades} malade(s)`} onClick={() => setModalKey('morbidite')} />
          <Indic title="Taux de croissance" value={`${ind.croissance.toFixed(1)} %`} icon={Sprout} color="#16a34a" sub={`${ind.naiss} naissance(s)`} onClick={() => setModalKey('croissance')} />
          <Indic title="Ventes (volume)" value={formatNumber(ventes.courant)} icon={ShoppingCart} color="#0d9488" sub={`${ventes.liste.length} vente(s)`} delta={ventes.courant - ventes.precedent} onClick={() => setModalKey('ventes')} />
          {showFinance && (
            <Indic title="Chiffre d'affaires" value={formatMoney(ca.courant)} icon={Wallet} color="#7c3aed" sub={`${ca.liste.length} facture(s) certifiée(s)`} delta={ca.courant - ca.precedent} money onClick={() => setModalKey('ca')} />
          )}
        </div>
        {!showFinance && (
          <p className="mt-2 text-[11px] text-gray-400">💡 Les montants financiers (chiffre d'affaires) sont réservés à la hiérarchie.</p>
        )}
      </div>

      {/* Graphiques */}
      <div className="grid gap-5 lg:grid-cols-3">
        <button onClick={() => setModalKey('morbidite')} className="card lg:col-span-2 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Taux de morbidité — {scopeLabel}</p>
              <p className="text-3xl font-extrabold text-amber-600">{ind.morbidite.toFixed(1)} %</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{ind.malades} malade(s) / {formatNumber(ind.effectif)} têtes — courbe & prévision</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Stethoscope size={22} /></div>
          </div>
          <div className="mt-2 h-52">
            {morbiditeSerie.labels.length
              ? <Line data={morbiditeChart} options={{ maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => v + ' %' } } } }} />
              : <p className="py-10 text-center text-sm text-gray-400">Aucune saisie sur la période.</p>}
          </div>
        </button>
        <Card title="Répartition par catégorie">
          <div className="h-72">
            {repartition.rows.some((r) => r.total > 0)
              ? <Doughnut data={repartition.data} options={{ maintainAspectRatio: false }} />
              : <p className="py-10 text-center text-sm text-gray-400">Aucun effectif.</p>}
          </div>
        </Card>
      </div>

      {/* Détail par espèce du périmètre */}
      <Card title={`Détail par espèce — ${scopeLabel}`}>
        {especeRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune espèce.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Espèce</th>
                  {scope === TOUTES && <th className="px-2 py-2 text-left">Catégorie</th>}
                  <th className="px-2 py-2 text-center">Effectif</th>
                  <th className="px-2 py-2 text-center">Naiss.</th>
                  <th className="px-2 py-2 text-center">Décès</th>
                  <th className="px-2 py-2 text-center">Malades</th>
                  {showFinance && <th className="px-2 py-2 text-right">Prix unit.</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {especeRows.map((r) => (
                  <tr key={r.nom}>
                    <td className="px-3 py-1.5 font-semibold">{r.nom}</td>
                    {scope === TOUTES && <td className="px-2 py-1.5 text-gray-500" style={{ color: catColor(r.cat) }}>{r.cat}</td>}
                    <td className="px-2 py-1.5 text-center font-bold">{formatNumber(r.fin)}</td>
                    <td className="px-2 py-1.5 text-center text-green-600">{r.naiss}</td>
                    <td className="px-2 py-1.5 text-center text-red-600">{r.dec}</td>
                    <td className="px-2 py-1.5 text-center text-amber-600">{r.malades}</td>
                    {showFinance && <td className="px-2 py-1.5 text-right text-gray-500">{formatMoney(r.prix)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ─────── Modales détaillées (scope courant) ─────── */}
      <Modal open={modalKey === 'mortalite'} onClose={() => setModalKey(null)} size="lg" title={`Mortalité — ${scopeLabel}`}>
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Taux : <strong>{ind.mortalite.toFixed(1)} %</strong> — {ind.dec} décès / {formatNumber(ind.base)} têtes (effectif initial)</p>
        <p className="my-2 text-xs italic text-gray-400">Formule : (Décès / Effectif initial) × 100</p>
        <DetailTable rows={decesDetail} cols={['Date', 'Espèce', 'Qté', 'Motif', 'Agent']} render={(d) => [formatDateShort(d.date), d.espece, d.qte, d.motif, d.agent]} empty="Aucun décès sur la période." />
      </Modal>

      <Modal open={modalKey === 'croissance'} onClose={() => setModalKey(null)} size="lg" title={`Croissance & naissances — ${scopeLabel}`}>
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Taux : <strong>{ind.croissance.toFixed(1)} %</strong> — {ind.naiss} naissance(s)</p>
        <p className="my-2 text-xs italic text-gray-400">Formule : ((Naissances − Décès) / Effectif initial) × 100</p>
        <DetailTable rows={naissancesDetail} cols={['Date', 'Espèce', 'Nés', 'Agent']} render={(n) => [formatDateShort(n.date), n.espece, n.qte, n.agent]} empty="Aucune naissance sur la période." />
      </Modal>

      <Modal open={modalKey === 'morbidite'} onClose={() => setModalKey(null)} size="lg" title={`Morbidité — ${scopeLabel}`}>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Taux : <strong>{ind.morbidite.toFixed(1)} %</strong> — {ind.malades} malade(s) / {formatNumber(ind.effectif)} têtes</p>
        <p className="my-2 text-xs italic text-gray-400">Formule : (Malades / Effectif) × 100 — prévision : tendance + moyenne mobile (7 jours)</p>
        {morbiditePrevision.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {morbiditePrevision.map((v, i) => <span key={i} className="rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">J+{i + 1} : {v.toFixed(1)} %</span>)}
          </div>
        )}
      </Modal>

      <Modal open={modalKey === 'ventes'} onClose={() => setModalKey(null)} size="lg" title={`Ventes (volume) — ${scopeLabel}`}>
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">{formatNumber(ventes.courant)} unité(s) vendue(s) — période préc. : {formatNumber(ventes.precedent)}</p>
        <DetailTable rows={ventes.liste} cols={['Date', 'Article', 'Catégorie', 'Qté', 'Source']} render={(v) => [formatDateShort(v.date), v.article, v.cat, v.qte, v.source === 'demande' ? 'Demande/Facture' : 'Saisie']} empty="Aucune vente sur la période." />
      </Modal>

      {showFinance && (
        <Modal open={modalKey === 'ca'} onClose={() => setModalKey(null)} size="lg" title={`Chiffre d'affaires — ${scopeLabel}`}>
          <p className="rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-800">{formatMoney(ca.courant)} — période préc. : {formatMoney(ca.precedent)}</p>
          <p className="my-2 text-xs italic text-gray-400">CA = factures <strong>certifiées</strong> uniquement{scope !== TOUTES ? ' (montant des lignes de cette catégorie)' : ''}.</p>
          <DetailTable rows={ca.liste} cols={['Date', 'N°', 'Client', 'Montant']} render={(f) => [formatDateShort(f.date), f.numero || '—', f.client?.nom || '—', formatMoney(scope === TOUTES ? (f.totalTTC || 0) : (f.lignes || []).filter((l) => l.articleCat === scope).reduce((s, l) => s + (l.total || 0), 0))]} empty="Aucune facture certifiée sur la période." />
        </Modal>
      )}
    </div>
  )
}

function ScopeTab({ active, color, onClick, children }) {
  return (
    <button onClick={onClick}
      className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors"
      style={active ? { background: color, color: '#fff' } : { background: '#f1f5f9', color: '#475569' }}>
      {children}
    </button>
  )
}

function Indic({ title, value, icon: Icon, color, sub, delta, money, onClick }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`card p-3 text-left transition-all ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : 'cursor-default'}`}>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{title}</p>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: color + '1a', color }}><Icon size={15} /></span>
      </div>
      <div className="flex items-baseline gap-1">
        <p className="text-xl font-extrabold" style={{ color }}>{value}</p>
        {delta !== undefined && delta !== 0 && (
          <span className={`text-xs font-bold ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {delta > 0 ? <TrendingUp size={12} className="inline" /> : <TrendingDown size={12} className="inline" />}
            {money ? formatMoney(Math.abs(delta)) : Math.abs(delta)}
          </span>
        )}
      </div>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}{onClick ? ' — détails' : ''}</p>}
    </button>
  )
}

function DetailTable({ rows, cols, render, empty }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-gray-400">{empty}</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{cols.map((c) => <th key={c} className="px-3 py-2 text-left">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
              {render(r).map((cell, j) => <td key={j} className="px-3 py-1.5">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

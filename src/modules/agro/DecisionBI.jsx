// Tableau de bord décisionnel MAXI-AGRO — vue type Power BI pour la direction.
import { useMemo, useState } from 'react'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import {
  Layers, TrendingUp, ShoppingCart, BadgeDollarSign,
  AlertTriangle, ClipboardList, Stethoscope, Send, Skull, Baby
} from 'lucide-react'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import { useAgroStore } from './store/agroStore'
import { CAT_ANIMAUX, catColor } from './data'
import { agregerAchatsVentes, mouvementsCategorie } from './logic'
import { formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'

export default function DecisionBI({
  inventaires, factures, demandes, sante, stockVaccins,
  invPeriode, start, end
}) {
  const especes = useAgroStore((s) => s.especes)
  const aliments = useAgroStore((s) => s.aliments)
  const [kpiDetail, setKpiDetail] = useState(null)

  const tri = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1)), [inventaires])
  const dernier = tri[0]
  const veille = tri[1]

  const cats = useMemo(() => {
    const custom = [...new Set(especes.map((e) => e.cat))].filter((c) => !CAT_ANIMAUX.includes(c))
    return [...CAT_ANIMAUX, ...custom].filter((c) => especes.some((e) => e.cat === c))
  }, [especes])

  const effectifTotal = useMemo(() =>
    Object.values(dernier?.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0),
  [dernier])

  const effectifVeille = useMemo(() =>
    Object.values(veille?.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0),
  [veille])

  const totauxAnim = useMemo(() => {
    let naiss = 0, ent = 0, sor = 0, dec = 0
    invPeriode.forEach((i) => Object.values(i.animaux || {}).forEach((a) => {
      naiss += a.naiss || 0; ent += a.ent || 0; sor += a.sor || 0; dec += a.dec || 0
    }))
    return { naiss, ent, sor, dec }
  }, [invPeriode])

  const { achats, ventes, totalAchats, totalVentes } = useMemo(
    () => agregerAchatsVentes(invPeriode, especes, aliments),
    [invPeriode, especes, aliments]
  )

  const facturesPeriode = useMemo(
    () => factures.filter((f) => f.date >= start && f.date <= end),
    [factures, start, end]
  )
  const caTotal = facturesPeriode.reduce((s, f) => s + (f.totalTTC || 0), 0)
  const nbFactures = facturesPeriode.length

  const demandesAttente = demandes.filter((d) => d.statut === 'en_attente').length
  const demandesPeriode = demandes.filter((d) => d.date >= start && d.date <= end)

  const interventions = sante.filter((f) => f.date >= start && f.date <= end)
  const stockBas = (stockVaccins || []).filter((s) => (s.quantite ?? 0) <= (s.seuilAlerte ?? 5))

  const parCat = useMemo(() => cats.map((cat) => {
    const total = especes.filter((e) => e.cat === cat).reduce((s, e) => s + (dernier?.animaux?.[e.id]?.fin || 0), 0)
    const mJour = mouvementsCategorie(dernier, especes, cat)
    const mVeille = mouvementsCategorie(veille, especes, cat)
    return { cat, total, color: catColor(cat), ent: mJour.entrees, sor: mJour.sorties, diffEnt: veille ? mJour.entrees - mVeille.entrees : 0, diffSor: veille ? mJour.sorties - mVeille.sorties : 0 }
  }), [cats, especes, dernier, veille])

  const baseEffectif = Object.values(dernier?.animaux || {}).reduce((s, a) => s + (a.init || 0), 0) || 1
  const tauxMortalite = ((totauxAnim.dec / baseEffectif) * 100).toFixed(1)
  const tauxCroissance = (((totauxAnim.naiss - totauxAnim.dec) / baseEffectif) * 100).toFixed(1)

  const alimentsStock = useMemo(() => {
    return aliments.map((a) => {
      let ent = 0, sor = 0
      invPeriode.forEach((i) => { const d = i.aliments?.[a.id]; if (d) { ent += d.ent || 0; sor += d.sor || 0 } })
      const stock = dernier?.aliments?.[a.id]?.fin || 0
      return { nom: a.nom, cat: a.cat, unite: a.unite || 'kg', stock, ent, sor, etat: stock <= 0 ? 'rupture' : stock < 10 ? 'bas' : 'ok' }
    }).sort((a, b) => a.stock - b.stock)
  }, [aliments, invPeriode, dernier])

  const alertes = useMemo(() => {
    const list = []
    if (demandesAttente > 0) list.push({ tone: 'warning', text: `${demandesAttente} demande(s) de sortie en attente d'approbation` })
    if (stockBas.length) list.push({ tone: 'danger', text: `${stockBas.length} produit(s) vaccin en stock bas` })
    alimentsStock.filter((a) => a.etat === 'rupture').forEach((a) => list.push({ tone: 'danger', text: `Rupture aliment : ${a.nom}` }))
    alimentsStock.filter((a) => a.etat === 'bas').slice(0, 3).forEach((a) => list.push({ tone: 'warning', text: `Stock bas : ${a.nom} (${a.stock} ${a.unite})` }))
    if (parseFloat(tauxMortalite) > 5) list.push({ tone: 'danger', text: `Taux de mortalité élevé : ${tauxMortalite} %` })
    return list
  }, [demandesAttente, stockBas, alimentsStock, tauxMortalite])

  const evolution = useMemo(() => {
    const pts = [...invPeriode].sort((a, b) => (a.date < b.date ? -1 : 1))
    return {
      labels: pts.map((i) => i.date?.slice(5)),
      datasets: [{
        label: 'Effectif total',
        data: pts.map((i) => Object.values(i.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)),
        borderColor: '#BC3C31', backgroundColor: 'rgba(188,60,49,0.1)', fill: true, tension: 0.3
      }]
    }
  }, [invPeriode])

  const caParMois = useMemo(() => {
    const map = {}
    facturesPeriode.forEach((f) => {
      const m = (f.date || '').slice(0, 7)
      map[m] = (map[m] || 0) + (f.totalTTC || 0)
    })
    const keys = Object.keys(map).sort()
    return { labels: keys.map((k) => k.slice(5)), datasets: [{ label: 'CA (FCFA)', data: keys.map((k) => map[k]), backgroundColor: '#16a34a' }] }
  }, [facturesPeriode])

  const repartition = {
    labels: parCat.map((p) => p.cat),
    datasets: [{ data: parCat.map((p) => p.total), backgroundColor: parCat.map((p) => p.color) }]
  }

  const mouvementsBar = {
    labels: ['Naissances', 'Entrées', 'Achats', 'Sorties', 'Ventes', 'Décès'],
    datasets: [{
      data: [totauxAnim.naiss, totauxAnim.ent, totalAchats, totauxAnim.sor, totalVentes, totauxAnim.dec],
      backgroundColor: ['#16a34a', '#0284c7', '#7c3aed', '#d97706', '#22c55e', '#dc2626']
    }]
  }

  const topClients = useMemo(() => {
    const map = {}
    facturesPeriode.forEach((f) => {
      const nom = f.client?.nom || 'Inconnu'
      map[nom] = (map[nom] || 0) + (f.totalTTC || 0)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [facturesPeriode])

  const kpis = [
    { id: 'effectif', title: 'Effectif total', value: formatNumber(effectifTotal), sub: veille ? `${effectifTotal - effectifVeille >= 0 ? '+' : ''}${effectifTotal - effectifVeille} vs veille` : '', icon: Layers, color: '#BC3C31' },
    { id: 'ca', title: 'CA facturé', value: formatMoney(caTotal), sub: `${nbFactures} facture(s)`, icon: BadgeDollarSign, color: '#16a34a' },
    { id: 'achats', title: 'Achats', value: formatNumber(totalAchats), sub: 'Animaux + aliments', icon: ShoppingCart, color: '#7c3aed' },
    { id: 'ventes', title: 'Ventes', value: formatNumber(totalVentes), sub: 'Dont demandes approuvées', icon: TrendingUp, color: '#0284c7' },
    { id: 'naiss', title: 'Naissances', value: formatNumber(totauxAnim.naiss), sub: `Croissance ${tauxCroissance} %`, icon: Baby, color: '#16a34a' },
    { id: 'dec', title: 'Décès', value: formatNumber(totauxAnim.dec), sub: `Mortalité ${tauxMortalite} %`, icon: Skull, color: '#dc2626' },
    { id: 'saisies', title: 'Saisies', value: invPeriode.length, sub: `Sur ${formatDateShort(start)} → ${formatDateShort(end)}`, icon: ClipboardList, color: '#0284c7' },
    { id: 'demandes', title: 'Demandes attente', value: demandesAttente, sub: `${demandesPeriode.length} sur la période`, icon: Send, color: demandesAttente > 0 ? '#d97706' : '#64748b' },
    { id: 'sante', title: 'Interventions santé', value: interventions.length, sub: `${stockBas.length} alerte(s) stock`, icon: Stethoscope, color: '#7c3aed' }
  ]

  return (
    <div className="space-y-5">
      {/* Bandeau alertes décisionnelles */}
      {alertes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertTriangle size={18} /> Points d'attention — décision requise
          </p>
          <div className="flex flex-wrap gap-2">
            {alertes.map((a, i) => (
              <span key={i} className={`rounded-full px-3 py-1 text-xs font-semibold ${a.tone === 'danger' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                {a.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grille KPI principale */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKpiDetail(k.id)}
            className="card group p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: k.color + '18', color: k.color }}>
                <k.icon size={18} />
              </div>
              <TrendingUp size={14} className="text-gray-300 opacity-0 group-hover:opacity-100" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{k.title}</p>
            <p className="text-xl font-extrabold text-gray-900">{k.value}</p>
            {k.sub && <p className="mt-0.5 text-[10px] text-gray-400">{k.sub}</p>}
          </button>
        ))}
      </div>

      {/* Graphiques principaux — 3 colonnes */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Évolution de l'effectif" className="lg:col-span-2">
          <div className="h-64">
            {evolution.labels.length
              ? <Line data={evolution} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
              : <p className="py-16 text-center text-sm text-gray-400">Aucune saisie sur la période</p>}
          </div>
        </Card>
        <Card title="Répartition par catégorie">
          <div className="h-64">
            {parCat.some((p) => p.total > 0)
              ? <Doughnut data={repartition} options={{ maintainAspectRatio: false }} />
              : <p className="py-16 text-center text-sm text-gray-400">Aucun effectif</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Flux opérationnels (période)">
          <div className="h-56">
            <Bar data={mouvementsBar} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
          </div>
        </Card>
        <Card title="Chiffre d'affaires facturé">
          <div className="h-56">
            {caParMois.labels.length
              ? <Bar data={caParMois} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
              : <p className="py-16 text-center text-sm text-gray-400">Aucune facture sur la période</p>}
          </div>
        </Card>
      </div>

      {/* Tableaux décisionnels */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Effectifs par catégorie (aujourd'hui)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Catégorie</th>
                  <th className="px-2 py-2 text-center">Effectif</th>
                  <th className="px-2 py-2 text-center">Entrées Δ</th>
                  <th className="px-2 py-2 text-center">Sorties Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parCat.map((p) => (
                  <tr key={p.cat}>
                    <td className="px-3 py-1.5 font-semibold" style={{ color: p.color }}>{p.cat}</td>
                    <td className="px-2 py-1.5 text-center font-bold">{formatNumber(p.total)}</td>
                    <td className={`px-2 py-1.5 text-center text-xs font-semibold ${p.diffEnt >= 0 ? 'text-sky-600' : 'text-sky-800'}`}>
                      {p.diffEnt >= 0 ? '+' : ''}{p.diffEnt}
                    </td>
                    <td className={`px-2 py-1.5 text-center text-xs font-semibold ${p.diffSor >= 0 ? 'text-amber-600' : 'text-amber-800'}`}>
                      {p.diffSor >= 0 ? '+' : ''}{p.diffSor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Stocks aliments — état critique en premier">
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Article</th>
                  <th className="px-2 py-2 text-center">Stock</th>
                  <th className="px-2 py-2 text-center">Entrées</th>
                  <th className="px-2 py-2 text-center">Sorties</th>
                  <th className="px-2 py-2 text-center">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {alimentsStock.map((a) => (
                  <tr key={a.nom}>
                    <td className="px-3 py-1.5 font-semibold">{a.nom}</td>
                    <td className="px-2 py-1.5 text-center">{formatNumber(a.stock)} <span className="text-[10px] text-gray-400">{a.unite}</span></td>
                    <td className="px-2 py-1.5 text-center text-sky-600">{formatNumber(a.ent)}</td>
                    <td className="px-2 py-1.5 text-center text-amber-600">{formatNumber(a.sor)}</td>
                    <td className="px-2 py-1.5 text-center">
                      {a.etat === 'rupture' ? <span className="text-xs font-bold text-red-600">Rupture</span>
                        : a.etat === 'bas' ? <span className="text-xs font-bold text-amber-600">Bas</span>
                        : <span className="text-xs text-green-600">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top 5 clients (CA période)">
          {topClients.length ? (
            <div className="space-y-2">
              {topClients.map(([nom, ca], i) => (
                <div key={nom} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{nom}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${(ca / topClients[0][1]) * 100}%` }} />
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-green-700">{formatMoney(ca)}</span>
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-sm text-gray-400">Aucune facture</p>}
        </Card>

        <Card title="Activité récente">
          <div className="max-h-48 space-y-2 overflow-y-auto text-sm">
            {[...invPeriode].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8).map((inv) => {
              const tetes = Object.values(inv.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)
              const ent = Object.values(inv.animaux || {}).reduce((s, a) => s + (a.ent || 0) + (a.naiss || 0), 0)
              const sor = Object.values(inv.animaux || {}).reduce((s, a) => s + (a.sor || 0) + (a.dec || 0), 0)
              return (
                <div key={inv.date} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div>
                    <p className="font-semibold">{formatDateShort(inv.date)}</p>
                    <p className="text-xs text-gray-400">{inv.agentNom || '—'}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-bold">{formatNumber(tetes)} têtes</p>
                    <p><span className="text-sky-600">+{ent}</span> · <span className="text-amber-600">−{sor}</span></p>
                  </div>
                </div>
              )
            })}
            {!invPeriode.length && <p className="py-8 text-center text-gray-400">Aucune saisie</p>}
          </div>
        </Card>
      </div>

      <KpiDetailModal
        id={kpiDetail}
        onClose={() => setKpiDetail(null)}
        data={{ achats, ventes, totauxAnim, parCat, alimentsStock, topClients, facturesPeriode, demandesPeriode, interventions, effectifTotal, caTotal }}
      />
    </div>
  )
}

function KpiDetailModal({ id, onClose, data }) {
  if (!id) return null
  const titles = {
    effectif: 'Détail effectif par catégorie',
    ca: 'Factures de la période',
    achats: 'Détail des achats',
    ventes: 'Détail des ventes',
    naiss: 'Synthèse naissances',
    dec: 'Synthèse décès',
    saisies: 'Saisies enregistrées',
    demandes: 'Demandes de sortie',
    sante: 'Interventions santé'
  }

  let content = null
  if (id === 'effectif') {
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2 text-left">Catégorie</th><th className="p-2 text-center">Effectif</th></tr></thead>
        <tbody>{data.parCat.map((p) => <tr key={p.cat} className="border-t"><td className="p-2 font-semibold">{p.cat}</td><td className="p-2 text-center font-bold">{formatNumber(p.total)}</td></tr>)}</tbody>
        <tfoot className="bg-gray-50 font-bold"><tr><td className="p-2 text-right">Total</td><td className="p-2 text-center">{formatNumber(data.effectifTotal)}</td></tr></tfoot>
      </table>
    )
  } else if (id === 'achats') {
    content = <DetailTable rows={data.achats} cols={['date', 'article', 'cat', 'qte', 'label']} />
  } else if (id === 'ventes') {
    content = <DetailTable rows={data.ventes} cols={['date', 'article', 'cat', 'qte', 'label']} />
  } else if (id === 'ca') {
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">Date</th><th className="p-2">Client</th><th className="p-2 text-right">Montant</th></tr></thead>
        <tbody>{data.facturesPeriode.map((f) => (
          <tr key={f.id || f.num} className="border-t">
            <td className="p-2">{formatDateShort(f.date)}</td>
            <td className="p-2">{f.client?.nom || '—'}</td>
            <td className="p-2 text-right font-bold">{formatMoney(f.totalTTC)}</td>
          </tr>
        ))}</tbody>
      </table>
    )
  } else if (id === 'demandes') {
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">N°</th><th className="p-2">Article</th><th className="p-2">Statut</th><th className="p-2 text-center">Qté</th></tr></thead>
        <tbody>{data.demandesPeriode.map((d) => (
          <tr key={d.id || d.num} className="border-t">
            <td className="p-2 font-mono text-xs">{d.num}</td>
            <td className="p-2">{d.articleNom}</td>
            <td className="p-2">{d.statut}</td>
            <td className="p-2 text-center">{d.qte}</td>
          </tr>
        ))}</tbody>
      </table>
    )
  } else if (id === 'sante') {
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">Espèce</th><th className="p-2 text-center">Animaux</th></tr></thead>
        <tbody>{data.interventions.map((f) => (
          <tr key={f.id} className="border-t">
            <td className="p-2">{formatDateShort(f.date)}</td>
            <td className="p-2">{f.type}</td>
            <td className="p-2">{f.especeNom}</td>
            <td className="p-2 text-center">{f.nombreAnimaux}</td>
          </tr>
        ))}</tbody>
      </table>
    )
  } else {
    content = <p className="py-6 text-center text-gray-500">Consultez les graphiques ci-dessus pour le détail complet.</p>
  }

  return (
    <Modal open onClose={onClose} size="lg" title={titles[id] || 'Détail'}>
      <div className="max-h-[60vh] overflow-auto">{content}</div>
    </Modal>
  )
}

function DetailTable({ rows, cols }) {
  if (!rows?.length) return <p className="py-8 text-center text-gray-400">Aucune donnée</p>
  const labels = { date: 'Date', article: 'Article', cat: 'Catégorie', qte: 'Qté', label: 'Précision' }
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs uppercase">
        <tr>{cols.map((c) => <th key={c} className="p-2 text-left">{labels[c]}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t">
            {cols.map((c) => (
              <td key={c} className="p-2">{c === 'date' ? formatDateShort(r.date) : c === 'qte' ? formatNumber(r.qte) : (r[c] || '—')}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

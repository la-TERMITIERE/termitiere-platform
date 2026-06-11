// Tableau de bord décisionnel MAXI-AGRO — vue type Power BI pour la direction.
import { useMemo, useState } from 'react'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import {
  Layers, TrendingUp, ShoppingCart, BadgeDollarSign,
  AlertTriangle, ClipboardList, Stethoscope, Send, Skull, Baby, ChevronRight
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
  const [catPeriode, setCatPeriode] = useState(null) // catégorie détaillée sur la période

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
  const demandesEnAttenteList = demandes.filter((d) => d.statut === 'en_attente')

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

  // Décès détaillés (avec motifs) sur la période
  const decesDetail = useMemo(() => {
    const result = []
    invPeriode.forEach((inv) => {
      especes.forEach((e) => {
        const a = inv.animaux?.[e.id]
        if (!a) return
        const sorties = a.sorties || []
        const decSorties = sorties.filter((l) => l.type === 'Décès' && (parseInt(l.qte) || 0) > 0)
        if (decSorties.length) {
          decSorties.forEach((l) => result.push({
            date: inv.date, espece: e.nom, cat: e.cat,
            qte: parseInt(l.qte) || 0, motif: l.label || '—', agent: l.agentNom || inv.agentNom || '—'
          }))
        } else if ((a.dec || 0) > 0) {
          result.push({ date: inv.date, espece: e.nom, cat: e.cat, qte: a.dec, motif: '—', agent: inv.agentNom || '—' })
        }
      })
    })
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [invPeriode, especes])

  // Naissances détaillées sur la période
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

  // Effectifs et mouvements par catégorie POUR LA PÉRIODE (pas seulement aujourd'hui)
  const parCatPeriode = useMemo(() => cats.map((cat) => {
    const efFinal = especes.filter((e) => e.cat === cat).reduce((s, e) => s + (dernier?.animaux?.[e.id]?.fin || 0), 0)
    let entPeriode = 0, sorPeriode = 0, naissP = 0, decP = 0
    invPeriode.forEach((inv) => {
      especes.filter((e) => e.cat === cat).forEach((e) => {
        const a = inv.animaux?.[e.id]
        if (a) { entPeriode += (a.ent || 0) + (a.naiss || 0); sorPeriode += (a.sor || 0) + (a.dec || 0); naissP += a.naiss || 0; decP += a.dec || 0 }
      })
    })
    return { cat, efFinal, entPeriode, sorPeriode, naissP, decP, color: catColor(cat) }
  }), [cats, especes, dernier, invPeriode])

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

  // Évolution détaillée par espèce et par métrique (effectif, ventes, décès, CA),
  // jour par jour sur la période. Sert à tracer un graphe par catégorie, avec
  // une échelle propre à chaque catégorie (les grands effectifs n'écrasent plus
  // les variations des petites catégories).
  const evolutionDetail = useMemo(() => {
    const pts = [...invPeriode].sort((a, b) => (a.date < b.date ? -1 : 1))
    // CA par espèce et par date : on rapproche les lignes de facture des espèces
    // (par identifiant d'article si disponible, sinon par nom).
    const byId = new Set(especes.map((e) => e.id))
    const byName = {}
    especes.forEach((e) => { byName[(e.nom || '').trim().toLowerCase()] = e.id })
    const caMap = {} // { especeId: { date: montant } }
    facturesPeriode.forEach((f) => {
      (f.lignes || []).forEach((l) => {
        const id = (l.articleId && byId.has(l.articleId))
          ? l.articleId
          : byName[(l.article || '').trim().toLowerCase()]
        if (!id) return
        caMap[id] = caMap[id] || {}
        caMap[id][f.date] = (caMap[id][f.date] || 0) + (l.total || 0)
      })
    })
    const parEspece = {}
    especes.forEach((e) => {
      parEspece[e.id] = {
        effectif: pts.map((inv) => inv.animaux?.[e.id]?.fin || 0),
        ventes: pts.map((inv) => {
          const a = inv.animaux?.[e.id]
          if (!a) return 0
          const vts = (a.sorties || []).filter((l) => l.type === 'Ventes')
            .reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
          return vts + (a.autoSor || 0)
        }),
        deces: pts.map((inv) => inv.animaux?.[e.id]?.dec || 0),
        ca: pts.map((inv) => caMap[e.id]?.[inv.date] || 0)
      }
    })
    return { labels: pts.map((i) => i.date?.slice(5)), parEspece }
  }, [invPeriode, especes, facturesPeriode])

  // Évolution du chiffre d'affaires facturé — courbe cumulée jour par jour.
  const evolutionCA = useMemo(() => {
    const map = {}
    facturesPeriode.forEach((f) => {
      const d = f.date || ''
      if (d) map[d] = (map[d] || 0) + (f.totalTTC || 0)
    })
    const keys = Object.keys(map).sort()
    let cumul = 0
    const cumulData = keys.map((k) => (cumul += map[k]))
    return {
      labels: keys.map((k) => k.slice(5)),
      datasets: [
        {
          label: 'CA cumulé (FCFA)',
          data: cumulData,
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22,163,74,0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2
        },
        {
          label: 'CA du jour (FCFA)',
          data: keys.map((k) => map[k]),
          borderColor: '#0284c7',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          borderDash: [4, 3],
          borderWidth: 1.5
        }
      ]
    }
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

      {/* Vue d'ensemble : répartition + flux */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Répartition par catégorie">
          <div className="h-64">
            {parCat.some((p) => p.total > 0)
              ? <Doughnut data={repartition} options={{ maintainAspectRatio: false }} />
              : <p className="py-16 text-center text-sm text-gray-400">Aucun effectif</p>}
          </div>
        </Card>
        <Card title="Flux opérationnels (période)" className="lg:col-span-2">
          <div className="h-64">
            <Bar data={mouvementsBar} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
          </div>
        </Card>
      </div>

      {/* Évolution détaillée : un graphe par catégorie, une courbe par espèce.
          Métrique au choix : effectif, ventes, décès, chiffre d'affaires. */}
      <div>
        <p className="mb-2 text-sm font-bold text-gray-700">Évolution par catégorie (détail par espèce)</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {cats.map((cat) => (
            <EvolutionCategorieCard key={cat} cat={cat} especes={especes} evolutionDetail={evolutionDetail} />
          ))}
        </div>
      </div>

      {/* Évolution du chiffre d'affaires global */}
      <Card title="Évolution du chiffre d'affaires (global)">
        <div className="h-56">
          {evolutionCA.labels.length
            ? <Line data={evolutionCA} options={{ maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }} />
            : <p className="py-16 text-center text-sm text-gray-400">Aucune facture sur la période</p>}
        </div>
      </Card>

      {/* Tableaux décisionnels */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Effectifs par catégorie — période (${formatDateShort(start)} → ${formatDateShort(end)})`}>
          <p className="mb-2 text-xs text-gray-400">Cliquez une catégorie pour voir son détail par espèce sur la période.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Catégorie</th>
                  <th className="px-2 py-2 text-center">EF Final</th>
                  <th className="px-2 py-2 text-center">Entrées période</th>
                  <th className="px-2 py-2 text-center">Sorties période</th>
                  <th className="px-2 py-2 text-center">Naiss.</th>
                  <th className="px-2 py-2 text-center">Décès</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parCatPeriode.map((p) => (
                  <tr key={p.cat} onClick={() => setCatPeriode(p.cat)} className="cursor-pointer hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-semibold" style={{ color: p.color }}>
                      <span className="inline-flex items-center gap-1">{p.cat} <ChevronRight size={13} className="text-gray-300" /></span>
                    </td>
                    <td className="px-2 py-1.5 text-center font-bold">{formatNumber(p.efFinal)}</td>
                    <td className="px-2 py-1.5 text-center text-xs font-semibold text-sky-600">{formatNumber(p.entPeriode)}</td>
                    <td className="px-2 py-1.5 text-center text-xs font-semibold text-amber-600">{formatNumber(p.sorPeriode)}</td>
                    <td className="px-2 py-1.5 text-center text-xs text-green-600">{formatNumber(p.naissP)}</td>
                    <td className="px-2 py-1.5 text-center text-xs text-red-600">{formatNumber(p.decP)}</td>
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
        data={{ achats, ventes, totauxAnim, parCat, parCatPeriode, alimentsStock, topClients, facturesPeriode, demandesPeriode, demandesEnAttenteList, interventions, effectifTotal, caTotal, decesDetail, naissancesDetail, invPeriode, baseEffectif, tauxMortalite, tauxCroissance, start, end }}
      />

      <CategoriePeriodeModal
        cat={catPeriode}
        onClose={() => setCatPeriode(null)}
        especes={especes}
        invPeriode={invPeriode}
        dernier={dernier}
        start={start}
        end={end}
      />
    </div>
  )
}

// Détail d'une catégorie sur la période : tableau par espèce (EF initial début de
// période, naissances, entrées, sorties, décès cumulés, EF final).
function CategoriePeriodeModal({ cat, onClose, especes, invPeriode, dernier, start, end }) {
  const data = useMemo(() => {
    if (!cat) return null
    const periodeAsc = [...invPeriode].sort((a, b) => (a.date < b.date ? -1 : 1))
    const premier = periodeAsc[0]
    const lignes = especes.filter((e) => e.cat === cat).map((e) => {
      let naiss = 0, ent = 0, sor = 0, dec = 0
      invPeriode.forEach((inv) => {
        const a = inv.animaux?.[e.id]
        if (a) { naiss += a.naiss || 0; ent += a.ent || 0; sor += a.sor || 0; dec += a.dec || 0 }
      })
      return {
        nom: e.nom,
        efInit: premier?.animaux?.[e.id]?.init || 0,
        naiss, ent, sor, dec,
        efFinal: dernier?.animaux?.[e.id]?.fin || 0
      }
    })
    const tot = lignes.reduce((a, l) => ({
      efInit: a.efInit + l.efInit, naiss: a.naiss + l.naiss, ent: a.ent + l.ent,
      sor: a.sor + l.sor, dec: a.dec + l.dec, efFinal: a.efFinal + l.efFinal
    }), { efInit: 0, naiss: 0, ent: 0, sor: 0, dec: 0, efFinal: 0 })
    return { lignes, tot, color: catColor(cat) }
  }, [cat, especes, invPeriode, dernier])

  return (
    <Modal open={!!cat} onClose={onClose} size="lg" title={`${cat || ''} — détail période (${formatDateShort(start)} → ${formatDateShort(end)})`}>
      {data && (
        data.lignes.length === 0 ? (
          <p className="py-6 text-center text-gray-400">Aucune espèce dans cette catégorie.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="p-2 text-left">Espèce</th>
                  <th className="p-2 text-center">EF Initial</th>
                  <th className="p-2 text-center">Naiss.</th>
                  <th className="p-2 text-center">Entrées</th>
                  <th className="p-2 text-center">Sorties</th>
                  <th className="p-2 text-center">Décès</th>
                  <th className="p-2 text-center">EF Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.lignes.map((l) => (
                  <tr key={l.nom}>
                    <td className="p-2 font-semibold">{l.nom}</td>
                    <td className="p-2 text-center">{formatNumber(l.efInit)}</td>
                    <td className="p-2 text-center text-green-600">{formatNumber(l.naiss)}</td>
                    <td className="p-2 text-center text-sky-600">{formatNumber(l.ent)}</td>
                    <td className="p-2 text-center text-amber-600">{formatNumber(l.sor)}</td>
                    <td className="p-2 text-center text-red-600">{formatNumber(l.dec)}</td>
                    <td className="p-2 text-center font-bold" style={{ color: data.color }}>{formatNumber(l.efFinal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-bold">
                <tr>
                  <td className="p-2">Total</td>
                  <td className="p-2 text-center">{formatNumber(data.tot.efInit)}</td>
                  <td className="p-2 text-center text-green-600">{formatNumber(data.tot.naiss)}</td>
                  <td className="p-2 text-center text-sky-600">{formatNumber(data.tot.ent)}</td>
                  <td className="p-2 text-center text-amber-600">{formatNumber(data.tot.sor)}</td>
                  <td className="p-2 text-center text-red-600">{formatNumber(data.tot.dec)}</td>
                  <td className="p-2 text-center" style={{ color: data.color }}>{formatNumber(data.tot.efFinal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
    </Modal>
  )
}

const METRICS_EVO = [
  { id: 'effectif', label: 'Effectif', money: false },
  { id: 'ventes', label: 'Ventes', money: false },
  { id: 'deces', label: 'Décès', money: false },
  { id: 'ca', label: "Chiffre d'affaires", money: true }
]

// Un graphe d'évolution pour UNE catégorie : une seule courbe agrégée (total de
// la catégorie), avec métrique sélectionnable (effectif / ventes / décès / CA).
function EvolutionCategorieCard({ cat, especes, evolutionDetail }) {
  const [metric, setMetric] = useState('effectif')
  const espCat = useMemo(() => especes.filter((e) => e.cat === cat), [especes, cat])
  const isMoney = metric === 'ca'

  // Somme, date par date, de toutes les espèces de la catégorie.
  const serie = useMemo(() => {
    const sum = new Array(evolutionDetail.labels.length).fill(0)
    espCat.forEach((e) => {
      (evolutionDetail.parEspece[e.id]?.[metric] || []).forEach((v, i) => { sum[i] += v || 0 })
    })
    return sum
  }, [espCat, evolutionDetail, metric])

  const color = catColor(cat)
  const data = {
    labels: evolutionDetail.labels,
    datasets: [{
      label: cat,
      data: serie,
      borderColor: color,
      backgroundColor: color + '22',
      fill: true,
      tension: 0.3,
      pointRadius: 2,
      borderWidth: 2
    }]
  }

  const options = {
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => (isMoney ? formatMoney(ctx.parsed.y) : formatNumber(ctx.parsed.y)) } }
    },
    scales: { y: { beginAtZero: true, ticks: { callback: (v) => (isMoney ? new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v) : v) } } }
  }

  const aDesDonnees = evolutionDetail.labels.length > 0 && espCat.length > 0

  return (
    <Card title={`${cat} — évolution`}>
      <div className="mb-2 flex flex-wrap gap-1">
        {METRICS_EVO.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMetric(m.id)}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${metric === m.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="h-56">
        {aDesDonnees
          ? <Line data={data} options={options} />
          : <p className="py-16 text-center text-sm text-gray-400">Aucune donnée sur la période</p>}
      </div>
    </Card>
  )
}

function KpiDetailModal({ id, onClose, data }) {
  if (!id) return null
  const titles = {
    effectif: 'Détail effectif par catégorie (période)',
    ca: 'Factures de la période',
    achats: 'Détail des achats',
    ventes: 'Détail des ventes',
    naiss: 'Détail des naissances — période',
    dec: 'Détail des décès avec motifs — période',
    saisies: 'Saisies enregistrées sur la période',
    demandes: 'Demandes de sortie EN ATTENTE',
    sante: 'Interventions santé'
  }

  let content = null
  if (id === 'effectif') {
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase">
          <tr>
            <th className="p-2 text-left">Catégorie</th>
            <th className="p-2 text-center">EF Final</th>
            <th className="p-2 text-center">Entrées</th>
            <th className="p-2 text-center">Sorties</th>
            <th className="p-2 text-center">Naissances</th>
            <th className="p-2 text-center">Décès</th>
          </tr>
        </thead>
        <tbody>
          {(data.parCatPeriode || []).map((p) => (
            <tr key={p.cat} className="border-t">
              <td className="p-2 font-semibold" style={{ color: p.color }}>{p.cat}</td>
              <td className="p-2 text-center font-bold">{formatNumber(p.efFinal)}</td>
              <td className="p-2 text-center text-sky-600">{formatNumber(p.entPeriode)}</td>
              <td className="p-2 text-center text-amber-600">{formatNumber(p.sorPeriode)}</td>
              <td className="p-2 text-center text-green-600">{formatNumber(p.naissP)}</td>
              <td className="p-2 text-center text-red-600">{formatNumber(p.decP)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 font-bold">
          <tr><td className="p-2 text-right" colSpan={1}>Total</td><td className="p-2 text-center">{formatNumber(data.effectifTotal)}</td></tr>
        </tfoot>
      </table>
    )
  } else if (id === 'naiss') {
    content = (
      <div className="space-y-3">
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-800">
          <strong>{data.totauxAnim?.naiss || 0}</strong> naissances — Taux de croissance : <strong>{data.tauxCroissance} %</strong>
          <span className="ml-2 text-xs text-green-600">(formule : ((Naissances − Décès) / EF initial) × 100)</span>
        </p>
        {(data.naissancesDetail || []).length === 0 ? (
          <p className="py-6 text-center text-gray-400">Aucune naissance enregistrée.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase">
              <tr><th className="p-2">Date</th><th className="p-2">Espèce</th><th className="p-2">Catégorie</th><th className="p-2 text-center">Nés</th><th className="p-2">Agent</th></tr>
            </thead>
            <tbody>
              {data.naissancesDetail.map((n, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 font-mono text-xs">{formatDateShort(n.date)}</td>
                  <td className="p-2 font-semibold">{n.espece}</td>
                  <td className="p-2 text-gray-500">{n.cat}</td>
                  <td className="p-2 text-center font-bold text-green-600">{n.qte}</td>
                  <td className="p-2 text-xs text-gray-400">{n.agent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  } else if (id === 'dec') {
    content = (
      <div className="space-y-3">
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          <strong>{data.totauxAnim?.dec || 0}</strong> décès — Taux de mortalité : <strong>{data.tauxMortalite} %</strong>
          <span className="ml-2 text-xs text-red-600">(formule : (Décès / EF initial) × 100 — EF initial : {formatNumber(data.baseEffectif)} têtes)</span>
        </p>
        {(data.decesDetail || []).length === 0 ? (
          <p className="py-6 text-center text-gray-400">Aucun décès enregistré.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase">
              <tr><th className="p-2">Date</th><th className="p-2">Espèce</th><th className="p-2">Catégorie</th><th className="p-2 text-center">Qté</th><th className="p-2">Motif</th><th className="p-2">Agent</th></tr>
            </thead>
            <tbody>
              {data.decesDetail.map((d, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 font-mono text-xs">{formatDateShort(d.date)}</td>
                  <td className="p-2 font-semibold">{d.espece}</td>
                  <td className="p-2 text-gray-500">{d.cat}</td>
                  <td className="p-2 text-center font-bold text-red-600">{d.qte}</td>
                  <td className="p-2 text-gray-700">{d.motif}</td>
                  <td className="p-2 text-xs text-gray-400">{d.agent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  } else if (id === 'saisies') {
    const saisiesTri = [...(data.invPeriode || [])].sort((a, b) => b.date.localeCompare(a.date))
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase">
          <tr><th className="p-2">Date</th><th className="p-2">Agent</th><th className="p-2 text-center">EF Total</th><th className="p-2 text-center">Entrées</th><th className="p-2 text-center">Sorties</th></tr>
        </thead>
        <tbody>
          {saisiesTri.map((inv) => {
            const tetes = Object.values(inv.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)
            const ent = Object.values(inv.animaux || {}).reduce((s, a) => s + (a.ent || 0) + (a.naiss || 0), 0)
            const sor = Object.values(inv.animaux || {}).reduce((s, a) => s + (a.sor || 0) + (a.dec || 0), 0)
            return (
              <tr key={inv.date} className="border-t">
                <td className="p-2 font-mono text-xs">{formatDateShort(inv.date)}</td>
                <td className="p-2">{inv.agentNom || '—'}</td>
                <td className="p-2 text-center font-bold">{formatNumber(tetes)}</td>
                <td className="p-2 text-center text-sky-600">+{ent}</td>
                <td className="p-2 text-center text-amber-600">−{sor}</td>
              </tr>
            )
          })}
        </tbody>
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
    const liste = data.demandesEnAttenteList || []
    content = (
      <div className="space-y-2">
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <strong>{liste.length}</strong> demande(s) en attente d'approbation
        </p>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">N°</th><th className="p-2">Article</th><th className="p-2">Date</th><th className="p-2 text-center">Qté</th><th className="p-2">Demandeur</th></tr></thead>
          <tbody>{liste.length ? liste.map((d) => (
            <tr key={d.id || d.num} className="border-t">
              <td className="p-2 font-mono text-xs">{d.num}</td>
              <td className="p-2">{d.articleNom}</td>
              <td className="p-2 text-xs">{formatDateShort(d.date)}</td>
              <td className="p-2 text-center">{d.qte}</td>
              <td className="p-2 text-xs text-gray-500">{d.agentNom || '—'}</td>
            </tr>
          )) : <tr><td colSpan={5} className="p-4 text-center text-gray-400">Aucune demande en attente.</td></tr>}</tbody>
        </table>
      </div>
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
    content = <p className="py-6 text-center text-gray-500">Consultez les graphiques ci-dessus.</p>
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

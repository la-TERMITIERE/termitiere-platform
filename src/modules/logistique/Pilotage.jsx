// Pilotage & Analyse — MAXI LOGISTIQUE (par SITE, vue direction / investisseurs).
// Indicateurs clés filtrables par PÉRIODE et par CATÉGORIE de matériel :
// chiffre d'affaires, prestations, panier moyen et taux de casse / perte.
// Détail par catégorie de matériel.
import { useMemo, useState } from 'react'
import { Doughnut, Bar } from 'react-chartjs-2'
import {
  BadgeDollarSign, ClipboardList, Coins, AlertTriangle,
  Boxes, TrendingUp, TrendingDown, Wallet
} from 'lucide-react'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import { useCollection } from '../../hooks/useFirestore'
import { useLogistiqueStore } from './store/referentielStore'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { estActif } from '../../shared/workflow'
import { formatMoney, formatNumber, formatDateShort, addDays } from '../../utils/formatters'
import { CAT_MATERIEL, catColor, labelColor } from './data'
import { analyserPrestations, nbJoursInclus } from './logic'
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

  const { start, end, preset, node: periodNode } = usePeriodSelect('mois')
  const [scope, setScope] = useState(TOUTES)
  const [modal, setModal] = useState(null)
  const [detail, setDetail] = useState(null) // drill-down analyse (élément / événement / client)
  const [elementSort, setElementSort] = useState('count') // 'count' (sollicitation) | 'ca'

  const inPeriode = (d) => (d || '') >= start && (d || '') <= end

  // Période précédente de MÊME durée — socle des indicateurs de tendance décisionnels.
  const comparable = preset !== 'all'
  const dayCount = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(dayCount - 1))
  const inPrev = (d) => comparable && (d || '') >= prevStart && (d || '') <= prevEnd
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

  // Analyse détaillée des prestations de la période (par élément, catégorie,
  // événement, client). Indépendante du filtre catégorie ci-dessus.
  const analyse = useMemo(() => analyserPrestations(prestationsP), [prestationsP])
  const keyOf = (l) => l.materielId || `autre:${l.materielNom || 'Autre'}`

  // Prestations concernant un élément donné → détail cliquable.
  const detailElement = (el) => {
    const rows = prestationsP
      .filter((p) => (p.lignes || []).some((l) => keyOf(l) === el.key))
      .sort((a, b) => ((a.dateDebut || '') < (b.dateDebut || '') ? 1 : -1))
    setDetail({
      titre: `Élément : ${el.nom}`,
      render: (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 p-3">
            <MiniStat label="Sollicité" value={`${el.count} fois`} color="#0284c7" />
            <MiniStat label="Quantité cumulée" value={formatNumber(el.qte)} color="#7c3aed" />
            <MiniStat label="Chiffre d'affaires" value={formatMoney(el.ca)} color="#16a34a" />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Événement</th><th className="px-2 py-2 text-center">Qté</th><th className="px-2 py-2 text-center">Jours</th><th className="px-3 py-2 text-right">Montant</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((p) => { const l = (p.lignes || []).find((x) => keyOf(x) === el.key); return (
                <tr key={p.id}>
                  <td className="px-3 py-1.5 font-mono text-xs">{formatDateShort(p.dateDebut || p.date)}</td>
                  <td className="px-3 py-1.5">{p.clientNom || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500">{p.evenement || '—'}</td>
                  <td className="px-2 py-1.5 text-center">{l?.qte ?? '—'}</td>
                  <td className="px-2 py-1.5 text-center">{l?.nbJours || 1}</td>
                  <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatMoney(l?.montant || 0)}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )
    })
  }

  const detailCategorie = (c) => setDetail({
    titre: `Catégorie : ${c.cat}`,
    render: (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr><th className="px-3 py-2 text-left">Élément</th><th className="px-2 py-2 text-center">Sollicitations</th><th className="px-2 py-2 text-center">Qté</th><th className="px-3 py-2 text-right">CA</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {c.elements.map((el, i) => (
            <tr key={el.key} className="cursor-pointer hover:bg-sky-50" onClick={() => detailElement(el)}>
              <td className="px-3 py-1.5 font-semibold">{i === 0 && <span className="mr-1">🏆</span>}{el.nom}</td>
              <td className="px-2 py-1.5 text-center font-bold text-sky-700">{el.count}</td>
              <td className="px-2 py-1.5 text-center">{formatNumber(el.qte)}</td>
              <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatMoney(el.ca)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  })

  const detailPrestations = (titre, rows) => setDetail({
    titre,
    render: (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2">N°</th><th className="px-3 py-2">Client / Événement</th><th className="px-2 py-2 text-center">Jours</th><th className="px-3 py-2 text-right">Montant</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-3 py-1.5 font-mono text-xs">{formatDateShort(p.dateDebut || p.date)}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{p.num}</td>
              <td className="px-3 py-1.5">{p.clientNom || '—'}<span className="text-gray-400"> · {p.evenement || '—'}</span></td>
              <td className="px-2 py-1.5 text-center">{nbJoursInclus(p.dateDebut, p.dateFin)}</td>
              <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatMoney(p.total || 0)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="py-4 text-center text-gray-400">Aucune prestation.</td></tr>}
        </tbody>
      </table>
    )
  })
  const maxElCount = Math.max(1, ...analyse.parElement.map((e) => e.count))
  // Classement des éléments — par sollicitation (défaut) OU par chiffre d'affaires.
  const elementsTries = useMemo(() => {
    const arr = [...analyse.parElement]
    return elementSort === 'ca' ? arr.sort((a, b) => b.ca - a.ca) : arr.sort((a, b) => b.count - a.count)
  }, [analyse, elementSort])

  // Montant d'une facture rapporté au périmètre (total, ou lignes de la catégorie).
  const montantScope = (f) => scope === TOUTES
    ? (f.totalTTC || 0)
    : (f.lignes || []).filter((l) => inScope(catOf[l.materielId] || l.cat)).reduce((s, l) => s + (l.montant || 0), 0)

  // Une prestation entre dans le périmètre si elle a une ligne de la catégorie.
  const prestationInScope = (p) => scope === TOUTES || (p.lignes || []).some((l) => inScope(catOf[l.materielId] || l.cat))
  const sommeDepenses = (p) => (p.depenses || []).reduce((s, x) => s + (parseFloat(x.montant) || 0), 0)

  const caTotal = facturesP.reduce((s, f) => s + montantScope(f), 0)
  const nbPrestations = scope === TOUTES
    ? prestationsP.length
    : prestationsP.filter(prestationInScope).length
  // Dépenses internes liées aux prestations (frais de mission…) — voir onglet Prestations.
  const depensesTotal = prestationsP.filter(prestationInScope).reduce((s, p) => s + sommeDepenses(p), 0)
  // Solde = bénéfice brut des prestations/locations = CA − dépenses.
  const solde = caTotal - depensesTotal

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
  const autorisations = demandes.filter((d) => estActif(d.statut)).length

  // ── Période précédente (mêmes règles de périmètre) → deltas décisionnels ──
  const facturesPrev = useMemo(() => comparable ? factures.filter((f) => f.statut === 'approuvee' && inPrev(f.date)) : [], [factures, prevStart, prevEnd, comparable])
  const caPrev = facturesPrev.reduce((s, f) => s + montantScope(f), 0)
  const prestPrev = useMemo(() => prestations.filter((p) => inPrev(p.date)), [prestations, prevStart, prevEnd])
  const nbPrestPrev = scope === TOUTES ? prestPrev.length : prestPrev.filter(prestationInScope).length
  const depensesPrev = prestPrev.filter(prestationInScope).reduce((s, p) => s + sommeDepenses(p), 0)
  const soldePrev = caPrev - depensesPrev
  const retoursPrevScope = retours.filter((r) => inPrev(r.date)).filter((r) => inScope(catOf[r.materielId] || 'AUTRES'))
  const rc = (arr, t) => arr.filter((r) => r.type === t).reduce((s, r) => s + (parseInt(r.qte) || 0), 0)
  const totRetPrev = rc(retoursPrevScope, 'OK') + rc(retoursPrevScope, 'Cassé') + rc(retoursPrevScope, 'Perdu')
  const tauxCassePrev = totRetPrev ? ((rc(retoursPrevScope, 'Cassé') + rc(retoursPrevScope, 'Perdu')) / totRetPrev) * 100 : 0
  // Casse/perte (pièces) période courante vs précédente — pour la tendance.
  const cassePiecesCur = retourCasse + retourPerdu
  const cassePiecesPrev = rc(retoursPrevScope, 'Cassé') + rc(retoursPrevScope, 'Perdu')
  // Variation relative (%) — null si pas de base de comparaison.
  const pct = (cur, prev) => (comparable && prev > 0) ? ((cur - prev) / prev) * 100 : null

  // Graphiques — répartition du CA (mix décisionnel).
  const caParCatChart = {
    labels: parCat.filter((p) => p.ca > 0).map((p) => p.cat),
    datasets: [{ data: parCat.filter((p) => p.ca > 0).map((p) => p.ca), backgroundColor: parCat.filter((p) => p.ca > 0).map((p) => p.color) }]
  }
  const evParCa = analyse.parEvenement.filter((e) => e.ca > 0)
  const caParEvChart = {
    labels: evParCa.map((e) => e.label),
    datasets: [{ data: evParCa.map((e) => e.ca), backgroundColor: evParCa.map((e) => labelColor(e.label)) }]
  }

  // Hero chart : CA par sous-période, période actuelle VS précédente (momentum).
  const caTrend = useMemo(() => {
    const approved = factures.filter((f) => f.statut === 'approuvee')
    let s0 = start, e0 = end
    if (!comparable || start < '2000-01-01') {
      const ds = approved.map((f) => f.date).filter(Boolean).sort()
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
    const caIn = (from, to) => approved.filter((f) => (f.date || '') >= from && (f.date || '') <= to).reduce((a, f) => a + montantScope(f), 0)
    // Casse / perte (pièces) sur les mêmes sous-périodes — pour la tendance des pertes.
    const retScope = retours.filter((r) => (r.type === 'Cassé' || r.type === 'Perdu') && inScope(catOf[r.materielId] || 'AUTRES'))
    const casseIn = (from, to) => retScope.filter((r) => (r.date || '') >= from && (r.date || '') <= to).reduce((a, r) => a + (parseInt(r.qte) || 0), 0)
    const cur = buckets.map((b) => caIn(b.from, b.to))
    const prev = (comparable && start >= '2000-01-01') ? buckets.map((b) => caIn(addDays(b.from, -dayCount), addDays(b.to, -dayCount))) : null
    const casseCur = buckets.map((b) => casseIn(b.from, b.to))
    const cassePrev = (comparable && start >= '2000-01-01') ? buckets.map((b) => casseIn(addDays(b.from, -dayCount), addDays(b.to, -dayCount))) : null
    return { labels: buckets.map((b) => b.label), cur, prev, casseCur, cassePrev }
  }, [factures, retours, catOf, start, end, scope, comparable, dayCount])

  // Croissance du CA vs période précédente (message décisionnel sous le graphe).
  const caDelta = pct(caTotal, caPrev)

  const kpis = [
    { id: 'ca', title: 'Chiffre d\'affaires', value: formatMoney(caTotal), delta: pct(caTotal, caPrev), up: true, sub: comparable ? `préc. ${formatMoney(caPrev)}` : `${facturesP.length} facture(s)`, icon: BadgeDollarSign, color: '#BC3C31' },
    { id: 'presta', title: 'Prestations', value: formatNumber(nbPrestations), delta: pct(nbPrestations, nbPrestPrev), up: true, sub: comparable ? `préc. ${formatNumber(nbPrestPrev)}` : 'sur la période', icon: ClipboardList, color: '#0284c7' },
    { id: 'depenses', title: 'Dépenses (prestations)', value: formatMoney(depensesTotal), delta: pct(depensesTotal, depensesPrev), up: false, sub: 'frais de mission, transport…', icon: Coins, color: '#ea580c' },
    { id: 'solde', title: 'Solde (bénéfice)', value: formatMoney(solde), delta: pct(solde, soldePrev), up: true, sub: 'CA − dépenses', icon: Wallet, color: solde >= 0 ? '#16a34a' : '#dc2626' },
    { id: 'casse', title: 'Taux de casse / perte', value: `${tauxCasse.toFixed(1)} %`, deltaPP: comparable ? (tauxCasse - tauxCassePrev) : null, up: false, sub: `${formatNumber(cassePiecesCur)}/${formatNumber(totalRetours)} retours`, icon: AlertTriangle, color: tauxCasse > 5 ? '#dc2626' : '#16a34a' }
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
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
            {/* Montant TOUJOURS entièrement visible (passe à la ligne au besoin). */}
            <p className="truncate text-[10px] font-bold uppercase tracking-wide text-gray-500" title={k.title}>{k.title}</p>
            <p className="break-words text-base font-extrabold leading-tight text-gray-900 sm:text-lg" title={String(k.value)}>{k.value}</p>
            {k.sub && <p className="mt-0.5 truncate text-[10px] text-gray-400" title={k.sub}>{k.sub}</p>}
          </button>
        )})}
      </div>
      {comparable && <p className="-mt-3 text-[11px] text-gray-400">▲▼ variation vs période précédente équivalente ({formatDateShort(prevStart)} → {formatDateShort(prevEnd)})</p>}

      {/* Hero BI : CA par sous-période, actuel vs précédent (momentum & saisonnalité) */}
      <Card title="Chiffre d'affaires par sous-période — actuel vs précédent">
        <div className="h-64">
          {caTrend.cur.some((v) => v > 0) || (caTrend.prev || []).some((v) => v > 0) ? (
            <Bar data={{
              labels: caTrend.labels,
              datasets: [
                { label: 'Période actuelle', data: caTrend.cur, backgroundColor: '#BC3C31', borderRadius: 4, maxBarThickness: 34 },
                ...(caTrend.prev ? [{ label: 'Période précédente', data: caTrend.prev, backgroundColor: '#e7cbc8', borderRadius: 4, maxBarThickness: 34 }] : [])
              ]
            }} options={{
              maintainAspectRatio: false,
              plugins: {
                legend: { display: !!caTrend.prev, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: (c) => `${c.dataset.label} : ${formatMoney(c.parsed.y)}` } }
              },
              scales: { y: { ticks: { callback: (v) => formatNumber(v) } } }
            }} />
          ) : <p className="py-16 text-center text-sm text-gray-400">Aucune facture approuvée sur la période</p>}
        </div>
        {caDelta != null && (
          <p className={`mt-2 text-sm font-semibold ${caDelta >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {caDelta >= 0 ? '▲' : '▼'} CA {caDelta >= 0 ? 'en hausse' : 'en baisse'} de {Math.abs(caDelta).toFixed(1)} % vs période précédente
            <span className="font-normal text-gray-400"> ({formatMoney(caPrev)} → {formatMoney(caTotal)})</span>
          </p>
        )}
      </Card>

      {/* Tendance des casses / pertes — actuel vs précédent (pièces) */}
      <Card title="Casse / perte par sous-période — actuel vs précédent">
        <div className="h-56">
          {caTrend.casseCur.some((v) => v > 0) || (caTrend.cassePrev || []).some((v) => v > 0) ? (
            <Bar data={{
              labels: caTrend.labels,
              datasets: [
                { label: 'Période actuelle', data: caTrend.casseCur, backgroundColor: '#dc2626', borderRadius: 4, maxBarThickness: 34 },
                ...(caTrend.cassePrev ? [{ label: 'Période précédente', data: caTrend.cassePrev, backgroundColor: '#fca5a5', borderRadius: 4, maxBarThickness: 34 }] : [])
              ]
            }} options={{
              maintainAspectRatio: false,
              plugins: {
                legend: { display: !!caTrend.cassePrev, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { callbacks: { label: (c) => `${c.dataset.label} : ${formatNumber(c.parsed.y)} pièce(s)` } }
              },
              scales: { y: { ticks: { precision: 0 } } }
            }} />
          ) : <p className="py-14 text-center text-sm text-gray-400">Aucune casse ni perte sur la période</p>}
        </div>
        {comparable && (
          <p className={`mt-2 text-sm font-semibold ${cassePiecesCur <= cassePiecesPrev ? 'text-green-700' : 'text-red-600'}`}>
            {cassePiecesCur <= cassePiecesPrev ? '▼' : '▲'} {formatNumber(cassePiecesCur)} pièce(s) cassée(s)/perdue(s)
            <span className="font-normal text-gray-400"> (préc. {formatNumber(cassePiecesPrev)})</span>
          </p>
        )}
      </Card>

      {/* Répartition du CA — deux axes de décision : catégorie & type d'événement */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Répartition du CA par catégorie">
          <div className="h-60">
            {parCat.some((p) => p.ca > 0) ? <Doughnut data={caParCatChart} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } }} /> : <p className="py-16 text-center text-sm text-gray-400">Aucune facture approuvée sur la période</p>}
          </div>
        </Card>
        <Card title="CA facturable par type d'événement">
          <div className="h-60">
            {evParCa.length ? <Doughnut data={caParEvChart} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } }} /> : <p className="py-16 text-center text-sm text-gray-400">Aucune prestation sur la période</p>}
          </div>
        </Card>
      </div>

      {/* ══ Analyse détaillée des prestations (sollicitations & montants facturables) ══ */}
      <div className="flex items-center gap-2 pt-2">
        <TrendingUp size={18} className="text-[#BC3C31]" />
        <h3 className="text-base font-extrabold text-gray-800">Analyse détaillée des prestations</h3>
        <span className="text-xs text-gray-400">{analyse.parElement.length ? `${prestationsP.length} prestation(s) · ${formatDateShort(start)} → ${formatDateShort(end)}` : ''}</span>
      </div>

      {!analyse.parElement.length ? (
        <Card><p className="py-8 text-center text-sm text-gray-400">Aucune prestation sur la période — élargissez la plage.</p></Card>
      ) : (
        <>
          {/* Tendances colorées par catégorie — le plus sollicité */}
          <Card title="Tendances par catégorie — le plus sollicité">
            <div className="grid gap-3 sm:grid-cols-2">
              {analyse.parCategorie.map((c) => {
                const color = catColor(c.cat)
                const maxCat = Math.max(1, ...c.elements.map((e) => e.count))
                return (
                  <button key={c.cat} onClick={() => detailCategorie(c)}
                    className="group rounded-xl border border-gray-100 p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 font-bold" style={{ color }}>
                        <span className="h-3 w-3 rounded-full" style={{ background: color }} /> {c.cat}
                      </span>
                      <span className="text-sm font-bold text-gray-700">{formatMoney(c.ca)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {c.elements.slice(0, 4).map((el, i) => (
                        <div key={el.key} className="flex items-center gap-2">
                          <span className="w-32 shrink-0 truncate text-xs font-medium text-gray-600">{i === 0 && '🏆 '}{el.nom}</span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full" style={{ width: `${(el.count / maxCat) * 100}%`, background: color }} />
                          </div>
                          <span className="w-10 shrink-0 text-right text-xs font-bold text-gray-500">{el.count}×</span>
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Classement des éléments — triable par sollicitation ou par CA */}
          <Card title="Analyse par élément — sollicitations, quantités, CA">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-400">Trier par :</span>
              <button onClick={() => setElementSort('count')} type="button"
                className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${elementSort === 'count' ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Plus sollicité
              </button>
              <button onClick={() => setElementSort('ca')} type="button"
                className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${elementSort === 'ca' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Chiffre d'affaires
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr><th className="px-3 py-2 text-left">Élément</th><th className="px-3 py-2 text-left">Catégorie</th><th className="px-3 py-2">Sollicité</th><th className="px-2 py-2 text-center">Qté</th><th className="px-2 py-2 text-center">Jours</th><th className="px-3 py-2 text-right">CA</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {elementsTries.map((el) => (
                    <tr key={el.key} className="cursor-pointer hover:bg-sky-50" onClick={() => detailElement(el)}>
                      <td className="px-3 py-1.5 font-semibold">{el.nom}</td>
                      <td className="px-3 py-1.5"><span className="text-xs font-semibold" style={{ color: catColor(el.cat) }}>{el.cat}</span></td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${(el.count / maxElCount) * 100}%` }} /></div>
                          <span className="text-xs font-bold text-sky-700">{el.count}×</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">{formatNumber(el.qte)}</td>
                      <td className="px-2 py-1.5 text-center">{formatNumber(el.jours)}</td>
                      <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatMoney(el.ca)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Événements les plus sollicités */}
            <Card title="Événements les plus sollicités">
              <div className="space-y-2">
                {analyse.parEvenement.map((ev) => {
                  const maxEv = Math.max(1, ...analyse.parEvenement.map((x) => x.count))
                  const color = labelColor(ev.label)
                  return (
                    <button key={ev.label} onClick={() => detailPrestations(`Événement : ${ev.label}`, prestationsP.filter((p) => ((p.evenement || '').trim() || 'Non précisé') === ev.label))}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50">
                      <span className="w-36 shrink-0 truncate text-sm font-medium">{ev.label}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${(ev.count / maxEv) * 100}%`, background: color }} /></div>
                      <span className="w-8 shrink-0 text-right text-xs font-bold text-gray-600">{ev.count}×</span>
                      <span className="w-24 shrink-0 text-right text-xs font-semibold text-green-700">{formatMoney(ev.ca)}</span>
                    </button>
                  )
                })}
              </div>
            </Card>

            {/* Classement complet des clients */}
            <Card title="Classement des clients (prestations · jours · CA)">
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                    <tr><th className="px-3 py-2 text-left">Client</th><th className="px-2 py-2 text-center">Presta.</th><th className="px-2 py-2 text-center">Jours</th><th className="px-3 py-2 text-right">CA</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {analyse.parClient.map((c, i) => (
                      <tr key={c.nom} className="cursor-pointer hover:bg-sky-50" onClick={() => detailPrestations(`Client : ${c.nom}`, prestationsP.filter((p) => ((p.clientNom || '').trim() || 'Client inconnu') === c.nom))}>
                        <td className="px-3 py-1.5 font-semibold">{i < 3 && ['🥇', '🥈', '🥉'][i]} {c.nom}</td>
                        <td className="px-2 py-1.5 text-center font-bold text-sky-700">{c.count}</td>
                        <td className="px-2 py-1.5 text-center">{formatNumber(c.jours)}</td>
                        <td className="px-3 py-1.5 text-right font-bold text-green-700">{formatMoney(c.ca)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}

      <PilotageModal id={modal} onClose={() => setModal(null)} scopeLabel={scopeLabel}
        data={{
          facturesP, prestationsP: prestationsP.filter(prestationInScope), retoursScope, parCat, montantScope,
          sommeDepenses, caTotal, depensesTotal, solde
        }} />

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.titre || ''} {...glassModalProps(COULEUR_MODULE.logistique)}>
        <div className="overflow-x-auto rounded-lg border border-gray-100">{detail?.render}</div>
      </Modal>
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2 text-center">
      <p className="text-[10px] font-bold uppercase text-gray-400">{label}</p>
      <p className="text-base font-extrabold" style={{ color }}>{value}</p>
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
    ca: 'Factures approuvées', parc: 'Parc par catégorie', stock: 'Parc par catégorie',
    presta: 'Prestations', depenses: 'Dépenses des prestations', solde: 'Solde (CA − dépenses)',
    casse: 'Casse / perte par prestation'
  }
  let content = null
  if (id === 'ca') {
    const rows = [...data.facturesP].sort((a, b) => (a.date < b.date ? 1 : -1))
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">Date</th><th className="p-2">Client</th><th className="p-2">Prestation</th><th className="p-2 text-right">Montant</th></tr></thead>
        <tbody>{rows.map((f) => (
          <tr key={f.id} className="border-t"><td className="p-2">{formatDateShort(f.date)}</td><td className="p-2">{f.clientNom || '—'}</td><td className="p-2 text-xs text-gray-500">{f.prestationNum || '—'}</td><td className="p-2 text-right font-bold">{formatMoney(data.montantScope(f))}</td></tr>
        ))}{!rows.length && <tr><td colSpan={4} className="p-4 text-center text-gray-400">Aucune facture approuvée.</td></tr>}</tbody>
      </table>
    )
  } else if (id === 'presta') {
    const rows = [...data.prestationsP].sort((a, b) => (a.date < b.date ? 1 : -1))
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">N°</th><th className="p-2">Client</th><th className="p-2">Période</th><th className="p-2 text-right">Montant</th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id} className="border-t"><td className="p-2 font-mono text-xs">{p.num}</td><td className="p-2">{p.clientNom}</td><td className="p-2 text-xs">{formatDateShort(p.dateDebut)} → {formatDateShort(p.dateFin)}</td><td className="p-2 text-right font-bold">{formatMoney(p.total || 0)}</td></tr>
        ))}{!rows.length && <tr><td colSpan={4} className="p-4 text-center text-gray-400">Aucune prestation.</td></tr>}</tbody>
      </table>
    )
  } else if (id === 'depenses' || id === 'solde') {
    const rows = [...data.prestationsP]
      .map((p) => ({ p, dep: data.sommeDepenses(p) }))
      .filter((x) => id === 'solde' || x.dep > 0)
      .sort((a, b) => b.dep - a.dep)
    content = (
      <>
        {id === 'solde' && (
          <div className="grid grid-cols-3 gap-2 p-3">
            <MiniStat label="Chiffre d'affaires" value={formatMoney(data.caTotal)} color="#16a34a" />
            <MiniStat label="Dépenses" value={formatMoney(data.depensesTotal)} color="#ea580c" />
            <MiniStat label="Solde" value={formatMoney(data.solde)} color={data.solde >= 0 ? '#16a34a' : '#dc2626'} />
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">N°</th><th className="p-2">Client</th><th className="p-2 text-right">Facturé</th><th className="p-2 text-right">Dépenses</th></tr></thead>
          <tbody>{rows.map(({ p, dep }) => (
            <tr key={p.id} className="border-t"><td className="p-2 font-mono text-xs">{p.num}</td><td className="p-2">{p.clientNom}</td><td className="p-2 text-right">{formatMoney(p.total || 0)}</td><td className="p-2 text-right font-bold text-orange-700">{dep > 0 ? formatMoney(dep) : '—'}</td></tr>
          ))}{!rows.length && <tr><td colSpan={4} className="p-4 text-center text-gray-400">Aucune dépense enregistrée.</td></tr>}</tbody>
        </table>
      </>
    )
  } else if (id === 'casse') {
    // Regroupe les retours cassés / perdus PAR PRESTATION : nb cassé, nb perdu,
    // pénalité totale et statut de remboursement (demande direction).
    const map = {}
    data.retoursScope.filter((r) => r.type !== 'OK').forEach((r) => {
      const k = r.prestationId || r.prestationNum || r.id
      const g = map[k] || (map[k] = { presta: r.prestationNum || '—', client: r.clientNom || '—', casse: 0, perdu: 0, penalite: 0, du: 0, items: [] })
      if (r.type === 'Cassé') g.casse += parseInt(r.qte) || 0
      if (r.type === 'Perdu') g.perdu += parseInt(r.qte) || 0
      const pen = parseFloat(r.penalite) || 0
      g.penalite += pen
      if (pen > 0 && !r.penalitePayee) g.du += pen
      g.items.push(r)
    })
    const rows = Object.values(map).sort((a, b) => b.penalite - a.penalite)
    content = (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2">Prestation</th><th className="p-2">Client</th><th className="p-2 text-center">Cassé</th><th className="p-2 text-center">Perdu</th><th className="p-2 text-right">Pénalité</th><th className="p-2 text-center">Remboursement</th></tr></thead>
        <tbody>{rows.map((g, i) => (
          <tr key={i} className="border-t">
            <td className="p-2 font-mono text-xs">{g.presta}</td>
            <td className="p-2">{g.client}</td>
            <td className="p-2 text-center font-bold text-red-600">{g.casse || '—'}</td>
            <td className="p-2 text-center font-bold text-red-600">{g.perdu || '—'}</td>
            <td className="p-2 text-right font-semibold">{g.penalite > 0 ? formatMoney(g.penalite) : '—'}</td>
            <td className="p-2 text-center">{g.penalite > 0 ? (g.du > 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Reste {formatMoney(g.du)}</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">Réglée</span>) : '—'}</td>
          </tr>
        ))}{!rows.length && <tr><td colSpan={6} className="p-4 text-center text-gray-400">Aucune casse ni perte sur la période.</td></tr>}</tbody>
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

// Dashboard Logistique & Événementiel — KPI matériel, prestations, autorisations.
// Cartes cliquables avec drill-down (catégorie → articles → détail).
import { useMemo, useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Boxes, BadgeDollarSign, Send, AlertTriangle, RotateCcw, ChevronRight, PackageX } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useLogistiqueStore } from './store/referentielStore'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
import { catColor, CAT_MATERIEL } from './data'
import { STATUTS_DEMANDE, normaliserStatut, estActif } from '../../shared/workflow'
import { useSite, matchSite, siteLabel } from './site/useSite'

const TOUTES = '__TOUTES__'

export default function Dashboard() {
  const materiel = useLogistiqueStore((s) => s.materiel)
  const site = useSite()
  const { data: allInventaires } = useCollection('logistique_inventaires')
  const { data: allPrestations } = useCollection('logistique_prestations')
  const { data: allFactures } = useCollection('logistique_factures')
  const { data: allDemandes } = useCollection('logistique_demandes')
  const { data: allRetours } = useCollection('logistique_retours')

  // Cloisonnement par site (sous-application Lomé / Kara).
  const inventaires = useMemo(() => allInventaires.filter((i) => matchSite(i, site)), [allInventaires, site])
  const prestations = useMemo(() => allPrestations.filter((p) => matchSite(p, site)), [allPrestations, site])
  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const demandes = useMemo(() => allDemandes.filter((d) => matchSite(d, site)), [allDemandes, site])
  const retours = useMemo(() => allRetours.filter((r) => matchSite(r, site)), [allRetours, site])

  const [detail, setDetail] = useState(null) // { titre, render }
  const [scope, setScope] = useState(TOUTES) // filtre catégorie (comme Maxi Agro)
  const { start, end, node: periodNode } = usePeriodSelect('mois')

  const dernier = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [inventaires])
  const dansPeriode = (d) => (d || '') >= start && (d || '') <= end

  // Catégorie d'un matériel (par id) + liste des catégories présentes.
  const catOf = useMemo(() => { const m = {}; materiel.forEach((x) => { m[x.id] = x.cat }); return m }, [materiel])
  const cats = useMemo(() => {
    const custom = [...new Set(materiel.map((m) => m.cat))].filter((c) => !CAT_MATERIEL.includes(c))
    return [...CAT_MATERIEL, ...custom].filter((c) => materiel.some((m) => m.cat === c))
  }, [materiel])
  const inScope = (cat) => scope === TOUTES || cat === scope
  const scopeLabel = scope === TOUTES ? 'Toutes catégories' : scope

  const stockTotal = useMemo(() =>
    dernier ? materiel.reduce((s, m) => s + (inScope(m.cat) ? (dernier.materiels?.[m.id]?.fin || 0) : 0), 0) : 0,
  [dernier, materiel, scope])

  const valeurStock = useMemo(() => {
    if (!dernier) return 0
    return materiel.reduce((s, m) => s + (inScope(m.cat) ? (dernier.materiels?.[m.id]?.fin || 0) * (m.coutAchat || 0) : 0), 0)
  }, [dernier, materiel, scope])

  // Montant d'une facture rapporté au périmètre (total, ou lignes de la catégorie).
  const montantScope = (f) => scope === TOUTES
    ? (f.totalTTC || 0)
    : (f.lignes || []).filter((l) => inScope(catOf[l.materielId] || l.cat)).reduce((s, l) => s + (l.montant || 0), 0)

  // CA = factures APPROUVÉES (autorisation de sortie certifiée) de la période.
  const facturesMois = factures.filter((f) => f.statut === 'approuvee' && dansPeriode(f.date) && montantScope(f) > 0)
  const caMois = facturesMois.reduce((s, f) => s + montantScope(f), 0)
  const demandesActives = demandes.filter((d) => estActif(d.statut))
  const prestationsActivesList = prestations.filter((p) => ['facturee', 'en_cours'].includes(p.statut))
  // Casse / perte SUR LA PÉRIODE, filtrée par catégorie — pièces + montant + pénalités.
  const cassePerte = useMemo(() => {
    const rows = retours.filter((r) => (r.type === 'Cassé' || r.type === 'Perdu') && dansPeriode(r.date) && inScope(catOf[r.materielId] || 'AUTRES'))
    const pieces = rows.reduce((s, r) => s + (parseInt(r.qte) || 0), 0)
    const penalites = rows.reduce((s, r) => s + (parseFloat(r.penalite) || 0), 0)
    const impayees = rows.filter((r) => (parseFloat(r.penalite) || 0) > 0 && !r.penalitePayee)
    return { rows, pieces, penalites, impayees }
  }, [retours, start, end, scope, catOf])

  const parCat = useMemo(() => {
    return cats.map((cat) => {
      const items = materiel.filter((m) => m.cat === cat)
        .map((m) => ({ nom: m.nom, unite: m.unite, fin: dernier?.materiels?.[m.id]?.fin || 0 }))
      const stock = items.reduce((s, it) => s + it.fin, 0)
      return { cat, stock, items, color: catColor(cat) }
    }).filter((p) => p.stock > 0)
  }, [materiel, dernier, cats])

  const repartition = {
    labels: parCat.map((p) => p.cat),
    datasets: [{ data: parCat.map((p) => p.stock), backgroundColor: parCat.map((p) => p.color) }]
  }

  const fluxMois = useMemo(() => {
    const invMois = inventaires.filter((i) => dansPeriode(i.date))
    let achats = 0, sorties = 0, retOk = 0
    invMois.forEach((i) => Object.values(i.materiels || {}).forEach((m) => {
      achats += m.ent || 0; sorties += m.sor || 0; retOk += m.retourOk || 0
    }))
    return {
      labels: ['Achats', 'Sorties', 'Retours OK'],
      datasets: [{ data: [achats, sorties, retOk], backgroundColor: ['#16a34a', '#d97706', '#0284c7'] }]
    }
  }, [inventaires, start, end])

  // Détail des articles d'une catégorie (2e niveau de drill-down).
  const ouvrirCategorie = (p) => setDetail({ titre: `Catégorie : ${p.cat}`, render: (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Article</th><th className="px-3 py-2 text-right">Stock</th></tr></thead>
      <tbody className="divide-y divide-gray-100">
        {p.items.filter((it) => it.fin > 0).map((it, i) => (
          <tr key={i}><td className="px-3 py-1.5 font-semibold">{it.nom} <span className="text-[10px] text-gray-400">({it.unite})</span></td><td className="px-3 py-1.5 text-right font-bold text-sky-700">{formatNumber(it.fin)}</td></tr>
        ))}
      </tbody>
    </table>
  ) })

  // Détail « stock par catégorie » avec catégories cliquables.
  const detailStock = (
    <div className="divide-y divide-gray-100">
      {parCat.map((p) => (
        <button key={p.cat} onClick={() => ouvrirCategorie(p)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-sky-50">
          <span className="flex items-center gap-2 font-semibold"><span className="h-3 w-3 rounded-full" style={{ background: p.color }} /> {p.cat}</span>
          <span className="flex items-center gap-2"><span className="font-bold text-sky-700">{formatNumber(p.stock)}</span><ChevronRight size={15} className="text-gray-300" /></span>
        </button>
      ))}
      {!parCat.length && <p className="px-3 py-4 text-center text-gray-400">Aucun stock.</p>}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(188,60,49,0.35),0_8px_20px_-8px_rgba(188,60,49,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.85) 0%, rgba(26,26,26,0.8) 100%)' }}>
        <div style={{ position: 'relative', flexShrink: 0, width: 64, height: 64 }}>
          <img src="/logo_maxi_logistique.png" alt="Maxi Logistique"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              objectFit: 'cover', background: 'white', padding: 4,
              boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55',
              display: 'block'
            }} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Maxi Logistique · {siteLabel(site)}</h2>
          <p className="text-sm text-white/80">Matériel · Location · Prestations · Autorisations</p>
        </div>
        <div className="ml-auto [&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:text-white [&_.input-base]:font-semibold [&_label]:text-white [&_label]:font-bold">
          {periodNode}
        </div>
      </div>

      {/* Filtre par catégorie (comme Maxi Agro) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-bold uppercase tracking-wide text-gray-400">Catégorie :</span>
        <ScopeTab active={scope === TOUTES} color="#374151" onClick={() => setScope(TOUTES)}>Toutes</ScopeTab>
        {cats.map((c) => (
          <ScopeTab key={c} active={scope === c} color={catColor(c)} onClick={() => setScope(c)}>{c}</ScopeTab>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard title="Stock total" value={formatNumber(stockTotal)} sub="pièces — cliquer" icon={Boxes} accent="#0284c7"
          onClick={() => setDetail({ titre: 'Stock par catégorie', render: detailStock })} />
        <StatCard title="Valeur stock" value={formatMoney(valeurStock)} sub="au coût d'achat · cliquer" icon={Boxes} accent="#7c3aed"
          onClick={() => setDetail({ titre: 'Valeur du stock', render: (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Article</th><th className="px-3 py-2 text-right">Stock</th><th className="px-3 py-2 text-right">Valeur</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {materiel.map((m) => { const fin = dernier?.materiels?.[m.id]?.fin || 0; if (!fin) return null; return (
                  <tr key={m.id}><td className="px-3 py-1.5 font-semibold">{m.nom}</td><td className="px-3 py-1.5 text-right">{formatNumber(fin)}</td><td className="px-3 py-1.5 text-right font-bold text-violet-700">{formatMoney(fin * (m.coutAchat || 0))}</td></tr>
                )})}
              </tbody>
            </table>
          ) })} />
        <StatCard title="CA période" value={formatMoney(caMois)} sub={`${facturesMois.length} facture(s) approuvée(s) · cliquer`} icon={BadgeDollarSign} accent="#16a34a"
          onClick={() => setDetail({ titre: 'Factures approuvées (CA) — période', render: (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2">N°</th><th className="px-3 py-2">Client</th><th className="px-3 py-2 text-right">Total TTC</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {[...facturesMois].sort((a, b) => (a.date < b.date ? 1 : -1)).map((f) => (
                  <tr key={f.id}><td className="px-3 py-1.5 font-mono text-xs">{formatDateShort(f.date)}</td><td className="px-3 py-1.5">{f.num}</td><td className="px-3 py-1.5">{f.clientNom || '—'}</td><td className="px-3 py-1.5 text-right font-bold text-green-700">{formatMoney(f.totalTTC || 0)}</td></tr>
                ))}
                {!facturesMois.length && <tr><td colSpan={4} className="py-4 text-center text-gray-400">Aucune facture ce mois.</td></tr>}
              </tbody>
            </table>
          ) })} />
        <StatCard title="Autorisations" value={demandesActives.length} sub="à traiter · cliquer" icon={Send} accent={demandesActives.length ? '#d97706' : '#64748b'}
          onClick={() => setDetail({ titre: 'Autorisations à traiter', render: (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">N°</th><th className="px-3 py-2">Matériel</th><th className="px-3 py-2 text-center">Qté</th><th className="px-3 py-2">Statut</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {demandesActives.map((d) => { const sn = normaliserStatut(d.statut); return (
                  <tr key={d.id}><td className="px-3 py-1.5 font-mono text-xs">{d.num}</td><td className="px-3 py-1.5 font-semibold">{d.materielNom}</td><td className="px-3 py-1.5 text-center">{d.qte}</td><td className="px-3 py-1.5"><Badge tone={STATUTS_DEMANDE[sn]?.tone}>{STATUTS_DEMANDE[sn]?.label}</Badge></td></tr>
                )})}
                {!demandesActives.length && <tr><td colSpan={4} className="py-4 text-center text-gray-400">Aucune autorisation en attente.</td></tr>}
              </tbody>
            </table>
          ) })} />
        <StatCard title="Prestations actives" value={prestationsActivesList.length} sub="en cours · cliquer" icon={RotateCcw} accent="#ea580c"
          onClick={() => setDetail({ titre: 'Prestations actives', render: (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Statut</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {prestationsActivesList.map((p) => (
                  <tr key={p.id}><td className="px-3 py-1.5 font-mono text-xs">{formatDateShort(p.date)}</td><td className="px-3 py-1.5">{p.clientNom || '—'}</td><td className="px-3 py-1.5">{p.statut}</td></tr>
                ))}
                {!prestationsActivesList.length && <tr><td colSpan={3} className="py-4 text-center text-gray-400">Aucune prestation active.</td></tr>}
              </tbody>
            </table>
          ) })} />
        <StatCard title="Casse / perte (période)" value={formatNumber(cassePerte.pieces)}
          sub={`${cassePerte.rows.length} retour(s) · ${cassePerte.impayees.length} pénalité(s) impayée(s)`}
          icon={PackageX} accent={cassePerte.pieces ? '#dc2626' : '#64748b'}
          onClick={() => setDetail({ titre: `Casse / perte — ${scopeLabel} (période)`, render: (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2">Matériel</th><th className="px-3 py-2">Prestation</th><th className="px-3 py-2 text-center">Qté</th><th className="px-3 py-2">État</th><th className="px-3 py-2 text-right">Pénalité</th><th className="px-3 py-2 text-center">Remb.</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {[...cassePerte.rows].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => (
                  <tr key={r.id}><td className="px-3 py-1.5 font-mono text-xs">{formatDateShort(r.date)}</td><td className="px-3 py-1.5 font-semibold">{r.materielNom}</td><td className="px-3 py-1.5 text-xs text-gray-500">{r.prestationNum || '—'}</td><td className="px-3 py-1.5 text-center">{r.qte}</td><td className="px-3 py-1.5 font-semibold text-red-600">{r.type}</td><td className="px-3 py-1.5 text-right">{r.penalite > 0 ? formatMoney(r.penalite) : '—'}</td><td className="px-3 py-1.5 text-center">{r.penalite > 0 ? (r.penalitePayee ? '✅' : '⏳') : '—'}</td></tr>
                ))}
                {!cassePerte.rows.length && <tr><td colSpan={7} className="py-4 text-center text-gray-400">Aucune casse ni perte sur la période.</td></tr>}
              </tbody>
            </table>
          ) })} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Répartition du stock par catégorie">
          <div className="h-64">
            {parCat.length
              ? <Doughnut data={repartition} options={{ maintainAspectRatio: false }} />
              : <p className="py-16 text-center text-sm text-gray-400">Aucun stock enregistré — commencez par la saisie magasin</p>}
          </div>
        </Card>
        <Card title={`Flux de la période (${formatDateShort(start)} → ${formatDateShort(end)})`}>
          <div className="h-64"><Bar data={fluxMois} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } } }} /></div>
        </Card>
      </div>

      {demandesActives.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={18} />
          <strong>{demandesActives.length}</strong> autorisation(s) de sortie à traiter (approbation puis certification).
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.titre || ''}
        panelClassName="bg-gradient-to-br from-red-200/85 via-red-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200">
        <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">{detail?.render}</div>
      </Modal>
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

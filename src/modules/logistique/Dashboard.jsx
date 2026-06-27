// Dashboard Logistique & Événementiel — KPI matériel, prestations, autorisations.
// Cartes cliquables avec drill-down (catégorie → articles → détail).
import { useMemo, useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Boxes, BadgeDollarSign, Send, AlertTriangle, RotateCcw, ChevronRight } from 'lucide-react'
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

export default function Dashboard() {
  const materiel = useLogistiqueStore((s) => s.materiel)
  const { data: inventaires } = useCollection('logistique_inventaires')
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: factures } = useCollection('logistique_factures')
  const { data: demandes } = useCollection('logistique_demandes')
  const { data: retours } = useCollection('logistique_retours')

  const [detail, setDetail] = useState(null) // { titre, render }
  const { start, end, node: periodNode } = usePeriodSelect('30')

  const dernier = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [inventaires])
  const dansPeriode = (d) => (d || '') >= start && (d || '') <= end

  const stockTotal = useMemo(() =>
    dernier ? Object.values(dernier.materiels || {}).reduce((s, m) => s + (m.fin || 0), 0) : 0,
  [dernier])

  const valeurStock = useMemo(() => {
    if (!dernier) return 0
    return materiel.reduce((s, m) => s + (dernier.materiels?.[m.id]?.fin || 0) * (m.coutAchat || 0), 0)
  }, [dernier, materiel])

  const facturesMois = factures.filter((f) => dansPeriode(f.date))
  const caMois = facturesMois.reduce((s, f) => s + (f.totalTTC || 0), 0)
  const demandesActives = demandes.filter((d) => estActif(d.statut))
  const prestationsActivesList = prestations.filter((p) => ['facturee', 'en_cours'].includes(p.statut))
  const retoursCasse = retours.filter((r) => r.type === 'Cassé' || r.type === 'Perdu').length

  const parCat = useMemo(() => {
    return [...CAT_MATERIEL].map((cat) => {
      const items = materiel.filter((m) => m.cat === cat)
        .map((m) => ({ nom: m.nom, unite: m.unite, fin: dernier?.materiels?.[m.id]?.fin || 0 }))
      const stock = items.reduce((s, it) => s + it.fin, 0)
      return { cat, stock, items, color: catColor(cat) }
    }).filter((p) => p.stock > 0)
  }, [materiel, dernier])

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
      <div className="flex flex-wrap items-center gap-3 rounded-xl p-4 text-white"
        style={{ background: 'linear-gradient(135deg, #BC3C31 0%, #1A1A1A 100%)' }}>
        <img src="/logo_maxi_logistique.png" alt="Maxi Logistique"
          className="h-16 w-auto object-contain rounded-lg bg-white p-1 shadow" />
        <div>
          <h2 className="text-lg font-extrabold">Maxi Logistique</h2>
          <p className="text-sm text-gray-300">Matériel · Location · Prestations · Autorisations</p>
        </div>
        <div className="ml-auto [&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:text-white [&_.input-base]:font-semibold [&_label]:text-white [&_label]:font-bold">
          {periodNode}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
        <StatCard title="CA période" value={formatMoney(caMois)} sub={`${facturesMois.length} facture(s) · cliquer`} icon={BadgeDollarSign} accent="#16a34a"
          onClick={() => setDetail({ titre: 'Factures de la période', render: (
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
        <StatCard title="Prestations actives" value={prestationsActivesList.length} sub={`${retoursCasse} casse/perte · cliquer`} icon={RotateCcw} accent="#ea580c"
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

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.titre || ''}>
        <div className="overflow-x-auto rounded-lg border border-gray-100">{detail?.render}</div>
      </Modal>
    </div>
  )
}

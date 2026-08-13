// Dashboard Briqueterie — production, stock, ventes, autorisations.
// Cartes cliquables (détail) + écarts vs mois précédent mis en avant.
import { useMemo, useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { ShoppingCart, Factory, Package, Send, AlertTriangle } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useBriqueterieStore } from './store/referentielStore'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { formatMoney, formatNumber, formatDateShort, addDays } from '../../utils/formatters'
import { stockBriqueTotal } from './logic'
import { STATUTS_DEMANDE, normaliserStatut, estActif } from '../../shared/workflow'

export default function Dashboard() {
  const briques = useBriqueterieStore((s) => s.briques)
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: factures } = useCollection('evenementiel_factures')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: demandes } = useCollection('evenementiel_demandes')

  const [detail, setDetail] = useState(null) // { titre, render }
  const { start, end, preset, node: periodNode } = usePeriodSelect('mois')

  // Période sélectionnée + période précédente équivalente (pour les écarts).
  const inPeriode = (d) => (d || '') >= start && (d || '') <= end
  const comparable = preset !== 'all'
  const dayCount = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(dayCount - 1))
  const inPrev = (d) => comparable && (d || '') >= prevStart && (d || '') <= prevEnd

  const dernier = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [inventaires])

  const stockPret = useMemo(() => {
    if (!dernier?.briques) return 0
    return briques.filter((b) => b.id !== 'caillasses').reduce((s, b) => s + (dernier.briques[b.id]?.pret || 0), 0)
  }, [dernier, briques])

  const stockSechage = useMemo(() => {
    if (!dernier?.briques) return 0
    return briques.filter((b) => b.id !== 'caillasses').reduce((s, b) => s + (dernier.briques[b.id]?.sechage || 0), 0)
  }, [dernier, briques])

  const caillasses = dernier?.briques?.caillasses?.caillasses || 0
  const prodDuMois = productions.filter((p) => inPeriode(p.date))
  const prodMois = prodDuMois.reduce((s, p) => s + (p.totalBriques || 0), 0)
  const prodMoisPrec = productions.filter((p) => inPrev(p.date)).reduce((s, p) => s + (p.totalBriques || 0), 0)
  // CA = factures émises (issues des ventes approuvées).
  const facturesDuMois = factures.filter((f) => inPeriode(f.date))
  const caMois = facturesDuMois.reduce((s, f) => s + (f.totalTTC || 0), 0)
  const caMoisPrec = factures.filter((f) => inPrev(f.date)).reduce((s, f) => s + (f.totalTTC || 0), 0)
  // Ventes de la période — commandes enregistrées, quel que soit leur avancement.
  const ventesDuMois = useMemo(
    () => ventes.filter((v) => inPeriode(v.date)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [ventes, start, end]
  )
  const ventesMontant = ventesDuMois.reduce((s, v) => s + (v.total || 0), 0)
  const nbVentesPrec = ventes.filter((v) => inPrev(v.date)).length
  const demandesActives = demandes.filter((d) => estActif(d.statut))

  // Total de BRIQUES vendues sur la période (somme des quantités des lignes) +
  // répartition par catégorie de brique (comme « Prêt à vendre »).
  const briquesVendues = useMemo(
    () => ventesDuMois.reduce((s, v) => s + (v.lignes || []).reduce((a, l) => a + (parseInt(l.qte) || 0), 0), 0),
    [ventesDuMois]
  )
  const briquesVenduesPrec = useMemo(
    () => ventes.filter((v) => inPrev(v.date)).reduce((s, v) => s + (v.lignes || []).reduce((a, l) => a + (parseInt(l.qte) || 0), 0), 0),
    [ventes, prevStart, prevEnd]
  )
  const ventesParCategorie = useMemo(() => {
    const map = {}
    ventesDuMois.forEach((v) => (v.lignes || []).forEach((l) => {
      const nom = l.briqueNom || l.briqueId || '—'
      map[nom] = (map[nom] || 0) + (parseInt(l.qte) || 0)
    }))
    return Object.entries(map).map(([nom, qte]) => ({ nom, qte })).sort((a, b) => b.qte - a.qte)
  }, [ventesDuMois])

  const parType = useMemo(() => {
    if (!dernier?.briques) return []
    return briques.filter((b) => b.id !== 'caillasses').map((b) => ({
      nom: b.nom, id: b.id,
      pret: dernier.briques[b.id]?.pret || 0,
      sechage: dernier.briques[b.id]?.sechage || 0,
      stock: stockBriqueTotal(dernier.briques[b.id])
    })).filter((p) => p.stock > 0)
  }, [dernier, briques])

  // Couleurs cardinales bien distinctes (rouge, orange, vert, bleu, jaune…) —
  // remplacent l'ancienne palette « tout en violet » où les parts se confondaient.
  const CARDINALES = ['#dc2626', '#ea580c', '#16a34a', '#0284c7', '#ca8a04', '#7c3aed', '#0d9488', '#db2777', '#4f46e5', '#65a30d']
  const repartition = {
    labels: parType.map((p) => p.nom),
    datasets: [{ data: parType.map((p) => p.stock), backgroundColor: parType.map((_, i) => CARDINALES[i % CARDINALES.length]) }]
  }

  const fluxMois = {
    labels: ['Production', 'Prêtes', 'En séchage', 'Caillasses'],
    datasets: [{ data: [prodMois, stockPret, stockSechage, caillasses], backgroundColor: ['#7c3aed', '#16a34a', '#ca8a04', '#64748b'] }]
  }

  // Tableaux de détail réutilisables.
  const tableStock = (champ) => (
    <div className="overflow-hidden rounded-2xl border border-gray-100">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-violet-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          <tr><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-right">Quantité</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {parType.filter((p) => p[champ] > 0).map((p, i) => (
            <tr key={p.id} className={`transition-colors hover:bg-violet-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
              <td className="px-4 py-2.5 font-semibold text-gray-800">{p.nom}</td>
              <td className="px-4 py-2.5 text-right text-base font-extrabold text-violet-700">{formatNumber(p[champ])}</td>
            </tr>
          ))}
          {!parType.some((p) => p[champ] > 0) && <tr><td colSpan={2} className="bg-white py-8 text-center text-sm text-gray-400">Aucun stock.</td></tr>}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(124,58,237,0.35),0_8px_20px_-8px_rgba(124,58,237,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.85) 0%, rgba(76,29,149,0.8) 100%)' }}>
        <div style={{ position: 'relative', flexShrink: 0, width: 64, height: 64 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#7c3aed', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55'
          }}>
            <span style={{ color: 'white', fontWeight: 800, fontSize: 20, letterSpacing: '-0.5px' }}>BR</span>
          </div>
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Briqueterie La Termitière</h2>
          <p className="text-sm text-white/80">Matières premières · Production · Séchage · Ventes · Autorisations (validation à deux niveaux)</p>
        </div>
        <div className="ml-auto [&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:font-semibold [&_.input-base]:text-white [&_label]:font-bold [&_label]:text-white">
          {periodNode}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Production période" value={formatNumber(prodMois)} icon={Factory} accent="#7c3aed"
          variation={comparable ? prodMois - prodMoisPrec : undefined} variationLabel={`période préc. : ${formatNumber(prodMoisPrec)} · cliquer`}
          onClick={() => setDetail({ titre: 'Production de la période', render: (
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-violet-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Détail par catégorie</th><th className="px-4 py-3 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...prodDuMois].sort((a, b) => (a.date < b.date ? 1 : -1)).map((p, i) => (
                    <tr key={p.id} className={`transition-colors hover:bg-violet-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="whitespace-nowrap px-4 py-2.5 align-top font-mono text-xs text-gray-500">{formatDateShort(p.date)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {(p.lignes || []).filter((l) => (parseInt(l.qte) || 0) > 0).map((l, k) => (
                            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                              {l.briqueNom} <span className="font-extrabold">{formatNumber(l.qte)}</span>
                            </span>
                          ))}
                          {(parseInt(p.caillasses) || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                              Caillasses <span className="font-extrabold">{formatNumber(p.caillasses)}</span>
                            </span>
                          )}
                          {!(p.lignes || []).some((l) => (parseInt(l.qte) || 0) > 0) && <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right align-top text-base font-extrabold text-violet-700">{formatNumber(p.totalBriques || 0)}</td>
                    </tr>
                  ))}
                  {!prodDuMois.length && <tr><td colSpan={3} className="bg-white py-8 text-center text-sm text-gray-400">Aucune production sur la période.</td></tr>}
                </tbody>
              </table>
            </div>
          ) })} />
        <StatCard title="Prêtes à vendre" value={formatNumber(stockPret)} icon={Package} accent="#16a34a"
          sub="par type — cliquer" onClick={() => setDetail({ titre: 'Briques prêtes à vendre', render: tableStock('pret') })} />
        <StatCard title="Briques vendues" value={formatNumber(briquesVendues)} icon={ShoppingCart} accent="#ca8a04"
          variation={comparable ? briquesVendues - briquesVenduesPrec : undefined}
          variationLabel={`${ventesDuMois.length} vente(s) · ${formatMoney(ventesMontant)} · cliquer`}
          onClick={() => setDetail({ titre: 'Briques vendues — par catégorie', render: (
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-violet-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3 text-left">Catégorie</th><th className="px-4 py-3 text-right">Quantité vendue</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ventesParCategorie.map((c, i) => (
                    <tr key={c.nom} className={`transition-colors hover:bg-violet-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{c.nom}</td>
                      <td className="px-4 py-2.5 text-right text-base font-extrabold text-amber-700">{formatNumber(c.qte)}</td>
                    </tr>
                  ))}
                  {!ventesParCategorie.length && <tr><td colSpan={2} className="bg-white py-8 text-center text-sm text-gray-400">Aucune vente sur la période.</td></tr>}
                </tbody>
                {ventesParCategorie.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-violet-50/60">
                      <td className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500">Total briques</td>
                      <td className="px-4 py-3 text-right text-base font-extrabold text-amber-700">{formatNumber(briquesVendues)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) })} />
        <StatCard title="CA période" value={formatMoney(caMois)} icon={Package} accent="#0284c7"
          variation={comparable ? caMois - caMoisPrec : undefined} variationLabel={`période préc. : ${formatMoney(caMoisPrec)} · cliquer`}
          onClick={() => setDetail({ titre: 'Chiffre d’affaires — par client & catégorie', render: (
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-violet-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Client</th><th className="px-4 py-3 text-left">Briques achetées (catégorie × qté)</th><th className="px-4 py-3 text-center">Total briques</th><th className="px-4 py-3 text-right">Total TTC</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...facturesDuMois].sort((a, b) => (a.date < b.date ? 1 : -1)).map((f, i) => {
                    const lignes = (f.lignes || []).filter((l) => (parseInt(l.qte) || 0) > 0)
                    const totalBr = lignes.reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
                    return (
                    <tr key={f.id} className={`transition-colors hover:bg-violet-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="whitespace-nowrap px-4 py-2.5 align-top font-mono text-xs text-gray-500">{formatDateShort(f.date)}</td>
                      <td className="px-4 py-2.5 align-top font-semibold text-gray-800">{f.client?.nom || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {lignes.map((l, k) => (
                            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                              {l.article || l.articleId || '—'} <span className="font-extrabold">{formatNumber(l.qte)}</span>
                            </span>
                          ))}
                          {!lignes.length && <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center align-top font-bold text-gray-700">{formatNumber(totalBr)}</td>
                      <td className="px-4 py-2.5 text-right align-top text-base font-extrabold text-sky-700">{formatMoney(f.totalTTC || 0)}</td>
                    </tr>
                  )})}
                  {!facturesDuMois.length && <tr><td colSpan={5} className="bg-white py-8 text-center text-sm text-gray-400">Aucune facture sur la période.</td></tr>}
                </tbody>
              </table>
            </div>
          ) })} />
        <StatCard title="Autorisations" value={demandesActives.length} sub={`${caillasses} caillasses · cliquer`} icon={Send}
          accent={demandesActives.length ? '#d97706' : '#64748b'}
          onClick={() => setDetail({ titre: 'Autorisations à traiter', render: (
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-violet-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3 text-left">N°</th><th className="px-4 py-3 text-left">Brique</th><th className="px-4 py-3 text-center">Qté</th><th className="px-4 py-3 text-left">Statut</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {demandesActives.map((d, i) => { const sn = normaliserStatut(d.statut); return (
                    <tr key={d.id} className={`transition-colors hover:bg-violet-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{d.num}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{d.briqueNom}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-gray-800">{d.qte}</td>
                      <td className="px-4 py-2.5"><Badge tone={STATUTS_DEMANDE[sn]?.tone}>{STATUTS_DEMANDE[sn]?.label}</Badge></td>
                    </tr>
                  )})}
                  {!demandesActives.length && <tr><td colSpan={4} className="bg-white py-8 text-center text-sm text-gray-400">Aucune autorisation en attente.</td></tr>}
                </tbody>
              </table>
            </div>
          ) })} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Stock par catégorie">
          <div className="h-64">
            {parType.length
              ? <Doughnut data={repartition} options={{ maintainAspectRatio: false }} />
              : <p className="py-16 text-center text-sm text-gray-400">Aucun stock — commencez par une production</p>}
          </div>
        </Card>
        <Card title="Vue d'ensemble">
          <div className="h-64"><Bar data={fluxMois} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
        </Card>
      </div>

      {demandesActives.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={18} />
          <strong>{demandesActives.length}</strong> autorisation(s) de sortie à traiter (approbation puis certification).
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.titre || ''}
        panelClassName="bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-300/75 backdrop-blur-2xl backdrop-saturate-200">
        <div className="overflow-x-auto">{detail?.render}</div>
      </Modal>
    </div>
  )
}

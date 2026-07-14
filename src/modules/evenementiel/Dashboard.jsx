// Dashboard Briqueterie — production, stock, ventes, autorisations.
// Cartes cliquables (détail) + écarts vs mois précédent mis en avant.
import { useMemo, useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { BrickWall, Factory, Package, Send, AlertTriangle } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useBriqueterieStore } from './store/referentielStore'
import { formatMoney, formatNumber, formatDateShort, todayStr } from '../../utils/formatters'
import { stockBriqueTotal } from './logic'
import { STATUTS_DEMANDE, normaliserStatut, estActif } from '../../shared/workflow'

// Renvoie le mois calendaire précédent au format 'YYYY-MM'.
function moisPrecedent(ym) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Dashboard() {
  const briques = useBriqueterieStore((s) => s.briques)
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: factures } = useCollection('evenementiel_factures')
  const { data: demandes } = useCollection('evenementiel_demandes')

  const [detail, setDetail] = useState(null) // { titre, render }

  const mois = todayStr().slice(0, 7)
  const moisPrec = moisPrecedent(mois)
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
  const prodDuMois = productions.filter((p) => (p.date || '').startsWith(mois))
  const prodMois = prodDuMois.reduce((s, p) => s + (p.totalBriques || 0), 0)
  const prodMoisPrec = productions.filter((p) => (p.date || '').startsWith(moisPrec)).reduce((s, p) => s + (p.totalBriques || 0), 0)
  // CA = factures émises (issues des ventes approuvées).
  const facturesDuMois = factures.filter((f) => (f.date || '').startsWith(mois))
  const caMois = facturesDuMois.reduce((s, f) => s + (f.totalTTC || 0), 0)
  const caMoisPrec = factures.filter((f) => (f.date || '').startsWith(moisPrec)).reduce((s, f) => s + (f.totalTTC || 0), 0)
  const demandesActives = demandes.filter((d) => estActif(d.statut))

  const parType = useMemo(() => {
    if (!dernier?.briques) return []
    return briques.filter((b) => b.id !== 'caillasses').map((b) => ({
      nom: b.nom, id: b.id,
      pret: dernier.briques[b.id]?.pret || 0,
      sechage: dernier.briques[b.id]?.sechage || 0,
      stock: stockBriqueTotal(dernier.briques[b.id])
    })).filter((p) => p.stock > 0)
  }, [dernier, briques])

  const repartition = {
    labels: parType.map((p) => p.nom),
    datasets: [{ data: parType.map((p) => p.stock), backgroundColor: ['#7c3aed', '#6366f1', '#8b5cf6', '#a855f7', '#c026d3', '#d946ef', '#ec4899'] }]
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
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(124,58,237,0.35),0_8px_20px_-8px_rgba(124,58,237,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
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
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard title="Production mois" value={formatNumber(prodMois)} icon={Factory} accent="#7c3aed"
          variation={prodMois - prodMoisPrec} variationLabel={`mois préc. : ${formatNumber(prodMoisPrec)} · cliquer`}
          onClick={() => setDetail({ titre: 'Production du mois', render: (
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-violet-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-right">Briques</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...prodDuMois].sort((a, b) => (a.date < b.date ? 1 : -1)).map((p, i) => (
                    <tr key={p.id} className={`transition-colors hover:bg-violet-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{formatDateShort(p.date)}</td>
                      <td className="px-4 py-2.5 text-right text-base font-extrabold text-violet-700">{formatNumber(p.totalBriques || 0)}</td>
                    </tr>
                  ))}
                  {!prodDuMois.length && <tr><td colSpan={2} className="bg-white py-8 text-center text-sm text-gray-400">Aucune production ce mois.</td></tr>}
                </tbody>
              </table>
            </div>
          ) })} />
        <StatCard title="Prêtes à vendre" value={formatNumber(stockPret)} icon={Package} accent="#16a34a"
          sub="par type — cliquer" onClick={() => setDetail({ titre: 'Briques prêtes à vendre', render: tableStock('pret') })} />
        <StatCard title="En séchage" value={formatNumber(stockSechage)} icon={BrickWall} accent="#ca8a04"
          sub="5–6 jours · cliquer" onClick={() => setDetail({ titre: 'Briques en séchage', render: tableStock('sechage') })} />
        <StatCard title="CA du mois" value={formatMoney(caMois)} icon={Package} accent="#0284c7"
          variation={caMois - caMoisPrec} variationLabel={`mois préc. : ${formatMoney(caMoisPrec)} · cliquer`}
          onClick={() => setDetail({ titre: 'Factures du mois', render: (
            <div className="overflow-hidden rounded-2xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-violet-50/60 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Client</th><th className="px-4 py-3 text-right">Total TTC</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...facturesDuMois].sort((a, b) => (a.date < b.date ? 1 : -1)).map((f, i) => (
                    <tr key={f.id} className={`transition-colors hover:bg-violet-50/60 ${i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{formatDateShort(f.date)}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{f.client?.nom || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-base font-extrabold text-sky-700">{formatMoney(f.totalTTC || 0)}</td>
                    </tr>
                  ))}
                  {!facturesDuMois.length && <tr><td colSpan={3} className="bg-white py-8 text-center text-sm text-gray-400">Aucune facture ce mois.</td></tr>}
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

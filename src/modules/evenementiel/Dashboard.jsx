// Dashboard Briqueterie — production, stock, ventes, autorisations.
import { useMemo } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { BrickWall, Factory, Package, Send, AlertTriangle } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { useBriqueterieStore } from './store/referentielStore'
import { formatMoney, formatNumber, todayStr } from '../../utils/formatters'
import { stockBriqueTotal } from './logic'

export default function Dashboard() {
  const briques = useBriqueterieStore((s) => s.briques)
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: demandes } = useCollection('evenementiel_demandes')

  const mois = todayStr().slice(0, 7)
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
  const prodMois = productions.filter((p) => (p.date || '').startsWith(mois)).reduce((s, p) => s + (p.totalBriques || 0), 0)
  const caMois = ventes.filter((v) => (v.date || '').startsWith(mois)).reduce((s, v) => s + (v.total || 0), 0)
  const autorisationsAttente = demandes.filter((d) => ['en_attente', 'partiel'].includes(d.statut)).length

  const parType = useMemo(() => {
    if (!dernier?.briques) return []
    return briques.filter((b) => b.id !== 'caillasses').map((b) => ({
      nom: b.nom,
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

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gradient-to-r from-violet-600 to-violet-800 p-4 text-white">
        <h2 className="text-lg font-extrabold">Briqueterie La Termitière</h2>
        <p className="text-sm text-violet-100">Matières premières · Production · Séchage · Ventes · Autorisations (3 autorités)</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard title="Production mois" value={formatNumber(prodMois)} sub="briques produites" icon={Factory} accent="#7c3aed" />
        <StatCard title="Prêtes à vendre" value={formatNumber(stockPret)} icon={Package} accent="#16a34a" />
        <StatCard title="En séchage" value={formatNumber(stockSechage)} sub="5–6 jours recommandés" icon={BrickWall} accent="#ca8a04" />
        <StatCard title="CA du mois" value={formatMoney(caMois)} icon={Package} accent="#0284c7" />
        <StatCard title="Autorisations" value={autorisationsAttente} sub={`${caillasses} caillasses`} icon={Send} accent={autorisationsAttente ? '#d97706' : '#64748b'} />
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

      {autorisationsAttente > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={18} />
          <strong>{autorisationsAttente}</strong> autorisation(s) de sortie en attente de validation (3 autorités requises).
        </div>
      )}
    </div>
  )
}

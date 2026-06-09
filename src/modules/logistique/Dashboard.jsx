// Dashboard Logistique & Événementiel — KPI matériel, prestations, autorisations.
import { useMemo } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Boxes, BadgeDollarSign, Send, AlertTriangle, RotateCcw } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { useLogistiqueStore } from './store/referentielStore'
import { formatMoney, formatNumber, todayStr } from '../../utils/formatters'
import { catColor, CAT_MATERIEL } from './data'

export default function Dashboard() {
  const materiel = useLogistiqueStore((s) => s.materiel)
  const { data: inventaires } = useCollection('logistique_inventaires')
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: factures } = useCollection('logistique_factures')
  const { data: demandes } = useCollection('logistique_demandes')
  const { data: retours } = useCollection('logistique_retours')

  const dernier = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [inventaires])
  const mois = todayStr().slice(0, 7)

  const stockTotal = useMemo(() => {
    if (!dernier) return 0
    return Object.values(dernier.materiels || {}).reduce((s, m) => s + (m.fin || 0), 0)
  }, [dernier])

  const valeurStock = useMemo(() => {
    if (!dernier) return 0
    return materiel.reduce((s, m) => {
      const fin = dernier.materiels?.[m.id]?.fin || 0
      return s + fin * (m.coutAchat || 0)
    }, 0)
  }, [dernier, materiel])

  const caMois = factures.filter((f) => (f.date || '').startsWith(mois)).reduce((s, f) => s + (f.totalTTC || 0), 0)
  const demandesAttente = demandes.filter((d) => d.statut === 'en_attente').length
  const prestationsActives = prestations.filter((p) => ['facturee', 'en_cours'].includes(p.statut)).length
  const retoursCasse = retours.filter((r) => r.type === 'Cassé' || r.type === 'Perdu').length

  const parCat = useMemo(() => {
    const cats = [...CAT_MATERIEL]
    return cats.map((cat) => {
      const items = materiel.filter((m) => m.cat === cat)
      const stock = items.reduce((s, m) => s + (dernier?.materiels?.[m.id]?.fin || 0), 0)
      return { cat, stock, color: catColor(cat) }
    }).filter((p) => p.stock > 0)
  }, [materiel, dernier])

  const repartition = {
    labels: parCat.map((p) => p.cat),
    datasets: [{ data: parCat.map((p) => p.stock), backgroundColor: parCat.map((p) => p.color) }]
  }

  const fluxMois = useMemo(() => {
    const invMois = inventaires.filter((i) => (i.date || '').startsWith(mois))
    let achats = 0, sorties = 0, retOk = 0
    invMois.forEach((i) => Object.values(i.materiels || {}).forEach((m) => {
      achats += m.ent || 0; sorties += m.sor || 0; retOk += m.retourOk || 0
    }))
    return {
      labels: ['Achats', 'Sorties', 'Retours OK'],
      datasets: [{ data: [achats, sorties, retOk], backgroundColor: ['#16a34a', '#d97706', '#0284c7'] }]
    }
  }, [inventaires, mois])

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gradient-to-r from-sky-600 to-sky-800 p-4 text-white">
        <h2 className="text-lg font-extrabold">Logistique & Événementiel</h2>
        <p className="text-sm text-sky-100">Matériel · Location · Prestations · Autorisations hiérarchiques</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard title="Stock total" value={formatNumber(stockTotal)} sub="pièces en magasin" icon={Boxes} accent="#0284c7" />
        <StatCard title="Valeur stock" value={formatMoney(valeurStock)} sub="au coût d'achat" icon={Boxes} accent="#7c3aed" />
        <StatCard title="CA du mois" value={formatMoney(caMois)} icon={BadgeDollarSign} accent="#16a34a" />
        <StatCard title="Autorisations attente" value={demandesAttente} icon={Send} accent={demandesAttente ? '#d97706' : '#64748b'} />
        <StatCard title="Prestations actives" value={prestationsActives} sub={`${retoursCasse} casse/perte`} icon={RotateCcw} accent="#ea580c" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Répartition du stock par catégorie">
          <div className="h-64">
            {parCat.length
              ? <Doughnut data={repartition} options={{ maintainAspectRatio: false }} />
              : <p className="py-16 text-center text-sm text-gray-400">Aucun stock enregistré — commencez par la saisie magasin</p>}
          </div>
        </Card>
        <Card title={`Flux du mois (${mois})`}>
          <div className="h-64"><Bar data={fluxMois} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
        </Card>
      </div>

      {demandesAttente > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={18} />
          <strong>{demandesAttente}</strong> autorisation(s) de sortie en attente de validation hiérarchique.
        </div>
      )}
    </div>
  )
}

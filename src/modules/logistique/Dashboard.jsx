// Dashboard Logistique : KPI véhicules / livraisons + graphiques.
import { useMemo } from 'react'
import { Doughnut, Line } from 'react-chartjs-2'
import { Car, Package, AlertTriangle, Wrench } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { STATUTS_LIVRAISON } from './store/logistiqueStore'
import { todayStr } from '../../utils/formatters'

export default function Dashboard() {
  const { data: vehicules } = useCollection('logistique_vehicules')
  const { data: livraisons } = useCollection('logistique_livraisons')

  const dispo = vehicules.filter((v) => v.statut === 'disponible').length
  const enMission = vehicules.filter((v) => v.statut === 'en_mission').length
  const maintenance = vehicules.filter((v) => v.statut === 'maintenance').length
  const livJour = livraisons.filter((l) => l.date === todayStr()).length
  const retards = livraisons.filter((l) => l.statut === 'en_cours' && l.date < todayStr()).length

  const repartition = useMemo(() => {
    const keys = Object.keys(STATUTS_LIVRAISON)
    return {
      labels: keys.map((k) => STATUTS_LIVRAISON[k].label),
      datasets: [{ data: keys.map((k) => livraisons.filter((l) => l.statut === k).length), backgroundColor: ['#94a3b8', '#0284c7', '#16a34a', '#dc2626'] }]
    }
  }, [livraisons])

  // Livraisons par jour (14 derniers jours)
  const parJour = useMemo(() => {
    const labels = []
    const data = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const s = d.toISOString().split('T')[0]
      labels.push(s.slice(5))
      data.push(livraisons.filter((l) => l.date === s).length)
    }
    return { labels, datasets: [{ label: 'Livraisons', data, borderColor: '#0284c7', backgroundColor: 'rgba(2,132,199,0.12)', fill: true, tension: 0.3 }] }
  }, [livraisons])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Disponibles" value={dispo} icon={Car} accent="#16a34a" />
        <StatCard title="En mission" value={enMission} icon={Package} accent="#0284c7" />
        <StatCard title="Maintenance" value={maintenance} icon={Wrench} accent="#d97706" />
        <StatCard title="Livraisons en retard" value={retards} icon={AlertTriangle} accent="#dc2626" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Livraisons (14 jours)" className="lg:col-span-2">
          <div className="h-64"><Line data={parJour} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
        </Card>
        <Card title="Par statut">
          <div className="h-64"><Doughnut data={repartition} options={{ maintainAspectRatio: false }} /></div>
          <p className="mt-2 text-center text-sm text-gray-500">{livJour} livraison(s) aujourd'hui</p>
        </Card>
      </div>
    </div>
  )
}

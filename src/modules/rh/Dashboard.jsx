// Dashboard RH : KPI effectif / présences / congés.
import { Users, UserCheck, Plane, UserPlus } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import { useCollection } from '../../hooks/useFirestore'
import { todayStr } from '../../utils/formatters'

export default function Dashboard() {
  const { data: employes } = useCollection('rh_employes')
  const { data: presences } = useCollection('rh_presences')

  const today = todayStr()
  const presentsAuj = presences.filter((p) => p.date === today && p.statut === 'present').length
  const congesAuj = presences.filter((p) => p.date === today && p.statut === 'conge').length
  const mois = today.slice(0, 7)
  const recrues = employes.filter((e) => (e.dateEmbauche || '').startsWith(mois)).length

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard title="Effectif total" value={employes.length} icon={Users} accent="#ea580c" />
      <StatCard title="Présents aujourd'hui" value={presentsAuj} icon={UserCheck} accent="#16a34a" />
      <StatCard title="Congés en cours" value={congesAuj} icon={Plane} accent="#0284c7" />
      <StatCard title="Recrues ce mois" value={recrues} icon={UserPlus} accent="#7c3aed" />
    </div>
  )
}

// Tableau de bord global : KPI consolidés de tous les modules actifs + graphique.
import { Line } from 'react-chartjs-2'
import { Leaf, Truck, BrickWall, Bell, MapPin } from 'lucide-react'
import StatCard from '../shared/ui/StatCard'
import Card from '../shared/ui/Card'
import { useCollection } from '../hooks/useFirestore'
import { useAuth } from '../hooks/useAuth'
import { todayStr, formatMoney } from '../utils/formatters'

export default function GlobalDashboard() {
  const { hasModule } = useAuth()
  const { data: inventaires } = useCollection('agro_inventaires')
  const { data: demandes } = useCollection('agro_demandes')
  const { data: demandesLog } = useCollection('logistique_demandes')
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: demandesBriq } = useCollection('evenementiel_demandes')
  const { data: dossiersFoncier } = useCollection('foncier_dossiers')

  const invTries = [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))
  const dernier = invTries[0]
  const totalAnimaux = dernier
    ? Object.values(dernier.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)
    : 0
  const moisCourant = todayStr().slice(0, 7)
  const prestationsMois = prestations.filter((p) => (p.date || '').startsWith(moisCourant)).length
  const demandesAttente = demandes.filter((d) => d.statut === 'en_attente').length
  const autorisationsLog = demandesLog.filter((d) => d.statut === 'en_attente').length
  const prodMois = productions.filter((p) => (p.date || '').startsWith(moisCourant)).reduce((s, p) => s + (p.totalBriques || 0), 0)
  const autorisationsBriq = demandesBriq.filter((d) => ['en_attente', 'partiel'].includes(d.statut)).length
  const dossiersActifs = dossiersFoncier.filter((d) => !['cloture', 'suspendu'].includes(d.statut)).length

  // Alertes cross-modules
  const alertes = []
  if (demandesAttente > 0)
    alertes.push(`${demandesAttente} demande(s) de sortie AGRO en attente d'approbation`)
  if (autorisationsLog > 0) alertes.push(`${autorisationsLog} autorisation(s) sortie matériel en attente`)
  if (autorisationsBriq > 0) alertes.push(`${autorisationsBriq} autorisation(s) sortie briques en attente (3 autorités)`)

  // Graphique : évolution effectif total (12 dernières saisies)
  const last = [...invTries].reverse().slice(-12)
  const chartData = {
    labels: last.map((i) => i.date?.slice(5) || ''),
    datasets: [
      {
        label: 'Effectif total animaux',
        data: last.map((i) => Object.values(i.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)),
        borderColor: '#BC3C31',
        backgroundColor: 'rgba(188,60,49,0.12)',
        fill: true,
        tension: 0.3
      }
    ]
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="text-xl font-extrabold text-gray-900">Tableau de bord global</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {hasModule('agro') && (
          <StatCard title="Animaux (AGRO)" value={totalAnimaux} sub="Dernière saisie" icon={Leaf} accent="#BC3C31" />
        )}
        {hasModule('logistique') && (
          <StatCard title="Prestations (log.)" value={prestationsMois} sub={autorisationsLog ? `${autorisationsLog} autorisation(s) attente` : 'Ce mois'} icon={Truck} accent="#0284c7" />
        )}
        {hasModule('evenementiel') && (
          <StatCard title="Briqueterie" value={prodMois} sub={autorisationsBriq ? `${autorisationsBriq} autorisation(s)` : 'Production ce mois'} icon={BrickWall} accent="#7c3aed" />
        )}
        {hasModule('foncier') && (
          <StatCard title="Foncier" value={dossiersActifs} sub="Dossiers actifs" icon={MapPin} accent="#059669" />
        )}
        <StatCard title="Alertes" value={alertes.length} icon={Bell} accent="#d97706" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Évolution des effectifs" className="lg:col-span-2">
          <div className="h-64">
            <Line data={chartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
          </div>
        </Card>

        <Card title="Alertes cross-modules">
          {alertes.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Aucune alerte 🎉</p>
          ) : (
            <ul className="space-y-2">
              {alertes.map((a, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
                  <Bell size={16} className="mt-0.5 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

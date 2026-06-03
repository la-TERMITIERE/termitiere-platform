// Dashboard Événementiel : KPI + prochains événements.
import { useMemo } from 'react'
import { CalendarDays, BadgeDollarSign, Percent, CalendarClock } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, formatDateShort, todayStr, addDays } from '../../utils/formatters'
import { STATUTS_EVENEMENT, labelType } from './store/evenementielStore'

export default function Dashboard() {
  const { data: evenements } = useCollection('evenementiel_evenements')

  const mois = todayStr().slice(0, 7)
  const ceMois = evenements.filter((e) => (e.dateDebut || '').startsWith(mois))
  const caMois = ceMois.filter((e) => e.statut === 'confirme' || e.statut === 'en_cours' || e.statut === 'termine')
    .reduce((s, e) => s + (e.budget || 0), 0)
  const prospects = evenements.filter((e) => e.statut === 'prospect').length
  const confirmes = evenements.filter((e) => ['confirme', 'en_cours', 'termine'].includes(e.statut)).length
  const conversion = prospects + confirmes ? Math.round((confirmes / (prospects + confirmes)) * 100) : 0

  const prochains = useMemo(() => {
    const limite = addDays(todayStr(), 7)
    return [...evenements]
      .filter((e) => e.dateDebut >= todayStr() && e.dateDebut <= limite && e.statut !== 'annule')
      .sort((a, b) => (a.dateDebut < b.dateDebut ? -1 : 1))
  }, [evenements])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Événements ce mois" value={ceMois.length} icon={CalendarDays} accent="#7c3aed" />
        <StatCard title="CA ce mois" value={formatMoney(caMois)} icon={BadgeDollarSign} accent="#16a34a" />
        <StatCard title="Taux conversion" value={`${conversion} %`} icon={Percent} accent="#0284c7" />
        <StatCard title="À venir (7 j)" value={prochains.length} icon={CalendarClock} accent="#d97706" />
      </div>

      <Card title="Prochains événements (7 jours)">
        {prochains.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucun événement prévu cette semaine.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {prochains.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-semibold text-gray-800">{e.titre} <span className="text-xs font-normal text-gray-400">· {labelType(e.type)}</span></p>
                  <p className="text-xs text-gray-500">{formatDateShort(e.dateDebut)} · {e.lieu} · {e.client?.nom}</p>
                </div>
                <Badge tone={STATUTS_EVENEMENT[e.statut]?.tone}>{STATUTS_EVENEMENT[e.statut]?.label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

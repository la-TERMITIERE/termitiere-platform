// MAXI-GYM — module en développement. Dashboard : KPI du mois — la saisie se
// fait désormais dans les volets dédiés (Séances / Abonnements).
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dumbbell, Construction, Ticket, CreditCard } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { todayStr, formatMoney } from '../../utils/formatters'

const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: seances }     = useCollection('gym_seances')
  const { data: abonnements } = useCollection('gym_abonnements')

  const prefixeMois = todayStr().slice(0, 7)
  const seancesMois     = useMemo(() => seances.filter((s) => (s.date || '').startsWith(prefixeMois)), [seances, prefixeMois])
  const abonnementsMois = useMemo(() => abonnements.filter((a) => (a.date || '').startsWith(prefixeMois)), [abonnements, prefixeMois])
  const totalEncaisseMois = useMemo(
    () => [...seancesMois, ...abonnementsMois].reduce((s, x) => s + (Number(x.montant) || 0), 0),
    [seancesMois, abonnementsMois]
  )

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Dumbbell size={28} color="white" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-extrabold">MAXI-GYM</h2>
          <p className="text-sm text-white/80">Salle de sport — séances et abonnements clients</p>
        </div>
      </div>

      <div className="rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-900">
        <div className="flex items-center gap-2">
          <Construction size={16} />
          <span><strong>Module en développement</strong> — les écrans détaillés arrivent progressivement. On commence par le suivi du mois.</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Séances ce mois" value={seancesMois.length} icon={Ticket} accent={COULEUR} />
        <StatCard title="Abonnements ce mois" value={abonnementsMois.length} icon={CreditCard} accent={COULEUR2} />
        <StatCard title="Total encaissé ce mois" value={formatMoney(totalEncaisseMois)} icon={Dumbbell} accent={COULEUR} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => navigate('/gym/seances')}><Ticket size={16} /> Voir les séances</Button>
        <Button variant="outline" onClick={() => navigate('/gym/abonnements')}><CreditCard size={16} /> Voir les abonnements</Button>
      </div>
    </div>
  )
}

// Statistiques du planning personnel — réservé à l'administration/la direction
// (isFullAccessRole, PAS le superviseur), cf. RoutineTaches.jsx. Sert à répondre à
// « qui fait ses tâches, à quelle fréquence, qui en a le plus, qui est le meilleur ».
import { useMemo } from 'react'
import { Trophy, ListChecks, CheckCircle2, Clock3 } from 'lucide-react'
import Card from '../ui/Card'
import { usePeriodSelect } from '../ui/PeriodSelect'
import { formatDateTime } from '../../utils/formatters'

export default function RoutineStatistiques({ itemsPersonnels, checks, color, user }) {
  const { start, end, node: periodNode } = usePeriodSelect('30')

  const nbJoursPeriode = useMemo(
    () => Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1),
    [start, end]
  )

  const parAgent = useMemo(() => {
    const map = new Map()
    itemsPersonnels.forEach((it) => {
      if (!map.has(it.assigneUid)) map.set(it.assigneUid, { uid: it.assigneUid, nom: it.assigneNom || it.assigneUid, taches: [] })
      map.get(it.assigneUid).taches.push(it)
    })
    const itemVersUid = new Map(itemsPersonnels.map((it) => [it.id, it.assigneUid]))
    const completionsParUid = new Map()
    const derniereActiviteParUid = new Map()
    checks.filter((c) => c.fait && c.date >= start && c.date <= end).forEach((c) => {
      const uid = itemVersUid.get(c.itemId)
      if (!uid) return
      completionsParUid.set(uid, (completionsParUid.get(uid) || 0) + 1)
      const dernierCheck = (c.evenements || []).filter((e) => e.action === 'check').sort((a, b) => b.le - a.le)[0]
      if (dernierCheck && (!derniereActiviteParUid.has(uid) || dernierCheck.le > derniereActiviteParUid.get(uid))) {
        derniereActiviteParUid.set(uid, dernierCheck.le)
      }
    })
    // Formule volontairement simple (comme une moyenne, pas une trace exacte du
    // nombre de jours où chaque tâche était réellement assignée) : nombre de
    // tâches ACTUELLEMENT assignées × nombre de jours de la période = complétions
    // attendues si l'agent faisait tout, tous les jours. Sert à comparer les agents
    // entre eux, pas à sanctionner au jour près une tâche ajoutée en cours de période.
    return [...map.values()].map((a) => {
      const nbTaches = a.taches.length
      const attendu = nbTaches * nbJoursPeriode
      const completions = completionsParUid.get(a.uid) || 0
      const taux = attendu > 0 ? Math.round((completions / attendu) * 100) : 0
      return { ...a, nbTaches, completions, attendu, taux, derniereActivite: derniereActiviteParUid.get(a.uid) || null }
    }).sort((x, y) => y.taux - x.taux)
  }, [itemsPersonnels, checks, start, end, nbJoursPeriode])

  const totaux = useMemo(() => ({
    agents: parAgent.length,
    taches: parAgent.reduce((s, a) => s + a.nbTaches, 0),
    completions: parAgent.reduce((s, a) => s + a.completions, 0),
    tauxMoyen: parAgent.length ? Math.round(parAgent.reduce((s, a) => s + a.taux, 0) / parAgent.length) : 0
  }), [parAgent])

  const plusCharge = useMemo(() => [...parAgent].sort((a, b) => b.nbTaches - a.nbTaches)[0], [parAgent])
  const meilleur = useMemo(() => parAgent.find((a) => a.nbTaches > 0), [parAgent]) // déjà trié par taux desc

  const maxTaux = Math.max(1, ...parAgent.map((a) => a.taux))

  return (
    <div className="space-y-4">
      {periodNode}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTuile icon={ListChecks} color={color} label="Tâches assignées" value={totaux.taches} sub={`${totaux.agents} agent(s)`} />
        <StatTuile icon={CheckCircle2} color="#16a34a" label="Complétions" value={totaux.completions} sub={`sur ${nbJoursPeriode} jour(s)`} />
        <StatTuile icon={Clock3} color="#d97706" label="Taux moyen" value={`${totaux.tauxMoyen}%`} sub="tous agents confondus" />
        <StatTuile icon={Trophy} color="#7c3aed" label="Meilleur taux" value={meilleur ? `${meilleur.taux}%` : '—'} sub={meilleur?.nom || 'Aucune donnée'} />
      </div>

      {plusCharge && plusCharge.nbTaches > 0 && (
        <p className="text-xs text-gray-500">
          📋 <strong>{plusCharge.nom}</strong> a le plus de tâches assignées ({plusCharge.nbTaches}).
        </p>
      )}

      <Card title="Classement par agent — fréquence d'exécution">
        <p className="mb-3 text-xs text-gray-500">
          Taux = complétions réelles / (tâches assignées × jours de la période) — une estimation pour comparer les agents entre eux, pas une mesure exacte jour par jour.
        </p>
        <div className="space-y-2.5">
          {parAgent.map((a, i) => (
            <div key={a.uid} className="flex items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-500' : i === 2 ? 'bg-orange-50 text-orange-500' : 'text-gray-300'
              }`}>{i < 3 ? <Trophy size={12} /> : i + 1}</span>
              <span className="w-28 shrink-0 truncate text-sm font-semibold text-gray-700">{a.nom}{a.uid === user.uid ? ' (moi)' : ''}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full" style={{ width: `${(a.taux / maxTaux) * 100}%`, background: color }} />
              </div>
              <span className="w-56 shrink-0 text-right text-xs text-gray-500">
                <strong className="text-gray-800">{a.taux}%</strong> · {a.completions}/{a.attendu} · {a.nbTaches} tâche(s)
                {a.derniereActivite && <> · dernière : {formatDateTime(a.derniereActivite)}</>}
              </span>
            </div>
          ))}
          {!parAgent.length && <p className="py-6 text-center text-sm text-gray-400">Aucune tâche assignée pour l'instant.</p>}
        </div>
      </Card>
    </div>
  )
}

function StatTuile({ icon: Icon, color, label, value, sub }) {
  return (
    <div className="card p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: color + '1a', color }}><Icon size={15} /></span>
      </div>
      <p className="text-xl font-extrabold" style={{ color }}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-gray-400">{sub}</p>}
    </div>
  )
}

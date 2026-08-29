// RH — Conformité & Alertes (Pilotage & Conformité). Alertes calculées + registre.
import { useMemo } from 'react'
import { Scale, AlertTriangle, CheckCircle2, FileWarning, CalendarClock } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { formatDateShort, todayStr } from '../../utils/formatters'
import { COL } from './store/rhStore'
import { PageHeader } from './rhui'

export default function Conformite() {
  const { data: employes } = useCollection(COL.employes)
  const { data: contrats } = useCollection(COL.contrats)
  const today = todayStr()
  const dans30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)

  const alertes = useMemo(() => {
    const a = []
    contrats.forEach((c) => {
      if (c.type === 'cdd' && c.dateFin) {
        if (c.dateFin < today) a.push({ type: 'CDD expiré', gravite: 'danger', qui: c.employeNom, detail: `Fin le ${formatDateShort(c.dateFin)}`, icon: FileWarning })
        else if (c.dateFin <= dans30) a.push({ type: 'CDD à échéance', gravite: 'warning', qui: c.employeNom, detail: `Fin le ${formatDateShort(c.dateFin)}`, icon: CalendarClock })
      }
    })
    employes.filter((e) => (e.statut || 'actif') === 'essai').forEach((e) => {
      a.push({ type: "Période d'essai en cours", gravite: 'warning', qui: e.nom, detail: 'Décision de confirmation à prendre', icon: CalendarClock })
    })
    employes.filter((e) => (e.statut || 'actif') === 'actif' && !contrats.some((c) => c.employeId === e.id)).forEach((e) => {
      a.push({ type: 'Contrat manquant', gravite: 'danger', qui: e.nom, detail: 'Aucun contrat enregistré', icon: FileWarning })
    })
    return a.sort((x, y) => (x.gravite === 'danger' ? -1 : 1))
  }, [employes, contrats, today, dans30])

  const dangers = alertes.filter((a) => a.gravite === 'danger').length

  return (
    <div className="space-y-5">
      <PageHeader icon={Scale} sousModule="Pilotage & Conformité" titre="Conformité & Alertes RH"
        sousTitre="Registre du personnel et alertes réglementaires (échéances, documents, contrats)." />

      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Alertes critiques" value={dangers} accent="#dc2626" icon={AlertTriangle} />
        <StatCard title="Alertes totales" value={alertes.length} accent="#f59e0b" icon={FileWarning} />
        <StatCard title="Effectif au registre" value={employes.length} accent="#0284c7" icon={Scale} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10"><p className="font-bold text-gray-800 dark:text-gray-100">Alertes RH</p></div>
        {alertes.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-green-600"><CheckCircle2 size={18} /> Aucune alerte — tout est à jour.</div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-white/10">
            {alertes.map((a, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                <a.icon size={18} className={a.gravite === 'danger' ? 'text-red-500' : 'text-amber-500'} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{a.type} <Badge tone={a.gravite}>{a.gravite === 'danger' ? 'Critique' : 'À surveiller'}</Badge></p>
                  <p className="text-xs text-gray-500">{a.qui} — {a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

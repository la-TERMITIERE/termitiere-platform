// Notifications & alertes automatiques du module Projet.
import { useMemo } from 'react'
import { AlertTriangle, Clock, Wallet, CheckCircle, Bell } from 'lucide-react'
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { formatDateShort } from '../../utils/formatters'
import { avancementProjet, tachesEnRetard, projetEnRetard } from './logic'
import { PRIORITES } from './data'

const TYPE_CONFIG = {
  projet_retard:   { icon: Clock,         color: '#ef4444', bg: 'bg-red-50',    border: 'border-red-200',    label: 'Projet en retard'      },
  budget_depasse:  { icon: Wallet,        color: '#f59e0b', bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Budget dépassé'         },
  tache_retard:    { icon: AlertTriangle, color: '#f59e0b', bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Tâche en retard'        },
  avancement_zero: { icon: Clock,         color: '#6366f1', bg: 'bg-indigo-50', border: 'border-indigo-200', label: 'Aucun avancement'       },
  termine:         { icon: CheckCircle,   color: '#16a34a', bg: 'bg-green-50',  border: 'border-green-200',  label: 'Projet terminé'         }
}

function genererAlertes(projets, taches) {
  const alertes = []
  const now = Date.now()
  const SEMAINE = 7 * 24 * 3600 * 1000

  projets.forEach((p) => {
    const tachesProjet = taches.filter((t) => t.projetId === p.id)

    // Projet en retard
    if (projetEnRetard(p)) {
      const joursRetard = Math.floor((now - p.dateFin) / (24 * 3600 * 1000))
      alertes.push({
        id: `retard_${p.id}`,
        type: 'projet_retard',
        projetNom: p.nom,
        message: `Ce projet aurait dû se terminer le ${formatDateShort(p.dateFin)} (${joursRetard} jour${joursRetard > 1 ? 's' : ''} de retard).`,
        date: p.dateFin,
        priorite: p.priorite
      })
    }

    // Budget dépassé
    if (p.budget && p.depenses && Number(p.depenses) > Number(p.budget)) {
      const depassement = Number(p.depenses) - Number(p.budget)
      alertes.push({
        id: `budget_${p.id}`,
        type: 'budget_depasse',
        projetNom: p.nom,
        message: `Budget dépassé de ${depassement.toLocaleString('fr-FR')} FCFA (prévu : ${Number(p.budget).toLocaleString('fr-FR')}, réel : ${Number(p.depenses).toLocaleString('fr-FR')}).`,
        date: now,
        priorite: p.priorite
      })
    }

    // Projet actif sans avancement depuis plus d'une semaine
    if (!['termine', 'annule'].includes(p.statut) && p.createdAt && (now - p.createdAt) > SEMAINE) {
      const avancement = avancementProjet(tachesProjet)
      if (avancement === 0 && tachesProjet.length > 0) {
        alertes.push({
          id: `zero_${p.id}`,
          type: 'avancement_zero',
          projetNom: p.nom,
          message: `Ce projet a ${tachesProjet.length} tâche(s) mais aucune n'est terminée depuis plus d'une semaine.`,
          date: p.createdAt,
          priorite: p.priorite
        })
      }
    }

    // Tâches en retard
    const enRetard = tachesEnRetard(tachesProjet)
    enRetard.forEach((t) => {
      const joursRetard = Math.floor((now - t.echeance) / (24 * 3600 * 1000))
      alertes.push({
        id: `tache_${t.id}`,
        type: 'tache_retard',
        projetNom: p.nom,
        message: `Tâche "${t.titre}" — échéance dépassée de ${joursRetard} jour${joursRetard > 1 ? 's' : ''} (assignée à : ${t.assignee || 'non assignée'}).`,
        date: t.echeance,
        priorite: t.priorite
      })
    })

    // Projet récemment terminé (dans les 7 derniers jours)
    if (p.statut === 'termine' && p.updatedAt && (now - p.updatedAt) < SEMAINE) {
      alertes.push({
        id: `termine_${p.id}`,
        type: 'termine',
        projetNom: p.nom,
        message: `Projet marqué comme terminé le ${formatDateShort(p.updatedAt)}. Félicitations !`,
        date: p.updatedAt,
        priorite: p.priorite
      })
    }
  })

  // Trier : retards d'abord, puis budget, puis reste
  const ordre = { projet_retard: 0, budget_depasse: 1, tache_retard: 2, avancement_zero: 3, termine: 4 }
  return alertes.sort((a, b) => (ordre[a.type] ?? 9) - (ordre[b.type] ?? 9))
}

export default function Alertes() {
  const { data: projets } = useCollection('projets')
  const { data: taches }  = useCollection('projet_taches')

  const alertes = useMemo(() => genererAlertes(projets, taches), [projets, taches])

  const counts = useMemo(() => ({
    critique: alertes.filter((a) => ['projet_retard', 'budget_depasse'].includes(a.type)).length,
    warning:  alertes.filter((a) => ['tache_retard', 'avancement_zero'].includes(a.type)).length,
    info:     alertes.filter((a) => a.type === 'termine').length
  }), [alertes])

  return (
    <div className="space-y-4">
      {/* Résumé */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{counts.critique}</p>
          <p className="text-xs text-red-500 font-medium">Critiques</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{counts.warning}</p>
          <p className="text-xs text-amber-500 font-medium">Avertissements</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{counts.info}</p>
          <p className="text-xs text-green-500 font-medium">Bonnes nouvelles</p>
        </div>
      </div>

      {/* Liste alertes */}
      {!alertes.length ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
            <Bell size={40} className="opacity-20" />
            <p className="text-sm font-medium">Aucune alerte — tout est sous contrôle !</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {alertes.map((alerte) => {
            const cfg = TYPE_CONFIG[alerte.type] || TYPE_CONFIG.tache_retard
            const Icon = cfg.icon
            return (
              <div key={alerte.id}
                className={`flex gap-3 rounded-xl border px-4 py-3 ${cfg.bg} ${cfg.border}`}>
                <div className="mt-0.5 shrink-0">
                  <Icon size={18} style={{ color: cfg.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-gray-600">
                      {alerte.projetNom}
                    </span>
                    {alerte.priorite && PRIORITES[alerte.priorite] && (
                      <span className="text-xs text-gray-400">{PRIORITES[alerte.priorite]?.label}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{alerte.message}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

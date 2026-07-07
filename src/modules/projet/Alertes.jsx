// Notifications & alertes automatiques du module Projet.
import { useMemo } from 'react'
import { AlertTriangle, Clock, Wallet, CheckCircle, Bell, X } from 'lucide-react'
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { genererAlertes } from './logic'
import { PRIORITES, SEUILS_DEFAUT } from './data'

const TYPE_CONFIG = {
  projet_retard:   { icon: Clock,         color: '#ef4444', bg: 'bg-red-50',    border: 'border-red-200',    label: 'Projet en retard'      },
  budget_depasse:  { icon: Wallet,        color: '#f59e0b', bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Budget dépassé'         },
  tache_depassee:  { icon: Wallet,        color: '#f59e0b', bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Tâche en dépassement'   },
  tache_retard:    { icon: AlertTriangle, color: '#f59e0b', bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Tâche en retard'        },
  avancement_zero: { icon: Clock,         color: '#6366f1', bg: 'bg-indigo-50', border: 'border-indigo-200', label: 'Aucun avancement'       },
  termine:         { icon: CheckCircle,   color: '#16a34a', bg: 'bg-green-50',  border: 'border-green-200',  label: 'Projet terminé'         }
}

export default function Alertes() {
  const { data: projets }  = useCollection('projets')
  const { data: taches }   = useCollection('projet_taches')
  const { data: depenses } = useCollection('projet_depenses')
  const { data: fermees }  = useCollection('projet_alertes_fermees')
  const { data: configs }  = useCollection('projet_params')
  const seuils = configs.find((c) => c.id === 'seuils') ?? SEUILS_DEFAUT

  // Seul "Projet terminé" peut être fermé définitivement — les autres alertes
  // ne disparaissent que lorsque le problème qui les déclenche est réellement résolu.
  const idsFermes = useMemo(() => new Set(fermees.map((f) => f.id)), [fermees])

  const alertes = useMemo(() =>
    genererAlertes(projets, taches, depenses, seuils).filter((a) => a.type !== 'termine' || !idsFermes.has(a.id)),
  [projets, taches, depenses, seuils, idsFermes])

  const fermer = (id) => setItem('projet_alertes_fermees', id, { id, fermeLe: Date.now() })

  const counts = useMemo(() => ({
    critique: alertes.filter((a) => ['projet_retard', 'budget_depasse'].includes(a.type)).length,
    warning:  alertes.filter((a) => ['tache_depassee', 'tache_retard', 'avancement_zero'].includes(a.type)).length,
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
                {alerte.type === 'termine' && (
                  <button onClick={() => fermer(alerte.id)} title="Fermer"
                    className="shrink-0 rounded p-1 text-green-400 hover:bg-green-100 hover:text-green-700">
                    <X size={15} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Dashboard Foncier — dossiers, progression, alertes.
import { useMemo } from 'react'
import { MapPin, FileText, Clock, CheckCircle2 } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { TYPES_DOSSIER, STATUTS_DOSSIER } from './data'
import { progressionDossier, etapeCourante } from './logic'
import { formatDateShort } from '../../utils/formatters'

export default function Dashboard() {
  const { data: dossiers } = useCollection('foncier_dossiers')

  const stats = useMemo(() => {
    const ouverts = dossiers.filter((d) => !['cloture', 'suspendu'].includes(d.statut)).length
    const enCours = dossiers.filter((d) => d.statut === 'en_cours').length
    const titresObtenus = dossiers.filter((d) => ['titre_obtenu', 'cloture'].includes(d.statut)).length
    const morcellements = dossiers.filter((d) => d.type === 'morcellement' && d.statut !== 'cloture').length
    return { total: dossiers.length, ouverts, enCours, titresObtenus, morcellements }
  }, [dossiers])

  const recents = useMemo(() =>
    [...dossiers].sort((a, b) => (a.updatedAt || a.createdAt || 0) < (b.updatedAt || b.createdAt || 0) ? 1 : -1).slice(0, 8),
  [dossiers])

  const parType = useMemo(() => {
    const map = {}
    TYPES_DOSSIER.forEach((t) => { map[t.id] = 0 })
    dossiers.forEach((d) => { if (map[d.type] !== undefined) map[d.type]++ })
    return TYPES_DOSSIER.map((t) => ({ ...t, count: map[t.id] || 0 }))
  }, [dossiers])

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-800 p-4 text-white">
        <h2 className="text-lg font-extrabold">Gestion Foncière</h2>
        <p className="text-sm text-emerald-100">Titres fonciers · Morcellement · Mutation · Suivi administratif (Togo)</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Dossiers total" value={stats.total} icon={FileText} accent="#059669" />
        <StatCard title="En cours" value={stats.enCours} icon={Clock} accent="#d97706" />
        <StatCard title="Titres obtenus" value={stats.titresObtenus} icon={CheckCircle2} accent="#16a34a" />
        <StatCard title="Morcellements actifs" value={stats.morcellements} icon={MapPin} accent="#0284c7" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Par type de dossier">
          <div className="space-y-2">
            {parType.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold">{t.label}</p>
                  <p className="text-xs text-gray-500">{t.description}</p>
                </div>
                <span className="text-xl font-extrabold text-emerald-700">{t.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Dossiers récents">
          {!recents.length ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucun dossier — créez-en un dans l'onglet Dossiers</p>
          ) : (
            <div className="space-y-2">
              {recents.map((d) => {
                const pct = progressionDossier(d.etapes)
                const etape = etapeCourante(d.etapes)
                return (
                  <div key={d.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-500">{d.num}</span>
                      <Badge tone={STATUTS_DOSSIER[d.statut]?.tone}>{STATUTS_DOSSIER[d.statut]?.label || d.statut}</Badge>
                    </div>
                    <p className="font-semibold">{d.commune} — Lot {d.lot || '—'}</p>
                    <p className="text-xs text-gray-500">{d.proprietaire}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                        <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-500">{pct}%</span>
                    </div>
                    {etape && <p className="mt-1 text-[10px] text-emerald-700">→ {etape.label}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <strong>Procédure titre foncier (Togo) :</strong> Reçu d'achat → Plan parcellaire → Vérification cadastre →
        Avis OTR → Acte notarié → Titre obtenu. Modes : héritage, donation/cession, achat.
      </div>
    </div>
  )
}

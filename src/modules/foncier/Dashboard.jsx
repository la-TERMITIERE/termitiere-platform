// Dashboard Foncier — dossiers, progression, alertes.
// Toutes les cartes sont cliquables : carte → liste de dossiers → détail d'un dossier (étapes).
import { useMemo, useState } from 'react'
import { MapPin, FileText, Clock, CheckCircle2 } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { TYPES_DOSSIER, STATUTS_DOSSIER, STATUTS_ETAPE, VERDICTS_APPRECIATION } from './data'
import { progressionDossier, etapeCourante } from './logic'
import { useFoncierStore } from './store/referentielStore'
import { formatDateShort } from '../../utils/formatters'

export default function Dashboard() {
  const { data: dossiers } = useCollection('foncier_dossiers')
  const customTypes = useFoncierStore((s) => s.customTypes)
  const [detail, setDetail] = useState(null)      // { titre, liste }
  const [dossierSel, setDossierSel] = useState(null) // dossier détaillé

  const stats = useMemo(() => {
    const ouverts = dossiers.filter((d) => !['cloture', 'suspendu'].includes(d.statut))
    const enCours = dossiers.filter((d) => d.statut === 'en_cours')
    const titresObtenus = dossiers.filter((d) => ['titre_obtenu', 'cloture'].includes(d.statut))
    const morcellements = dossiers.filter((d) => d.type === 'morcellement' && d.statut !== 'cloture')
    return { ouverts, enCours, titresObtenus, morcellements }
  }, [dossiers])

  const recents = useMemo(() =>
    [...dossiers].sort((a, b) => (a.updatedAt || a.createdAt || 0) < (b.updatedAt || b.createdAt || 0) ? 1 : -1).slice(0, 8),
  [dossiers])

  const parType = useMemo(() => {
    const types = [...TYPES_DOSSIER, ...customTypes]
    const map = {}
    types.forEach((t) => { map[t.id] = 0 })
    dossiers.forEach((d) => { if (map[d.type] !== undefined) map[d.type]++ })
    return types.map((t) => ({ ...t, count: map[t.id] || 0 }))
  }, [dossiers, customTypes])

  const openDetail = (titre, liste) => setDetail({ titre, liste })

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-800 p-4 text-white">
        <h2 className="text-lg font-extrabold">Gestion Foncière</h2>
        <p className="text-sm text-emerald-100">Titres fonciers · Morcellement · Mutation · Suivi administratif (Togo)</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Dossiers total" value={dossiers.length} icon={FileText} accent="#059669"
          sub="cliquer pour la liste" onClick={() => openDetail('Tous les dossiers', dossiers)} />
        <StatCard title="En cours" value={stats.enCours.length} icon={Clock} accent="#d97706"
          sub="cliquer pour la liste" onClick={() => openDetail('Dossiers en cours', stats.enCours)} />
        <StatCard title="Titres obtenus" value={stats.titresObtenus.length} icon={CheckCircle2} accent="#16a34a"
          sub="cliquer pour la liste" onClick={() => openDetail('Titres obtenus', stats.titresObtenus)} />
        <StatCard title="Morcellements actifs" value={stats.morcellements.length} icon={MapPin} accent="#0284c7"
          sub="cliquer pour la liste" onClick={() => openDetail('Morcellements actifs', stats.morcellements)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Par type de dossier">
          <div className="space-y-2">
            {parType.map((t) => (
              <button key={t.id} onClick={() => openDetail(t.label, dossiers.filter((d) => d.type === t.id))}
                className="flex w-full items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-left text-sm transition-colors hover:bg-emerald-50">
                <div>
                  <p className="font-semibold">{t.label}</p>
                  <p className="text-xs text-gray-500">{t.description}</p>
                </div>
                <span className="text-xl font-extrabold text-emerald-700">{t.count}</span>
              </button>
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
                  <button key={d.id} onClick={() => setDossierSel(d)}
                    className="block w-full rounded-lg border border-gray-100 px-3 py-2 text-left text-sm transition-colors hover:bg-emerald-50">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-500">{d.num}</span>
                      <Badge tone={STATUTS_DOSSIER[d.statut]?.tone}>{STATUTS_DOSSIER[d.statut]?.label || d.statut}</Badge>
                    </div>
                    <p className="font-semibold">{d.commune} — Lot {d.lot || '—'}</p>
                    <p className="text-xs text-gray-500">{d.proprietaire}</p>
                    {d.type === 'vente_cession' && d.cession?.appreciation?.verdict && d.cession.appreciation.verdict !== 'en_attente' && (
                      <span className="mt-1 inline-block"><Badge tone={VERDICTS_APPRECIATION[d.cession.appreciation.verdict]?.tone}>{VERDICTS_APPRECIATION[d.cession.appreciation.verdict]?.label}</Badge></span>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                        <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-500">{pct}%</span>
                    </div>
                    {etape && <p className="mt-1 text-[10px] text-emerald-700">→ {etape.label}</p>}
                  </button>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <strong>Procédure titre foncier (Togo) :</strong> Levé topographique → Avis du Guichet Foncier Unique →
        Acte notarié → Publication au Journal Officiel (opposition 3 mois) → Bornage contradictoire → Traitement OTR →
        Titre établi par la Conservation Foncière. Cession, mutation, donation, héritage & lotissement gérés par dossier.
      </div>

      {/* Détail : liste de dossiers filtrée (cliquable jusqu'au dossier) */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.titre || ''}>
        {detail && (detail.liste.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucun dossier.</p>
        ) : (
          <div className="space-y-2">
            {detail.liste.map((d) => {
              const pct = progressionDossier(d.etapes)
              return (
                <button key={d.id} onClick={() => { setDossierSel(d); setDetail(null) }}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left text-sm transition-colors hover:bg-emerald-50">
                  <div>
                    <p className="font-semibold">{d.commune} — Lot {d.lot || '—'} <span className="font-mono text-xs text-gray-400">{d.num}</span></p>
                    <p className="text-xs text-gray-500">{d.proprietaire}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500">{pct}%</span>
                    <Badge tone={STATUTS_DOSSIER[d.statut]?.tone}>{STATUTS_DOSSIER[d.statut]?.label || d.statut}</Badge>
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </Modal>

      {/* Détail d'un dossier : ses étapes */}
      <Modal open={!!dossierSel} onClose={() => setDossierSel(null)} size="lg"
        title={dossierSel ? `${dossierSel.commune} — Lot ${dossierSel.lot || '—'}` : ''}>
        {dossierSel && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-xs text-gray-400">{dossierSel.num}</span>
              <Badge tone={STATUTS_DOSSIER[dossierSel.statut]?.tone}>{STATUTS_DOSSIER[dossierSel.statut]?.label || dossierSel.statut}</Badge>
              <span className="text-gray-500">{dossierSel.proprietaire}</span>
            </div>
            <div className="rounded-lg border border-gray-100">
              {(dossierSel.etapes || []).slice().sort((a, b) => a.ordre - b.ordre).map((e) => (
                <div key={e.id} className="flex items-center justify-between border-b border-gray-50 px-3 py-2 text-sm last:border-0">
                  <span>{e.ordre}. {e.label}</span>
                  <Badge tone={STATUTS_ETAPE[e.statut]?.tone}>{STATUTS_ETAPE[e.statut]?.label || e.statut}</Badge>
                </div>
              ))}
              {!(dossierSel.etapes || []).length && <p className="px-3 py-4 text-center text-sm text-gray-400">Aucune étape.</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

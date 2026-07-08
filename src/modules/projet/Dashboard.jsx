import { useMemo, useState, useEffect, useRef } from 'react'
import { FolderKanban, Clock, CheckCircle2, AlertTriangle, BellRing, X } from 'lucide-react'
import InfoBulle from '../../shared/ui/InfoBulle'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { STATUTS_PROJET, PRIORITES, SEUILS_DEFAUT } from './data'
import { avancementProjet, tachesEnRetard, projetEnRetard, genererAlertes } from './logic'
import { formatDateShort } from '../../utils/formatters'
import { notify } from '../../core/notify'
import { FULL_ACCESS_ROLES } from '../../core/roles'
import { useAuthStore } from '../../core/auth'
import { projetsVisibles, scopeParProjets } from './logic'

const TYPE_ALERTE = {
  projet_retard:   { color: 'text-red-600',    bg: 'border-red-200 bg-red-50',       label: 'Projet en retard'      },
  budget_depasse:  { color: 'text-amber-600',  bg: 'border-amber-200 bg-amber-50',   label: 'Budget dépassé'        },
  tache_depassee:  { color: 'text-amber-600',  bg: 'border-amber-200 bg-amber-50',   label: 'Tâche en dépassement'  },
  tache_retard:    { color: 'text-amber-600',  bg: 'border-amber-200 bg-amber-50',   label: 'Tâche en retard'       },
  avancement_zero: { color: 'text-indigo-600', bg: 'border-indigo-200 bg-indigo-50', label: 'Aucun avancement'      },
  termine:         { color: 'text-green-600',  bg: 'border-green-200 bg-green-50',   label: 'Terminé ✓'             }
}

export default function Dashboard() {
  const { data: projetsTous }  = useCollection('projets')
  const { data: tachesTous }   = useCollection('projet_taches')
  const { data: configs }      = useCollection('projet_params')
  const { data: depensesTous } = useCollection('projet_depenses')
  const { data: fermeesDashboard } = useCollection('projet_alertes_dashboard_fermees')
  const { user: utilisateur, role } = useAuthStore()

  // Cloisonnement : un chef de projet ne voit que ses projets sur le Dashboard.
  const projets  = useMemo(() => projetsVisibles(projetsTous, utilisateur, role), [projetsTous, utilisateur, role])
  const taches   = useMemo(() => scopeParProjets(tachesTous, projets), [tachesTous, projets])
  const depenses = useMemo(() => scopeParProjets(depensesTous, projets), [depensesTous, projets])

  const [detail, setDetail] = useState(null)
  const seuils = configs.find((c) => c.id === 'seuils') ?? SEUILS_DEFAUT
  const alertesRef = useRef(new Set())
  const idsFermesDashboard = useMemo(() => new Set(fermeesDashboard.map((f) => f.id)), [fermeesDashboard])
  const fermerSurDashboard = (id) => setItem('projet_alertes_dashboard_fermees', id, { id, fermeLe: Date.now() })

  // Notifications temps réel — envoie une notif pour chaque nouvelle alerte critique
  useEffect(() => {
    const alertes = genererAlertes(projets, taches, depenses, seuils)
    const critiques = alertes.filter((a) => ['projet_retard', 'budget_depasse'].includes(a.type))
    critiques.forEach((a) => {
      if (!alertesRef.current.has(a.id)) {
        alertesRef.current.add(a.id)
        notify({
          type: 'warning',
          title: a.type === 'projet_retard' ? 'Projet en retard' : 'Budget dépassé',
          body: `${a.projetNom} — ${a.message}`,
          module: 'projet',
          forRoles: FULL_ACCESS_ROLES,
          link: '/projet',
        })
      }
    })
  }, [projets, taches, depenses, seuils])

  const stats = useMemo(() => {
    const actifs    = projets.filter((p) => p.statut === 'en_cours')
    const termines  = projets.filter((p) => p.statut === 'termine')
    const enRetard  = projets.filter((p) => projetEnRetard(p))
    const tRetard   = tachesEnRetard(taches)
    return { actifs, termines, enRetard, tRetard }
  }, [projets, taches])

  const recents = useMemo(() =>
    [...projets]
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, 8),
  [projets])

  return (
    <div className="space-y-5">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(13,148,136,0.35),0_8px_20px_-8px_rgba(13,148,136,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.85) 0%, rgba(15,84,80,0.8) 100%)' }}>
        <div style={{ position: 'relative', flexShrink: 0, width: 64, height: 64 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0d9488', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55'
          }}>
            <span style={{ color: 'white', fontWeight: 800, fontSize: 20, letterSpacing: '-0.5px' }}>GP</span>
          </div>
        </div>
        <div>
          <h2 className="text-lg font-extrabold">E-G.Pro</h2>
          <p className="text-sm text-white/80">Suivi des projets · Tâches · Équipes · Avancement</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title={<span className="flex items-center gap-1">Total projets <InfoBulle texte="Nombre total de projets enregistrés dans le module." /></span>}
          value={projets.length} icon={FolderKanban} accent="#0d9488" sub="cliquer pour la liste" onClick={() => setDetail({ titre: 'Tous les projets', liste: projets })} />
        <StatCard title={<span className="flex items-center gap-1">En cours <InfoBulle texte="Projets dont le statut est 'En cours'." /></span>}
          value={stats.actifs.length} icon={Clock} accent="#d97706" sub="cliquer pour la liste" onClick={() => setDetail({ titre: 'Projets en cours', liste: stats.actifs })} />
        <StatCard title={<span className="flex items-center gap-1">Terminés <InfoBulle texte="Projets dont le statut est 'Terminé'." /></span>}
          value={stats.termines.length} icon={CheckCircle2} accent="#16a34a" sub="cliquer pour la liste" onClick={() => setDetail({ titre: 'Projets terminés', liste: stats.termines })} />
        <StatCard title={<span className="flex items-center gap-1">En retard <InfoBulle texte="Projets actifs dont la date de fin prévue est dépassée." /></span>}
          value={stats.enRetard.length} icon={AlertTriangle} accent="#dc2626" sub="cliquer pour la liste" onClick={() => setDetail({ titre: 'Projets en retard', liste: stats.enRetard })} />
      </div>

      {/* ── Alertes ────────────────────────────────────────────────────────── */}
      {(() => {
        // Fermer ici ne retire l'alerte que de ce widget — elle reste visible dans l'onglet Alertes
        // tant que le problème n'est pas résolu.
        const alertes = genererAlertes(projets, taches, depenses, seuils).filter((a) => !idsFermesDashboard.has(a.id))
        if (!alertes.length) return null
        const critiques = alertes.filter((a) => ['projet_retard','budget_depasse'].includes(a.type)).length
        return (
          <Card title={
            <span className="flex items-center gap-2">
              <BellRing size={15} className={critiques ? 'text-red-500' : 'text-amber-500'} />
              Alertes
              {critiques > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{critiques}</span>}
            </span>
          }>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {alertes.map((a) => {
                const cfg = TYPE_ALERTE[a.type]
                return (
                  <div key={a.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${cfg.bg}`}>
                    <span className={`shrink-0 font-bold ${cfg.color}`}>{cfg.label}</span>
                    <span className="font-semibold text-gray-600">{a.projetNom}</span>
                    <span className="flex-1 text-gray-500">{a.message}</span>
                    <button onClick={() => fermerSurDashboard(a.id)} title="Retirer de ce widget"
                      className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-white/70 hover:text-gray-700">
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })()}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Projets récents">
          {!recents.length ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucun projet — créez-en un dans l'onglet Projets</p>
          ) : (
            <div className="space-y-2">
              {recents.map((p) => {
                const tachesDuProjet = taches.filter((t) => t.projetId === p.id)
                const pct = avancementProjet(tachesDuProjet, p)
                return (
                  <div key={p.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-400">{p.num}</span>
                      <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label || p.statut}</Badge>
                    </div>
                    <p className="font-semibold">{p.nom}</p>
                    {p.responsable && <p className="text-xs text-gray-500">Resp. : {p.responsable}</p>}
                    {p.dureeIndeterminee
                      ? <p className="text-xs italic text-gray-400">Durée indéterminée</p>
                      : p.dateFin && <p className="text-xs text-gray-400">Échéance : {formatDateShort(p.dateFin)}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                        <div className="h-1.5 rounded-full bg-teal-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-500">{pct}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="Tâches en retard">
          {!stats.tRetard.length ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucune tâche en retard</p>
          ) : (
            <div className="space-y-2">
              {stats.tRetard.slice(0, 8).map((t) => {
                const projet = projets.find((p) => p.id === t.projetId)
                return (
                  <div key={t.id} className="flex items-start justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm">
                    <div>
                      <p className="font-semibold text-red-800">{t.titre}</p>
                      {projet && <p className="text-xs text-gray-500">{projet.nom}</p>}
                      <p className="text-xs text-red-500">Échue le {formatDateShort(t.echeance)}</p>
                    </div>
                    <Badge tone={PRIORITES[t.priorite]?.tone}>{PRIORITES[t.priorite]?.label || t.priorite}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.titre || ''}>
        {detail && (detail.liste.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucun projet.</p>
        ) : (
          <div className="space-y-2">
            {detail.liste.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold">{p.nom} <span className="font-mono text-xs text-gray-400">{p.num}</span></p>
                  {p.responsable && <p className="text-xs text-gray-500">Resp. : {p.responsable}</p>}
                </div>
                <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label || p.statut}</Badge>
              </div>
            ))}
          </div>
        ))}
      </Modal>
    </div>
  )
}

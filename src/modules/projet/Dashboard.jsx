import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Clock, CheckCircle2, AlertTriangle, BellRing, X, Clock3, Wallet2, HandCoins, TimerOff, PartyPopper, Banknote } from 'lucide-react'
import InfoBulle from '../../shared/ui/InfoBulle'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { STATUTS_PROJET, SEUILS_DEFAUT } from './data'
import { avancementProjet, projetEnRetard, genererAlertes } from './logic'
import { formatDateShort, todayStr } from '../../utils/formatters'
import { useAuthStore } from '../../core/auth'
import { projetsVisibles, scopeParProjets } from './logic'

// Fermer une alerte sur le Dashboard la fait taire jusqu'au LENDEMAIN (reset
// automatique, cf. visibiliteAlerte ci-dessous) — une seule fermeture suffit, pas
// besoin de la refermer plusieurs fois. Elle ne revient que si le jour change et
// que la condition est toujours vraie (pas corrigée).
const REAPPARITION_MS  = 2 * 60 * 1000
const MAX_FERMETURES   = 1

function visibiliteAlerte(alerteId, fermetures) {
  const f = fermetures.find((x) => x.id === alerteId)
  if (!f) return true
  if (f.jour !== todayStr()) return true // nouveau jour → on repart de zéro
  if ((f.compteur || 0) >= MAX_FERMETURES) return false // quota atteint → silence jusqu'à demain
  return Date.now() - (f.dernierFermeture || 0) >= REAPPARITION_MS
}

const TYPE_ALERTE = {
  projet_retard:   { color: 'text-red-600',    ring: 'ring-red-200',    bg: 'bg-red-50/80',    icon: Clock3,     label: 'Projet en retard'      },
  budget_depasse:  { color: 'text-amber-600',  ring: 'ring-amber-200',  bg: 'bg-amber-50/80',  icon: Wallet2,    label: 'Budget dépassé'        },
  tache_depassee:  { color: 'text-amber-600',  ring: 'ring-amber-200',  bg: 'bg-amber-50/80',  icon: HandCoins,  label: 'Tâche en dépassement'  },
  reste_a_payer:   { color: 'text-sky-600',    ring: 'ring-sky-200',    bg: 'bg-sky-50/80',    icon: Banknote,   label: 'Reste à payer'         },
  tache_retard:    { color: 'text-orange-600', ring: 'ring-orange-200', bg: 'bg-orange-50/80', icon: TimerOff,   label: 'Tâche en retard'       },
  avancement_zero: { color: 'text-indigo-600', ring: 'ring-indigo-200', bg: 'bg-indigo-50/80', icon: AlertTriangle, label: 'Aucun avancement'   },
  termine:         { color: 'text-green-600',  ring: 'ring-green-200',  bg: 'bg-green-50/80',  icon: PartyPopper, label: 'Terminé ✓'            }
}

// Couleur de la barre empilée pour la répartition par statut (assortie au ton du Badge).
const TONE_BAR = {
  info: 'bg-sky-400', warning: 'bg-amber-400', neutral: 'bg-gray-300', success: 'bg-green-400', danger: 'bg-red-400'
}

// Volet à ouvrir au clic sur une alerte — on ouvre directement la fiche du projet
// ou de la tâche concernée (pas juste la liste générale), là où se fait la correction.
const VOLET_PAR_CIBLE = { projet: '/projet/projets', tache: '/projet/taches' }

export default function Dashboard() {
  const navigate = useNavigate()
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
  const [resteOuvert, setResteOuvert] = useState(false) // détail de l'alerte groupée « reste à payer »
  const seuils = configs.find((c) => c.id === 'seuils') ?? SEUILS_DEFAUT

  // Revérifie périodiquement si une alerte fermée doit réapparaître (délai de 2 min écoulé).
  const [, relancerVerif] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => relancerVerif((n) => n + 1), 15 * 1000)
    return () => clearInterval(timer)
  }, [])

  const fermerSurDashboard = (a) => {
    const jour = todayStr()
    const existant = fermeesDashboard.find((f) => f.id === a.id)
    const compteur = (existant?.jour === jour ? (existant.compteur || 0) : 0) + 1
    setItem('projet_alertes_dashboard_fermees', a.id, { id: a.id, compteur, dernierFermeture: Date.now(), jour })
  }

  const stats = useMemo(() => {
    const actifs    = projets.filter((p) => p.statut === 'en_cours')
    const termines  = projets.filter((p) => p.statut === 'termine')
    const enRetard  = projets.filter((p) => projetEnRetard(p))
    return { actifs, termines, enRetard }
  }, [projets])

  const recents = useMemo(() =>
    [...projets]
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, 8),
  [projets])

  // Vue d'ensemble — répartition par statut + avancement moyen, informatif pour
  // tous les rôles (pas seulement ceux qui gèrent budget/tâches).
  const repartitionStatuts = useMemo(() =>
    Object.entries(STATUTS_PROJET)
      .map(([key, cfg]) => ({ key, label: cfg.label, tone: cfg.tone, count: projets.filter((p) => p.statut === key).length }))
      .filter((s) => s.count > 0),
  [projets])

  const avancementMoyen = useMemo(() => {
    if (!projets.length) return 0
    const total = projets.reduce((s, p) => s + avancementProjet(taches.filter((t) => t.projetId === p.id), p), 0)
    return Math.round(total / projets.length)
  }, [projets, taches])

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
        // Fermer une alerte ici la masque 2 min (elle réapparaît ensuite si toujours
        // active), jusqu'à 5 fermetures par jour — au-delà, silence jusqu'au lendemain.
        // Le chef de projet concerné et la direction continuent d'être notifiés via la
        // cloche pendant ce temps, indépendamment de ce widget.
        const alertes = genererAlertes(projets, taches, depenses, seuils).filter((a) => visibiliteAlerte(a.id, fermeesDashboard))
        if (!alertes.length) return null
        const critiques = alertes.filter((a) => ['projet_retard','budget_depasse'].includes(a.type)).length
        return (
          <Card title={
            <span className="flex items-center gap-2">
              <BellRing size={15} className={critiques ? 'text-red-500' : 'text-amber-500'} />
              Alertes
              {critiques > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{critiques}</span>}
              <span className="ml-auto text-[11px] font-normal text-gray-400">{alertes.length} active{alertes.length > 1 ? 's' : ''}</span>
            </span>
          }>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {alertes.map((a) => {
                const cfg = TYPE_ALERTE[a.type]
                const Icone = cfg.icon
                const responsable = projets.find((p) => p.id === a.projetId)?.responsable
                // Alerte groupée « reste à payer » : pas de navigation directe, un clic déplie
                // la liste des tâches concernées (une seule carte au lieu d'une par tâche).
                if (a.type === 'reste_a_payer') {
                  return (
                    <div key={a.id} className={`rounded-2xl border border-white/60 shadow-sm ring-1 backdrop-blur-sm ${cfg.bg} ${cfg.ring}`}>
                      <div onClick={() => setResteOuvert((o) => !o)} title="Voir le détail"
                        className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-all hover:brightness-95">
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm ${cfg.color}`}>
                          <Icone size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                          <p className="mt-0.5 text-xs leading-snug text-gray-500">{a.message}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); fermerSurDashboard(a) }} title="Masquer 2 min"
                          className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-white/80 hover:text-gray-700">
                          <X size={14} />
                        </button>
                      </div>
                      {resteOuvert && (
                        <div className="space-y-1 border-t border-white/60 px-3 py-2">
                          {a.details.map((d) => (
                            <div key={d.tacheId} onClick={() => navigate('/projet/taches', { state: { openTacheId: d.tacheId } })}
                              title="Aller corriger"
                              className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/70">
                              <span className="min-w-0 truncate text-gray-600">
                                <span className="font-semibold text-gray-700">{d.tacheTitre}</span>
                                <span className="text-gray-400"> — {d.projetNom}</span>
                              </span>
                              <span className="shrink-0 font-bold text-sky-700">{d.reste.toLocaleString('fr-FR')} FCFA</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }
                return (
                  <div key={a.id} onClick={() => {
                      // Budget dépassé / Tâche en dépassement → droit au formulaire de révision,
                      // pas juste la fiche, pour agir tout de suite sans clic supplémentaire.
                      const ouvrirRevision = a.type === 'budget_depasse' || a.type === 'tache_depassee'
                      const state = a.cibleType === 'tache'
                        ? { openTacheId: a.cibleId, openRevision: ouvrirRevision }
                        : { openProjetId: a.cibleId, openRevision: ouvrirRevision }
                      navigate(VOLET_PAR_CIBLE[a.cibleType] || '/projet', { state })
                    }}
                    title="Aller corriger"
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border border-white/60 px-3 py-2.5 shadow-sm ring-1 backdrop-blur-sm transition-all hover:shadow-md hover:brightness-95 ${cfg.bg} ${cfg.ring}`}>
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm ${cfg.color}`}>
                      <Icone size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-xs font-semibold text-gray-600">— {a.projetNom}</span>
                        {responsable && (
                          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Resp. : {responsable}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-snug text-gray-500">{a.message}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); fermerSurDashboard(a) }} title="Masquer 2 min"
                      className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-white/80 hover:text-gray-700">
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })()}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title="Projets récents">
          {!recents.length ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucun projet — créez-en un dans l'onglet Projets</p>
          ) : (
            <div className="space-y-2">
              {recents.map((p) => {
                const tachesDuProjet = taches.filter((t) => t.projetId === p.id)
                const pct = avancementProjet(tachesDuProjet, p)
                return (
                  <div key={p.id} className="rounded-2xl bg-white/50 px-3 py-2.5 text-sm shadow-sm transition-colors hover:bg-white/70">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-400">{p.num}</span>
                      <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label || p.statut}</Badge>
                    </div>
                    <p className="font-semibold text-gray-800">{p.nom}</p>
                    {p.responsable && <p className="text-xs text-gray-500">Resp. : {p.responsable}</p>}
                    {p.dureeIndeterminee
                      ? <p className="text-xs italic text-gray-400">Durée indéterminée</p>
                      : p.dateFin && <p className="text-xs text-gray-400">Échéance : {formatDateShort(p.dateFin)}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-200/70">
                        <div className="h-1.5 rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-500">{pct}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {projets.length > 0 && (
          <Card title="Vue d'ensemble">
            <div className="space-y-4">
              <div>
                <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
                  {repartitionStatuts.map((s) => (
                    <div key={s.key} className={TONE_BAR[s.tone] || 'bg-gray-300'}
                      style={{ width: `${(s.count / projets.length) * 100}%` }} title={`${s.label} : ${s.count}`} />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {repartitionStatuts.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className={`h-2 w-2 rounded-full ${TONE_BAR[s.tone] || 'bg-gray-300'}`} />
                      {s.label} <b className="text-gray-800">{s.count}</b>
                    </span>
                  ))}
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold uppercase tracking-wide text-gray-500">Avancement moyen</span>
                  <span className="font-bold text-teal-700">{avancementMoyen}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full bg-teal-500 transition-all" style={{ width: `${avancementMoyen}%` }} />
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" title={detail?.titre || ''}
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        {detail && (detail.liste.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucun projet.</p>
        ) : (
          <div className="space-y-2">
            {detail.liste.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-2.5 text-sm">
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

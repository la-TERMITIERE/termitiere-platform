import { useMemo, useState, useEffect, useRef } from 'react'
import { FolderKanban, Clock, CheckCircle2, AlertTriangle, BellRing } from 'lucide-react'
import InfoBulle from '../../shared/ui/InfoBulle'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { STATUTS_PROJET, PRIORITES } from './data'
import { avancementProjet, tachesEnRetard, projetEnRetard } from './logic'
import { formatDateShort } from '../../utils/formatters'
import { SEUILS_DEFAUT } from './Params'
import { notify } from '../../core/notify'
import { FULL_ACCESS_ROLES } from '../../core/roles'

const TYPE_ALERTE = {
  projet_retard:   { color: 'text-red-600',    bg: 'border-red-200 bg-red-50',       label: 'Projet en retard'   },
  budget_depasse:  { color: 'text-amber-600',  bg: 'border-amber-200 bg-amber-50',   label: 'Budget dépassé'     },
  tache_retard:    { color: 'text-amber-600',  bg: 'border-amber-200 bg-amber-50',   label: 'Tâche en retard'    },
  avancement_zero: { color: 'text-indigo-600', bg: 'border-indigo-200 bg-indigo-50', label: 'Aucun avancement'   },
  termine:         { color: 'text-green-600',  bg: 'border-green-200 bg-green-50',   label: 'Terminé ✓'          }
}

function genAlertes(projets, taches, seuils, depenses = []) {
  const alertes = [], now = Date.now()
  const seuilBudget     = (seuils?.budget    ?? SEUILS_DEFAUT.budget)    / 100
  const seuilInactivite = (seuils?.inactivite ?? SEUILS_DEFAUT.inactivite) * 24 * 3600 * 1000
  const SEMAINE = 7*24*3600*1000

  projets.forEach((p) => {
    const tp = taches.filter((t) => t.projetId === p.id)
    if (projetEnRetard(p)) {
      const j = Math.floor((now - p.dateFin) / (24*3600*1000))
      alertes.push({ id:`r_${p.id}`, type:'projet_retard', projetNom:p.nom, message:`${j}j de retard (fin : ${formatDateShort(p.dateFin)})` })
    }
    // Alerte budget : utilise la somme réelle des dépenses du module
    const totalDepenses = depenses
      .filter((d) => d.projetId === p.id)
      .reduce((s, d) => s + (Number(d.montant) || 0), 0)
    if (p.budget && totalDepenses > 0 && totalDepenses >= Number(p.budget) * seuilBudget) {
      const pct = Math.round((totalDepenses / Number(p.budget)) * 100)
      alertes.push({ id:`b_${p.id}`, type:'budget_depasse', projetNom:p.nom, message:`${pct}% du budget utilisé (${totalDepenses.toLocaleString('fr-FR')} / ${Number(p.budget).toLocaleString('fr-FR')} FCFA)` })
    }
    tp.filter((t) =>
      !['terminee','annulee'].includes(t.statut) &&
      (t.updatedAt || t.createdAt) &&
      (now - (t.updatedAt || t.createdAt)) > seuilInactivite
    ).forEach((t) => {
      const j = Math.floor((now - (t.updatedAt || t.createdAt)) / (24*3600*1000))
      alertes.push({ id:`z_${t.id}`, type:'avancement_zero', projetNom:p.nom, message:`"${t.titre}" — inactive depuis ${j}j` })
    })
    tachesEnRetard(tp).forEach((t) => {
      const j = Math.floor((now - t.echeance) / (24*3600*1000))
      alertes.push({ id:`t_${t.id}`, type:'tache_retard', projetNom:p.nom, message:`"${t.titre}" — ${j}j de retard` })
    })
    if (p.statut==='termine' && p.updatedAt && (now-p.updatedAt)<SEMAINE)
      alertes.push({ id:`fin_${p.id}`, type:'termine', projetNom:p.nom, message:`Terminé le ${formatDateShort(p.updatedAt)}` })
  })
  const ordre = { projet_retard:0, budget_depasse:1, tache_retard:2, avancement_zero:3, termine:4 }
  return alertes.sort((a,b)=>(ordre[a.type]??9)-(ordre[b.type]??9))
}

export default function Dashboard() {
  const { data: projets }  = useCollection('projets')
  const { data: taches }   = useCollection('projet_taches')
  const { data: configs }  = useCollection('projet_params')
  const { data: depenses } = useCollection('projet_depenses')
  const [detail, setDetail] = useState(null)
  const seuils = configs.find((c) => c.id === 'seuils') ?? SEUILS_DEFAUT
  const alertesRef = useRef(new Set())

  // Notifications temps réel — envoie une notif pour chaque nouvelle alerte critique
  useEffect(() => {
    const alertes = genAlertes(projets, taches, seuils, depenses)
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
          <h2 className="text-lg font-extrabold">Gestion de Projet</h2>
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
        const alertes = genAlertes(projets, taches, seuils, depenses)
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
                  <div key={a.id} className={`flex gap-2 rounded-lg border px-3 py-2 text-xs ${cfg.bg}`}>
                    <span className={`shrink-0 font-bold ${cfg.color}`}>{cfg.label}</span>
                    <span className="font-semibold text-gray-600">{a.projetNom}</span>
                    <span className="text-gray-500">{a.message}</span>
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
                const pct = avancementProjet(tachesDuProjet)
                return (
                  <div key={p.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-gray-400">{p.num}</span>
                      <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label || p.statut}</Badge>
                    </div>
                    <p className="font-semibold">{p.nom}</p>
                    {p.responsable && <p className="text-xs text-gray-500">Resp. : {p.responsable}</p>}
                    {p.dateFin && <p className="text-xs text-gray-400">Échéance : {formatDateShort(p.dateFin)}</p>}
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

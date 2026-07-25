// Pilotage — Vue d'ensemble stratégique pour le Directeur Général.
import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Doughnut, Bar } from 'react-chartjs-2'
import { TrendingDown, AlertTriangle, CheckCircle2, Clock, Wallet, Users, BellRing } from 'lucide-react'

const TitreGraphe = ({ label, description }) => (
  <div>
    <span>{label}</span>
    {description && <p className="mt-0.5 text-[11px] font-normal text-gray-400">{description}</p>}
  </div>
)
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { avancementProjet, tachesEnRetard, projetEnRetard, genererAlertes } from './logic'
import { STATUTS_PROJET, SEUILS_DEFAUT } from './data'

const TEAL  = '#0d9488'
const GREEN = '#16a34a'
const AMBER = '#f59e0b'
const RED   = '#ef4444'
const GRAY  = '#94a3b8'

// ── Jauge circulaire SVG ──────────────────────────────────────────────────────
function Jauge({ pct, label, color = TEAL, size = 88 }) {
  const r = 36, circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div className="flex flex-col items-center gap-1.5 max-w-[140px]">
      <svg width={size} height={size} viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4}
          strokeLinecap="round" style={{ transition: 'stroke-dasharray .5s' }} />
        <text x="44" y="48" textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>{pct}%</text>
      </svg>
      <span className="text-xs font-medium text-gray-600 text-center leading-tight">{label}</span>
    </div>
  )
}

// ── Indicateur de santé ───────────────────────────────────────────────────────
function Sante({ projet, taches, depenses }) {
  const tp       = taches.filter((t) => t.projetId === projet.id)
  const av       = avancementProjet(tp, projet)
  const retard   = projetEnRetard(projet)
  const budget   = Number(projet.budget) || 0
  const totalDep = depenses
    .filter((d) => d.projetId === projet.id)
    .reduce((s, d) => s + (Number(d.montant) || 0), 0)
  const surBudget = budget > 0 && totalDep > budget
  const tRetard  = tachesEnRetard(tp).length

  let score = 100
  if (retard)    score -= 40
  if (surBudget) score -= 30
  if (tRetard)   score -= Math.min(30, tRetard * 10)

  const color = score >= 70 ? GREEN : score >= 40 ? AMBER : RED
  const label = score >= 70 ? 'Sain' : score >= 40 ? 'Attention' : 'Critique'

  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <div className="w-2 h-10 rounded-full shrink-0" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-800 text-sm truncate">{projet.nom}</p>
        <p className="text-xs text-gray-400">
          {STATUTS_PROJET[projet.statut]?.label || projet.statut}
          {projet.responsable ? ` · ${projet.responsable}` : ''}
        </p>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
          {retard    && <span className="text-red-500 font-bold">⚠ Retard</span>}
          {surBudget && <span className="text-amber-500 font-bold">⚠ Budget dépassé</span>}
          {tRetard > 0 && <span className="text-amber-500">{tRetard} tâche(s) en retard</span>}
        </div>
      </div>
      <div className="flex flex-col items-center shrink-0">
        <span className="text-lg font-extrabold" style={{ color }}>{av}%</span>
        <span className="text-[10px] font-semibold" style={{ color }}>{label}</span>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Pilotage() {
  const navigate = useNavigate()
  const [onglet, setOnglet] = useState('pilotage')
  const [detail, setDetail] = useState(null) // { titre, type: 'projets' | 'taches' | 'responsables', liste }
  const { data: projets }  = useCollection('projets')
  const { data: taches }   = useCollection('projet_taches')
  const { data: depenses } = useCollection('projet_depenses')
  const { data: configs }  = useCollection('projet_params')
  const seuils = configs.find((c) => c.id === 'seuils') ?? SEUILS_DEFAUT

  const actifs = useMemo(() => projets.filter((p) => !['annule'].includes(p.statut)), [projets])

  // ── Indicateurs globaux ───────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const enCours   = projets.filter((p) => p.statut === 'en_cours')
    const termines  = projets.filter((p) => p.statut === 'termine')
    const enRetard  = projets.filter((p) => projetEnRetard(p))
    const tachesRetardListe = tachesEnRetard(taches)
    const budgetTotal   = projets.reduce((s, p) => s + (Number(p.budget) || 0), 0)
    const depTotal      = depenses.reduce((s, d) => s + (Number(d.montant) || 0), 0)
    const tachesTot     = taches.length
    const tachesTermees = taches.filter((t) => t.statut === 'terminee').length
    const tauxGlobal    = tachesTot ? Math.round((tachesTermees / tachesTot) * 100) : 0
    const responsables  = [...new Set(projets.map((p) => p.responsable).filter(Boolean))].length
    return { enCours, termines, enRetard, tachesRetardListe,
             enCoursN: enCours.length, terminesN: termines.length, enRetardN: enRetard.length,
             budgetTotal, depTotal, ecart: budgetTotal - depTotal, tauxGlobal, tRetard: tachesRetardListe.length, responsables }
  }, [projets, taches, depenses])

  // ── Taux de réussite délais / budget ─────────────────────────────────────
  const tauxDelai = useMemo(() => {
    const term = projets.filter((p) => p.statut === 'termine')
    if (!term.length) return null
    const ok = term.filter((p) => !p.dateFin || p.updatedAt <= p.dateFin).length
    return Math.round((ok / term.length) * 100)
  }, [projets])

  const tauxBudget = useMemo(() => {
    const avecBudget = projets.filter((p) => Number(p.budget) > 0)
    if (!avecBudget.length) return null
    const ok = avecBudget.filter((p) => {
      const totalDep = depenses.filter((d) => d.projetId === p.id).reduce((s, d) => s + (Number(d.montant) || 0), 0)
      return totalDep <= Number(p.budget)
    }).length
    return Math.round((ok / avecBudget.length) * 100)
  }, [projets, depenses])

  const tauxAvancement = useMemo(() => {
    if (!actifs.length) return 0
    const sum = actifs.reduce((s, p) => s + avancementProjet(taches.filter((t) => t.projetId === p.id), p), 0)
    return Math.round(sum / actifs.length)
  }, [actifs, taches])

  // ── Répartition statuts (donut) ───────────────────────────────────────────
  const statutData = useMemo(() => {
    const labels = [], data = [], colors = []
    Object.entries(STATUTS_PROJET).forEach(([k, v]) => {
      const n = projets.filter((p) => p.statut === k).length
      if (n > 0) { labels.push(v.label); data.push(n); colors.push(v.chartColor || GRAY) }
    })
    return { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] }
  }, [projets])

  // ── Comparaison projets (budget vs dépenses) ──────────────────────────────
  const budgetData = useMemo(() => {
    const ps = actifs.filter((p) => Number(p.budget) > 0).slice(0, 8)
    return {
      labels: ps.map((p) => p.nom.length > 18 ? p.nom.slice(0, 18) + '…' : p.nom),
      datasets: [
        { label: 'Budget', data: ps.map((p) => Number(p.budget) || 0), backgroundColor: TEAL + 'cc', borderRadius: 4 },
        { label: 'Dépenses', data: ps.map((p) => depenses.filter((d) => d.projetId === p.id).reduce((s, d) => s + (Number(d.montant) || 0), 0)), backgroundColor: AMBER + 'cc', borderRadius: 4 }
      ]
    }
  }, [actifs])

  // ── Top responsables ──────────────────────────────────────────────────────
  const topResp = useMemo(() => {
    const map = {}
    projets.forEach((p) => {
      if (!p.responsable) return
      if (!map[p.responsable]) map[p.responsable] = { projets: 0, termines: 0, enRetard: 0 }
      map[p.responsable].projets++
      if (p.statut === 'termine') map[p.responsable].termines++
      if (projetEnRetard(p)) map[p.responsable].enRetard++
    })
    return Object.entries(map).sort((a, b) => b[1].projets - a[1].projets).slice(0, 5)
  }, [projets])

  // ── Alertes — même source que l'onglet Alertes, ici en simple résumé ────────
  const alertes = useMemo(() => genererAlertes(projets, taches, depenses, seuils), [projets, taches, depenses, seuils])
  const alertesResume = useMemo(() => ({
    critiques:      alertes.filter((a) => ['projet_retard', 'budget_depasse'].includes(a.type)).length,
    avertissements: alertes.filter((a) => ['tache_depassee', 'reste_a_payer', 'tache_retard', 'avancement_zero'].includes(a.type)).length
  }), [alertes])

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }
  }
  const barOpts = {
    ...chartOpts,
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, callback: (v) => v.toLocaleString('fr-FR') } }
    }
  }

  return (
    <div className="space-y-5">
      {/* En-tête DG */}
      <div className="rounded-xl bg-gradient-to-r from-teal-700 to-teal-900 p-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-teal-300">Pilotage & Contrôle</p>
            <h2 className="mt-1 text-2xl font-extrabold">Vue d'ensemble</h2>
            <p className="mt-1 text-sm text-teal-200">{projets.length} projet(s) · {taches.length} tâche(s) · {kpis.responsables} responsable(s)</p>
          </div>
          <div className="text-right text-xs text-teal-300">
            <p>{new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {[
          { id: 'pilotage', label: '📊 Pilotage', sub: 'Vue stratégique' },
          { id: 'controle', label: '🎯 Contrôle',  sub: 'À traiter maintenant', badge: alertesResume.critiques + alertesResume.avertissements }
        ].map((o) => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            className={`relative flex-1 rounded-lg py-2 text-sm font-medium transition-all ${onglet === o.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {o.label}
            {o.badge > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{o.badge}</span>
            )}
          </button>
        ))}
      </div>

      {onglet === 'controle' ? (
        <div className="space-y-5">
          {/* Alertes — résumé ; le détail est désormais poussé par notification aux responsables + direction */}
          <Card>
            <div className="flex items-center gap-3">
              <BellRing size={18} className={alertesResume.critiques ? 'text-red-500' : 'text-amber-500'} />
              <div>
                <p className="text-sm font-bold text-gray-800">
                  {!alertesResume.critiques && !alertesResume.avertissements
                    ? <span className="text-green-600">Tout est sous contrôle</span>
                    : (
                      <>
                        {alertesResume.critiques > 0 && <span className="text-red-600">{alertesResume.critiques} critique{alertesResume.critiques > 1 ? 's' : ''}</span>}
                        {alertesResume.critiques > 0 && alertesResume.avertissements > 0 && ' · '}
                        {alertesResume.avertissements > 0 && <span className="text-amber-600">{alertesResume.avertissements} avertissement{alertesResume.avertissements > 1 ? 's' : ''}</span>}
                      </>
                    )}
                </p>
                <p className="text-xs text-gray-400">Retards, dépassements de budget et de tâches — notifiés au responsable du projet et à la direction.</p>
                <p className="mt-0.5 text-[10px] italic text-gray-400">
                  📐 Critique = projet en retard ou budget global dépassé. Avertissement = tâche en dépassement (&gt; 1000 FCFA), tâche en retard, ou projet actif sans tâche terminée depuis 7 jours.
                </p>
              </div>
            </div>
          </Card>

          {/* Santé des projets actifs */}
          <Card title={<TitreGraphe label="Santé des projets actifs" />}>
            {!actifs.filter((p) => p.statut !== 'termine').length ? (
              <p className="py-8 text-center text-sm text-gray-400">Aucun projet actif.</p>
            ) : (
              <div className="space-y-2">
                {actifs.filter((p) => p.statut !== 'termine').map((p) => (
                  <Sante key={p.id} projet={p} taches={taches} depenses={depenses} />
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : (
      <>
      {/* KPIs stratégiques — chiffres clés (cliquables pour voir le détail) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Budget total" value={formatMoney(kpis.budgetTotal)} icon={Wallet} accent={TEAL}
          sub="cliquer pour la liste" onClick={() => setDetail({ titre: 'Tous les projets', type: 'projets', liste: projets })} />
        <StatCard title="Dépenses"
          value={formatMoney(kpis.depTotal)} icon={TrendingDown} accent={AMBER}
          sub="voir le détail" onClick={() => navigate('/projet/depenses')} />
        <StatCard title="Solde budgétaire"
          value={formatMoney(kpis.ecart)} icon={Wallet} accent={kpis.ecart >= 0 ? GREEN : RED}
          sub={kpis.ecart < 0 ? 'Budget dépassé !' : 'Sous contrôle'} onClick={() => navigate('/projet/depenses')} />
        <StatCard title="Taux de complétion"
          value={`${projets.length ? Math.round((kpis.terminesN / projets.length) * 100) : 0}%`}
          icon={CheckCircle2} accent={GREEN}
          sub={`${kpis.terminesN} / ${projets.length} projets`}
          onClick={() => setDetail({ titre: 'Projets terminés', type: 'projets', liste: kpis.termines })} />
        <StatCard title="Projets en cours" value={kpis.enCoursN} icon={Clock} accent={AMBER}
          sub="cliquer pour la liste" onClick={() => setDetail({ titre: 'Projets en cours', type: 'projets', liste: kpis.enCours })} />
        <StatCard title="Projets en retard" value={kpis.enRetardN} icon={AlertTriangle} accent={RED}
          sub="cliquer pour la liste" onClick={() => setDetail({ titre: 'Projets en retard', type: 'projets', liste: kpis.enRetard })} />
        <StatCard title="Tâches en retard" value={kpis.tRetard} icon={AlertTriangle} accent={RED}
          sub="cliquer pour la liste" onClick={() => setDetail({ titre: 'Tâches en retard', type: 'taches', liste: kpis.tachesRetardListe })} />
        <StatCard title="Responsables actifs" value={kpis.responsables} icon={Users} accent={TEAL}
          sub="cliquer pour la liste" onClick={() => setDetail({ titre: 'Responsables', type: 'responsables', liste: topResp })} />
      </div>

      {/* Jauges synthétiques — indicateurs qualité */}
      <Card title={<TitreGraphe label="Indicateurs de qualité"
        description="Trois angles complémentaires pour évaluer la santé du portefeuille — délais, budget et progression terrain." />}>
        <div className="flex flex-wrap justify-around gap-6 py-2">
          {tauxDelai !== null
            ? <Jauge pct={tauxDelai} color={tauxDelai >= 70 ? GREEN : tauxDelai >= 40 ? AMBER : RED}
                label="Respect des délais" />
            : <Jauge pct={0} color={GRAY} label="Respect des délais" />
          }
          {tauxBudget !== null
            ? <Jauge pct={tauxBudget} color={tauxBudget >= 70 ? GREEN : tauxBudget >= 40 ? AMBER : RED}
                label="Maîtrise du budget" />
            : <Jauge pct={0} color={GRAY} label="Maîtrise du budget" />
          }
          <Jauge pct={tauxAvancement} color={tauxAvancement >= 70 ? GREEN : tauxAvancement >= 40 ? TEAL : AMBER}
            label="Avancement terrain" />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Répartition statuts */}
        <Card title={<TitreGraphe label="Répartition des projets" description="Voir combien de projets sont en planification, en cours, terminés ou annulés." />}>
          {projets.length ? (
            <div className="h-48"><Doughnut data={statutData} options={{ ...chartOpts, cutout: '65%' }} /></div>
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">Aucun projet.</p>
          )}
        </Card>

        {/* Budget vs Dépenses */}
        <Card title={<TitreGraphe label="Budget vs Dépenses par projet" description="Comparer le budget alloué aux dépenses réelles pour chaque projet — détecter les dépassements." />}>
          {budgetData.labels.length ? (
            <div className="h-48"><Bar data={budgetData} options={barOpts} /></div>
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">Aucun budget renseigné.</p>
          )}
        </Card>
      </div>

      {/* Top responsables */}
      <Card title={<TitreGraphe label="Responsables de projets" description="Voir qui gère le plus de projets et identifier les responsables les plus sollicités." />}>
        {!topResp.length ? (
          <p className="py-8 text-center text-sm text-gray-400">Aucun responsable renseigné.</p>
        ) : (
          <div className="space-y-3">
            {topResp.map(([nom, s]) => (
              <div key={nom} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
                  {nom.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-700 truncate">{nom}</p>
                  <p className="text-xs text-gray-400">{s.projets} projet(s) · {s.termines} terminé(s){s.enRetard > 0 ? ` · ${s.enRetard} en retard` : ''}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`text-xs font-bold ${s.enRetard > 0 ? 'text-red-500' : 'text-green-600'}`}>
                    {s.enRetard > 0 ? `⚠ ${s.enRetard}` : '✓ OK'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      </>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.titre || ''}
        panelClassName="bg-gradient-to-br from-teal-200/85 via-teal-100/75 to-emerald-300/75 backdrop-blur-2xl backdrop-saturate-200">
        {detail?.type === 'projets' && (
          !detail.liste.length ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucun projet.</p>
          ) : (
            <div className="space-y-2">
              {detail.liste.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-700">{p.nom}</p>
                    <p className="font-mono text-xs text-gray-400">{p.num}</p>
                    {p.responsable && <p className="text-xs text-gray-400">Resp. {p.responsable}</p>}
                  </div>
                  <Badge tone={STATUTS_PROJET[p.statut]?.tone}>{STATUTS_PROJET[p.statut]?.label || p.statut}</Badge>
                </div>
              ))}
            </div>
          )
        )}
        {detail?.type === 'taches' && (
          !detail.liste.length ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucune tâche en retard.</p>
          ) : (
            <div className="space-y-2">
              {detail.liste.map((t) => {
                const proj = projets.find((p) => p.id === t.projetId)
                return (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-700">{t.titre}</p>
                      <p className="text-xs text-gray-400">{proj?.nom || 'Projet inconnu'}</p>
                    </div>
                    <p className="shrink-0 text-xs font-semibold text-red-500">
                      {t.echeance ? formatDateShort(t.echeance) : '—'}
                    </p>
                  </div>
                )
              })}
            </div>
          )
        )}
        {detail?.type === 'responsables' && (
          !detail.liste.length ? (
            <p className="py-8 text-center text-sm text-gray-400">Aucun responsable renseigné.</p>
          ) : (
            <div className="space-y-2">
              {detail.liste.map(([nom, s]) => (
                <div key={nom} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
                    {nom.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-700 truncate">{nom}</p>
                    <p className="text-xs text-gray-400">{s.projets} projet(s) · {s.termines} terminé(s){s.enRetard > 0 ? ` · ${s.enRetard} en retard` : ''}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-bold ${s.enRetard > 0 ? 'text-red-500' : 'text-green-600'}`}>
                    {s.enRetard > 0 ? `⚠ ${s.enRetard}` : '✓ OK'}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </Modal>
    </div>
  )
}

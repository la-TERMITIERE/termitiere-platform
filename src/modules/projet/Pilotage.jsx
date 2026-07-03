// Pilotage — Vue d'ensemble stratégique pour le Directeur Général.
import '../../utils/chartSetup'
import { useMemo } from 'react'
import { Doughnut, Bar } from 'react-chartjs-2'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock, Wallet, Users, Target } from 'lucide-react'
import InfoBulle from '../../shared/ui/InfoBulle'

const TitreGraphe = ({ label, description }) => (
  <div>
    <span>{label}</span>
    {description && <p className="mt-0.5 text-[11px] font-normal text-gray-400">{description}</p>}
  </div>
)
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { avancementProjet, tachesEnRetard, projetEnRetard } from './logic'
import { STATUTS_PROJET } from './data'

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
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4}
          strokeLinecap="round" style={{ transition: 'stroke-dasharray .5s' }} />
        <text x="44" y="48" textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>{pct}%</text>
      </svg>
      <span className="text-xs text-gray-500 text-center leading-tight">{label}</span>
    </div>
  )
}

// ── Carte KPI ─────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, icon: Icon, color, trend }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 flex items-start gap-3 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: color + '18' }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-extrabold text-gray-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {trend !== undefined && (
        <div className={`ml-auto shrink-0 flex items-center gap-0.5 text-xs font-bold ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {trend >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
  )
}

// ── Indicateur de santé ───────────────────────────────────────────────────────
function Sante({ projet, taches, depenses }) {
  const tp       = taches.filter((t) => t.projetId === projet.id)
  const av       = avancementProjet(tp)
  const retard   = projetEnRetard(projet)
  const budget   = Number(projet.budget) || 0
  const totalDep = depenses
    .filter((d) => d.projetId === projet.id && (d.statut || 'en_attente') === 'approuvee')
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
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3">
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
  const { data: projets }  = useCollection('projets')
  const { data: taches }   = useCollection('projet_taches')
  const { data: depenses } = useCollection('projet_depenses')

  const actifs = useMemo(() => projets.filter((p) => !['annule'].includes(p.statut)), [projets])

  // ── Indicateurs globaux ───────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const enCours   = projets.filter((p) => p.statut === 'en_cours')
    const termines  = projets.filter((p) => p.statut === 'termine')
    const enRetard  = projets.filter((p) => projetEnRetard(p))
    const budgetTotal   = projets.reduce((s, p) => s + (Number(p.budget) || 0), 0)
    const depTotal      = depenses
      .filter((d) => (d.statut || 'en_attente') === 'approuvee')
      .reduce((s, d) => s + (Number(d.montant) || 0), 0)
    const depEnAttente  = depenses
      .filter((d) => (d.statut || 'en_attente') === 'en_attente')
      .reduce((s, d) => s + (Number(d.montant) || 0), 0)
    const tachesTot     = taches.length
    const tachesTermees = taches.filter((t) => t.statut === 'terminee').length
    const tauxGlobal    = tachesTot ? Math.round((tachesTermees / tachesTot) * 100) : 0
    const tRetard       = tachesEnRetard(taches).length
    const responsables  = [...new Set(projets.map((p) => p.responsable).filter(Boolean))].length
    return { enCours: enCours.length, termines: termines.length, enRetard: enRetard.length,
             budgetTotal, depTotal, depEnAttente, ecart: budgetTotal - depTotal, tauxGlobal, tRetard, responsables }
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
    const ok = avecBudget.filter((p) => (Number(p.depenses) || 0) <= Number(p.budget)).length
    return Math.round((ok / avecBudget.length) * 100)
  }, [projets])

  const tauxAvancement = useMemo(() => {
    if (!actifs.length) return 0
    const sum = actifs.reduce((s, p) => s + avancementProjet(taches.filter((t) => t.projetId === p.id)), 0)
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
        { label: 'Dépenses approuvées', data: ps.map((p) => depenses.filter((d) => d.projetId === p.id && (d.statut || 'en_attente') === 'approuvee').reduce((s, d) => s + (Number(d.montant) || 0), 0)), backgroundColor: AMBER + 'cc', borderRadius: 4 }
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

  // ── Projets à risque ─────────────────────────────────────────────────────
  const aRisque = useMemo(() =>
    actifs
      .filter((p) => p.statut !== 'termine' && (
        projetEnRetard(p) ||
        (Number(p.depenses) || 0) > (Number(p.budget) || Infinity) ||
        tachesEnRetard(taches.filter((t) => t.projetId === p.id)).length > 0
      ))
      .slice(0, 5),
  [actifs, taches])

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

      {/* KPIs stratégiques — chiffres clés */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI label={<span className="flex items-center gap-1">Budget total <InfoBulle texte="Somme des budgets prévus de tous les projets." /></span>} value={formatMoney(kpis.budgetTotal)} icon={Wallet} color={TEAL} />
        <KPI label={<span className="flex items-center gap-1">Dépenses approuvées <InfoBulle texte="Somme des dépenses dont le statut est 'Approuvée'. Les dépenses en attente ou rejetées ne sont pas comptées." /></span>}
          value={formatMoney(kpis.depTotal)} icon={TrendingDown} color={AMBER}
          sub={kpis.depEnAttente > 0 ? `+ ${formatMoney(kpis.depEnAttente)} en attente` : 'Tout validé'} />
        <KPI label={<span className="flex items-center gap-1">Solde budgétaire <InfoBulle texte="Budget total − Dépenses approuvées. Négatif = dépassement global sur les dépenses validées." /></span>}
          value={formatMoney(kpis.ecart)} icon={Wallet} color={kpis.ecart >= 0 ? GREEN : RED}
          sub={kpis.ecart < 0 ? 'Budget dépassé !' : 'Sous contrôle'} />
        <KPI label={<span className="flex items-center gap-1">Taux de complétion <InfoBulle texte="Projets terminés ÷ total projets × 100. Mesure combien de projets ont été clôturés." /></span>}
          value={`${projets.length ? Math.round((kpis.termines / projets.length) * 100) : 0}%`}
          icon={CheckCircle2} color={GREEN}
          sub={`${kpis.termines} / ${projets.length} projets`} />
        <KPI label={<span className="flex items-center gap-1">Projets en cours <InfoBulle texte="Projets dont le statut est 'En cours'." /></span>} value={kpis.enCours} icon={Clock} color={AMBER} />
        <KPI label={<span className="flex items-center gap-1">Projets en retard <InfoBulle texte="Projets actifs dont la date de fin prévue est dépassée." /></span>} value={kpis.enRetard} icon={AlertTriangle} color={RED} />
        <KPI label={<span className="flex items-center gap-1">Tâches en retard <InfoBulle texte="Tâches non terminées dont l'échéance est dépassée." /></span>} value={kpis.tRetard} icon={AlertTriangle} color={RED} />
        <KPI label={<span className="flex items-center gap-1">Responsables actifs <InfoBulle texte="Nombre de responsables distincts assignés à au moins un projet." /></span>} value={kpis.responsables} icon={Users} color={TEAL} />
      </div>

      {/* Jauges synthétiques — indicateurs qualité */}
      <Card title={<TitreGraphe label={<span className="flex items-center gap-1">Indicateurs de qualité <InfoBulle texte="Chaque jauge mesure une dimension de la performance : délais, budget, avancement." /></span>} description="Trois angles complémentaires pour évaluer la santé du portefeuille — délais, budget et progression terrain." />}>
        <div className="flex flex-wrap justify-around gap-6 py-2">
          {tauxDelai !== null
            ? <Jauge pct={tauxDelai} color={tauxDelai >= 70 ? GREEN : tauxDelai >= 40 ? AMBER : RED}
                label={<span className="flex items-center gap-1 justify-center">Respect des délais <InfoBulle texte="Projets terminés dans les délais ÷ total projets terminés × 100." /></span>} />
            : <Jauge pct={0} color={GRAY}
                label={<span className="flex items-center gap-1 justify-center">Respect des délais <InfoBulle texte="Disponible dès qu'un projet est terminé." /></span>} />
          }
          {tauxBudget !== null
            ? <Jauge pct={tauxBudget} color={tauxBudget >= 70 ? GREEN : tauxBudget >= 40 ? AMBER : RED}
                label={<span className="flex items-center gap-1 justify-center">Maîtrise du budget <InfoBulle texte="Projets dont les dépenses ne dépassent pas le budget ÷ total projets avec budget × 100." /></span>} />
            : <Jauge pct={0} color={GRAY}
                label={<span className="flex items-center gap-1 justify-center">Maîtrise du budget <InfoBulle texte="Disponible dès qu'un projet a un budget renseigné." /></span>} />
          }
          <Jauge pct={tauxAvancement} color={tauxAvancement >= 70 ? GREEN : tauxAvancement >= 40 ? TEAL : AMBER}
            label={<span className="flex items-center gap-1 justify-center">Avancement terrain <InfoBulle texte="Moyenne des avancements de tous les projets actifs, basée sur les tâches terminées." /></span>} />
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

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Santé des projets actifs */}
        <Card title={<TitreGraphe label="Santé des projets actifs" description="Évaluer rapidement l'état de chaque projet en cours — Sain, Attention ou Critique selon retard et budget." />}>
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
      </div>

      {/* Projets à risque */}
      {aRisque.length > 0 && (
        <Card title={<span className="flex items-center gap-2 text-red-600"><AlertTriangle size={15} />Projets nécessitant une attention immédiate</span>}>
          <div className="space-y-2">
            {aRisque.map((p) => {
              const tp       = taches.filter((t) => t.projetId === p.id)
              const av       = avancementProjet(tp)
              const tRet     = tachesEnRetard(tp).length
              const surBudg  = (Number(p.depenses)||0) > (Number(p.budget)||0) && Number(p.budget) > 0
              const pRet     = projetEnRetard(p)
              return (
                <div key={p.id} className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-red-800 text-sm">{p.nom}</p>
                      <p className="text-xs text-gray-500">Responsable : {p.responsable || '—'} · Fin prévue : {formatDateShort(p.dateFin)}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        {pRet    && <span className="rounded-full bg-red-200 px-2 py-0.5 text-red-700 font-bold">Projet en retard</span>}
                        {surBudg && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-amber-800 font-bold">Budget dépassé</span>}
                        {tRet > 0 && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-700">{tRet} tâche(s) en retard</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-2xl font-extrabold text-red-700">{av}%</p>
                      <p className="text-[10px] text-gray-400">avancement</p>
                    </div>
                  </div>
                  {/* Barre */}
                  <div className="mt-2 rounded-full bg-red-200 h-1.5">
                    <div className="h-1.5 rounded-full bg-red-500 transition-all" style={{ width: `${av}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

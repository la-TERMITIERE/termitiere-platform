// Dashboard Dépenses — budget alloué vs dépensé, par secteur, pour le mois en cours.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Wallet, TrendingDown, Receipt, AlertTriangle, Stamp, BellRing, X, Building2, History } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { setItem } from '../../core/db'
import { depenseRoleEffectif } from '../../core/roles'
import { SECTEURS, MOIS_LABELS, STATUTS_DECAISSEMENT } from './data'
import { totalDepenses, statutBudget, depensesEnCircuit, coutsMatieresBriqueterie, secteursEtSites, visibleDansEDepenses, seuilsBudgetDe, moisTouchesPeriode, dateDansPeriode, budgetSecteurPeriode, depensesEntrepriseSecteurDates } from './logic'
import { formatDateShort, formatMoney, todayStr } from '../../utils/formatters'

const now = new Date()

// Fermer une alerte sur le Dashboard la fait taire jusqu'au LENDEMAIN — une seule
// fermeture suffit (reset automatique) — même mécanique que E-G.Pro.
const REAPPARITION_MS = 2 * 60 * 1000
const MAX_FERMETURES  = 1

function visibiliteAlerte(alerteId, fermetures) {
  const f = fermetures.find((x) => x.id === alerteId)
  if (!f) return true
  if (f.jour !== todayStr()) return true // nouveau jour → on repart de zéro
  if ((f.compteur || 0) >= MAX_FERMETURES) return false // quota atteint → silence jusqu'à demain
  return Date.now() - (f.dernierFermeture || 0) >= REAPPARITION_MS
}

const TYPE_ALERTE = {
  budget_depasse:   { color: 'text-red-600',   bg: 'bg-red-50',   iconBg: 'bg-red-100',   icon: AlertTriangle, label: 'Budget dépassé'  },
  budget_attention: { color: 'text-amber-600', bg: 'bg-amber-50', iconBg: 'bg-amber-100', icon: AlertTriangle, label: 'Budget en alerte' },
  demande:          { color: 'text-amber-600', bg: 'bg-amber-50', iconBg: 'bg-amber-100', icon: Stamp,         label: 'Décaissement à traiter' }
}

export default function Dashboard() {
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: depensesReelles } = useCollection('depense_depenses')
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  const { data: fermeesDashboard } = useCollection('depense_alertes_dashboard_fermees')
  const { data: depenseParams } = useCollection('depense_params')
  // Seuils d'alerte (Attention/Dépassé) configurables en Paramètres — 80%/100% par
  // défaut tant que la direction n'a rien réglé (cf. seuilsBudgetDe).
  const seuils = useMemo(() => seuilsBudgetDe(depenseParams), [depenseParams])
  // Coût matières Briqueterie, inclus en lecture seule — pas de double saisie. Les
  // dépenses de projet (E-G.Pro) n'apparaissent plus ici : elles ne se consultent
  // que depuis E-G.Pro lui-même (cf. Depenses.jsx/SourcesRevenus.jsx pour le détail).
  const depenses = useMemo(() => [
    ...depensesReelles.filter((d) => !d.projetId),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ].filter(visibleDansEDepenses), [depensesReelles, inventairesBriq])
  const { role: roleReel } = useAuth()
  // super_admin/admin/directeur traités comme un agent dans E-DÉPENSES (cf.
  // depenseRoleEffectif) — seuls pau, ge et info gardent l'accès complet ici.
  const role = depenseRoleEffectif(roleReel)
  const navigate = useNavigate()
  // L'agent n'a pas accès aux KPI financiers globaux (budget alloué, secteurs en
  // dépassement) ni au détail des revenus/financement — seulement au total dépensé
  // et au reste, dont il a besoin pour suivre sa propre saisie.
  const restreintAgent = role === 'agent'

  // Période affichée par TOUT le Dashboard (KPI, Répartition par secteur, alertes,
  // Dépenses récentes) — un seul sélecteur dans le bandeau, Jour/Mois/Année/Plage,
  // comme dans les autres modules (cf. FiltrePeriode). Le budget alloué reste une
  // notion mensuelle en interne (moisTouchesPeriode additionne le budget de chaque
  // mois touché par la période choisie — les 12 mois de l'année en mode Année), mais
  // la « consommation » (dépenses) suit, elle, la période exacte.
  const [modePeriode, setModePeriode] = useState('mois')
  const [jourSel, setJourSel] = useState(todayStr())
  const [moisSel, setMoisSel] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [anneeSel, setAnneeSel] = useState(now.getFullYear())
  const [debutSel, setDebutSel] = useState('')
  const [finSel, setFinSel] = useState('')

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
    setItem('depense_alertes_dashboard_fermees', a.id, { id: a.id, compteur, dernierFermeture: Date.now(), jour })
  }

  const changerMois = (delta) => {
    const [a, m] = moisSel.split('-').map(Number)
    let mm = m + delta, aa = a
    if (mm < 1) { mm = 12; aa -= 1 }
    if (mm > 12) { mm = 1; aa += 1 }
    setMoisSel(`${aa}-${String(mm).padStart(2, '0')}`)
  }

  const changerJour = (delta) => {
    const d = jourSel ? new Date(`${jourSel}T00:00:00`) : new Date()
    d.setDate(d.getDate() + delta)
    setJourSel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }

  const changerAnnee = (delta) => setAnneeSel((a) => (Number(a) || now.getFullYear()) + delta)

  const periode = useMemo(() => ({ jour: jourSel, mois: moisSel, annee: anneeSel, debut: debutSel, fin: finSel }), [jourSel, moisSel, anneeSel, debutSel, finSel])
  const moisTouches = useMemo(() => moisTouchesPeriode(modePeriode, periode), [modePeriode, periode])
  const matchDate = useMemo(() => (dateStr) => dateDansPeriode(dateStr, modePeriode, periode), [modePeriode, periode])
  // Mois de référence pour la navigation croisée (ouvrir Recettes & Dépenses sur le bon
  // mois) — le premier mois touché par la période affichée, ou le mois réel à défaut
  // (ex. mode Plage sans dates saisies).
  const periodeRef = useMemo(() => moisTouches[0] || { annee: now.getFullYear(), mois: now.getMonth() + 1 }, [moisTouches])
  const periodeLabel = modePeriode === 'jour'
    ? (jourSel ? formatDateShort(jourSel) : 'Choisir un jour')
    : modePeriode === 'annee'
      ? String(anneeSel)
      : modePeriode === 'plage'
        ? (debutSel || finSel ? `${debutSel ? formatDateShort(debutSel) : '…'} → ${finSel ? formatDateShort(finSel) : '…'}` : 'Choisir une plage')
        : `${MOIS_LABELS[Number(moisSel.split('-')[1]) - 1]} ${moisSel.split('-')[0]}`

  // MAXI BAT (chantiers) est écarté de la répartition par secteur — son budget/suivi
  // vit exclusivement dans le volet BTP d'E-G.Pro.
  const parSecteur = useMemo(() => secteursEtSites(true).map((s) => {
    const alloue = budgetSecteurPeriode(budgets, s.secteurId, moisTouches, s.site)
    const depense = totalDepenses(depensesEntrepriseSecteurDates(depenses, s.secteurId, matchDate, s.site))
    const pct = alloue > 0 ? Math.round((depense / alloue) * 100) : (depense > 0 ? 100 : 0)
    return { ...s, alloue, depense, reste: alloue - depense, pct, statut: statutBudget(pct, seuils) }
  }), [budgets, depenses, moisTouches, matchDate, seuils])

  const totalAlloue = parSecteur.reduce((s, x) => s + x.alloue, 0)
  const totalDepense = parSecteur.reduce((s, x) => s + x.depense, 0)
  const secteursDepasses = parSecteur.filter((x) => x.statut.key === 'depasse').length

  const recentes = useMemo(
    () => depenses.filter((d) => matchDate(d.date)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8),
    [depenses, matchDate]
  )

  // Secteurs en alerte pour la période affichée — directement dérivé de parSecteur
  // (déjà calculé pour la même période), pas besoin d'un second calcul.
  const alertes = useMemo(() => parSecteur.filter((s) => s.statut.key !== 'ok'), [parSecteur])
  const enAttenteCount = useMemo(() => depensesEnCircuit(depenses).length, [depenses])
  // Identifiant stable de la période affichée — sert de clé de dédoublonnage aux
  // alertes fermées (remplace l'ancien `${annee}-${mois}` fixe).
  const periodeKey = modePeriode === 'jour' ? `j_${jourSel}` : modePeriode === 'annee' ? `a_${anneeSel}` : modePeriode === 'plage' ? `p_${debutSel}_${finSel}` : `m_${moisSel}`

  // Alertes unifiées (budget, décaissements en attente) — même présentation/
  // comportement que le widget « Alertes » d'E-G.Pro : une carte, dismiss (✕)
  // avec réapparition après 2 min (5x/jour max), clic → détail. Réservé à
  // l'administration comme le reste des KPI financiers.
  const alertesCard = useMemo(() => {
    const out = []
    alertes.forEach((s) => {
      out.push({
        id: `budget_${s.id}_${periodeKey}`,
        type: s.statut.key === 'depasse' ? 'budget_depasse' : 'budget_attention',
        message: `${s.label} — ${s.pct}% consommé (${formatMoney(s.depense)} / ${formatMoney(s.alloue)})`,
        secteurId: s.id
      })
    })
    if (enAttenteCount > 0) {
      out.push({
        id: 'demandes_decaissement',
        type: 'demande',
        message: `${enAttenteCount} demande${enAttenteCount > 1 ? 's' : ''} en attente d'autorisation`
      })
    }
    return out
  }, [alertes, enAttenteCount, periodeKey])

  const alertesVisibles = useMemo(
    () => alertesCard.filter((a) => visibiliteAlerte(a.id, fermeesDashboard)),
    [alertesCard, fermeesDashboard]
  )

  return (
    <div className="space-y-5">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(180,83,9,0.35),0_8px_20px_-8px_rgba(180,83,9,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(180,83,9,0.85) 0%, rgba(120,53,15,0.8) 100%)' }}>
        {/* Halos décoratifs — même recette que les autres modules (ex. MAXI-GYM). */}
        <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-56 w-56 rounded-full bg-white opacity-[0.12] blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-white opacity-[0.08] blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-3xl bg-gradient-to-b from-white/15 to-transparent" />
        <div className="relative" style={{ flexShrink: 0, width: 64, height: 64 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#B45309', boxShadow: '0 0 0 3px #ffffff, 0 0 14px 4px #ffffff55'
          }}>
            <Wallet size={26} color="white" />
          </div>
        </div>
        <div className="relative min-w-0 flex-1">
          <h2 className="text-lg font-extrabold">Dépenses</h2>
          <p className="truncate text-sm text-white/80">Suivi du budget alloué et des dépenses par secteur</p>
        </div>
        {/* Sélecteur de période — même emplacement (dans le bandeau) que le sélecteur de
            MAXI-GYM, mais avec un choix de mode (Jour/Mois/Année/Plage, comme les
            autres modules — cf. FiltrePeriode) : c'est CE sélecteur qui pilote tout le
            Dashboard (KPI, Répartition par secteur, alertes, Dépenses récentes). */}
        <div className="relative flex w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-white/30 bg-white/15 p-1.5 backdrop-blur-sm sm:ml-auto sm:w-auto sm:justify-start">
          <select value={modePeriode} onChange={(e) => setModePeriode(e.target.value)}
            className="rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/50 [&>option]:text-gray-800">
            <option value="jour">Jour</option>
            <option value="mois">Mois</option>
            <option value="annee">Année</option>
            <option value="plage">Plage</option>
          </select>

          {modePeriode === 'annee' && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => changerAnnee(-1)} className="rounded-xl p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white">
                <ChevronLeft size={16} />
              </button>
              <span className="px-1 text-sm font-bold whitespace-nowrap">{anneeSel}</span>
              <button onClick={() => changerAnnee(1)} className="rounded-xl p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white">
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {modePeriode === 'mois' && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => changerMois(-1)} className="rounded-xl p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white">
                <ChevronLeft size={16} />
              </button>
              <span className="px-1 text-sm font-bold whitespace-nowrap">{periodeLabel}</span>
              <button onClick={() => changerMois(1)} className="rounded-xl p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white">
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {modePeriode === 'jour' && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => changerJour(-1)} className="rounded-xl p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white">
                <ChevronLeft size={16} />
              </button>
              <input type="date" value={jourSel} onChange={(e) => setJourSel(e.target.value)} style={{ colorScheme: 'dark' }}
                className="rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/50" />
              <button onClick={() => changerJour(1)} className="rounded-xl p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white">
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {modePeriode === 'plage' && (
            <div className="flex items-center gap-1">
              <input type="date" value={debutSel} max={finSel || undefined} onChange={(e) => setDebutSel(e.target.value)} style={{ colorScheme: 'dark' }}
                className="rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/50" />
              <span className="text-xs text-white/60">→</span>
              <input type="date" value={finSel} min={debutSel || undefined} onChange={(e) => setFinSel(e.target.value)} style={{ colorScheme: 'dark' }}
                className="rounded-xl border-0 bg-white/20 px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/50" />
            </div>
          )}
        </div>
      </div>

      {/* ── Alertes (budget, décaissements en attente, reconduction) ── */}
      {!restreintAgent && alertesVisibles.length > 0 && (() => {
        const critiques = alertesVisibles.filter((a) => a.type === 'budget_depasse' || a.type === 'demande').length
        return (
          <Card title={
            <span className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${critiques ? 'bg-red-100 text-red-500' : 'bg-amber-100 text-amber-500'}`}>
                <BellRing size={14} />
              </span>
              Alertes
              <span className="ml-auto text-[11px] font-medium text-gray-400">{alertesVisibles.length}</span>
            </span>
          }>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {alertesVisibles.map((a) => {
                const cfg = TYPE_ALERTE[a.type]
                const Icone = cfg.icon
                const onClickAlerte = () => {
                  if (a.type === 'demande') navigate('/depense/autorisations')
                  else navigate('/depense/recettes-depenses', { state: { openSecteurId: a.secteurId, annee: periodeRef.annee, mois: periodeRef.mois } })
                }
                return (
                  <div key={a.id} onClick={onClickAlerte} title="Aller corriger"
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:brightness-95 ${cfg.bg}`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.iconBg} ${cfg.color}`}>
                      <Icone size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{a.message}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); fermerSurDashboard(a) }} title="Masquer 2 min"
                      className="shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-white hover:text-gray-600">
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })()}

      <div className={`grid grid-cols-2 gap-3 ${restreintAgent ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        <StatCard title="Budget alloué" value={formatMoney(totalAlloue)} icon={Receipt} accent="#B45309"
          onClick={restreintAgent ? undefined : () => navigate('/depense/recettes-depenses')} />
        <StatCard title="Total dépensé" value={formatMoney(totalDepense)} icon={TrendingDown} accent="#dc2626"
          onClick={() => navigate('/depense/liste')} />
        <StatCard title="Reste global" value={formatMoney(totalAlloue - totalDepense)} icon={Wallet}
          accent={(totalAlloue - totalDepense) < 0 ? '#dc2626' : '#16a34a'} />
        {!restreintAgent && (
          <StatCard title="Secteurs en dépassement" value={secteursDepasses} icon={AlertTriangle}
            accent={secteursDepasses > 0 ? '#dc2626' : '#16a34a'}
            valueColor={secteursDepasses > 0 ? '#dc2626' : undefined}
            sub={secteursDepasses > 0 ? 'à surveiller' : 'tout va bien'} />
        )}
      </div>

      <Card title={
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Building2 size={14} /></span>
          Répartition par secteur
        </span>
      }>
        <div className="space-y-2.5">
          {parSecteur.map((s) => {
            // Aucun budget alloué : le calcul de % force artificiellement 100% « Dépassé »
            // dès la moindre dépense (0 FCFA alloué), ce qui est trompeur — on distingue ce
            // cas plutôt que d'afficher une fausse alerte de dépassement.
            const sansBudget = s.alloue === 0
            const peutAllouer = !restreintAgent && sansBudget
            return (
              <div key={s.id}
                onClick={peutAllouer ? () => navigate('/depense/recettes-depenses', { state: { openSecteurId: s.id, annee: periodeRef.annee, mois: periodeRef.mois } }) : undefined}
                title={peutAllouer ? 'Cliquer pour allouer un budget à ce secteur' : undefined}
                className={`group rounded-2xl border border-gray-200/60 bg-white/60 p-3.5 shadow-[0_10px_24px_-14px_rgba(26,26,26,0.10)] backdrop-blur-md backdrop-saturate-150 transition-all hover:shadow-[0_18px_36px_-16px_rgba(26,26,26,0.20)] ${peutAllouer ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
                style={{ borderLeft: `4px solid ${s.color}` }}>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${s.color}1a`, color: s.color }}>
                    <Building2 size={15} />
                  </span>
                  <span className="font-bold text-gray-800">{s.label}</span>
                  {sansBudget
                    ? <Badge tone="neutral">Budget non défini</Badge>
                    : <Badge tone={s.statut.tone}>{s.statut.label}</Badge>}
                  <div className="ml-auto text-right text-sm text-gray-500">
                    <strong className="text-gray-800">{formatMoney(s.depense)}</strong>
                    {sansBudget
                      ? <span className="text-gray-400"> / {formatMoney(s.alloue)} alloué</span>
                      : (restreintAgent
                        ? <span className="text-gray-400"> · reste {formatMoney(s.reste)}</span>
                        : <span className="text-gray-400"> / {formatMoney(s.alloue)}</span>)}
                  </div>
                </div>
                {sansBudget ? (
                  <>
                    {/* Ligne discrète : rouge doux (pas le rouge d'alerte plein) quand il y a
                        de la dépense sans budget en face — signale l'avancement sans fausse
                        alarme de « dépassement ». Vide si rien n'a encore été dépensé. */}
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      {s.depense > 0 && <div className="h-1.5 rounded-full bg-red-200" style={{ width: '100%' }} />}
                    </div>
                    <p className="mt-1.5 text-xs italic text-gray-400">
                      {peutAllouer ? 'Aucun budget alloué — cliquez pour en définir un.' : 'Aucun budget alloué pour ce secteur.'}
                    </p>
                  </>
                ) : (
                  <div className="mt-2.5 flex items-center gap-2.5">
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                          s.statut.key === 'depasse' ? 'bg-red-500' : s.statut.key === 'attention' ? 'bg-amber-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.max(Math.min(s.pct, 100), 3)}%` }}
                      />
                      {/* Repère du seuil « Attention » configurable — situe visuellement où
                          bascule la couleur avant même d'atteindre 100%. */}
                      {seuils.attention < 100 && (
                        <span aria-hidden="true" className="absolute top-0 h-full w-px bg-white" style={{ left: `${seuils.attention}%` }} />
                      )}
                    </div>
                    <span className={`w-10 shrink-0 text-right text-xs font-bold tabular-nums ${s.statut.key === 'depasse' ? 'text-red-600' : s.statut.key === 'attention' ? 'text-amber-600' : 'text-green-600'}`}>
                      {s.pct}%
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card title={
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600"><History size={14} /></span>
          Dépenses récentes
        </span>
      }>
        {/* Suit désormais la période choisie dans le bandeau (Jour/Mois/Plage) — plus de
            filtre séparé ici, tout le Dashboard répond au même sélecteur. */}
        {recentes.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune dépense enregistrée sur cette période ({periodeLabel}).</p>
        ) : (
          <div className="space-y-1.5">
            {recentes.map((d) => {
              const secteur = SECTEURS.find((s) => s.id === d.secteurId)
              const statut = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.decaissee
              return (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200/60 bg-white/50 px-3 py-2 text-sm shadow-[0_10px_24px_-14px_rgba(26,26,26,0.10)] backdrop-blur-md backdrop-saturate-150 transition-shadow hover:shadow-[0_14px_30px_-14px_rgba(26,26,26,0.18)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: secteur?.color || '#94a3b8' }} />
                    <span className="font-semibold text-gray-800">{secteur?.label || d.secteurId}</span>
                    <span className="truncate text-xs text-gray-400">{d.description || '—'}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={statut.tone}>{statut.label}</Badge>
                    <span className="text-xs text-gray-400">{formatDateShort(d.date)}</span>
                    <span className="font-semibold text-gray-800">{formatMoney(d.montant)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// Dashboard Dépenses — budget alloué vs dépensé, par secteur, pour le mois en cours.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Wallet, TrendingDown, Receipt, AlertTriangle, Repeat, Stamp, BellRing, X } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { FULL_ACCESS_ROLES, depenseRoleEffectif } from '../../core/roles'
import { SECTEURS, MOIS_LABELS, STATUTS_DECAISSEMENT } from './data'
import { budgetSecteur, depensesEntrepriseSecteurMois, totalDepenses, statutBudget, secteursEnAlerte, moisPrecedent, depensesEnCircuit, coutsMatieresBriqueterie, secteursEtSites } from './logic'
import { formatDateShort, genId, todayStr } from '../../utils/formatters'

const now = new Date()
const REAL_ANNEE = now.getFullYear()
const REAL_MOIS = now.getMonth() + 1

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
  budget_depasse:   { color: 'text-red-600',   ring: 'ring-red-200',   bg: 'bg-red-50/80',   icon: AlertTriangle, label: 'Budget dépassé'  },
  budget_attention: { color: 'text-amber-600', ring: 'ring-amber-200', bg: 'bg-amber-50/80',  icon: AlertTriangle, label: 'Budget en alerte' },
  demande:          { color: 'text-amber-600', ring: 'ring-amber-200', bg: 'bg-amber-50/80',  icon: Stamp,         label: 'Décaissement à traiter' },
  reconduction:     { color: 'text-sky-600',   ring: 'ring-sky-200',   bg: 'bg-sky-50/80',    icon: Repeat,        label: 'Dépense à reconduire' }
}

export default function Dashboard() {
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: depensesReelles } = useCollection('depense_depenses')
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  const { data: fermeesDashboard } = useCollection('depense_alertes_dashboard_fermees')
  // Coût matières Briqueterie, inclus en lecture seule — pas de double saisie. Les
  // dépenses de projet (E-G.Pro) n'apparaissent plus ici : elles ne se consultent
  // que depuis E-G.Pro lui-même (cf. Depenses.jsx/SourcesRevenus.jsx pour le détail).
  const depenses = useMemo(() => [
    ...depensesReelles.filter((d) => !d.projetId),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ].filter((d) => d.secteurId !== 'bat'), [depensesReelles, inventairesBriq])
  const { user, role: roleReel } = useAuth()
  // super_admin/admin/directeur traités comme un agent dans E-DÉPENSES (cf.
  // depenseRoleEffectif) — seuls pau, ge et info gardent l'accès complet ici.
  const role = depenseRoleEffectif(roleReel)
  const navigate = useNavigate()
  // L'agent n'a pas accès aux KPI financiers globaux (budget alloué, secteurs en
  // dépassement) ni au détail des revenus/financement — seulement au total dépensé
  // et au reste, dont il a besoin pour suivre sa propre saisie.
  const restreintAgent = role === 'agent'

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)
  const [reconduisant, setReconduisant] = useState(false)

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
    let m = mois + delta, a = annee
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMois(m); setAnnee(a)
  }

  // MAXI BAT (chantiers) est écarté de la répartition par secteur — son budget/suivi
  // vit exclusivement dans le volet BTP d'E-G.Pro.
  const parSecteur = useMemo(() => secteursEtSites(true).map((s) => {
    const alloue = budgetSecteur(budgets, s.secteurId, annee, mois, s.site)
    const depense = totalDepenses(depensesEntrepriseSecteurMois(depenses, s.secteurId, annee, mois, s.site))
    const pct = alloue > 0 ? Math.round((depense / alloue) * 100) : (depense > 0 ? 100 : 0)
    return { ...s, alloue, depense, reste: alloue - depense, pct, statut: statutBudget(pct) }
  }), [budgets, depenses, annee, mois])

  const totalAlloue = parSecteur.reduce((s, x) => s + x.alloue, 0)
  const totalDepense = parSecteur.reduce((s, x) => s + x.depense, 0)
  const secteursDepasses = parSecteur.filter((x) => x.statut.key === 'depasse').length

  const recentes = useMemo(() => {
    const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
    return depenses.filter((d) => (d.date || '').startsWith(prefixe))
      .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8)
  }, [depenses, annee, mois])

  const alertes = useMemo(() => secteursEnAlerte(budgets, depenses, annee, mois), [budgets, depenses, annee, mois])
  const enAttenteCount = useMemo(() => depensesEnCircuit(depenses).length, [depenses])

  // Reconduction des dépenses récurrentes du mois précédent → uniquement visible sur le mois réel en cours.
  const estMoisCourant = annee === REAL_ANNEE && mois === REAL_MOIS
  const depensesAReconduire = useMemo(() => {
    if (!estMoisCourant) return []
    const prec = moisPrecedent(annee, mois)
    const prefixePrec = `${prec.annee}-${String(prec.mois).padStart(2, '0')}`
    const prefixeCourant = `${annee}-${String(mois).padStart(2, '0')}`
    const recurrentesPrec = depenses.filter((d) => d.recurrente && (d.date || '').startsWith(prefixePrec))
    return recurrentesPrec.filter((d) => !depenses.some((x) =>
      (x.date || '').startsWith(prefixeCourant) && x.secteurId === d.secteurId &&
      x.categorie === d.categorie && Number(x.montant) === Number(d.montant)
    ))
  }, [depenses, annee, mois, estMoisCourant])

  async function reconduireDepenses() {
    if (reconduisant || depensesAReconduire.length === 0) return
    setReconduisant(true)
    try {
      for (const d of depensesAReconduire) {
        const id = genId()
        await setItem('depense_depenses', id, {
          id, secteurId: d.secteurId, site: d.site || null, categorie: d.categorie, montant: d.montant,
          date: todayStr(), description: d.description || '', piece: null,
          recurrente: true, imprevue: false, statut: 'decaissee', enregistrePar: user?.nom || '—', createdAt: Date.now()
        })
      }
      await audit('depense', 'DEPENSE_RECONDUITE', `${depensesAReconduire.length} dépense(s) récurrente(s) reconduite(s)`, { count: depensesAReconduire.length })
      // Réservé à l'administration : des dépenses récurrentes viennent d'être
      // reconduites automatiquement sur le mois en cours.
      const totalReconduit = depensesAReconduire.reduce((s, d) => s + (Number(d.montant) || 0), 0)
      await notify({
        type: 'info', title: `🔁 ${depensesAReconduire.length} dépense(s) récurrente(s) reconduite(s)`,
        body: `${totalReconduit.toLocaleString('fr-FR')} FCFA reconduits sur ${MOIS_LABELS[mois - 1]} ${annee}.`,
        module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid,
        link: '/depense/liste', state: { filtreMois: `${annee}-${String(mois).padStart(2, '0')}` }
      }).catch(() => {})
      toast.success(`${depensesAReconduire.length} dépense(s) reconduite(s) ✓`)
    } finally {
      setReconduisant(false)
    }
  }

  // Alertes unifiées (budget, décaissements en attente, reconduction) — même
  // présentation/comportement que le widget « Alertes » d'E-G.Pro : une carte,
  // dismiss (✕) avec réapparition après 2 min (5x/jour max), clic → détail.
  // Réservé à l'administration comme le reste des KPI financiers.
  const alertesCard = useMemo(() => {
    const out = []
    alertes.forEach((s) => {
      out.push({
        id: `budget_${s.id}_${annee}-${mois}`,
        type: s.statut.key === 'depasse' ? 'budget_depasse' : 'budget_attention',
        message: `${s.label} — ${s.pct}% consommé (${s.depense.toLocaleString('fr-FR')} / ${s.alloue.toLocaleString('fr-FR')} FCFA)`,
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
    if (depensesAReconduire.length > 0) {
      out.push({
        id: 'reconduction',
        type: 'reconduction',
        message: `${depensesAReconduire.length} dépense${depensesAReconduire.length > 1 ? 's' : ''} récurrente${depensesAReconduire.length > 1 ? 's' : ''} à reconduire ce mois-ci`
      })
    }
    return out
  }, [alertes, enAttenteCount, depensesAReconduire, annee, mois])

  const alertesVisibles = useMemo(
    () => alertesCard.filter((a) => visibiliteAlerte(a.id, fermeesDashboard)),
    [alertesCard, fermeesDashboard]
  )

  return (
    <div className="space-y-5">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(180,83,9,0.35),0_8px_20px_-8px_rgba(180,83,9,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(180,83,9,0.85) 0%, rgba(120,53,15,0.8) 100%)' }}>
        <div style={{ position: 'relative', flexShrink: 0, width: 64, height: 64 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#B45309', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55'
          }}>
            <Wallet size={26} color="white" />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Dépenses</h2>
          <p className="text-sm text-white/80">Suivi du budget alloué et des dépenses par secteur</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => changerMois(-1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
          <ChevronLeft size={16} />
        </button>
        <span className="text-lg font-extrabold text-gray-800">{MOIS_LABELS[mois - 1]} {annee}</span>
        <button onClick={() => changerMois(1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Alertes (budget, décaissements en attente, reconduction) ── */}
      {!restreintAgent && alertesVisibles.length > 0 && (() => {
        const critiques = alertesVisibles.filter((a) => a.type === 'budget_depasse' || a.type === 'demande').length
        return (
          <Card title={
            <span className="flex items-center gap-2">
              <BellRing size={15} className={critiques ? 'text-red-500' : 'text-amber-500'} />
              Alertes
              {critiques > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{critiques}</span>}
              <span className="ml-auto text-[11px] font-normal text-gray-400">{alertesVisibles.length} active{alertesVisibles.length > 1 ? 's' : ''}</span>
            </span>
          }>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {alertesVisibles.map((a) => {
                const cfg = TYPE_ALERTE[a.type]
                const Icone = cfg.icon
                const onClickAlerte = () => {
                  if (a.type === 'demande') navigate('/depense/autorisations')
                  else if (a.type === 'reconduction') reconduireDepenses()
                  else navigate('/depense/recettes-depenses', { state: { openSecteurId: a.secteurId, annee, mois } })
                }
                return (
                  <div key={a.id} onClick={onClickAlerte} title={a.type === 'reconduction' ? 'Reconduire maintenant' : 'Aller corriger'}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border border-white/60 px-3 py-2.5 shadow-sm ring-1 backdrop-blur-sm transition-all hover:shadow-md hover:brightness-95 ${cfg.bg} ${cfg.ring}`}>
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
                )
              })}
            </div>
          </Card>
        )
      })()}

      <div className={`grid grid-cols-2 gap-3 ${restreintAgent ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        <StatCard title="Budget alloué" value={`${totalAlloue.toLocaleString('fr-FR')} FCFA`} icon={Receipt} accent="#B45309"
          onClick={restreintAgent ? undefined : () => navigate('/depense/recettes-depenses')} />
        <StatCard title="Total dépensé" value={`${totalDepense.toLocaleString('fr-FR')} FCFA`} icon={TrendingDown} accent="#dc2626"
          onClick={() => navigate('/depense/liste')} />
        <StatCard title="Reste global" value={`${(totalAlloue - totalDepense).toLocaleString('fr-FR')} FCFA`} icon={Wallet}
          accent={(totalAlloue - totalDepense) < 0 ? '#dc2626' : '#16a34a'} />
        {!restreintAgent && (
          <StatCard title="Secteurs en dépassement" value={secteursDepasses} icon={AlertTriangle}
            accent={secteursDepasses > 0 ? '#dc2626' : '#16a34a'}
            valueColor={secteursDepasses > 0 ? '#dc2626' : undefined}
            sub={secteursDepasses > 0 ? 'à surveiller' : 'tout va bien'} />
        )}
      </div>

      <Card title="Répartition par secteur">
        <div className="space-y-2.5">
          {parSecteur.map((s) => {
            // Aucun budget alloué : le calcul de % force artificiellement 100% « Dépassé »
            // dès la moindre dépense (0 FCFA alloué), ce qui est trompeur — on distingue ce
            // cas plutôt que d'afficher une fausse alerte de dépassement.
            const sansBudget = s.alloue === 0
            const peutAllouer = !restreintAgent && sansBudget
            return (
              <div key={s.id}
                onClick={peutAllouer ? () => navigate('/depense/recettes-depenses', { state: { openSecteurId: s.id, annee, mois } }) : undefined}
                title={peutAllouer ? 'Cliquer pour allouer un budget à ce secteur' : undefined}
                className={`rounded-2xl border border-gray-200/60 bg-white/60 p-3.5 shadow-[0_10px_24px_-14px_rgba(26,26,26,0.10)] backdrop-blur-md backdrop-saturate-150 transition-shadow hover:shadow-[0_14px_30px_-14px_rgba(26,26,26,0.18)] ${peutAllouer ? 'cursor-pointer' : ''}`}
                style={{ borderLeft: `4px solid ${s.color}` }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-gray-800">{s.label}</span>
                  {sansBudget
                    ? <Badge tone="neutral">Budget non défini</Badge>
                    : <Badge tone={s.statut.tone}>{s.statut.label}</Badge>}
                  <div className="ml-auto text-right text-sm text-gray-500">
                    <strong className="text-gray-800">{s.depense.toLocaleString('fr-FR')} FCFA</strong>
                    {sansBudget
                      ? <span className="text-gray-400"> / {s.alloue.toLocaleString('fr-FR')} FCFA alloué</span>
                      : (restreintAgent
                        ? <span className="text-gray-400"> · reste {s.reste.toLocaleString('fr-FR')} FCFA</span>
                        : <span className="text-gray-400"> / {s.alloue.toLocaleString('fr-FR')} FCFA</span>)}
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
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-2.5 rounded-full transition-all ${s.statut.key === 'depasse' ? 'bg-red-500' : s.statut.key === 'attention' ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(s.pct, 100)}%` }}
                      />
                    </div>
                    <span className={`w-10 shrink-0 text-right text-xs font-bold ${s.statut.key === 'depasse' ? 'text-red-600' : s.statut.key === 'attention' ? 'text-amber-600' : 'text-green-600'}`}>
                      {s.pct}%
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card title="Dépenses récentes">
        {recentes.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune dépense enregistrée ce mois.</p>
        ) : (
          <div className="space-y-1">
            {recentes.map((d) => {
              const secteur = SECTEURS.find((s) => s.id === d.secteurId)
              const statut = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.decaissee
              return (
                <div key={d.id} className="flex items-center justify-between rounded-2xl border border-gray-200/60 bg-white/50 px-3 py-2 text-sm shadow-[0_10px_24px_-14px_rgba(26,26,26,0.10)] backdrop-blur-md backdrop-saturate-150">
                  <div>
                    <span className="font-semibold">{secteur?.label || d.secteurId}</span>
                    <span className="ml-2 text-xs text-gray-400">{d.description || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={statut.tone}>{statut.label}</Badge>
                    <span className="text-xs text-gray-400">{formatDateShort(d.date)}</span>
                    <span className="font-semibold text-gray-800">{Number(d.montant).toLocaleString('fr-FR')} FCFA</span>
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

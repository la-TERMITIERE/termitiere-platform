// Dashboard Dépenses — budget alloué vs dépensé, par secteur, pour le mois en cours.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Wallet, TrendingDown, Receipt, AlertTriangle, Repeat, Stamp, HeartHandshake, HandCoins, History, BellRing, X, Eye } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useLocation, useNavigate } from 'react-router-dom'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { FULL_ACCESS_ROLES, depenseRoleEffectif } from '../../core/roles'
import { SECTEURS, MOIS_LABELS, STATUTS_DECAISSEMENT, sourceFinancementDefaut } from './data'
import { budgetSecteur, depensesEntrepriseSecteurMois, totalDepenses, statutBudget, secteursEnAlerte, moisPrecedent, depensesEnCircuit, depensesProjetVersSecteurs, coutsMatieresBriqueterie, secteursEtSites } from './logic'
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
  const { data: depensesProjet }  = useCollection('projet_depenses')
  const { data: projetsTous }     = useCollection('projets')
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  const { data: remboursementsPau } = useCollection('depense_pau_remboursements')
  const { data: fermeesDashboard } = useCollection('depense_alertes_dashboard_fermees')
  // Dépenses de E-G.Pro (par secteur) + coût matières Briqueterie, inclus en lecture seule — pas de double saisie.
  // MAXI BAT (chantiers) est exclu : ces dépenses — et les apports du PAU qui les financent —
  // sont réunies exclusivement dans le volet BTP d'E-G.Pro, jamais ici (cf. Depenses.jsx/SourcesRevenus.jsx).
  const depenses = useMemo(() => [
    ...depensesReelles,
    ...depensesProjetVersSecteurs(depensesProjet, projetsTous),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ].filter((d) => d.secteurId !== 'bat'), [depensesReelles, depensesProjet, projetsTous, inventairesBriq])
  const { user, role: roleReel } = useAuth()
  // super_admin/admin/directeur traités comme un agent dans E-DÉPENSES (cf.
  // depenseRoleEffectif) — seuls pau, ge et info gardent l'accès complet ici.
  const role = depenseRoleEffectif(roleReel)
  const navigate = useNavigate()
  const location = useLocation()
  // L'agent n'a pas accès aux KPI financiers globaux (budget alloué, dette PAU, secteurs
  // en dépassement) ni au détail des revenus/financement — seulement au total dépensé et
  // au reste, dont il a besoin pour suivre sa propre saisie.
  const restreintAgent = role === 'agent'

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)
  const [reconduisant, setReconduisant] = useState(false)
  const [remboursement, setRemboursement] = useState(null) // { montant, date, motif } quand le modal est ouvert
  const [rembSaving, setRembSaving] = useState(false)
  const [histoRembOuvert, setHistoRembOuvert] = useState(false)

  // Ouvre directement l'historique des remboursements PAU depuis la notification
  // « Remboursement au PAU » — évite d'avoir à cliquer sur « Historique » soi-même.
  useEffect(() => {
    if (!location.state?.openHistoriqueRemb) return
    setHistoRembOuvert(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state])

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

  // Dette envers le PAU : ce que l'entreprise a reçu de sa poche (apport) MOINS ce qu'elle
  // lui a déjà restitué (remboursements) = ce qu'elle lui doit encore. Lecture seule côté
  // dépenses ; les remboursements, eux, sont une vraie écriture (collection dédiée).
  const financement = useMemo(() => {
    const estPau = (d) => (d.sourceFinancement || sourceFinancementDefaut) === 'pau'
    const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
    const cumulPau = totalDepenses(depenses.filter(estPau))
    const cumulEntreprise = totalDepenses(depenses.filter((d) => !estPau(d)))
    const cumulRembourse = totalDepenses(remboursementsPau)
    const detteNette = cumulPau - cumulRembourse
    const moisPau = totalDepenses(depenses.filter((d) => estPau(d) && (d.date || '').startsWith(prefixe)))
    const moisRembourse = totalDepenses(remboursementsPau.filter((r) => (r.date || '').startsWith(prefixe)))
    const total = cumulPau + cumulEntreprise
    return { cumulPau, cumulEntreprise, cumulRembourse, detteNette, moisPau, moisRembourse, pct: total > 0 ? Math.round((cumulPau / total) * 100) : 0 }
  }, [depenses, remboursementsPau, annee, mois])

  const ouvrirRemboursement = () => setRemboursement({ montant: '', date: todayStr(), motif: '', secteurId: '' })

  async function confirmerRemboursement() {
    if (!remboursement) return
    const montant = Number(remboursement.montant)
    if (!remboursement.montant || montant <= 0) return toast.error('Montant requis')
    if (montant > financement.detteNette) return toast.error(`Le montant dépasse la dette restante (${financement.detteNette.toLocaleString('fr-FR')} FCFA)`)
    if (!remboursement.date) return toast.error('Date requise')
    if (!remboursement.secteurId) return toast.error('Secteur requis — le PAU avait financé une dépense d\'un secteur précis')
    setRembSaving(true)
    try {
      const id = genId()
      const secteurLabel = SECTEURS.find((s) => s.id === remboursement.secteurId)?.label || remboursement.secteurId
      await setItem('depense_pau_remboursements', id, {
        id, montant, date: remboursement.date, motif: remboursement.motif.trim(), secteurId: remboursement.secteurId,
        enregistrePar: user?.nom || user?.login || '—', createdAt: Date.now()
      })
      await audit('depense', 'PAU_REMBOURSEMENT', `${montant.toLocaleString('fr-FR')} FCFA remboursés au PAU — ${secteurLabel}${remboursement.motif ? ' — ' + remboursement.motif.trim() : ''}`, { montant, date: remboursement.date, secteurId: remboursement.secteurId })
      // Réservé à l'administration : mouvement de restitution d'une dette envers le PAU.
      await notify({
        type: 'info', title: `💜 Remboursement au PAU — ${secteurLabel}`,
        body: `${montant.toLocaleString('fr-FR')} FCFA restitués${remboursement.motif ? ' — ' + remboursement.motif.trim() : ''}.`,
        module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid,
        link: '/depense', state: { openHistoriqueRemb: true }
      }).catch(() => {})
      toast.success('Remboursement enregistré ✓ — budget crédité pour ' + secteurLabel)
      setRemboursement(null)
    } finally {
      setRembSaving(false)
    }
  }

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

      {/* Dette envers le PAU : ce que l'entreprise a reçu de sa poche (apport) et lui doit
          encore restituer. Le remboursement réduit la dette nette — traçabilité complète. */}
      {!restreintAgent && financement.cumulPau > 0 && (() => {
        const pctRestitue = financement.cumulPau > 0 ? Math.min(100, Math.round((financement.cumulRembourse / financement.cumulPau) * 100)) : 0
        return (
        <div className="rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50/80 via-purple-50/60 to-violet-50/40 px-4 py-4 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 shadow-[0_4px_10px_-2px_rgba(124,58,237,0.5)]">
              <HeartHandshake size={16} className="text-white" />
            </div>
            <p className="font-bold text-violet-900">Dette envers le PAU</p>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-violet-700 shadow-sm">{financement.pct}% du financement total</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => navigate('/depense/liste', { state: { filtreSource: 'pau' } })}
                title="Voir sur quoi le PAU a mis son argent"
                className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-violet-600 shadow-sm hover:bg-violet-50">
                <Eye size={12} /> Voir le détail
              </button>
              {financement.cumulRembourse > 0 && (
                <button onClick={() => setHistoRembOuvert((o) => !o)}
                  className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-violet-600 shadow-sm hover:bg-violet-50">
                  <History size={12} /> Historique
                </button>
              )}
              {financement.detteNette > 0 && (
                <button onClick={ouvrirRemboursement}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-[0_4px_12px_-2px_rgba(124,58,237,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-violet-700 hover:shadow-[0_7px_18px_-4px_rgba(124,58,237,0.7)]">
                  <HandCoins size={14} /> Rembourser
                </button>
              )}
            </div>
          </div>

          {/* Dette nette — l'info la plus importante, mise en avant, avec la barre
              de restitution intégrée juste en dessous pour lire les deux d'un coup. */}
          <div onClick={() => navigate('/depense/liste', { state: { filtreSource: 'pau' } })}
            title="Voir sur quoi le PAU a mis son argent"
            className="mt-3 cursor-pointer rounded-xl bg-white/80 px-3.5 py-3 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">Dette restante (à restituer)</p>
                <p className={`text-lg font-extrabold leading-snug ${financement.detteNette > 0 ? 'text-violet-800' : 'text-green-700'}`}>
                  {financement.detteNette.toLocaleString('fr-FR')} <span className="text-xs font-semibold text-violet-400">FCFA</span>
                  {financement.detteNette === 0 && <span className="ml-2 text-xs font-bold text-green-600">✓ Soldée</span>}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">{pctRestitue}% restitué</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-100">
              <div className="h-1.5 rounded-full bg-gradient-to-r from-green-400 to-green-600 transition-all" style={{ width: `${pctRestitue}%` }} />
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400">
              Basé sur la « Source de financement » de chaque dépense + les remboursements enregistrés.
            </p>
          </div>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-xl bg-white/70 p-3">
              <div className="flex items-center gap-1.5 text-violet-500">
                <HandCoins size={13} />
                <p className="text-[10px] font-semibold uppercase tracking-wide">Apporté (cumulé)</p>
              </div>
              <p className="mt-1 text-base font-bold text-violet-800">{financement.cumulPau.toLocaleString('fr-FR')} FCFA</p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <div className="flex items-center gap-1.5 text-green-600">
                <History size={13} />
                <p className="text-[10px] font-semibold uppercase tracking-wide">Déjà remboursé (cumulé)</p>
              </div>
              <p className="mt-1 text-base font-bold text-green-700">{financement.cumulRembourse.toLocaleString('fr-FR')} FCFA</p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Wallet size={13} />
                <p className="text-[10px] font-semibold uppercase tracking-wide">Fonds propres (cumulé)</p>
              </div>
              <p className="mt-1 text-base font-bold text-gray-700">{financement.cumulEntreprise.toLocaleString('fr-FR')} FCFA</p>
            </div>
          </div>

          {histoRembOuvert && remboursementsPau.length > 0 && (
            <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-xl bg-white/70 p-2">
              {[...remboursementsPau].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-sm">
                  <div className="min-w-0">
                    <span className="font-bold text-gray-800">{Number(r.montant).toLocaleString('fr-FR')} FCFA</span>
                    {r.secteurId && <span className="ml-2 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">{SECTEURS.find((s) => s.id === r.secteurId)?.label || r.secteurId}</span>}
                    {r.motif && <span className="ml-2 truncate text-gray-500">{r.motif}</span>}
                  </div>
                  <span className="shrink-0 text-[10px] text-gray-400">{formatDateShort(r.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        )
      })()}

      {/* Modal enregistrement d'un remboursement au PAU */}
      <Modal open={!!remboursement} onClose={() => setRemboursement(null)} size="sm" title="Rembourser le PAU"
        panelClassName="bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-300/75 backdrop-blur-2xl backdrop-saturate-200"
        footer={<><Button variant="outline" onClick={() => setRemboursement(null)} disabled={rembSaving}>Annuler</Button><Button onClick={confirmerRemboursement} loading={rembSaving}>Enregistrer</Button></>}>
        {remboursement && (
          <div className="space-y-3">
            <p className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs text-violet-700">
              Dette restante : <strong>{financement.detteNette.toLocaleString('fr-FR')} FCFA</strong>
            </p>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Montant remboursé (FCFA) <span className="text-red-500">*</span></label>
              <input type="number" min="0" max={financement.detteNette}
                value={remboursement.montant} onChange={(e) => setRemboursement((r) => ({ ...r, montant: e.target.value }))}
                placeholder="0" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Date <span className="text-red-500">*</span></label>
              <input type="date" value={remboursement.date} onChange={(e) => setRemboursement((r) => ({ ...r, date: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Secteur concerné <span className="text-red-500">*</span></label>
              <select value={remboursement.secteurId} onChange={(e) => setRemboursement((r) => ({ ...r, secteurId: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                <option value="">— Choisir le secteur dont l'apport du PAU est remboursé —</option>
                {SECTEURS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-gray-400">Le montant remboursé crédite le budget consommé de ce secteur (il ne compte plus contre son budget alloué).</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Motif / précision</label>
              <input value={remboursement.motif} onChange={(e) => setRemboursement((r) => ({ ...r, motif: e.target.value }))}
                placeholder="ex : Remboursement partiel sur trésorerie du mois"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>
        )}
      </Modal>

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

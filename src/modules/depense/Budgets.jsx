// Allocation du budget mensuel par secteur.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Wallet, TrendingDown, PiggyBank, History } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isReadOnlyRole } from '../../core/roles'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { genId, formatDateTime } from '../../utils/formatters'
import { SECTEURS, MOIS_LABELS } from './data'
import { budgetSecteur, depensesSecteurMois, totalDepenses, statutBudget, depensesProjetVersSecteurs, coutsMatieresBriqueterie } from './logic'

const now = new Date()
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')

export default function Budgets() {
  const { data: budgets }         = useCollection('depense_budgets')
  const { data: depensesReelles } = useCollection('depense_depenses')
  const { data: depensesProjet }  = useCollection('projet_depenses')
  const { data: projetsTous }     = useCollection('projets')
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  const { user, role } = useAuth()
  const lectureSeule = isReadOnlyRole(role)

  // « Dépensé » aligné sur le reste du module : dépenses saisies + E-G.Pro + Briqueterie.
  const depenses = useMemo(() => [
    ...depensesReelles,
    ...depensesProjetVersSecteurs(depensesProjet, projetsTous),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ], [depensesReelles, depensesProjet, projetsTous, inventairesBriq])

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)

  const changerMois = (delta) => {
    let m = mois + delta, a = annee
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMois(m); setAnnee(a)
  }

  // Révision du budget d'un secteur — garde une trace (ancien/nouveau/motif) au lieu
  // d'écraser silencieusement la valeur, comme pour le budget projet dans E-G.Pro.
  const [revision, setRevision]     = useState(null) // { id, secteurId, secteurLabel, montantActuel, revisions }
  const [revMontant, setRevMontant] = useState('')
  const [revMotif, setRevMotif]     = useState('')
  const [revSaving, setRevSaving]   = useState(false)

  // Données calculées par secteur (dépensé, %, statut, historique de révisions).
  const parSecteur = useMemo(() => SECTEURS.map((s) => {
    const id = `${s.id}_${annee}-${String(mois).padStart(2, '0')}`
    const doc = budgets.find((b) => b.id === id)
    const alloue = budgetSecteur(budgets, s.id, annee, mois)
    const depense = totalDepenses(depensesSecteurMois(depenses, s.id, annee, mois))
    const pct = alloue > 0 ? Math.round((depense / alloue) * 100) : (depense > 0 ? 100 : 0)
    return { ...s, id, alloue, depense, pct, statut: statutBudget(pct), revisions: doc?.revisions || [] }
  }), [budgets, depenses, annee, mois])

  const totalAlloue  = parSecteur.reduce((s, x) => s + x.alloue, 0)
  const totalDepense = parSecteur.reduce((s, x) => s + x.depense, 0)
  const totalReste   = totalAlloue - totalDepense
  const pctGlobal    = totalAlloue > 0 ? Math.round((totalDepense / totalAlloue) * 100) : 0

  const ouvrirRevision = (s) => {
    setRevision({ id: s.id, secteurId: s.id, secteurLabel: s.label, montantActuel: s.alloue, revisions: s.revisions })
    setRevMontant(String(s.alloue || ''))
    setRevMotif('')
  }

  const confirmerRevision = async () => {
    if (!revision) return
    const nouveau = Number(revMontant)
    if (revMontant === '' || nouveau < 0) return toast.error('Montant requis')
    if (!revMotif.trim()) return toast.error('Motif requis')
    setRevSaving(true)
    try {
      const ancien = revision.montantActuel
      const entry = { id: genId(), ancien, nouveau, motif: revMotif.trim(), date: Date.now(), auteur: user?.nom || user?.login || '—' }
      const revisions = [...revision.revisions, entry]
      await setItem('depense_budgets', revision.id, {
        id: revision.id, secteurId: revision.secteurId, annee, mois, montant: nouveau, revisions, updatedAt: Date.now()
      })
      await audit('depense', 'BUDGET_REVISE', `${revision.secteurLabel} — ${fmt(ancien)} → ${fmt(nouveau)} FCFA (${revMotif.trim()})`, { secteurId: revision.secteurId, annee, mois, ancien, nouveau })
      toast.success('Budget révisé ✓')
      setRevision(null)
    } finally {
      setRevSaving(false)
    }
  }

  const badgePct = (statut) => statut.key === 'depasse' ? 'bg-red-100 text-red-700'
    : statut.key === 'attention' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
  const barColor = (statut) => statut.key === 'depasse' ? 'bg-red-500'
    : statut.key === 'attention' ? 'bg-amber-500' : 'bg-teal-500'

  return (
    <div className="space-y-5">
      {/* Navigation mois */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => changerMois(-1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronLeft size={16} /></button>
        <span className="text-lg font-extrabold text-gray-800">{MOIS_LABELS[mois - 1]} {annee}</span>
        <button onClick={() => changerMois(1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronRight size={16} /></button>
      </div>

      {/* Résumé du mois — KPI standard (StatCard, comme les autres modules) */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Total alloué" value={`${fmt(totalAlloue)} FCFA`} icon={Wallet} accent="#B45309" />
        <StatCard title="Total dépensé" value={`${fmt(totalDepense)} FCFA`} sub={`${pctGlobal}% du budget consommé`} icon={TrendingDown} accent="#dc2626" />
        <StatCard title="Reste global" value={`${fmt(totalReste)} FCFA`} sub={totalReste < 0 ? '⚠ Budget global dépassé' : 'Disponible ce mois'}
          icon={PiggyBank} accent={totalReste < 0 ? '#dc2626' : '#16a34a'} valueColor={totalReste < 0 ? '#dc2626' : '#16a34a'} />
      </div>

      {/* Allocation par secteur */}
      <div className="space-y-2.5">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Allocation par secteur — {MOIS_LABELS[mois - 1]} {annee}</p>
        {parSecteur.map((s) => {
          const reste = s.alloue - s.depense
          return (
            <div key={s.id} className="rounded-2xl border-l-4 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-gray-100 transition-shadow hover:shadow-[0_8px_20px_-8px_rgba(180,83,9,0.18)]" style={{ borderLeftColor: s.color }}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* Secteur */}
                <div className="flex min-w-[150px] items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="font-bold text-gray-800">{s.label}</span>
                </div>

                {/* Budget alloué (lecture) + révision */}
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-gray-400">Budget alloué</p>
                    <p className="text-sm font-bold text-gray-800">{s.alloue > 0 ? `${fmt(s.alloue)} FCFA` : <span className="font-normal text-gray-300">Non défini</span>}</p>
                  </div>
                  {!lectureSeule && (
                    <button onClick={() => ouvrirRevision(s)}
                      title={s.alloue > 0 ? "Réviser ce budget (revoir ou ajouter une somme)" : "Allouer un budget à ce secteur"}
                      className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 shadow-sm transition-all duration-200 hover:bg-amber-50 hover:shadow-[0_0_14px_2px_rgba(180,83,9,0.55)]">
                      {s.alloue > 0 ? '🔄 Réviser' : '+ Allouer'}
                    </button>
                  )}
                  {s.revisions.length > 0 && (
                    <button onClick={() => ouvrirRevision(s)} title="Voir l'historique des révisions"
                      className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500 hover:bg-gray-200">
                      <History size={11} /> {s.revisions.length}
                    </button>
                  )}
                </div>

                {/* Consommation */}
                <div className="ml-auto flex items-center gap-3 text-xs">
                  <span className="text-gray-500">Dépensé <b className="text-amber-600">{fmt(s.depense)}</b></span>
                  <span className="text-gray-500">Reste <b className={reste < 0 ? 'text-red-600' : 'text-green-600'}>{fmt(reste)}</b></span>
                  <span className={`rounded-full px-2 py-0.5 font-bold ${badgePct(s.statut)}`}>{s.pct}%</span>
                </div>
              </div>

              {/* Barre de consommation */}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-1.5 rounded-full transition-all ${barColor(s.statut)}`} style={{ width: `${Math.min(100, s.pct)}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Révision du budget d'un secteur */}
      <Modal open={!!revision} onClose={() => setRevision(null)} size="sm"
        title={revision ? `Réviser le budget — ${revision.secteurLabel}` : 'Réviser le budget'}
        panelClassName="bg-gradient-to-br from-amber-200/85 via-amber-100/75 to-orange-300/75 backdrop-blur-2xl backdrop-saturate-200">
        {revision && (
          <div className="space-y-4">
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-gray-400">Budget actuel</p>
                  <p className="text-sm font-bold text-gray-700">{fmt(revision.montantActuel)} FCFA</p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Nouveau montant (FCFA)</label>
                  <input type="number" min="0" value={revMontant} onChange={(e) => setRevMontant(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="0" />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-[10px] font-semibold uppercase text-gray-400">Motif de la révision</label>
                <input value={revMotif} onChange={(e) => setRevMotif(e.target.value)}
                  placeholder="ex : Ajustement suite à hausse des prix, apport supplémentaire du PAU…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={confirmerRevision} loading={revSaving}>Confirmer la révision</Button>
              </div>
            </div>

            {revision.revisions.length > 0 && (
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-gray-400"><History size={12} /> Historique des révisions</p>
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {[...revision.revisions].reverse().map((r) => (
                    <div key={r.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs">
                      <p className="font-semibold text-gray-700">{fmt(r.ancien)} → {fmt(r.nouveau)} FCFA</p>
                      <p className="mt-0.5 text-gray-600">{r.motif}</p>
                      <p className="mt-0.5 text-[10px] text-gray-400">par {r.auteur || '—'} · {formatDateTime(r.date)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

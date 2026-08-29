// Analyses Dépenses — budget vs dépensé par secteur, répartition par catégorie.
import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { ChevronLeft, ChevronRight, Wallet, HeartHandshake } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { SECTEURS, MOIS_LABELS, sourceFinancementDefaut } from './data'
import { budgetSecteur, depensesSecteurMois, totalDepenses, derniersMois, depensesNatureMois, natureFlux, depensesProjetVersSecteurs, coutsMatieresBriqueterie } from './logic'
import { revenuSecteur, SECTEURS_AVEC_REVENU } from './revenus'
import { depenseRoleEffectif } from '../../core/roles'

const now = new Date()
const PALETTE = ['#B45309', '#059669', '#dc2626', '#d97706', '#0284c7', '#7c3aed', '#E8390E', '#0d9488', '#BC3C31']

export default function Analyses() {
  const navigate = useNavigate()
  const { role: roleReel } = useAuth()
  // super_admin/admin/directeur traités comme un agent dans E-DÉPENSES (cf.
  // depenseRoleEffectif) — seuls pau, ge et info gardent l'accès complet ici.
  const role = depenseRoleEffectif(roleReel)
  // L'agent voit l'onglet (suivi de ses propres dépenses) mais pas les figures
  // financières réservées à l'administration : revenus, dette/apports du PAU,
  // budget alloué par secteur — même restriction que le Dashboard.
  const restreintAgent = role === 'agent'
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: depensesReelles } = useCollection('depense_depenses')
  const { data: depensesProjet }  = useCollection('projet_depenses')
  const { data: projetsTous }     = useCollection('projets')
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  const { data: remboursementsPau } = useCollection('depense_pau_remboursements')
  const { data: paiementsGarderie }    = useCollection('garderie_paiements')
  const { data: facturesAgro }         = useCollection('agro_factures')
  const { data: facturesLogistique }   = useCollection('logistique_factures')
  const { data: facturesEvenementiel } = useCollection('evenementiel_factures')
  // Dépenses de E-G.Pro (par secteur) + coût matières Briqueterie, inclus en lecture seule — pas de double saisie.
  // MAXI BAT (chantiers) est exclu : ces dépenses — et les apports du PAU qui les financent —
  // sont réunies exclusivement dans le volet BTP d'E-G.Pro, jamais ici.
  const depenses = useMemo(() => [
    ...depensesReelles,
    ...depensesProjetVersSecteurs(depensesProjet, projetsTous),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ].filter((d) => d.secteurId !== 'bat'), [depensesReelles, depensesProjet, projetsTous, inventairesBriq])
  const collections = { paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel }

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)

  const changerMois = (delta) => {
    let m = mois + delta, a = annee
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMois(m); setAnnee(a)
  }

  // Reste à payer (engagé) : dépenses approuvées ou en attente, pas encore décaissées.
  // Chiffre réel et global (indépendant du mois affiché) — récupéré de l'ancien Prévisionnel.
  const resteAPayer = useMemo(
    () => totalDepenses(depenses.filter((d) => d.statut === 'approuvee' || d.statut === 'en_attente')),
    [depenses]
  )

  // MAXI BAT est écarté ici aussi — son suivi budgétaire vit dans le volet BTP d'E-G.Pro.
  const parSecteur = useMemo(() => SECTEURS.filter((s) => s.id !== 'bat').map((s) => {
    const listeMois = depensesSecteurMois(depenses, s.id, annee, mois)
    return {
      ...s,
      alloue:  budgetSecteur(budgets, s.id, annee, mois),
      depense: totalDepenses(listeMois),
      depExpl: totalDepenses(listeMois.filter((d) => natureFlux(d) === 'exploitation')),
      depInv:  totalDepenses(listeMois.filter((d) => natureFlux(d) === 'investissement'))
    }
  }), [budgets, depenses, annee, mois])

  const depensesDuMois = useMemo(() => {
    const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
    return depenses.filter((d) => (d.date || '').startsWith(prefixe))
  }, [depenses, annee, mois])

  const parCategorie = useMemo(() => {
    const categories = [...new Set(depensesDuMois.map((d) => d.categorie).filter(Boolean))]
    return categories
      .map((label) => ({ label, total: totalDepenses(depensesDuMois.filter((d) => d.categorie === label)) }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [depensesDuMois])

  // Par secteur : 3 barres côte à côte — Budget alloué (cible) · Dépenses courantes ·
  // Investissements — pour comparer directement les trois montants d'un même secteur.
  // L'agent n'a pas droit au budget alloué (figure réservée à l'administration) : le
  // dataset correspondant est simplement omis pour lui, les 2 autres restent utiles.
  const barData = {
    labels: parSecteur.map((s) => s.label),
    datasets: [
      ...(restreintAgent ? [] : [{ label: 'Budget alloué', data: parSecteur.map((s) => s.alloue), backgroundColor: 'rgba(148,163,184,0.55)', borderColor: '#64748b', borderWidth: 1, borderRadius: 6 }]),
      { label: 'Dépenses courantes', data: parSecteur.map((s) => s.depExpl), backgroundColor: 'rgba(220,38,38,0.65)', borderColor: '#dc2626', borderWidth: 1, borderRadius: 6 },
      { label: 'Investissements', data: parSecteur.map((s) => s.depInv), backgroundColor: 'rgba(180,83,9,0.6)', borderColor: '#B45309', borderWidth: 1, borderRadius: 6 }
    ]
  }

  const barOptions = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${Number(ctx.parsed.y).toLocaleString('fr-FR')} FCFA` } } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { callback: (v) => Number(v).toLocaleString('fr-FR') } }
    }
  }

  const totalCategories = parCategorie.reduce((s, c) => s + c.total, 0)

  const doughnutData = {
    labels: parCategorie.map((c) => c.label),
    datasets: [{ data: parCategorie.map((c) => c.total), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }]
  }

  const doughnutOptions = {
    responsive: true, maintainAspectRatio: false, cutout: '62%',
    plugins: {
      legend: { display: false }, // remplacé par la liste chiffrée à côté
      tooltip: { callbacks: { label: (ctx) => {
        const pctRaw = totalCategories > 0 ? (ctx.parsed / totalCategories) * 100 : 0
        const pctLabel = pctRaw > 0 && pctRaw < 1 ? '<1%' : `${Math.round(pctRaw)}%`
        return `${ctx.label} : ${Number(ctx.parsed).toLocaleString('fr-FR')} FCFA (${pctLabel})`
      } } }
    }
  }

  // Tendance sur les 6 derniers mois — revenus réels vs dépenses, tous secteurs confondus.
  // Les dépenses sont séparées par nature (fonctionnement courant vs investissements de projet)
  // pour que les gros investissements ponctuels n'écrasent pas la lecture du récurrent.
  const tendance = useMemo(() => derniersMois(6, MOIS_LABELS).map(({ annee: a, mois: m, label }) => {
    const revenu = SECTEURS_AVEC_REVENU.reduce((s, id) => s + revenuSecteur(collections, id, a, m), 0)
    const depExploitation   = totalDepenses(depensesNatureMois(depenses, 'exploitation', a, m))
    const depInvestissement = totalDepenses(depensesNatureMois(depenses, 'investissement', a, m))
    return { label, revenu, depExploitation, depInvestissement }
  }), [depenses, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel])

  const lineData = {
    labels: tendance.map((t) => t.label),
    datasets: [
      // Revenus réservés à l'administration — omis pour l'agent.
      ...(restreintAgent ? [] : [{ label: 'Revenus', data: tendance.map((t) => t.revenu), borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.12)', tension: 0.3, fill: true, borderWidth: 3, pointRadius: 3, pointBackgroundColor: '#059669' }]),
      { label: 'Dépenses courantes', data: tendance.map((t) => t.depExploitation), borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.08)', tension: 0.3, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#dc2626' },
      { label: 'Investissements (projets)', data: tendance.map((t) => t.depInvestissement), borderColor: '#B45309', backgroundColor: 'rgba(180,83,9,0.06)', tension: 0.3, borderWidth: 2, borderDash: [6, 4], pointRadius: 3, pointBackgroundColor: '#B45309' }
    ]
  }

  const lineOptions = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${Number(ctx.parsed.y).toLocaleString('fr-FR')} FCFA` } } },
    scales: { y: { beginAtZero: true, ticks: { callback: (v) => Number(v).toLocaleString('fr-FR') } }, x: { grid: { display: false } } }
  }

  // ── Dette envers le PAU : ce que le promoteur a injecté de sa poche (apport), diminué de
  // ce qui lui a déjà été restitué (remboursements) = dette nette encore due. Cumul réel
  // depuis le début, à chaque mois. Basé sur la « Source de financement » de chaque dépense
  // + la collection dédiée des remboursements (lecture seule, n'affecte aucun budget).
  const estPau = (d) => (d.sourceFinancement || sourceFinancementDefaut) === 'pau'
  const financementPau = useMemo(() => {
    const cumulPau = totalDepenses(depenses.filter(estPau))
    const cumulEntreprise = totalDepenses(depenses.filter((d) => !estPau(d)))
    const cumulRembourse = totalDepenses(remboursementsPau)
    const detteNette = cumulPau - cumulRembourse
    const total = cumulPau + cumulEntreprise
    return { cumulPau, cumulEntreprise, cumulRembourse, detteNette, pct: total > 0 ? Math.round((cumulPau / total) * 100) : 0 }
  }, [depenses, remboursementsPau])

  const tendancePau = useMemo(() => derniersMois(6, MOIS_LABELS).map(({ annee: a, mois: m, label }) => {
    const fin = `${a}-${String(m).padStart(2, '0')}`
    const cumulPau = totalDepenses(depenses.filter((d) => estPau(d) && (d.date || '').slice(0, 7) <= fin))
    const cumulRembourse = totalDepenses(remboursementsPau.filter((r) => (r.date || '').slice(0, 7) <= fin))
    return { label, cumulPau, cumulRembourse, detteNette: cumulPau - cumulRembourse }
  }), [depenses, remboursementsPau])

  const pauChartData = {
    labels: tendancePau.map((t) => t.label),
    datasets: [
      { label: 'Apporté (cumulé)', data: tendancePau.map((t) => t.cumulPau), borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.06)', tension: 0.3, borderWidth: 2, borderDash: [6, 4], pointRadius: 3, pointBackgroundColor: '#7c3aed' },
      { label: 'Remboursé (cumulé)', data: tendancePau.map((t) => t.cumulRembourse), borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.06)', tension: 0.3, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#059669' },
      { label: 'Dette nette restante', data: tendancePau.map((t) => t.detteNette), borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.12)', tension: 0.3, fill: true, borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#dc2626', pointBorderColor: '#fff', pointBorderWidth: 2 }
    ]
  }

  const pauChartOptions = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${Number(ctx.parsed.y).toLocaleString('fr-FR')} FCFA` } } },
    scales: { y: { beginAtZero: true, ticks: { callback: (v) => Number(v).toLocaleString('fr-FR') } }, x: { grid: { display: false } } }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Reste à payer (engagé)"
          value={`${resteAPayer.toLocaleString('fr-FR')} FCFA`}
          sub="Approuvé / en attente, non décaissé"
          icon={Wallet} accent="#d97706" />
        {!restreintAgent && (
          <StatCard title="Dette envers le PAU"
            value={`${financementPau.detteNette.toLocaleString('fr-FR')} FCFA`}
            sub={financementPau.cumulPau === 0 ? 'Aucun apport enregistré' : financementPau.detteNette === 0 ? '✓ Soldée' : `${financementPau.cumulRembourse.toLocaleString('fr-FR')} FCFA déjà restitués`}
            icon={HeartHandshake} accent={financementPau.detteNette > 0 ? '#7c3aed' : '#059669'}
            onClick={financementPau.cumulPau === 0 ? undefined : () => navigate('/depense/liste', { state: { filtreSource: 'pau' } })} />
        )}
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

      <Card title={restreintAgent ? 'Tendance sur 6 mois — dépenses (tous secteurs)' : 'Tendance sur 6 mois — revenus vs dépenses (tous secteurs)'}>
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
          {!restreintAgent && (
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#059669' }} /> Revenus réellement encaissés/facturés</span>
          )}
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#dc2626' }} /> Dépenses courantes (fonctionnement)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#B45309' }} /> Investissements (projets, ponctuels)</span>
        </div>
        <div style={{ height: 280 }}>
          <Line data={lineData} options={lineOptions} />
        </div>
      </Card>

      {!restreintAgent && (
        <Card title="Dette envers le PAU — évolution sur 6 mois">
          {financementPau.cumulPau === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              Aucun apport du PAU enregistré. Marquez une dépense « Apport du PAU » à la saisie pour le suivre ici.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-200/60 bg-violet-50/50 px-3 py-2 text-xs">
                <span className="font-bold text-violet-900">Dette restante : {financementPau.detteNette.toLocaleString('fr-FR')} FCFA</span>
                <span className="text-gray-500">— Apporté {financementPau.cumulPau.toLocaleString('fr-FR')} · Remboursé {financementPau.cumulRembourse.toLocaleString('fr-FR')}</span>
                <span className="ml-auto rounded-full bg-white px-2.5 py-0.5 font-bold text-violet-700 shadow-sm">{financementPau.pct}% du financement total</span>
              </div>
              <div style={{ height: 280 }}>
                <Line data={pauChartData} options={pauChartOptions} />
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                Cumul depuis le début, tous secteurs confondus. La dette diminue à mesure des remboursements enregistrés (Dashboard) — traçabilité pure, n'affecte pas les budgets.
              </p>
            </>
          )}
        </Card>
      )}

      <Card title={restreintAgent ? `Dépenses par secteur — ${MOIS_LABELS[mois - 1]} ${annee}` : `Budget vs dépenses par secteur — ${MOIS_LABELS[mois - 1]} ${annee}`}>
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
          {!restreintAgent && (
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#94a3b8' }} /> Budget alloué (cible)</span>
          )}
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#dc2626' }} /> Dépenses courantes</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#B45309' }} /> Investissements (projets)</span>
        </div>
        <div style={{ height: 320 }}>
          <Bar data={barData} options={barOptions} />
        </div>
      </Card>

      <Card title={`Répartition des dépenses par catégorie — ${MOIS_LABELS[mois - 1]} ${annee}`}>
        {parCategorie.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Aucune dépense enregistrée ce mois.</p>
        ) : (
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <div style={{ height: 240, width: 240, flexShrink: 0 }}>
              <Doughnut data={doughnutData} options={doughnutOptions} />
            </div>
            <div className="w-full space-y-1.5">
              {parCategorie.map((c, i) => {
                const pctRaw = totalCategories > 0 ? (c.total / totalCategories) * 100 : 0
                // Part réelle mais < 1 % → « <1% » plutôt que « 0% » (qui laisse croire à rien).
                const pctLabel = pctRaw > 0 && pctRaw < 1 ? '<1%' : `${Math.round(pctRaw)}%`
                return (
                  <div key={c.label} className="flex items-center gap-2 text-sm">
                    <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="font-medium text-gray-700">{c.label}</span>
                    <span className="ml-auto font-mono text-gray-500">{c.total.toLocaleString('fr-FR')} FCFA</span>
                    <span className="w-12 text-right font-bold text-gray-800">{pctLabel}</span>
                  </div>
                )
              })}
              <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2 text-sm font-bold">
                <span className="text-gray-700">Total</span>
                <span className="ml-auto font-mono text-gray-900">{totalCategories.toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

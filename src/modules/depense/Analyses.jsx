// Analyses Dépenses — budget vs dépensé par secteur, répartition par catégorie, et
// rentabilité (revenu réalisé vs dépense décaissée, marge par secteur — fusionné
// depuis l'ancien écran « Rentabilité », réservé comme lui à l'administration).
import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { ChevronLeft, ChevronRight, Wallet, TrendingUp, TrendingDown, FileSpreadsheet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { exportRapportExcel } from '../../utils/excelReport'
import { SECTEURS, MOIS_LABELS } from './data'
import { budgetSecteur, depensesSecteurMois, depensesEntrepriseSecteurMois, totalDepenses, derniersMois, depensesNatureMois, natureFlux, coutsMatieresBriqueterie, versementsClientVersSecteurs, visibleDansEDepenses } from './logic'
import { revenuSecteur, SECTEURS_AVEC_REVENU } from './revenus'
import { depenseRoleEffectif } from '../../core/roles'

const now = new Date()
const PALETTE = ['#B45309', '#059669', '#dc2626', '#d97706', '#0284c7', '#7c3aed', '#E8390E', '#0d9488', '#BC3C31']
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')

export default function Analyses() {
  const { role: roleReel } = useAuth()
  // super_admin/admin/directeur traités comme un agent dans E-DÉPENSES (cf.
  // depenseRoleEffectif) — seuls pau, ge et info gardent l'accès complet ici.
  const role = depenseRoleEffectif(roleReel)
  // L'agent voit l'onglet (suivi de ses propres dépenses) mais pas les figures
  // financières réservées à l'administration : revenus, budget alloué par secteur,
  // rentabilité/marge — même restriction que le Dashboard (et que l'ancien écran
  // « Rentabilité », qui n'était pas accessible du tout à l'agent).
  const restreintAgent = role === 'agent'
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: depensesReelles } = useCollection('depense_depenses')
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  const { data: paiementsGarderie }    = useCollection('garderie_paiements')
  const { data: facturesAgro }         = useCollection('agro_factures')
  const { data: facturesLogistique }   = useCollection('logistique_factures')
  const { data: facturesEvenementiel } = useCollection('evenementiel_factures')
  const { data: projetsTous }          = useCollection('projets')
  const { data: versementsClientTous } = useCollection('projet_versements_client')
  const { data: revenusManuelsTous }   = useCollection('depense_revenus_manuels')
  // Coût matières Briqueterie, inclus en lecture seule — pas de double saisie. Tout ce
  // qui vient d'E-G.Pro (repérable à son `projetId`) n'apparaît plus ici — ça ne se
  // consulte que depuis E-G.Pro lui-même (dette/apports du PAU y compris).
  const depenses = useMemo(() => [
    ...depensesReelles.filter((d) => !d.projetId),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ].filter(visibleDansEDepenses), [depensesReelles, inventairesBriq])
  const collections = { paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel }

  // Versements clients des projets E-G.Pro, routés par secteur — comptés en revenu
  // (utilisé par la section Rentabilité ci-dessous).
  const versementsClientRoutes = useMemo(() => versementsClientVersSecteurs(versementsClientTous, projetsTous),
    [versementsClientTous, projetsTous])

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
  // depensesEntrepriseSecteurMois (pas depensesSecteurMois) pour que la comparaison
  // avec le « Budget alloué » reste cohérente : une dépense payée depuis la Caisse
  // commune (cf. Depenses.jsx) ne doit pas faire paraître ce secteur en dépassement.
  const parSecteur = useMemo(() => SECTEURS.filter((s) => s.id !== 'bat').map((s) => {
    const listeMois = depensesEntrepriseSecteurMois(depenses, s.id, annee, mois)
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

  // ── Rentabilité : revenu réellement réalisé vs dépense décaissée, marge par secteur
  // (fusionné depuis l'ancien écran « Rentabilité »). Réservé à l'administration.
  const secteursRentabilite = useMemo(() => SECTEURS
    .filter((s) => s.id !== 'bat')
    .map((s) => {
      const revenu = revenuSecteur(collections, s.id, annee, mois, versementsClientRoutes, revenusManuelsTous)
      const depense = totalDepenses(depensesSecteurMois(depenses, s.id, annee, mois))
      const marge = revenu - depense
      const margePct = revenu > 0 ? Math.round((marge / revenu) * 100) : null
      return { ...s, revenu, depense, marge, margePct }
    })
    .sort((a, b) => b.marge - a.marge),
  [depenses, versementsClientRoutes, revenusManuelsTous, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel, annee, mois])

  const totalRevenuRentab  = secteursRentabilite.reduce((s, x) => s + x.revenu, 0)
  const totalDepenseRentab = secteursRentabilite.reduce((s, x) => s + x.depense, 0)
  const margeGlobale       = totalRevenuRentab - totalDepenseRentab

  const barDataRentab = {
    labels: secteursRentabilite.map((s) => s.label),
    datasets: [
      { label: 'Revenu réalisé',     data: secteursRentabilite.map((s) => s.revenu),  backgroundColor: '#05966933', borderColor: '#059669', borderWidth: 1, borderRadius: 6 },
      { label: 'Dépense décaissée',  data: secteursRentabilite.map((s) => s.depense), backgroundColor: '#dc262699', borderColor: '#dc2626', borderWidth: 1, borderRadius: 6 }
    ]
  }

  function exportRentabiliteXLSX() {
    const rows = secteursRentabilite.map((s) => ({
      Secteur: s.label,
      'Revenu réalisé (FCFA)': s.revenu,
      'Dépense décaissée (FCFA)': s.depense,
      'Marge (FCFA)': s.marge,
      'Marge (%)': s.margePct === null ? '—' : `${s.margePct}%`
    }))
    exportRapportExcel({
      filename: `rentabilite-${annee}-${String(mois).padStart(2, '0')}.xlsx`,
      sections: [{
        id: 'rentabilite', name: 'Rentabilité', title: 'Revenus vs Dépenses par secteur',
        subtitle: `${MOIS_LABELS[mois - 1]} ${annee}`,
        columns: [
          { key: 'Secteur', label: 'Secteur', width: 22 },
          { key: 'Revenu réalisé (FCFA)', label: 'Revenu réalisé (FCFA)', width: 20 },
          { key: 'Dépense décaissée (FCFA)', label: 'Dépense décaissée (FCFA)', width: 22 },
          { key: 'Marge (FCFA)', label: 'Marge (FCFA)', width: 18 },
          { key: 'Marge (%)', label: 'Marge (%)', width: 12 }
        ],
        rows
      }]
    })
  }

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
    interaction: { mode: 'index', intersect: false },
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
    interaction: { mode: 'index', intersect: false },
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
          <>
            <StatCard title="Revenu réalisé (mois)" value={`${fmt(totalRevenuRentab)} FCFA`} icon={TrendingUp} accent="#059669" />
            <StatCard title="Dépense décaissée (mois)" value={`${fmt(totalDepenseRentab)} FCFA`} icon={TrendingDown} accent="#dc2626" />
            <StatCard title="Marge globale (mois)" value={`${fmt(margeGlobale)} FCFA`}
              icon={margeGlobale >= 0 ? TrendingUp : TrendingDown} accent={margeGlobale >= 0 ? '#059669' : '#dc2626'} />
          </>
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
        {!restreintAgent && (
          <Button variant="outline" className="ml-auto" onClick={exportRentabiliteXLSX}><FileSpreadsheet size={16} /> Export Excel rentabilité</Button>
        )}
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
        <>
          <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
            Rentabilité : compare le revenu de chaque secteur (paiements garderie, factures certifiées MAXI-AGRO, factures MAXI Logistique et Briqueterie) à sa dépense <strong>décaissée</strong> du même mois. Les secteurs sans facturation propre ce mois-là affichent un revenu à 0.
          </div>

          <Card title={`Revenu vs dépense par secteur — ${MOIS_LABELS[mois - 1]} ${annee}`}>
            <div style={{ height: 320 }}>
              <Bar data={barDataRentab} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }} />
            </div>
          </Card>
        </>
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

      {!restreintAgent && (
        <Card title="Détail de la rentabilité par secteur" className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Secteur</th>
                <th className="px-3 py-2 text-right">Revenu réalisé</th>
                <th className="px-3 py-2 text-right">Dépense décaissée</th>
                <th className="px-3 py-2 text-right">Marge</th>
                <th className="px-3 py-2 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {secteursRentabilite.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-semibold text-gray-800">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-green-700">{fmt(s.revenu)}</td>
                  <td className="px-3 py-2 text-right font-mono text-red-700">{fmt(s.depense)}</td>
                  <td className={`px-3 py-2 text-right font-mono font-bold ${s.marge >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {s.marge >= 0 ? '+' : ''}{fmt(s.marge)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.margePct === null
                      ? <Badge tone="neutral">Pas de revenu</Badge>
                      : <Badge tone={s.marge >= 0 ? 'success' : 'danger'}>{s.margePct >= 0 ? '+' : ''}{s.margePct}%</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!restreintAgent && (
        <p className="text-center text-xs text-gray-400">
          Pour la tendance de la marge sur 6 mois, voir <strong>Flux de trésorerie</strong> — le solde d'exploitation et le solde global y équivalent exactement à la marge courante et à la marge totale ci-dessus.
        </p>
      )}
    </div>
  )
}

// Rentabilité — croise le revenu réellement réalisé (garderie, agro, logistique, briqueterie)
// avec la dépense décaissée du même secteur/mois. Lecture seule, aucune écriture croisée.
import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, FileSpreadsheet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { exportRapportExcel } from '../../utils/excelReport'
import { SECTEURS, MOIS_LABELS } from './data'
import { depensesSecteurMois, totalDepenses, derniersMois, depensesNatureMois, depensesProjetVersSecteurs, coutsMatieresBriqueterie } from './logic'
import { revenuSecteur, SECTEURS_AVEC_REVENU } from './revenus'

const now = new Date()
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')

export default function Rentabilite() {
  const { data: depensesReelles }     = useCollection('depense_depenses')
  const { data: depensesProjet }      = useCollection('projet_depenses')
  const { data: projetsTous }         = useCollection('projets')
  const { data: inventairesBriq }     = useCollection('evenementiel_inventaires')
  const { data: paiementsGarderie }   = useCollection('garderie_paiements')
  const { data: facturesAgro }        = useCollection('agro_factures')
  const { data: facturesLogistique }  = useCollection('logistique_factures')
  const { data: facturesEvenementiel }= useCollection('evenementiel_factures')

  // Comme Dashboard/Analyses/Flux : on inclut les dépenses de chantier E-G.Pro et le coût
  // des matières Briqueterie pour que la marge par secteur reflète toutes les dépenses réelles.
  const depenses = useMemo(() => [
    ...depensesReelles,
    ...depensesProjetVersSecteurs(depensesProjet, projetsTous),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ], [depensesReelles, depensesProjet, projetsTous, inventairesBriq])

  const collections = { paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel }

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)

  const changerMois = (delta) => {
    let m = mois + delta, a = annee
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMois(m); setAnnee(a)
  }

  const secteurs = useMemo(() => SECTEURS
    .filter((s) => SECTEURS_AVEC_REVENU.includes(s.id))
    .map((s) => {
      const revenu = revenuSecteur(collections, s.id, annee, mois)
      const depense = totalDepenses(depensesSecteurMois(depenses, s.id, annee, mois))
      const marge = revenu - depense
      const margePct = revenu > 0 ? Math.round((marge / revenu) * 100) : null
      return { ...s, revenu, depense, marge, margePct }
    })
    .sort((a, b) => b.marge - a.marge),
  [depenses, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel, annee, mois])

  const totalRevenu  = secteurs.reduce((s, x) => s + x.revenu, 0)
  const totalDepense = secteurs.reduce((s, x) => s + x.depense, 0)
  const margeGlobale = totalRevenu - totalDepense

  const barData = {
    labels: secteurs.map((s) => s.label),
    datasets: [
      { label: 'Revenu réalisé',     data: secteurs.map((s) => s.revenu),  backgroundColor: '#05966933', borderColor: '#059669', borderWidth: 1, borderRadius: 6 },
      { label: 'Dépense décaissée',  data: secteurs.map((s) => s.depense), backgroundColor: '#dc262699', borderColor: '#dc2626', borderWidth: 1, borderRadius: 6 }
    ]
  }

  // Deux marges pour ne pas confondre rentabilité du fonctionnement et poids des investissements :
  //  • Marge courante = revenu − dépenses de fonctionnement (nature « Exploitation ») → vraie rentabilité récurrente ;
  //  • Marge totale   = revenu − TOUTES les dépenses (investissements de projet compris) → plonge quand un gros chantier tombe.
  const tendance = useMemo(() => derniersMois(6, MOIS_LABELS).map(({ annee: a, mois: m, label }) => {
    const revenu      = SECTEURS_AVEC_REVENU.reduce((s, id) => s + revenuSecteur(collections, id, a, m), 0)
    const depTotale   = SECTEURS.reduce((s, sec) => s + totalDepenses(depensesSecteurMois(depenses, sec.id, a, m)), 0)
    const depCourante = totalDepenses(depensesNatureMois(depenses, 'exploitation', a, m))
    return { label, revenu, margeCourante: revenu - depCourante, margeTotale: revenu - depTotale }
  }), [depenses, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel])

  const lineData = {
    labels: tendance.map((t) => t.label),
    datasets: [
      { label: 'Revenu', data: tendance.map((t) => t.revenu), borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.12)', tension: 0.3, fill: true, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#059669' },
      { label: 'Marge courante (hors investissements)', data: tendance.map((t) => t.margeCourante), borderColor: '#B45309', backgroundColor: 'rgba(180,83,9,0.06)', tension: 0.3, borderWidth: 3, pointRadius: 3, pointBackgroundColor: '#B45309' },
      { label: 'Marge totale (investissements compris)', data: tendance.map((t) => t.margeTotale), borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.06)', tension: 0.3, borderWidth: 2, borderDash: [6, 4], pointRadius: 3, pointBackgroundColor: '#dc2626' }
    ]
  }

  const lineOptions = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${Number(ctx.parsed.y).toLocaleString('fr-FR')} FCFA` } } },
    scales: {
      y: { beginAtZero: false, ticks: { callback: (v) => Number(v).toLocaleString('fr-FR') }, grid: { color: (c) => (c.tick.value === 0 ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.05)') } },
      x: { grid: { display: false } }
    }
  }

  function exportXLSX() {
    const rows = secteurs.map((s) => ({
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => changerMois(-1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
          <ChevronLeft size={16} />
        </button>
        <span className="text-lg font-extrabold text-gray-800">{MOIS_LABELS[mois - 1]} {annee}</span>
        <button onClick={() => changerMois(1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
          <ChevronRight size={16} />
        </button>
        <Button variant="outline" className="ml-auto" onClick={exportXLSX}><FileSpreadsheet size={16} /> Export Excel</Button>
      </div>

      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
        Compare le revenu <strong>réellement encaissé/facturé</strong> de chaque secteur (paiements garderie, factures certifiées MAXI-AGRO, factures MAXI Logistique et Briqueterie) à sa dépense <strong>décaissée</strong> du même mois. Foncier, Comptabilité, E-G.Pro et Direction n'ont pas de revenu propre suivi dans l'application — ils n'apparaissent pas ici.
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Revenu total réalisé" value={`${fmt(totalRevenu)} FCFA`} icon={TrendingUp} accent="#059669" />
        <StatCard title="Dépense totale décaissée" value={`${fmt(totalDepense)} FCFA`} icon={TrendingDown} accent="#dc2626" />
        <StatCard
          title="Marge globale"
          value={`${fmt(margeGlobale)} FCFA`}
          icon={margeGlobale >= 0 ? TrendingUp : TrendingDown}
          accent={margeGlobale >= 0 ? '#059669' : '#dc2626'}
        />
      </div>

      <Card title="Revenu vs dépense par secteur">
        <div style={{ height: 320 }}>
          <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }} />
        </div>
      </Card>

      <Card title="Détail par secteur" className="overflow-x-auto p-0">
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
            {secteurs.map((s) => (
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

      <Card title="Tendance sur 6 mois — revenu & marges (courante vs totale)">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#059669' }} /> Revenu réel</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#B45309' }} /> Marge courante = revenu − charges de fonctionnement (hors investissements)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#dc2626' }} /> Marge totale = revenu − toutes les dépenses (investissements compris)</span>
        </div>
        <div style={{ height: 280 }}>
          <Line data={lineData} options={lineOptions} />
        </div>
      </Card>
    </div>
  )
}

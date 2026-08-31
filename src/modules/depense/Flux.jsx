// Flux de trésorerie — solde par nature de flux (exploitation / investissement / perte),
// croisé avec les revenus réels des autres modules. Lecture seule, aucune écriture croisée.
import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { Chart } from 'react-chartjs-2'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, FileSpreadsheet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import InfoBulle from '../../shared/ui/InfoBulle'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { exportRapportExcel } from '../../utils/excelReport'
import { MOIS_LABELS, NATURES_FLUX } from './data'
import { soldesFluxMois, croissance, derniersMois, moisPrecedent, coutsMatieresBriqueterie } from './logic'
import { revenuSecteur, SECTEURS_AVEC_REVENU } from './revenus'

const now = new Date()
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')

export default function Flux() {
  const { data: depensesReelles }      = useCollection('depense_depenses')
  const { data: inventairesBriq }      = useCollection('evenementiel_inventaires')
  const { data: paiementsGarderie }    = useCollection('garderie_paiements')
  const { data: facturesAgro }         = useCollection('agro_factures')
  const { data: facturesLogistique }   = useCollection('logistique_factures')
  const { data: facturesEvenementiel } = useCollection('evenementiel_factures')

  // Coût matières Briqueterie, inclus en lecture seule — pas de double saisie. Les
  // dépenses de projet (E-G.Pro) n'apparaissent plus ici — elles ne se consultent
  // que depuis E-G.Pro lui-même. MAXI BAT reste exclu (volet BTP d'E-G.Pro).
  const depenses = useMemo(() => [
    ...depensesReelles.filter((d) => !d.projetId),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ].filter((d) => d.secteurId !== 'bat'), [depensesReelles, inventairesBriq])

  const collections = { paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel }

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)

  const changerMois = (delta) => {
    let m = mois + delta, a = annee
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMois(m); setAnnee(a)
  }

  const revenuMois = (a, m) => SECTEURS_AVEC_REVENU.reduce((s, id) => s + revenuSecteur(collections, id, a, m), 0)

  const solde = useMemo(() => soldesFluxMois(depenses, revenuMois(annee, mois), annee, mois),
    [depenses, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel, annee, mois])

  const { annee: aPrec, mois: mPrec } = moisPrecedent(annee, mois)
  const soldePrecedent = useMemo(() => soldesFluxMois(depenses, revenuMois(aPrec, mPrec), aPrec, mPrec),
    [depenses, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel, aPrec, mPrec])

  const tauxCroissance = croissance(solde.soldeGlobal, soldePrecedent.soldeGlobal)

  const tendance = useMemo(() => derniersMois(6, MOIS_LABELS).map(({ annee: a, mois: m, label }) => {
    const s = soldesFluxMois(depenses, revenuMois(a, m), a, m)
    return { label, ...s }
  }), [depenses, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel])

  // Barres = solde de chaque nature (exploitation / investissement / perte), ligne = solde global.
  // Le zéro accentué sépare visuellement gain (au-dessus) et sortie (en-dessous).
  const chartData = {
    labels: tendance.map((t) => t.label),
    datasets: [
      { type: 'line', label: 'Solde global', data: tendance.map((t) => t.soldeGlobal), borderColor: '#334155', backgroundColor: 'rgba(51,65,85,0.05)', borderWidth: 3, borderDash: [6, 4], tension: 0.35, pointRadius: 3, pointBackgroundColor: '#334155', order: 0, fill: false },
      { type: 'bar', label: 'Exploitation',   data: tendance.map((t) => t.soldeExploitation),   backgroundColor: 'rgba(13,148,136,0.6)', borderColor: '#0d9488', borderWidth: 1, borderRadius: 4, order: 1 },
      { type: 'bar', label: 'Investissement', data: tendance.map((t) => t.soldeInvestissement), backgroundColor: 'rgba(217,119,6,0.55)', borderColor: '#d97706', borderWidth: 1, borderRadius: 4, order: 1 },
      { type: 'bar', label: 'Pertes',         data: tendance.map((t) => t.soldePerte),          backgroundColor: 'rgba(220,38,38,0.55)', borderColor: '#dc2626', borderWidth: 1, borderRadius: 4, order: 1 }
    ]
  }

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} : ${Number(ctx.parsed.y).toLocaleString('fr-FR')} FCFA` } } },
    scales: {
      y: { beginAtZero: false, ticks: { callback: (v) => Number(v).toLocaleString('fr-FR') }, grid: { color: (c) => (c.tick.value === 0 ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.05)') } },
      x: { grid: { display: false } }
    }
  }

  function exportXLSX() {
    exportRapportExcel({
      filename: `flux-tresorerie-${annee}-${String(mois).padStart(2, '0')}.xlsx`,
      sections: [{
        id: 'flux', name: 'Flux de trésorerie', title: 'Solde de trésorerie par nature de flux',
        subtitle: `${MOIS_LABELS[mois - 1]} ${annee}`,
        columns: [
          { key: 'Nature', label: 'Nature', width: 22 },
          { key: 'Entrées (FCFA)', label: 'Entrées (FCFA)', width: 18 },
          { key: 'Sorties (FCFA)', label: 'Sorties (FCFA)', width: 18 },
          { key: 'Solde (FCFA)', label: 'Solde (FCFA)', width: 18 }
        ],
        rows: [
          { Nature: 'Exploitation',   'Entrées (FCFA)': solde.revenuExploitation, 'Sorties (FCFA)': solde.depExploitation,   'Solde (FCFA)': solde.soldeExploitation },
          { Nature: 'Investissement', 'Entrées (FCFA)': 0,                        'Sorties (FCFA)': solde.depInvestissement, 'Solde (FCFA)': solde.soldeInvestissement },
          { Nature: 'Pertes',         'Entrées (FCFA)': 0,                        'Sorties (FCFA)': solde.depPerte,          'Solde (FCFA)': solde.soldePerte },
          { Nature: 'Solde global',   'Entrées (FCFA)': solde.revenuExploitation, 'Sorties (FCFA)': solde.depExploitation + solde.depInvestissement + solde.depPerte, 'Solde (FCFA)': solde.soldeGlobal }
        ]
      }]
    })
  }

  const IconCroissance = tauxCroissance === null ? Minus : tauxCroissance >= 0 ? TrendingUp : TrendingDown
  const couleurCroissance = tauxCroissance === null ? '#94a3b8' : tauxCroissance >= 0 ? '#059669' : '#dc2626'

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
        Chaque dépense décaissée est classée par <strong>nature de flux</strong> (Exploitation, Investissement ou Perte — voir l'onglet Dépenses). Le solde d'exploitation compare cette dépense au revenu réel du mois ; investissement et pertes sont des sorties pures, sans revenu suivi en face.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={<span className="flex items-center gap-1">Solde d'exploitation <InfoBulle texte="Revenus réels du mois − dépenses classées Exploitation." /></span>}
          value={`${fmt(solde.soldeExploitation)} FCFA`} icon={solde.soldeExploitation >= 0 ? TrendingUp : TrendingDown}
          sub={`Revenus ${fmt(solde.revenuExploitation)} − Charges ${fmt(solde.depExploitation)}`}
          accent={solde.soldeExploitation >= 0 ? '#0d9488' : '#dc2626'} />
        <StatCard
          title={<span className="flex items-center gap-1">Solde d'investissement <InfoBulle texte="− dépenses classées Investissement (achat d'actif durable)." /></span>}
          value={`${fmt(solde.soldeInvestissement)} FCFA`} icon={TrendingDown}
          sub={`Décaissé : ${fmt(solde.depInvestissement)} FCFA`} accent="#d97706" />
        <StatCard
          title={<span className="flex items-center gap-1">Pertes <InfoBulle texte="− dépenses classées Perte (argent perdu sans contrepartie)." /></span>}
          value={`${fmt(solde.soldePerte)} FCFA`} icon={TrendingDown}
          sub={`Décaissé : ${fmt(solde.depPerte)} FCFA`} accent="#dc2626" />
        <StatCard
          title={<span className="flex items-center gap-1">Solde global <InfoBulle texte="Exploitation + Investissement + Pertes." /></span>}
          value={`${fmt(solde.soldeGlobal)} FCFA`} icon={solde.soldeGlobal >= 0 ? TrendingUp : TrendingDown}
          sub={`Revenus ${fmt(solde.revenuExploitation)} − Sorties ${fmt(solde.depExploitation + solde.depInvestissement + solde.depPerte)}`}
          accent={solde.soldeGlobal >= 0 ? '#B45309' : '#dc2626'} />
      </div>

      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: couleurCroissance + '18' }}>
            <IconCroissance size={20} style={{ color: couleurCroissance }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">
              Croissance du solde global vs {MOIS_LABELS[mPrec - 1]} {aPrec}
              <InfoBulle texte="(Solde global de ce mois − solde global du mois précédent) ÷ |solde précédent| × 100." className="ml-1" />
            </p>
            <p className="text-xl font-extrabold" style={{ color: couleurCroissance }}>
              {tauxCroissance === null ? 'Non calculable (solde précédent nul)' : `${tauxCroissance >= 0 ? '+' : ''}${tauxCroissance}%`}
            </p>
          </div>
        </div>
      </Card>

      <Card title={`Entrées vs sorties — ${MOIS_LABELS[mois - 1]} ${annee}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-green-100 bg-green-50/40 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-green-700">💰 Entrées</p>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-600">Revenus réels du mois</span>
              <span className="font-mono font-semibold text-green-700">{fmt(solde.revenuExploitation)} FCFA</span>
            </div>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50/40 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">📤 Sorties</p>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between"><span className="text-gray-600">Fonctionnement (exploitation)</span><span className="font-mono">{fmt(solde.depExploitation)}</span></div>
              <div className="flex items-center justify-between"><span className="text-gray-600">Investissements</span><span className="font-mono">{fmt(solde.depInvestissement)}</span></div>
              <div className="flex items-center justify-between"><span className="text-gray-600">Pertes</span><span className="font-mono">{fmt(solde.depPerte)}</span></div>
              <div className="flex items-center justify-between border-t border-red-100 pt-1 font-bold"><span className="text-gray-700">Total sorties</span><span className="font-mono text-red-700">{fmt(solde.depExploitation + solde.depInvestissement + solde.depPerte)} FCFA</span></div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2.5">
          <span className="text-sm font-bold text-gray-700">Solde net du mois (entrées − sorties)</span>
          <span className={`font-mono text-lg font-black ${solde.soldeGlobal >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(solde.soldeGlobal)} FCFA</span>
        </div>
      </Card>

      <Card title="Tendance sur 6 mois — solde par nature de flux">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#0d9488' }} /> Exploitation (fonctionnement)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#d97706' }} /> Investissement</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#dc2626' }} /> Pertes</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: '#334155' }} /> Solde global (ligne)</span>
        </div>
        <div style={{ height: 300 }}>
          <Chart type="bar" data={chartData} options={chartOptions} />
        </div>
      </Card>
    </div>
  )
}

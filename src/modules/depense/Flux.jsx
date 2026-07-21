// Flux de trésorerie — solde par nature de flux (exploitation / investissement / perte),
// croisé avec les revenus réels des autres modules. Lecture seule, aucune écriture croisée.
import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, FileSpreadsheet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import InfoBulle from '../../shared/ui/InfoBulle'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { exportRapportExcel } from '../../utils/excelReport'
import { MOIS_LABELS, NATURES_FLUX } from './data'
import { soldesFluxMois, croissance, derniersMois, moisPrecedent, depensesProjetVersSecteurs, coutsMatieresBriqueterie } from './logic'
import { revenuSecteur, SECTEURS_AVEC_REVENU } from './revenus'

const now = new Date()
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')

export default function Flux() {
  const { data: depensesReelles }      = useCollection('depense_depenses')
  const { data: depensesProjet }       = useCollection('projet_depenses')
  const { data: projetsTous }          = useCollection('projets')
  const { data: inventairesBriq }      = useCollection('evenementiel_inventaires')
  const { data: paiementsGarderie }    = useCollection('garderie_paiements')
  const { data: facturesAgro }         = useCollection('agro_factures')
  const { data: facturesLogistique }   = useCollection('logistique_factures')
  const { data: facturesEvenementiel } = useCollection('evenementiel_factures')

  // Dépenses de E-G.Pro (par secteur) + coût matières Briqueterie, inclus en lecture seule — pas de double saisie.
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

  const lineData = {
    labels: tendance.map((t) => t.label),
    datasets: [
      { label: 'Exploitation',   data: tendance.map((t) => t.soldeExploitation),   borderColor: '#0d9488', backgroundColor: '#0d948833', tension: 0.3 },
      { label: 'Investissement', data: tendance.map((t) => t.soldeInvestissement), borderColor: '#059669', backgroundColor: '#05966933', tension: 0.3 },
      { label: 'Pertes',         data: tendance.map((t) => t.soldePerte),          borderColor: '#dc2626', backgroundColor: '#dc262633', tension: 0.3 },
      { label: 'Solde global',   data: tendance.map((t) => t.soldeGlobal),         borderColor: '#B45309', backgroundColor: '#B4530933', tension: 0.3, borderDash: [6, 4], borderWidth: 2 }
    ]
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
          accent={solde.soldeExploitation >= 0 ? '#0d9488' : '#dc2626'} />
        <StatCard
          title={<span className="flex items-center gap-1">Solde d'investissement <InfoBulle texte="− dépenses classées Investissement (achat d'actif durable)." /></span>}
          value={`${fmt(solde.soldeInvestissement)} FCFA`} icon={TrendingDown} accent="#059669" />
        <StatCard
          title={<span className="flex items-center gap-1">Pertes <InfoBulle texte="− dépenses classées Perte (argent perdu sans contrepartie)." /></span>}
          value={`${fmt(solde.soldePerte)} FCFA`} icon={TrendingDown} accent="#dc2626" />
        <StatCard
          title={<span className="flex items-center gap-1">Solde global <InfoBulle texte="Exploitation + Investissement + Pertes." /></span>}
          value={`${fmt(solde.soldeGlobal)} FCFA`} icon={solde.soldeGlobal >= 0 ? TrendingUp : TrendingDown}
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

      <Card title="Tendance sur 6 mois — solde par nature de flux">
        <div style={{ height: 300 }}>
          <Line data={lineData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }} />
        </div>
      </Card>
    </div>
  )
}

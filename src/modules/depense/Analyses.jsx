// Analyses Dépenses — budget vs dépensé par secteur, répartition par catégorie.
import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Card from '../../shared/ui/Card'
import { useCollection } from '../../hooks/useFirestore'
import { SECTEURS, MOIS_LABELS } from './data'
import { budgetSecteur, depensesSecteurMois, totalDepenses, derniersMois, depensesProjetVersSecteurs, coutsMatieresBriqueterie } from './logic'

const now = new Date()
const PALETTE = ['#B45309', '#059669', '#dc2626', '#d97706', '#0284c7', '#7c3aed', '#E8390E', '#0d9488', '#BC3C31']

export default function Analyses() {
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: depensesReelles } = useCollection('depense_depenses')
  const { data: depensesProjet }  = useCollection('projet_depenses')
  const { data: projetsTous }     = useCollection('projets')
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  // Dépenses de E-G.Pro (par secteur) + coût matières Briqueterie, inclus en lecture seule — pas de double saisie.
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

  const parSecteur = useMemo(() => SECTEURS.map((s) => ({
    ...s,
    alloue: budgetSecteur(budgets, s.id, annee, mois),
    depense: totalDepenses(depensesSecteurMois(depenses, s.id, annee, mois))
  })), [budgets, depenses, annee, mois])

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

  const barData = {
    labels: parSecteur.map((s) => s.label),
    datasets: [
      { label: 'Budget alloué', data: parSecteur.map((s) => s.alloue), backgroundColor: '#B4530933', borderColor: '#B45309', borderWidth: 1, borderRadius: 6 },
      { label: 'Dépensé', data: parSecteur.map((s) => s.depense), backgroundColor: '#dc262699', borderColor: '#dc2626', borderWidth: 1, borderRadius: 6 }
    ]
  }

  const doughnutData = {
    labels: parCategorie.map((c) => c.label),
    datasets: [{ data: parCategorie.map((c) => c.total), backgroundColor: PALETTE }]
  }

  // Tendance sur les 6 derniers mois — total (tous secteurs confondus) alloué vs dépensé.
  const tendance = useMemo(() => derniersMois(6, MOIS_LABELS).map(({ annee: a, mois: m, label }) => {
    const alloue = SECTEURS.reduce((s, sec) => s + budgetSecteur(budgets, sec.id, a, m), 0)
    const depense = SECTEURS.reduce((s, sec) => s + totalDepenses(depensesSecteurMois(depenses, sec.id, a, m)), 0)
    return { label, alloue, depense }
  }), [budgets, depenses])

  const lineData = {
    labels: tendance.map((t) => t.label),
    datasets: [
      { label: 'Budget alloué', data: tendance.map((t) => t.alloue), borderColor: '#B45309', backgroundColor: '#B4530933', tension: 0.3 },
      { label: 'Dépensé', data: tendance.map((t) => t.depense), borderColor: '#dc2626', backgroundColor: '#dc262633', tension: 0.3 }
    ]
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
      </div>

      <Card title="Tendance sur 6 mois — total tous secteurs">
        <div style={{ height: 280 }}>
          <Line data={lineData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }} />
        </div>
      </Card>

      <Card title="Budget alloué vs dépensé par secteur">
        <div style={{ height: 320 }}>
          <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }} />
        </div>
      </Card>

      <Card title="Répartition des dépenses par catégorie">
        {parCategorie.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Aucune dépense enregistrée ce mois.</p>
        ) : (
          <div style={{ height: 300, maxWidth: 420, margin: '0 auto' }}>
            <Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false }} />
          </div>
        )}
      </Card>
    </div>
  )
}

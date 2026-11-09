// RH : cartes détaillées du tableau de bord (listes courtes et anneau d'effectif), au même gabarit que les autres tableaux de bord
// de l'application : carte en verre, icône 3D en titre, entrée en fondu. Chaque liste montre cinq lignes au plus puis « + N autres ».
import { Doughnut } from 'react-chartjs-2'
import { PieChart } from 'lucide-react'
import '../../utils/chartSetup'
import Card from '../../shared/ui/Card'
import { icone3D } from '../../utils/color'

const BLEU = '#0284c7' // couleur du bandeau RH
const PALETTE = ['#0284c7', '#16a34a', '#f59e0b', '#7c3aed', '#dc2626', '#0d9488', '#db2777', '#475569', '#ea580c', '#65a30d']

const TitreCarte = ({ icone: Icone, couleur = BLEU, titre, sous }) => (
  <div className="mb-3 flex items-center gap-2.5">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Icone size={17} /></span>
    <div className="min-w-0">
      <h3 className="truncate text-base font-bold leading-tight text-gray-800 dark:text-gray-100">{titre}</h3>
      {sous && <p className="text-[11px] text-gray-400">{sous}</p>}
    </div>
  </div>
)

// lignes : [{ id, libelle, detail }] ; `vide` : texte affiché quand il n'y a rien.
export function ListeCarte({ icone, couleur, titre, sous, lignes, vide, rang = 0, max = 5 }) {
  const visibles = lignes.slice(0, max)
  return (
    <Card className="ed-entree" style={{ animationDelay: `${rang * 70}ms` }}>
      <TitreCarte icone={icone} couleur={couleur} titre={titre} sous={sous} />
      {lignes.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{vide}</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-white/10">
          {visibles.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{l.libelle}</span>
              {l.detail && <span className="shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">{l.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      {lignes.length > max && <p className="mt-2 text-xs font-semibold text-gray-400">+ {lignes.length - max} autre{lignes.length - max > 1 ? 's' : ''}</p>}
    </Card>
  )
}

// parDepartement : [{ nom, nb }]
export function EffectifAnneauCarte({ parDepartement, rang = 0 }) {
  const total = parDepartement.reduce((s, d) => s + d.nb, 0)
  const data = {
    labels: parDepartement.map((d) => d.nom),
    datasets: [{
      data: parDepartement.map((d) => d.nb),
      backgroundColor: parDepartement.map((_, i) => PALETTE[i % PALETTE.length]),
      borderColor: '#ffffff', borderWidth: 3, borderRadius: 6, hoverOffset: 8
    }]
  }
  const options = {
    maintainAspectRatio: false,
    cutout: '70%',
    animation: { animateRotate: true, duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 10, font: { size: 10, weight: '600' } } },
      tooltip: {
        backgroundColor: '#0f172a', padding: 10, cornerRadius: 10, displayColors: false,
        callbacks: { label: (c) => `${c.parsed} employé(s) · ${total ? Math.round((c.parsed / total) * 100) : 0} %` }
      }
    }
  }
  return (
    <Card className="ed-entree" style={{ animationDelay: `${rang * 70}ms` }}>
      <TitreCarte icone={PieChart} titre="Effectif par secteur" sous="Nombre d'employés par département" />
      <div className="h-60">
        {total > 0
          ? <Doughnut data={data} options={options} />
          : <p className="py-20 text-center text-sm text-gray-400">Aucun employé enregistré pour le moment.</p>}
      </div>
    </Card>
  )
}

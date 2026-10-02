// MAXI-GYM — éléments d'UI liés au sexe des clients (proportion femmes / hommes).
import '../../utils/chartSetup'
import { Doughnut } from 'react-chartjs-2'
import { SEXES, sexeInfo } from './data'

// Boutons Femme / Homme pour les formulaires (séance, abonnement, fiche client).
export function SexeBoutons({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {SEXES.map((s) => {
        const actif = value === s.id
        return (
          <button key={s.id} type="button" onClick={() => onChange(s.id)}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-bold transition-all ${actif ? 'text-white shadow-[0_6px_14px_-4px_rgba(0,0,0,0.35)]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
            style={actif ? { background: s.couleur, borderColor: s.couleur } : undefined}>
            <span className="text-base leading-none">{s.symbole}</span> {s.label}
          </button>
        )
      })}
    </div>
  )
}

// Filtre Tous / Femmes / Hommes posé directement sur le bandeau héro (glassmorphism).
// « Non précisé » n'apparaît que s'il reste des enregistrements sans sexe renseigné.
export function SexeFiltre({ value, onChange, inconnus = 0 }) {
  const options = [['', 'Tous'], ...SEXES.map((s) => [s.id, `${s.symbole} ${s.court}`]), ...(inconnus > 0 ? [['inconnu', `? Non précisé (${inconnus})`]] : [])]
  return (
    <div className="flex flex-wrap gap-1 rounded-2xl border border-white/30 bg-white/15 p-1 backdrop-blur-sm">
      {options.map(([v, l]) => (
        <button key={v || 'tous'} type="button" onClick={() => onChange(v)}
          className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${value === v ? 'bg-white text-orange-700' : 'text-white/80 hover:bg-white/20'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

// Petite pastille ♀ / ♂ pour les tableaux.
export function SexeBadge({ sexe }) {
  const s = sexeInfo(sexe)
  if (!s) return <span className="text-gray-300">—</span>
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm" style={{ background: s.couleur }} title={s.label}>
      {s.symbole}
    </span>
  )
}

// Donut Femmes / Hommes (personnes distinctes). `mini` : petit format pour le Dashboard.
export function SexeDonut({ stats, mini = false }) {
  const taille = mini ? 96 : 190
  const data = {
    labels: SEXES.map((s) => s.court),
    datasets: [{
      data: [stats.F.personnes, stats.H.personnes],
      backgroundColor: SEXES.map((s) => s.couleur), borderColor: '#ffffff', borderWidth: mini ? 2 : 3, hoverOffset: mini ? 2 : 6
    }]
  }
  const options = {
    responsive: true, maintainAspectRatio: false, cutout: mini ? '66%' : '64%',
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c) => ` ${c.label} : ${c.parsed} personne${c.parsed > 1 ? 's' : ''}` } }
    }
  }
  return (
    <div className="relative shrink-0" style={{ width: taille, height: taille }}>
      <Doughnut data={data} options={options} />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${mini ? 'text-base' : 'text-2xl'} font-extrabold leading-none text-gray-800`}>{stats.connus}</span>
        <span className={`${mini ? 'text-[9px]' : 'text-[11px]'} font-semibold text-gray-400`}>personne{stats.connus > 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}

// Onglets en pastilles avec effet lumineux (dégradé + halo + point lumineux)
// une fois actif, plutôt qu'un simple soulignement — style unifié pour tous
// les volets à onglets de l'application. `accent` est la couleur par défaut
// (généralement COULEUR_MODULE du module courant) ; un onglet peut fournir
// son propre `accent` pour se distinguer des autres (ex : catégories Garderie
// / Maternelle / Journaliers, chacune avec sa couleur).
import { shadeHex, teinterHex } from '../../utils/color'

export default function PillTabs({ tabs, active, onChange, accent = '#E8390E', className = '' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {tabs.map((t) => {
        const isActive = active === t.id
        const color = t.accent || accent
        return (
          <button key={t.id} type="button" onClick={() => onChange(t.id)}
            style={isActive
              ? {
                  background: `linear-gradient(135deg, ${shadeHex(color, 18)} 0%, ${color} 100%)`,
                  boxShadow: `0 6px 18px -4px ${teinterHex(color, 0.6)}, inset 0 1px 0 0 rgba(255,255,255,0.5)`
                }
              : { '--tc': color }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ${isActive
              ? 'scale-105 text-white'
              : 'border border-gray-200 bg-white text-gray-500 hover:scale-105 hover:shadow-sm hover:border-[var(--tc)] hover:text-[var(--tc)]'}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full transition-all ${isActive ? 'bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.9)]' : 'bg-gray-300'}`} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

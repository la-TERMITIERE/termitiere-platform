// Onglets en pastilles avec effet lumineux (dégradé + halo + point lumineux)
// une fois actif, plutôt qu'un simple soulignement — style unifié pour tous
// les volets à onglets de l'application. `accent` est la couleur par défaut
// (généralement COULEUR_MODULE du module courant) ; un onglet peut fournir
// son propre `accent` pour se distinguer des autres (ex : catégories Garderie
// / Maternelle / Journaliers, chacune avec sa couleur).
// Options : `taille="sm"` pour des pastilles plus petites ; `icone` (composant lucide) sur un onglet pour remplacer le
// point lumineux par une icône, qui flotte doucement quand l'onglet est actif.
import { shadeHex, teinterHex } from '../../utils/color'

const TAILLES = {
  md: { bouton: 'gap-2 px-4 py-2 text-sm', point: 'h-2 w-2', icone: 16 },
  sm: { bouton: 'gap-1.5 px-3 py-1.5 text-xs', point: 'h-1.5 w-1.5', icone: 14 }
}

export default function PillTabs({ tabs, active, onChange, accent = '#E8390E', className = '', taille = 'md' }) {
  const t0 = TAILLES[taille] || TAILLES.md
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <style>{'@keyframes pt-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }'}</style>
      {tabs.map((t) => {
        const isActive = active === t.id
        const color = t.accent || accent
        const Icone = t.icone
        return (
          <button key={t.id} type="button" onClick={() => onChange(t.id)}
            style={isActive
              ? {
                  background: `linear-gradient(135deg, ${shadeHex(color, 18)} 0%, ${color} 100%)`,
                  boxShadow: `0 6px 18px -4px ${teinterHex(color, 0.6)}, inset 0 1px 0 0 rgba(255,255,255,0.5)`
                }
              : { '--tc': color }}
            className={`group relative inline-flex items-center overflow-hidden rounded-full font-bold transition-all duration-200 active:scale-95 ${t0.bouton} ${isActive
              ? 'scale-105 text-white'
              : 'border border-white/70 bg-white/70 text-gray-500 backdrop-blur-md hover:-translate-y-0.5 hover:scale-105 hover:shadow-sm hover:border-[var(--tc)] hover:text-[var(--tc)]'}`}>
            {isActive && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />}
            {Icone ? (
              <Icone size={t0.icone} strokeWidth={2.4} className="relative shrink-0 transition-transform duration-300 group-hover:scale-110" style={isActive ? { animation: 'pt-flotte 2.6s ease-in-out infinite' } : undefined} />
            ) : (
              <span className={`relative shrink-0 rounded-full transition-all ${t0.point} ${isActive ? 'bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.9)]' : 'bg-gray-300'}`} />
            )}
            <span className="relative">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

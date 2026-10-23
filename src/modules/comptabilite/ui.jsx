// COMPTABILITÉ : éléments d'affichage communs aux fiches Immobilier et Immobilisations
// (animations d'entrée, état vide, petite tuile d'information en verre).
import { icone3D } from '../../utils/color'

// À poser une fois dans la page : <style>{ANIMATIONS}</style>
export const ANIMATIONS = `
  @keyframes cp-entree { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
  @keyframes cp-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
  @keyframes cp-barre { from { width: 0; } }
  @media (prefers-reduced-motion: reduce) { .cp-anim, .cp-flotte, .cp-barre { animation: none !important; } }
`
export const entree = (i = 0) => ({ animation: `cp-entree 0.4s ease-out ${Math.min(i, 12) * 0.05}s both` })

// Carte en verre dépoli avec un halo de couleur dans le coin
export function CarteVerre({ i = 0, couleur, className = '', onClick, children }) {
  return (
    <div onClick={onClick} style={entree(i)}
      className={`cp-anim group relative flex flex-col gap-3 overflow-hidden rounded-3xl border border-white/70 bg-white/60 p-4 shadow-[0_10px_30px_-16px_rgba(26,26,26,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_-16px_rgba(26,26,26,0.5),inset_0_1px_0_rgba(255,255,255,0.9)] ${onClick ? 'cursor-pointer' : ''} ${className}`}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-70" style={{ background: couleur }} />
      {children}
    </div>
  )
}

// Petite tuile d'information : icône 3D + libellé + valeur
export function Info({ icone: Icone, couleur, label, children, className = '' }) {
  return (
    <div className={`flex items-center gap-2 rounded-2xl border border-white/70 bg-white/55 px-2 py-1.5 backdrop-blur-md ${className}`}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D(couleur)}><Icone size={12} /></span>
      <div className="min-w-0">
        <p className="text-[9px] font-extrabold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="truncate text-xs font-bold text-gray-800">{children}</p>
      </div>
    </div>
  )
}

// Bouton rond d'action (modifier / supprimer)
export function BoutonAction({ icone: Icone, couleur, titre, onClick }) {
  return (
    <button type="button" title={titre} aria-label={titre} onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/80 bg-white/70 text-gray-500 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:text-white hover:shadow-md active:scale-90"
      onMouseEnter={(e) => { e.currentTarget.style.background = `linear-gradient(135deg, ${couleur}, ${couleur}cc)` }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '' }}>
      <Icone size={14} />
    </button>
  )
}

// État vide : grosse icône 3D qui flotte, message, et le bouton d'ajout
export function EtatVide({ icone: Icone, couleur, titre, texte, action }) {
  return (
    <div style={entree(0)} className="cp-anim relative col-span-full overflow-hidden rounded-3xl border border-white/70 bg-white/55 px-6 py-10 text-center shadow-[0_10px_30px_-16px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl">
      <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl" style={{ background: couleur }} />
      <span className="cp-flotte relative mx-auto flex h-16 w-16 items-center justify-center rounded-3xl" style={{ ...icone3D(couleur), animation: 'cp-flotte 3.2s ease-in-out infinite' }}>
        <Icone size={30} />
      </span>
      <p className="relative mt-4 text-base font-extrabold text-gray-800">{titre}</p>
      <p className="relative mx-auto mt-1 max-w-sm text-sm text-gray-500">{texte}</p>
      {action && <div className="relative mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

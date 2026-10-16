// Bouton réutilisable avec variantes de couleur et état de chargement.
// Design « verre » : liseré clair, reflet brillant sur la moitié haute, relief (ombre intérieure et extérieure) et
// un reflet qui balaie le bouton au survol. Légère animation : le bouton se soulève au survol, s'enfonce au clic, et
// l'icône (svg) grossit doucement. Les couleurs propres à un module (style={{ backgroundColor }}) restent respectées :
// le verre est posé par-dessus, pas à la place de la couleur.
import { Loader2 } from 'lucide-react'

const RELIEF_PLEIN = 'border border-white/35 text-white shadow-[0_10px_20px_-10px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-2px_0_rgba(0,0,0,0.14)] hover:shadow-[0_14px_26px_-10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-2px_0_rgba(0,0,0,0.14)]'

const VARIANTS = {
  primary: `bg-primary hover:bg-primary-dark ${RELIEF_PLEIN}`,
  secondary: `bg-secondary hover:bg-secondary-dark ${RELIEF_PLEIN}`,
  success: `bg-green-600 hover:bg-green-700 ${RELIEF_PLEIN}`,
  danger: `bg-red-600 hover:bg-red-700 ${RELIEF_PLEIN}`,
  warning: `bg-amber-600 hover:bg-amber-700 ${RELIEF_PLEIN}`,
  ghost: 'bg-transparent text-gray-700 hover:bg-white/70 hover:backdrop-blur-md hover:shadow-[0_6px_14px_-8px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.9)] dark:text-gray-300 dark:hover:bg-white/10',
  outline: 'border border-white/80 bg-white/70 text-gray-700 backdrop-blur-md ring-1 ring-black/5 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.95)] hover:bg-white/95 hover:shadow-[0_10px_20px_-10px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,1)] dark:border-white/15 dark:bg-white/5 dark:text-gray-300 dark:ring-white/5 dark:hover:bg-white/10'
}
const PLEINS = ['primary', 'secondary', 'success', 'danger', 'warning']

const SIZES = {
  sm: 'rounded-lg px-3 py-1.5 text-sm',
  md: 'rounded-xl px-4 py-2 text-sm',
  lg: 'rounded-xl px-5 py-2.5 text-base'
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  ...props
}) {
  const plein = PLEINS.includes(variant) || !VARIANTS[variant]
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`group relative inline-flex items-center justify-center gap-2 overflow-hidden font-bold tracking-wide
        transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]
        disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0
        ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {plein && (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/35 opacity-0 blur-sm transition-all duration-700 group-hover:left-[130%] group-hover:opacity-100 group-disabled:hidden" />
        </>
      )}
      <span className="relative inline-flex items-center justify-center gap-2 [&>svg]:shrink-0 [&>svg]:transition-transform [&>svg]:duration-300 group-hover:[&>svg]:scale-110">
        {loading && <Loader2 size={16} className="animate-spin" />}
        {children}
      </span>
    </button>
  )
}

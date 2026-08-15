// Bouton réutilisable avec variantes de couleur et état de chargement.
import { Loader2 } from 'lucide-react'

const VARIANTS = {
  primary: 'bg-primary hover:bg-primary-dark text-white',
  secondary: 'bg-secondary hover:bg-secondary-dark text-white',
  success: 'bg-green-600 hover:bg-green-700 text-white',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  warning: 'bg-amber-600 hover:bg-amber-700 text-white',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 dark:hover:bg-white/10 dark:text-gray-300',
  outline: 'bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 dark:bg-[#1d2226] dark:border-white/15 dark:hover:bg-white/10 dark:text-gray-300'
}

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base'
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
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold
        shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm
        disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-sm
        ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
}

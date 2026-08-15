// Badge / pastille colorée.
const TONES = {
  success: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  neutral: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
  primary: 'bg-primary/10 text-primary-dark dark:bg-primary/20 dark:text-primary-light',
  purple: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400'
}

export default function Badge({ children, tone = 'neutral', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold
        ${TONES[tone] || TONES.neutral} ${className}`}
    >
      {children}
    </span>
  )
}

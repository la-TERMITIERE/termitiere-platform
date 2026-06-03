// Badge / pastille colorée.
const TONES = {
  success: 'bg-green-100 text-green-700',
  danger: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-sky-100 text-sky-700',
  neutral: 'bg-gray-100 text-gray-600',
  primary: 'bg-primary/10 text-primary-dark',
  purple: 'bg-violet-100 text-violet-700'
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

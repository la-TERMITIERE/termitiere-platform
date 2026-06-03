import { Loader2 } from 'lucide-react'

// Spinner de chargement centré.
export default function LoadingSpinner({ label = 'Chargement…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 text-gray-500 ${className}`}>
      <Loader2 className="animate-spin text-primary" size={28} />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

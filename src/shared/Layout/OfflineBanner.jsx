// Bandeau d'avertissement affiché quand l'appareil est hors-ligne.
import { WifiOff } from 'lucide-react'
import { useOffline } from '../../hooks/useOffline'

export default function OfflineBanner() {
  const offline = useOffline()
  if (!offline) return null
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-sm font-medium text-white">
      <WifiOff size={16} />
      Mode hors-ligne — les modifications seront synchronisées au retour du réseau.
    </div>
  )
}

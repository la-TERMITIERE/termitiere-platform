// Gestion des mises à jour de l'application (PWA / service worker).
// - Vérifie l'existence d'une nouvelle version toutes les 60 secondes, même si
//   l'onglet reste ouvert longtemps.
// - Dès qu'une mise à jour est disponible, l'applique automatiquement à TOUS les
//   utilisateurs (rechargement forcé) après un court compte à rebours visible,
//   pour garantir que tout le monde tourne sur la même version.
import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

const POLL_MS = 60 * 1000      // fréquence de vérification d'une nouvelle version
const COUNTDOWN_S = 5          // délai avant rechargement automatique

export default function UpdateManager() {
  const [countdown, setCountdown] = useState(COUNTDOWN_S)
  const tickRef = useRef(null)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      // Vérifie périodiquement le serveur : capte les mises à jour même sans
      // rechargement manuel de la page.
      setInterval(() => {
        // N'interroge que si l'appareil est en ligne (évite des erreurs inutiles).
        if (!navigator.onLine) return
        registration.update().catch(() => {})
      }, POLL_MS)
    },
    onRegisterError(err) {
      console.warn('[pwa] enregistrement du service worker échoué :', err)
    }
  })

  // Compte à rebours puis application automatique de la mise à jour pour tous.
  useEffect(() => {
    if (!needRefresh) return
    setCountdown(COUNTDOWN_S)
    tickRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(tickRef.current)
          updateServiceWorker(true) // skipWaiting + rechargement de la page
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(tickRef.current)
  }, [needRefresh, updateServiceWorker])

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-3">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-primary/20 bg-white px-4 py-3 shadow-lg">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <RefreshCw size={18} className="animate-spin" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">Nouvelle version disponible</p>
          <p className="text-xs text-gray-500">
            Mise à jour automatique dans {countdown} s…
          </p>
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary/90"
        >
          Mettre à jour
        </button>
      </div>
    </div>
  )
}

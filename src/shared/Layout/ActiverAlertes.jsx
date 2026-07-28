// Invitation à activer les notifications de l'appareil (téléphone ou PC).
// Sans cette autorisation, l'utilisateur ne peut RIEN recevoir quand l'appli est
// fermée : on la demande donc de façon visible, une fois connecté, plutôt que de
// la cacher dans le menu de la cloche.
// - rappel reporté 3 jours si « Plus tard » ;
// - dès que l'autorisation est accordée, l'appareil est abonné au push et reçoit
//   une notification de confirmation.
import { useEffect, useState } from 'react'
import { BellRing, X, Share, Smartphone } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { subscribeToPush, pushSupported } from '../../core/push'
import { toast } from '../../core/notifications'

const CLE_REPORT = 'termitiere_alertes_report'
const REPORT_MS = 3 * 24 * 60 * 60 * 1000 // 3 jours

const reporte = () => {
  try { return Date.now() < Number(localStorage.getItem(CLE_REPORT) || 0) } catch { return false }
}

// iOS : Web Push n'existe QUE si l'app est installée sur l'écran d'accueil
// (iOS 16.4+). Dans un onglet Safari classique, aucune notification n'est
// possible — on détecte ce cas pour guider l'utilisateur plutôt que de rester muet.
const estIOS = () => typeof navigator !== 'undefined' &&
  /ip(hone|ad|od)/i.test(navigator.userAgent) && !window.MSStream
const estInstallee = () => typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true)

export default function ActiverAlertes() {
  const { user } = useAuth()
  const [perm, setPerm] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [masque, setMasque] = useState(reporte())
  const [enCours, setEnCours] = useState(false)

  // Autorisation déjà accordée : (ré)abonner cet appareil au push à chaque
  // ouverture de session — l'abonnement peut expirer ou changer d'appareil.
  useEffect(() => {
    if (user && perm === 'granted' && pushSupported()) subscribeToPush(user)
  }, [user, perm])

  async function activer() {
    if (typeof Notification === 'undefined') return
    setEnCours(true)
    try {
      const p = await Notification.requestPermission()
      setPerm(p)
      if (p === 'granted') {
        const ok = await subscribeToPush(user)
        if (ok) toast.success('Notifications activées sur cet appareil ✅')
        else toast.warning('Alertes activées à l’écran, mais l’abonnement « appli fermée » a échoué — réessayez ou vérifiez votre connexion.')
        // Confirmation visible immédiatement, comme sur les autres applis.
        try {
          const reg = await navigator.serviceWorker?.getRegistration()
          reg?.showNotification?.('LA TERMITIÈRE', {
            body: 'Les alertes sont activées : vous serez prévenu des demandes d’autorisation, sorties et validations.',
            icon: '/icon-192.png', badge: '/icon-192.png', tag: 'alertes-activees'
          })
        } catch { /* ignore */ }
      } else if (p === 'denied') {
        toast.warning('Notifications refusées. Autorisez-les dans les réglages du navigateur pour être alerté.')
      }
    } catch { /* ignore */ } finally { setEnCours(false) }
  }

  function plusTard() {
    try { localStorage.setItem(CLE_REPORT, String(Date.now() + REPORT_MS)) } catch { /* ignore */ }
    setMasque(true)
  }

  if (!user || masque) return null

  // Cas iPhone non installé : le push est IMPOSSIBLE tant que l'app n'est pas
  // ajoutée à l'écran d'accueil. On explique la marche à suivre au lieu de rien
  // afficher (sinon les utilisateurs iOS croient que « ça ne marche pas »).
  if (estIOS() && !estInstallee() && !pushSupported()) {
    return (
      <div className="fixed inset-x-3 bottom-3 z-[70] sm:left-auto sm:right-4 sm:w-[380px]">
        <div className="toast-enter relative overflow-hidden rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/5"
          style={{ borderLeft: '5px solid #BC3C31' }}>
          <button onClick={plusTard} aria-label="Fermer"
            className="absolute right-2 top-2 rounded-full p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600">
            <X size={14} />
          </button>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#BC3C31]">
              <Smartphone size={20} color="white" />
            </div>
            <div className="min-w-0 flex-1 pr-4">
              <p className="text-[15px] font-bold text-gray-900">Recevoir les notifications sur iPhone</p>
              <p className="mt-0.5 text-[13px] leading-snug text-gray-600">
                Sur iPhone, les notifications n’arrivent que si l’application est ajoutée
                à l’écran d’accueil :
              </p>
              <ol className="mt-1.5 space-y-1 text-[13px] text-gray-700">
                <li>1. Touchez <Share size={13} className="inline -mt-0.5" /> <strong>Partager</strong> (barre Safari).</li>
                <li>2. <strong>« Sur l’écran d’accueil »</strong>.</li>
                <li>3. Rouvrez l’app depuis son <strong>icône</strong>, puis activez les alertes.</li>
              </ol>
              <button onClick={plusTard} className="mt-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100">
                J’ai compris
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Appareil compatible (Android, PC, ou iOS installé) avec permission encore à demander.
  if (perm !== 'default' || !pushSupported()) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-[70] sm:left-auto sm:right-4 sm:w-[380px]">
      <div className="toast-enter relative overflow-hidden rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/5"
        style={{ borderLeft: '5px solid #BC3C31' }}>
        <button onClick={plusTard} aria-label="Fermer"
          className="absolute right-2 top-2 rounded-full p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600">
          <X size={14} />
        </button>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#BC3C31]">
            <BellRing size={20} color="white" />
          </div>
          <div className="min-w-0 flex-1 pr-4">
            <p className="text-[15px] font-bold text-gray-900">Activer les notifications</p>
            <p className="mt-0.5 text-[13px] leading-snug text-gray-600">
              Recevez les demandes d’autorisation, les sorties et les validations
              directement sur cet appareil — même application fermée.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button onClick={activer} disabled={enCours}
                className="rounded-lg bg-[#BC3C31] px-3.5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
                {enCours ? 'Activation…' : 'Activer'}
              </button>
              <button onClick={plusTard}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100">
                Plus tard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

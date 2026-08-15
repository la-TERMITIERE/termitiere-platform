// Paramètres — accessible à tous les utilisateurs connectés (comme Mon compte).
// Réglages qui s'appliquent à l'appareil courant : apparence, notifications, mises à jour.
import { useState } from 'react'
import { Settings, Sun, Moon, BellRing, BellOff, RefreshCw, Info, Share, Smartphone } from 'lucide-react'
import Card from '../shared/ui/Card'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { subscribeToPush, pushSupported } from '../core/push'
import { toast } from '../core/notifications'

const estIOS = () => typeof navigator !== 'undefined' &&
  /ip(hone|ad|od)/i.test(navigator.userAgent) && !window.MSStream
const estInstallee = () => typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true)

export default function Parametres() {
  const { user } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()

  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [activation, setActivation] = useState(false)
  const [checking, setChecking] = useState(false)

  const iosSansInstall = estIOS() && !estInstallee() && !pushSupported()

  async function activerNotifs() {
    if (typeof Notification === 'undefined') return
    setActivation(true)
    try {
      const p = await Notification.requestPermission()
      setNotifPerm(p)
      if (p === 'granted') {
        const ok = await subscribeToPush(user)
        if (ok) toast.success('Notifications activées sur cet appareil ✅')
        else toast.warning('Alertes activées à l’écran, mais l’abonnement « appli fermée » a échoué.')
      } else if (p === 'denied') {
        toast.warning('Notifications refusées. Autorisez-les dans les réglages du navigateur pour être alerté.')
      }
    } finally { setActivation(false) }
  }

  async function verifierMaj() {
    setChecking(true)
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg) {
        await reg.update()
        toast.success('Vérification effectuée — une mise à jour s’appliquera automatiquement si disponible.')
      } else {
        toast.info('Aucune mise à jour automatique sur cet appareil.')
      }
    } catch {
      toast.error('Vérification impossible pour le moment.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(188,60,49,0.35),0_8px_20px_-8px_rgba(188,60,49,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.92) 0%, rgba(90,20,16,0.92) 100%)' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#BC3C31', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Settings size={26} color="white" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold">Paramètres</h1>
          <p className="text-sm text-white/80">Réglages propres à cet appareil</p>
        </div>
      </div>

      {/* Apparence */}
      <Card title="🎨 Apparence">
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">Choisissez l’apparence de l’application sur cet appareil.</p>
        <div className="inline-flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/5">
          <button
            onClick={() => theme === 'dark' && toggleTheme()}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              theme === 'light' ? 'bg-white text-gray-900 shadow-sm dark:bg-[#2a3036] dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Sun size={16} /> Clair
          </button>
          <button
            onClick={() => theme === 'light' && toggleTheme()}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              theme === 'dark' ? 'bg-white text-gray-900 shadow-sm dark:bg-[#2a3036] dark:text-gray-100' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Moon size={16} /> Sombre
          </button>
        </div>
      </Card>

      {/* Notifications */}
      <Card title="🔔 Notifications">
        {iosSansInstall ? (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sur iPhone, les notifications n’arrivent que si l’application est ajoutée à l’écran d’accueil :
            </p>
            <ol className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <li>1. Touchez <Share size={13} className="inline -mt-0.5" /> <strong>Partager</strong> (barre Safari).</li>
              <li>2. <strong>« Sur l’écran d’accueil »</strong>.</li>
              <li>3. Rouvrez l’app depuis son <strong>icône</strong>, puis revenez ici.</li>
            </ol>
          </div>
        ) : !pushSupported() ? (
          <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Smartphone size={16} /> Non disponible sur ce navigateur/appareil.
          </p>
        ) : notifPerm === 'granted' ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-green-600 dark:text-green-400">
            <BellRing size={16} /> Activées sur cet appareil
          </p>
        ) : notifPerm === 'denied' ? (
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
              <BellOff size={16} /> Refusées
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Autorisez-les dans les réglages du navigateur pour cet appareil, puis revenez ici.
            </p>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              Recevez les demandes d’autorisation, sorties et validations sur cet appareil — même application fermée.
            </p>
            <button onClick={activerNotifs} disabled={activation}
              className="rounded-lg bg-[#BC3C31] px-3.5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
              {activation ? 'Activation…' : 'Activer les notifications'}
            </button>
          </div>
        )}
      </Card>

      {/* À propos */}
      <Card title="ℹ️ À propos">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Info size={16} /> LA TERMITIÈRE — Plateforme
          </div>
          <button onClick={verifierMaj} disabled={checking}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-white/15 dark:text-gray-300 dark:hover:bg-white/5">
            <RefreshCw size={13} className={checking ? 'animate-spin' : ''} /> Vérifier les mises à jour
          </button>
        </div>
      </Card>
    </div>
  )
}

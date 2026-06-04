// Cloche de notifications (barre supérieure) : pastille de non-lues + panneau
// déroulant listant les notifications de l'utilisateur. Clic = marquer lu + ouvrir.
// Propose aussi d'activer les notifications système (popup type WhatsApp/Gmail).
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, BellRing } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'

const EMOJI = { demande: '📤', approuve: '✅', refus: '⛔', user: '👤', info: '🔔' }

// Temps relatif court : "à l'instant", "il y a 5 min", "il y a 2 h", "il y a 3 j".
function timeAgo(ms) {
  if (!ms) return ''
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return "à l'instant"
  const m = Math.floor(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  return `il y a ${j} j`
}

export default function NotificationBell() {
  const { mine, unread, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const ref = useRef(null)

  // Fermeture au clic extérieur
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function activerAlertes() {
    if (typeof Notification === 'undefined') return
    try { const p = await Notification.requestPermission(); setPerm(p) } catch (e) { /* ignore */ }
  }

  function onClickNotif(n) {
    markRead(n.id)
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  const nUnread = unread.length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {nUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {nUnread > 9 ? '9+' : nUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <p className="text-sm font-bold text-gray-800">Notifications</p>
            {nUnread > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Check size={13} /> Tout marquer lu
              </button>
            )}
          </div>

          {perm === 'default' && (
            <button onClick={activerAlertes} className="flex w-full items-center gap-2 border-b border-amber-100 bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-800 hover:bg-amber-100">
              <BellRing size={14} /> Activer les alertes sur cet appareil
            </button>
          )}

          <div className="max-h-96 overflow-y-auto">
            {mine.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-gray-400">Aucune notification.</p>
            ) : (
              mine.slice(0, 30).map((n) => {
                const isUnread = unread.some((u) => u.id === n.id)
                return (
                  <button
                    key={n.id}
                    onClick={() => onClickNotif(n)}
                    className={`flex w-full items-start gap-3 border-b border-gray-50 px-3 py-2.5 text-left hover:bg-gray-50 ${isUnread ? 'bg-primary/[0.04]' : ''}`}
                  >
                    <span className="mt-0.5 text-lg leading-none">{EMOJI[n.type] || '🔔'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className={`truncate text-sm ${isUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{n.title}</span>
                        {isUnread && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </span>
                      {n.body && <span className="mt-0.5 block truncate text-xs text-gray-500">{n.body}</span>}
                      <span className="mt-0.5 block text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

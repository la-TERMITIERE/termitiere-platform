// Cloche de notifications : pastille non-lues + panneau déroulant.
// - Bouton ✕ par notification pour la faire disparaître manuellement.
// - Auto-dismiss 5 min après lecture.
// - Réglage du son des alertes et activation des notifications de l'appareil.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, BellRing, BellOff, X, Volume2, VolumeX, ChevronRight } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import { useAuth } from '../../hooks/useAuth'
import { subscribeToPush, pushSupported } from '../../core/push'
import { sonActif, setSonActif, jouerDing } from '../../core/alertes'
import { themeOf } from './moduleTheme'

const EMOJI = {
  demande: '📤', approuve: '✅', refus: '⛔', success: '✅', warning: '⚠️',
  rappel: '⏰', user: '👤', info: '🔔'
}

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
  const { mine, unread, unreadAll, markRead, markAllRead, dismiss, dismissAll } = useNotifications()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [son, setSon] = useState(sonActif())
  const ref = useRef(null)

  useEffect(() => {
    if (user && perm === 'granted' && pushSupported()) subscribeToPush(user)
  }, [user, perm])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function activerAlertes() {
    if (typeof Notification === 'undefined') return
    try {
      const p = await Notification.requestPermission()
      setPerm(p)
      if (p === 'granted') await subscribeToPush(user)
    } catch (e) { /* ignore */ }
  }

  function basculerSon() {
    const v = !son
    setSon(v)
    setSonActif(v)
    if (v) jouerDing() // aperçu du son
  }

  function onClickNotif(n) {
    markRead(n.id)
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  const nUnread = unread.length
  // Non-lues qui concernent d'autres applications que celle affichée : la cloche
  // reste cloisonnée, mais on ne les cache pas complètement.
  const nAilleurs = unreadAll.length - nUnread

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"
        aria-label={`Notifications${unreadAll.length ? ` (${unreadAll.length} non lues)` : ''}`}
      >
        {unreadAll.length > 0 ? <BellRing size={20} className="text-primary" /> : <Bell size={20} />}
        {unreadAll.length > 0 && (
          <>
            <span className="absolute -right-0.5 -top-0.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadAll.length > 9 ? '9+' : unreadAll.length}
            </span>
            {/* Halo pulsant : visible même du coin de l'œil */}
            <span className="absolute -right-0.5 -top-0.5 h-4 w-4 animate-ping rounded-full bg-red-500/60" />
          </>
        )}
      </button>

      {open && (
        <div className="fixed right-2 left-2 top-14 z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <p className="text-sm font-bold text-gray-800">
              Notifications
              {nUnread > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{nUnread} nouvelle{nUnread > 1 ? 's' : ''}</span>}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={basculerSon} title={son ? 'Couper le son des alertes' : 'Activer le son des alertes'}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                {son ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
              {nUnread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <Check size={13} /> Tout lu
                </button>
              )}
              {mine.length > 0 && (
                <button onClick={() => { if (confirm('Effacer toutes les notifications affichées ?')) dismissAll() }}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-red-600 hover:underline">
                  <X size={12} /> Tout effacer
                </button>
              )}
            </div>
          </div>

          {perm === 'default' && pushSupported() && (
            <button onClick={activerAlertes} className="flex w-full items-center gap-2 border-b border-amber-100 bg-amber-50 px-3 py-2 text-left text-xs font-medium text-amber-800 hover:bg-amber-100">
              <BellRing size={14} className="shrink-0" />
              Activer les alertes sur cet appareil (même appli fermée)
            </button>
          )}
          {perm === 'denied' && (
            <p className="flex items-start gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 text-left text-[11px] text-gray-500">
              <BellOff size={14} className="mt-0.5 shrink-0" />
              Notifications bloquées pour ce site. Autorisez-les dans les réglages
              du navigateur (🔒 à côté de l’adresse) pour être alerté appli fermée.
            </p>
          )}

          <div className="max-h-96 overflow-y-auto">
            {mine.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-gray-400">Aucune notification.</p>
            ) : (
              mine.slice(0, 30).map((n) => {
                const isUnread = unread.some((u) => u.id === n.id)
                const theme = themeOf(n.module)
                return (
                  <div
                    key={n.id}
                    className="relative flex w-full items-start gap-2 border-b border-gray-50 py-2.5 pl-3 pr-1"
                    style={isUnread ? { background: `${theme.color}0f`, borderLeft: `3px solid ${theme.color}` } : { borderLeft: '3px solid transparent' }}
                  >
                    <button
                      onClick={() => onClickNotif(n)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left hover:opacity-80"
                    >
                      <span className="mt-0.5 text-lg leading-none">{EMOJI[n.type] || '🔔'}</span>
                      <span className="min-w-0 flex-1">
                        {n.module && (
                          <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: theme.color }}>
                            {theme.nom}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <span className={`truncate text-sm ${isUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{n.title}</span>
                          {isUnread && <span className="ml-auto h-2 w-2 shrink-0 rounded-full" style={{ background: theme.color }} />}
                        </span>
                        {n.body && <span className="mt-0.5 block truncate text-xs text-gray-500">{n.body}</span>}
                        <span className="mt-0.5 block text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                      </span>
                    </button>
                    {/* Effacer CETTE notification — toujours visible (indispensable au
                        toucher : pas de survol sur mobile). */}
                    <button
                      onClick={(e) => { e.stopPropagation(); dismiss(n.id) }}
                      className="mt-0.5 shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Effacer cette notification"
                      aria-label="Effacer cette notification"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {nAilleurs > 0 && (
            <button
              onClick={() => { setOpen(false); navigate('/') }}
              className="flex w-full items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-600 hover:bg-gray-100"
            >
              <span>{nAilleurs} notification{nAilleurs > 1 ? 's' : ''} dans d’autres applications</span>
              <ChevronRight size={14} />
            </button>
          )}

          {mine.length > 0 && (
            <p className="border-t border-gray-100 px-3 py-2 text-center text-[11px] text-gray-400">
              Touchez une notification pour l’ouvrir · le ✕ l’efface définitivement.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Hook des notifications de l'utilisateur courant.
// - Filtre la collection `notifications` selon le rôle / l'identité.
// - Calcule les non-lues.
// - Auto-dismiss 5 min après lecture.
// - Dismiss manuel possible (cache localement la notification).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCollection } from './useFirestore'
import { useAuth } from './useAuth'
import { updateItem } from '../core/db'
import { toast } from '../core/notifications'

const MOUNT_TS = Date.now()
const AUTO_DISMISS_MS = 5 * 60 * 1000 // 5 minutes

function isFor(n, user, role) {
  if (!user) return false
  if (n.excludeUid && n.excludeUid === user.uid) return false
  const roles = n.forRoles || []
  const users = n.forUsers || []
  if (!roles.length && !users.length) return true
  if (roles.includes(role)) return true
  if (users.includes(user.uid) || users.includes(user.login)) return true
  return false
}

export function useNotifications() {
  const { user, role } = useAuth()
  const { data } = useCollection('notifications')
  const shownRef = useRef(new Set())

  // IDs dismissés manuellement (état local, disparaît au rechargement)
  const [dismissed, setDismissed] = useState(new Set())
  // { id: timestamp } — moment où la notif a été lue, pour auto-dismiss après 5 min
  const [readAt, setReadAt] = useState({})

  const mine = useMemo(
    () =>
      data
        .filter((n) => isFor(n, user, role) && !dismissed.has(n.id))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [data, user, role, dismissed]
  )

  // Notifications non-lues (non dismissées)
  const unread = useMemo(
    () => mine.filter((n) => !(n.readBy && n.readBy[user?.uid])),
    [mine, user]
  )

  // Auto-dismiss : 5 min après avoir été marquée lue
  useEffect(() => {
    if (!user) return
    const timers = []
    Object.entries(readAt).forEach(([id, ts]) => {
      const remaining = AUTO_DISMISS_MS - (Date.now() - ts)
      if (remaining <= 0) {
        setDismissed((prev) => new Set([...prev, id]))
      } else {
        const t = setTimeout(() => {
          setDismissed((prev) => new Set([...prev, id]))
        }, remaining)
        timers.push(t)
      }
    })
    return () => timers.forEach((t) => clearTimeout(t))
  }, [readAt, user])

  // Toast + notification système pour les nouvelles notifs.
  useEffect(() => {
    if (!user) return
    for (const n of mine) {
      if (shownRef.current.has(n.id)) continue
      shownRef.current.add(n.id)
      if ((n.createdAt || 0) < MOUNT_TS) continue
      if (n.readBy && n.readBy[user.uid]) continue
      toast.info(`🔔 ${n.title}`)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(n.title, { body: n.body || '', tag: n.id, icon: '/icon-192.png' }) } catch (e) { /* ignore */ }
      }
    }
  }, [mine, user])

  const markRead = useCallback((id) => {
    if (!user) return
    updateItem('notifications', id, { [`readBy/${user.uid}`]: true })
    setReadAt((prev) => ({ ...prev, [id]: Date.now() }))
  }, [user])

  const markAllRead = useCallback(() => {
    unread.forEach((n) => markRead(n.id))
  }, [unread, markRead])

  const dismiss = useCallback((id) => {
    markRead(id)
    setDismissed((prev) => new Set([...prev, id]))
  }, [markRead])

  const dismissAll = useCallback(() => {
    unread.forEach((n) => dismiss(n.id))
  }, [unread, dismiss])

  return { mine, unread, markRead, markAllRead, dismiss, dismissAll }
}

// Hook des notifications de l'utilisateur courant.
// - Filtre la collection `notifications` selon le rôle / l'identité.
// - Calcule les non-lues.
// - Déclenche un toast + une notification SYSTÈME (type WhatsApp/Gmail) pour
//   chaque nouvelle notification reçue pendant que l'app est ouverte.
import { useEffect, useMemo, useRef } from 'react'
import { useCollection } from './useFirestore'
import { useAuth } from './useAuth'
import { updateItem } from '../core/db'
import { toast } from '../core/notifications'

// Horodatage de chargement de l'app : on ne « popup » que les notifs postérieures
// (sinon tout l'historique remonterait à chaque ouverture).
const MOUNT_TS = Date.now()

function isFor(n, user, role) {
  if (!user) return false
  if (n.excludeUid && n.excludeUid === user.uid) return false
  const roles = n.forRoles || []
  const users = n.forUsers || []
  if (!roles.length && !users.length) return true // diffusion générale
  if (roles.includes(role)) return true
  if (users.includes(user.uid) || users.includes(user.login)) return true
  return false
}

export function useNotifications() {
  const { user, role } = useAuth()
  const { data } = useCollection('notifications')
  const shownRef = useRef(new Set())

  const mine = useMemo(
    () =>
      data
        .filter((n) => isFor(n, user, role))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [data, user, role]
  )

  const unread = useMemo(
    () => mine.filter((n) => !(n.readBy && n.readBy[user?.uid])),
    [mine, user]
  )

  // Popup (toast + notification système) pour les nouvelles notifications.
  useEffect(() => {
    if (!user) return
    for (const n of mine) {
      if (shownRef.current.has(n.id)) continue
      shownRef.current.add(n.id)
      if ((n.createdAt || 0) < MOUNT_TS) continue          // historique : pas de popup
      if (n.readBy && n.readBy[user.uid]) continue          // déjà lue
      toast.info(`🔔 ${n.title}`)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(n.title, { body: n.body || '', tag: n.id, icon: '/icon-192.png' }) } catch (e) { /* ignore */ }
      }
    }
  }, [mine, user])

  const markRead = (id) => { if (user) updateItem('notifications', id, { [`readBy/${user.uid}`]: true }) }
  const markAllRead = () => unread.forEach((n) => markRead(n.id))

  return { mine, unread, markRead, markAllRead }
}

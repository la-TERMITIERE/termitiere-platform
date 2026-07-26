// Hook des notifications de l'utilisateur courant.
// - Filtre la collection `notifications` selon le rôle / l'identité.
// - Calcule les non-lues.
// - Déclenche l'alerte façon WhatsApp : bandeau heads-up + son + vibration quand
//   l'app est à l'écran, vraie notification système quand elle est en arrière-plan.
// - Met à jour la pastille de l'onglet et de l'icône de l'application.
// - Auto-dismiss 5 min après lecture.
// - Dismiss manuel possible (cache localement la notification).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useCollection } from './useFirestore'
import { useAuth } from './useAuth'
import { updateItem } from '../core/db'
import { useAlertesStore, setBadgeApp } from '../core/alertes'

const MOUNT_TS = Date.now()
const AUTO_DISMISS_MS = 5 * 60 * 1000 // 5 minutes
// Types « importants » : alerte plus longue, son plus marqué, notification
// système persistante (demandes d'autorisation, refus, alertes).
const TYPES_URGENTS = ['demande', 'refus', 'warning', 'alerte']

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

// Chaque application n'affiche que SES notifications : à l'intérieur d'un module,
// on masque celles des autres modules pour ne pas mélanger les acteurs.
// Sur le portail (aucun module actif), tout est visible (vue d'ensemble) — mais
// jamais un module auquel l'utilisateur n'a pas accès (cf. hasModule ci-dessous).
function matchesModule(n, activeModule) {
  if (!activeModule) return true
  if (!n.module) return true // notifs globales (compte, système…)
  return n.module === activeModule
}

// Notification SYSTÈME (hors de l'onglet) — passe par le service worker quand il
// est disponible : c'est le seul chemin qui fonctionne sur Android/PWA.
async function notifSysteme(n) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const urgent = TYPES_URGENTS.includes(n.type)
  const options = {
    body: n.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: n.id,
    renotify: true,
    requireInteraction: urgent,
    vibrate: urgent ? [90, 60, 90, 60, 140] : [70, 45, 70],
    data: { url: n.link || '/' }
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg?.showNotification) { await reg.showNotification(n.title, options); return }
  } catch { /* repli ci-dessous */ }
  try { new Notification(n.title, options) } catch { /* ignore */ }
}

export function useNotifications() {
  const { user, role, hasModule } = useAuth()
  const { data } = useCollection('notifications')
  const location = useLocation()
  const activeModule = location.pathname.split('/')[1] || '' // '' = portail
  const shownRef = useRef(new Set())
  const montrerAlerte = useAlertesStore((s) => s.montrer)

  // IDs dismissés manuellement (état local, disparaît au rechargement)
  const [dismissed, setDismissed] = useState(new Set())
  // { id: timestamp } — moment où la notif a été lue, pour auto-dismiss après 5 min
  const [readAt, setReadAt] = useState({})

  // Toutes MES notifications, tous modules confondus. Sert aux alertes et à la
  // pastille : une demande d'autorisation doit m'alerter même si je suis en train
  // de travailler dans un autre module (comme WhatsApp alerte hors conversation).
  const toutes = useMemo(
    () =>
      data
        .filter((n) =>
          isFor(n, user, role) &&
          (!n.module || hasModule(n.module)) &&
          !dismissed.has(n.id)
        )
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [data, user, role, dismissed, hasModule]
  )

  // Ce qu'affiche la cloche : cloisonné au module courant.
  const mine = useMemo(
    () => toutes.filter((n) => matchesModule(n, activeModule)),
    [toutes, activeModule]
  )

  // Notifications non-lues (non dismissées)
  const unread = useMemo(
    () => mine.filter((n) => !(n.readBy && n.readBy[user?.uid])),
    [mine, user]
  )

  // Non-lues tous modules confondus (pastille onglet / icône appli).
  const unreadAll = useMemo(
    () => toutes.filter((n) => !(n.readBy && n.readBy[user?.uid])),
    [toutes, user]
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

  // Alerte à chaque nouvelle notification : bandeau heads-up si l'app est à
  // l'écran, notification système si elle est en arrière-plan / minimisée.
  useEffect(() => {
    if (!user) return
    for (const n of toutes) {
      if (shownRef.current.has(n.id)) continue
      shownRef.current.add(n.id)
      if ((n.createdAt || 0) < MOUNT_TS) continue
      if (n.readBy && n.readBy[user.uid]) continue
      const urgent = TYPES_URGENTS.includes(n.type)
      if (document.visibilityState === 'hidden') {
        notifSysteme(n)
      } else {
        montrerAlerte({
          id: n.id, type: n.type, title: n.title, body: n.body,
          module: n.module, link: n.link, urgent
        })
      }
    }
  }, [toutes, user, montrerAlerte])

  // Pastille : titre de l'onglet + icône de l'application installée.
  useEffect(() => {
    const n = unreadAll.length
    setBadgeApp(n)
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '')
    document.title = n > 0 ? `(${n > 99 ? '99+' : n}) ${base}` : base
  }, [unreadAll.length])

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

  return { mine, unread, unreadAll, markRead, markAllRead, dismiss, dismissAll }
}

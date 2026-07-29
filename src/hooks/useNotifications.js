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
import { updateItem, setItem } from '../core/db'
import { useAlertesStore, setBadgeApp } from '../core/alertes'

const MOUNT_TS = Date.now()

// Lien d'ouverture d'une notification. Repli sur la page du module concerné
// (au lieu de l'accueil) quand la notification n'a pas de lien précis — pour ne
// plus « retomber sur l'accueil » en cliquant une notification.
export const lienNotif = (n) => n?.link || (n?.module ? `/${n.module}` : '/')
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

// Vrai si l'utilisateur a lu / effacé la notif. Sur Firebase (prod), la clé
// `champ/uid` crée un objet imbriqué ({ [uid]: true }) ; en mode démo (localStorage)
// elle reste une clé plate ("champ/uid"). On accepte les deux pour un comportement
// identique dans les deux environnements.
const aMarque = (n, champ, uid) => !!(n?.[champ]?.[uid] || n?.[`${champ}/${uid}`])

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
    data: { url: lienNotif(n) }
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
  const { data: prefs } = useCollection('notif_prefs')
  const location = useLocation()
  const activeModule = location.pathname.split('/')[1] || '' // '' = portail
  const shownRef = useRef(new Set())
  const montrerAlerte = useAlertesStore((s) => s.montrer)

  // IDs effacés — retrait local immédiat, doublé d'un effacement persistant en
  // base (dismissedBy) pour que la notification ne revienne pas au rechargement.
  const [dismissed, setDismissed] = useState(new Set())

  // Horodatage « tout effacer » PAR UTILISATEUR : toute notification créée avant
  // ce moment est considérée comme effacée. Un seul enregistrement remet la
  // pastille à zéro d'un coup — indispensable avec des centaines de notifications
  // historiques (sinon le « 9+ » ne partait jamais). Repli local instantané.
  const [clearedLocal, setClearedLocal] = useState(0)
  const clearedAt = useMemo(() => {
    const row = prefs.find((p) => p.id === user?.uid)
    return Math.max(row?.clearedAt || 0, clearedLocal)
  }, [prefs, user, clearedLocal])

  // Une notification est-elle « éteinte » pour l'utilisateur (effacée une-par-une
  // OU antérieure au dernier « tout effacer ») ?
  const eteinte = useCallback(
    (n) => dismissed.has(n.id) || aMarque(n, 'dismissedBy', user?.uid) || ((n.createdAt || 0) <= clearedAt),
    [dismissed, user, clearedAt]
  )

  // Toutes MES notifications, tous modules confondus. Sert aux alertes et à la
  // pastille : une demande d'autorisation doit m'alerter même si je suis en train
  // de travailler dans un autre module (comme WhatsApp alerte hors conversation).
  const toutes = useMemo(
    () =>
      data
        .filter((n) =>
          isFor(n, user, role) &&
          (!n.module || hasModule(n.module)) &&
          !eteinte(n)
        )
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [data, user, role, hasModule, eteinte]
  )

  // Ce qu'affiche la cloche : cloisonné au module courant.
  const mine = useMemo(
    () => toutes.filter((n) => matchesModule(n, activeModule)),
    [toutes, activeModule]
  )

  // Notifications non-lues (non dismissées)
  const unread = useMemo(
    () => mine.filter((n) => !aMarque(n, 'readBy', user?.uid)),
    [mine, user]
  )

  // Non-lues tous modules confondus (pastille onglet / icône appli).
  const unreadAll = useMemo(
    () => toutes.filter((n) => !aMarque(n, 'readBy', user?.uid)),
    [toutes, user]
  )

  // Les notifications RESTENT dans la cloche jusqu'à ce que l'utilisateur les
  // efface lui-même (comme WhatsApp) — plus d'auto-effacement après lecture, qui
  // faisait « disparaître puis réapparaître » les notifications de façon confuse.

  // Alerte à chaque nouvelle notification : bandeau heads-up si l'app est à
  // l'écran, notification système si elle est en arrière-plan / minimisée.
  useEffect(() => {
    if (!user) return
    for (const n of toutes) {
      if (shownRef.current.has(n.id)) continue
      shownRef.current.add(n.id)
      if ((n.createdAt || 0) < MOUNT_TS) continue
      if (aMarque(n, 'readBy', user.uid)) continue
      const urgent = TYPES_URGENTS.includes(n.type)
      if (document.visibilityState === 'hidden') {
        notifSysteme(n)
      } else {
        montrerAlerte({
          id: n.id, type: n.type, title: n.title, body: n.body,
          module: n.module, link: lienNotif(n), urgent
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
  }, [user])

  const markAllRead = useCallback(() => {
    unread.forEach((n) => markRead(n.id))
  }, [unread, markRead])

  // Efface UNE notification : persistant par utilisateur (dismissedBy) + retrait
  // local immédiat pour un ressenti instantané. Marque aussi comme lue.
  const dismiss = useCallback((id) => {
    if (user) updateItem('notifications', id, { [`readBy/${user.uid}`]: true, [`dismissedBy/${user.uid}`]: true })
    setDismissed((prev) => new Set([...prev, id]))
  }, [user])

  // « Tout effacer » = efface TOUTES les notifications de l'utilisateur, tous
  // modules confondus, en UNE écriture (horodatage). Remet la pastille à zéro
  // même avec des centaines de notifications historiques — la vraie cause du
  // « 9+ qui ne part jamais ». Effet immédiat (clearedLocal) + persistant.
  const dismissAll = useCallback(() => {
    const t = Date.now()
    setClearedLocal(t)
    if (user) setItem('notif_prefs', user.uid, { clearedAt: t }).catch(() => {})
  }, [user])

  return { mine, unread, unreadAll, markRead, markAllRead, dismiss, dismissAll }
}

// Abonnement Web Push + envoi de notifications push (app fermée).
// Clé VAPID PUBLIQUE (non secrète) — la clé privée correspondante vit côté
// serveur (fonction Netlify send-push, variable VAPID_PRIVATE).
import { getAll, setItem } from './db'
import { auth } from './firebase'

// Doit correspondre exactement à VAPID_PUBLIC côté serveur (Netlify). Surchargée
// via VITE_VAPID_PUBLIC si vous générez votre propre paire de clés.
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC || 'BKlCjgPKFCXhaFwx5RtYA9puJPaT9N6NN2Yt_KYr2bjriCObVcNVH6dw5yFrHinbvgSRHWVvK7jiv-Tk4lb3oDc'

// Jeton Firebase Auth de l'utilisateur courant, envoyé au serveur pour prouver
// que l'appel vient bien d'un utilisateur connecté de l'app (cf. send-push.js).
async function authHeader() {
  try {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

export const pushSupported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
  typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

// Clé stable (sans caractères interdits RTDB) dérivée de l'endpoint.
function keyFor(endpoint) {
  let h = 5381
  for (let i = 0; i < endpoint.length; i++) h = ((h << 5) + h + endpoint.charCodeAt(i)) >>> 0
  return 'sub_' + h.toString(36)
}

// Abonne l'appareil courant aux notifications push et enregistre l'abonnement
// (associé à l'utilisateur) pour que le serveur puisse lui pousser des messages.
export async function subscribeToPush(user) {
  if (!user || !pushSupported()) return false
  if (Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
      })
    }
    const json = sub.toJSON()
    await setItem('push_subs', keyFor(json.endpoint), {
      uid: user.uid,
      login: user.login,
      endpoint: json.endpoint,
      sub: json,
      ua: navigator.userAgent.slice(0, 120),
      createdAt: Date.now()
    })
    return true
  } catch (e) {
    console.warn('[push] abonnement échoué :', e)
    return false
  }
}

// Pousse une notification (title/body/url) aux abonnements des utilisateurs ciblés.
export async function pushToUsers(uids, payload) {
  try {
    const wanted = (uids || []).filter(Boolean)
    if (!wanted.length) return
    const all = await getAll('push_subs')
    const subscriptions = all
      .filter((s) => s.sub && (wanted.includes(s.uid) || wanted.includes(s.login)))
      .map((s) => s.sub)
    if (!subscriptions.length) return
    await fetch('/.netlify/functions/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ subscriptions, payload })
    })
  } catch (e) { /* best effort */ }
}

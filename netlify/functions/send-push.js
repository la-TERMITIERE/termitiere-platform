// Fonction serveur Netlify : envoie des notifications Web Push aux abonnements
// fournis, signées avec les clés VAPID. Permet de notifier un utilisateur même
// quand l'application est FERMÉE (le service worker reçoit le push).
//
// Les clés VAPID doivent être fournies via les variables d'environnement
// VAPID_PUBLIC / VAPID_PRIVATE (Netlify → Site settings → Environment variables).
// AUCUNE valeur par défaut ici : une clé privée ne doit jamais être commitée
// dans le code source, même en repli. La clé publique correspondante vit côté
// client dans src/core/push.js (VITE_VAPID_PUBLIC) et DOIT être identique.
import webpush from 'web-push'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const VAPID_PUBLIC = process.env.VAPID_PUBLIC
const VAPID_PRIVATE = process.env.VAPID_PRIVATE
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:latermitiere2021@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)
}

function ensureAdmin() {
  if (getApps().length) return true
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return false
  try { initializeApp({ credential: cert(JSON.parse(raw)) }); return true }
  catch { return false }
}

// Vérifie le jeton Firebase Auth de l'appelant (garde-fou anti-abus en plus du
// rate-limit). Renvoie `null` si le SDK Admin n'est pas encore configuré (repli :
// rate-limit seul, comme avant), ou `false` si le jeton est absent/invalide.
async function verifyCaller(event) {
  if (!ensureAdmin()) return null
  const authz = event.headers['authorization'] || event.headers['Authorization'] || ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  if (!token) return false
  try { return await getAuth().verifyIdToken(token) } catch { return false }
}

// Limite de débit PAR IP (anti-abus) : endpoint public → 1re barrière contre les
// rafales automatiques. Fenêtre en mémoire (par instance serverless).
const RL_MAX = 30
const RL_WINDOW_MS = 60000
const rlWindows = new Map()
function rateLimited(ip) {
  const now = Date.now()
  const arr = (rlWindows.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS)
  if (arr.length >= RL_MAX) return true
  arr.push(now)
  rlWindows.set(ip, arr)
  return false
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) }
  }

  const ip = event.headers['x-nf-client-connection-ip']
    || (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || 'unknown'
  if (rateLimited(ip)) {
    return { statusCode: 429, body: JSON.stringify({ ok: false, error: 'Trop de requêtes' }) }
  }
  const caller = await verifyCaller(event)
  if (caller === false) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Authentification requise' }) }
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, skipped: 'Push non configuré (VAPID_PUBLIC / VAPID_PRIVATE manquants)' }) }
  }
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) } }

  const { subscriptions = [], payload = {} } = body
  const data = JSON.stringify({
    title: payload.title || 'LA TERMITIÈRE',
    body: payload.body || '',
    url: payload.url || '/',
    tag: payload.tag
  })

  const results = await Promise.all(
    (Array.isArray(subscriptions) ? subscriptions : []).map(async (sub) => {
      try {
        await webpush.sendNotification(sub, data)
        return { ok: true }
      } catch (e) {
        // 404/410 = abonnement expiré (à nettoyer côté client si souhaité)
        return { ok: false, statusCode: e?.statusCode || 0, endpoint: sub?.endpoint }
      }
    })
  )

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      sent: results.filter((r) => r.ok).length,
      total: results.length,
      expired: results.filter((r) => r.statusCode === 404 || r.statusCode === 410).map((r) => r.endpoint)
    })
  }
}

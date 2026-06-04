// Fonction serveur Netlify : envoie des notifications Web Push aux abonnements
// fournis, signées avec les clés VAPID. Permet de notifier un utilisateur même
// quand l'application est FERMÉE (le service worker reçoit le push).
//
// Les clés VAPID sont intégrées (la clé publique n'est pas secrète ; la privée
// ne permet que d'émettre des push vers les abonnés de CETTE app). On peut les
// surcharger via les variables d'environnement VAPID_PUBLIC / VAPID_PRIVATE.
import webpush from 'web-push'

const VAPID_PUBLIC = process.env.VAPID_PUBLIC || 'BKlCjgPKFCXhaFwx5RtYA9puJPaT9N6NN2Yt_KYr2bjriCObVcNVH6dw5yFrHinbvgSRHWVvK7jiv-Tk4lb3oDc'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'tQD0CKCt9FX7TOFGMEHAuaoxHRMLj0Yh89o00BpKRqI'

webpush.setVapidDetails('mailto:latermitiere2021@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) }
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

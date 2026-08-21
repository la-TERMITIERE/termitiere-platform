// Fonction serveur Netlify : envoie des alertes WhatsApp via l'API WhatsApp Business
// Cloud (Meta), pour notifier même quand l'application est FERMÉE. Voir
// NOTIFICATIONS_WHATSAPP.md pour la configuration (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID).
//
// Suit le même schéma de sécurité que send-push.js : authentification par jeton
// Firebase (anti-abus), limite de débit par IP, échec silencieux (skipped, pas
// d'erreur) si les variables d'environnement ne sont pas encore configurées.
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const WHATSAPP_TOKEN    = process.env.WHATSAPP_TOKEN
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID
const WHATSAPP_TEMPLATE = process.env.WHATSAPP_TEMPLATE || ''
const WHATSAPP_LANG     = process.env.WHATSAPP_LANG || 'fr'

function ensureAdmin() {
  if (getApps().length) return true
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return false
  try { initializeApp({ credential: cert(JSON.parse(raw)) }); return true }
  catch { return false }
}

async function verifyCaller(event) {
  if (!ensureAdmin()) return null
  const authz = event.headers['authorization'] || event.headers['Authorization'] || ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  if (!token) return false
  try { return await getAuth().verifyIdToken(token) } catch { return false }
}

// Limite de débit PAR IP (anti-abus) — même recette que send-push.js.
const RL_MAX = 20
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

// Un numéro WhatsApp valide (format international) : que des chiffres, 8 à 15.
function numeroValide(n) {
  return /^[0-9]{8,15}$/.test(String(n || '').trim())
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
  if (!caller) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        ok: false,
        error: caller === null
          ? 'Vérification impossible : FIREBASE_SERVICE_ACCOUNT absent ou invalide côté serveur.'
          : 'Authentification requise'
      })
    }
  }

  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, skipped: 'WhatsApp non configuré (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID manquants)' }) }
  }

  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) } }

  const { numbers = [], payload = {} } = body
  const texte = [payload.title, payload.body].filter(Boolean).join('\n\n').slice(0, 1000)
  if (!texte) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Message vide' }) }

  const destinataires = [...new Set((Array.isArray(numbers) ? numbers : []).map((n) => String(n || '').replace(/[^0-9]/g, '')))]
    .filter(numeroValide)
    .slice(0, 50) // borne large mais évite un envoi massif accidentel en un seul appel

  const results = await Promise.all(destinataires.map(async (to) => {
    try {
      // Message texte libre : fonctionne dans la fenêtre de 24h après un message du
      // destinataire, ou vers des numéros de test vérifiés en mode sandbox. Hors de
      // cette fenêtre en production, Meta exige un template approuvé (WHATSAPP_TEMPLATE) —
      // on l'utilise alors, avec le texte complet comme unique variable {{1}} du corps
      // (adapter cette structure si votre template approuvé a une forme différente).
      const requestBody = WHATSAPP_TEMPLATE
        ? {
            messaging_product: 'whatsapp', to, type: 'template',
            template: {
              name: WHATSAPP_TEMPLATE, language: { code: WHATSAPP_LANG },
              components: [{ type: 'body', parameters: [{ type: 'text', text: texte }] }]
            }
          }
        : { messaging_product: 'whatsapp', to, type: 'text', text: { body: texte, preview_url: false } }

      const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WHATSAPP_TOKEN}` },
        body: JSON.stringify(requestBody)
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, to, error: json?.error?.message || `HTTP ${res.status}` }
      return { ok: true, to }
    } catch (e) {
      return { ok: false, to, error: e.message }
    }
  }))

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      sent: results.filter((r) => r.ok).length,
      total: results.length,
      erreurs: results.filter((r) => !r.ok)
    })
  }
}

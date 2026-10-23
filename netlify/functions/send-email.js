// Fonction serveur Netlify : envoie un e-mail d'alerte (via Resend) aux adresses fournies. Sert aux dépenses :
// le PAU et la GE reçoivent un e-mail pour chaque dépense, et pour chaque demande de décaissement à valider.
//
// Même schéma de sécurité que whatsapp-notify.js : authentification par jeton Firebase (anti-abus), limite de
// débit par IP, échec silencieux (skipped, pas d'erreur) tant que la configuration n'est pas faite.
//
// Variables d'environnement Netlify :
//   RESEND_API_KEY   (obligatoire) clé API Resend
//   EMAIL_FROM       (conseillé)   expéditeur, ex. « LA TERMITIÈRE <alertes@latermitiere.com> » : le domaine doit être
//                                  vérifié dans Resend. Par défaut onboarding@resend.dev, qui n'envoie QU'À l'adresse
//                                  du compte Resend (suffisant pour un essai).
//   APP_URL          (optionnel)   adresse de l'application, pour le lien « Ouvrir » (ex. https://latermitiere-app.netlify.app)
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM || 'LA TERMITIÈRE <onboarding@resend.dev>'
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '')

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

const emailValide = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim())
const echapper = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) }
  }
  const ip = event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) return { statusCode: 429, body: JSON.stringify({ ok: false, error: 'Trop de requêtes' }) }

  const caller = await verifyCaller(event)
  if (!caller) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: caller === null ? 'Vérification impossible : FIREBASE_SERVICE_ACCOUNT absent ou invalide côté serveur.' : 'Authentification requise' })
    }
  }
  if (!RESEND_API_KEY) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, skipped: 'E-mail non configuré (RESEND_API_KEY manquante)' }) }
  }

  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) } }
  const destinataires = [...new Set((body.to || []).map((e) => String(e).trim()).filter(emailValide))].slice(0, 10)
  const sujet = String(body.subject || '').slice(0, 200)
  const texte = String(body.text || '').slice(0, 4000)
  if (!destinataires.length || !sujet) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Destinataire ou sujet manquant' }) }

  const lien = body.link ? `${APP_URL}${String(body.link).startsWith('/') ? '' : '/'}${body.link}` : APP_URL
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1f2937">
    <h2 style="color:#B45309;margin:0 0 12px">${echapper(sujet)}</h2>
    <p style="white-space:pre-line;font-size:15px;line-height:1.5">${echapper(texte)}</p>
    ${lien ? `<p style="margin-top:20px"><a href="${echapper(lien)}" style="background:#B45309;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Ouvrir dans LA TERMITIÈRE</a></p>` : ''}
    <p style="margin-top:24px;font-size:12px;color:#9ca3af">Message automatique de LA TERMITIÈRE : E-DÉPENSES.</p></div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: destinataires, subject: sujet, html, text: `${texte}${lien ? `\n\n${lien}` : ''}` })
    })
    const info = await res.json().catch(() => ({}))
    if (!res.ok) return { statusCode: 200, body: JSON.stringify({ ok: false, error: info.message || `Resend ${res.status}` }) }
    return { statusCode: 200, body: JSON.stringify({ ok: true, envoyes: destinataires.length }) }
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e.message || e) }) }
  }
}

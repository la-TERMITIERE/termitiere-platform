// Fonction serveur Netlify : auto-pointage depuis le carnet de présence public
// MAXI-GYM. Le client scanne son QR, arrive sur /gym/carnet/<jeton>, et peut
// s'y pointer lui-même s'il ne l'est pas déjà aujourd'hui — sans compte, donc
// sans accès direct à la base (cf. gym-carnet.js pour le contexte des règles).
//
// Chaque présence garde une trace de son origine (`source: 'client'` ici,
// absent/'reception' pour un pointage fait depuis l'appli par le personnel) —
// utile si un jour il faut distinguer les deux dans les statistiques.
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const DB_URL = process.env.VITE_FIREBASE_DATABASE_URL || 'https://max-agro-83baf-default-rtdb.firebaseio.com'

function ensureAdmin() {
  if (getApps().length) return true
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return false
  try {
    initializeApp({ credential: cert(JSON.parse(raw)), databaseURL: DB_URL })
    return true
  } catch (e) {
    console.error('[gym-carnet-pointer] FIREBASE_SERVICE_ACCOUNT invalide :', e?.message)
    return false
  }
}

// Limite de débit PAR IP — plus stricte : c'est une écriture.
const RL_MAX = 10
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

async function trouverClientParToken(db, token) {
  const snap = await db.ref('tp/gym_clients').orderByChild('qrToken').equalTo(token).limitToFirst(1).once('value')
  const val = snap.val()
  if (!val) return null
  const id = Object.keys(val)[0]
  return { id, ...val[id] }
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) }
  }

  const ip = event.headers['x-nf-client-connection-ip']
    || (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || 'unknown'
  if (rateLimited(ip)) {
    return { statusCode: 429, body: JSON.stringify({ ok: false, error: 'Trop de tentatives — réessayez dans une minute.' }) }
  }

  if (!ensureAdmin()) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'not_configured' }) }
  }

  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) } }
  const token = String(body.token || '').trim()
  if (!token || token.length > 100) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Lien invalide.' }) }
  }

  try {
    const db = getDatabase()
    const client = await trouverClientParToken(db, token)
    if (!client) return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Lien invalide ou expiré.' }) }

    const site = client.site || 'lome'
    const cle = (client.nom || '').trim().toLowerCase()
    const aujourdhui = new Date().toISOString().slice(0, 10)

    const presencesSnap = await db.ref('tp/gym_presences').orderByChild('clientNom').equalTo(client.nom).once('value')
    const presences = Object.values(presencesSnap.val() || {})
      .filter((p) => (p.clientNom || '').trim().toLowerCase() === cle && (p.site || 'lome') === site)
    const dejaPointe = presences.some((p) => p.date === aujourdhui)

    if (!dejaPointe) {
      await db.ref('tp/gym_presences').push({
        clientNom: client.nom, date: aujourdhui, site, source: 'client',
        enregistrePar: 'Client (auto — carnet QR)', enregistreParUid: null, createdAt: Date.now()
      })
      await db.ref('tp/audit_global').push({
        userId: 'client', userNom: client.nom, userRole: '', module: 'gym',
        action: 'PRESENCE_POINTEE', details: `${client.nom} — arrivée auto-pointée via le carnet QR`,
        meta: null, timestamp: Date.now()
      })
    }

    const joursPresents = [...presences.map((p) => p.date), ...(dejaPointe ? [] : [aujourdhui])]
      .filter((d) => d.startsWith(aujourdhui.slice(0, 7)))

    return { statusCode: 200, body: JSON.stringify({ ok: true, dejaPointe, joursPresents }) }
  } catch (e) {
    console.error('[gym-carnet-pointer] erreur :', e?.message)
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Erreur — réessayez.' }) }
  }
}

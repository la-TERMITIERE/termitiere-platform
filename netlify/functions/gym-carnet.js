// Fonction serveur Netlify : lecture du carnet de présence public MAXI-GYM.
//
// Le carnet (page /gym/carnet/<jeton>) n'exige pas de connexion — la base est
// verrouillée à `auth != null` (cf. database.rules.json), donc un visiteur non
// authentifié ne peut rien lire directement. Cette fonction contourne les règles
// via le SDK Admin, mais ne renvoie QUE les données du client propriétaire du
// jeton (nom, calendrier de présence du mois, statut d'abonnement) — jamais la
// liste des clients, ni leurs coordonnées.
//
// Configuration requise : FIREBASE_SERVICE_ACCOUNT (cf. netlify/functions/login.js).
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
    console.error('[gym-carnet] FIREBASE_SERVICE_ACCOUNT invalide :', e?.message)
    return false
  }
}

// Limite de débit PAR IP — endpoint public, sans authentification.
const RL_MAX = 40
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

export async function trouverClientParToken(db, token) {
  const snap = await db.ref('tp/gym_clients').orderByChild('qrToken').equalTo(token).limitToFirst(1).once('value')
  const val = snap.val()
  if (!val) return null
  const id = Object.keys(val)[0]
  return { id, ...val[id] }
}

export async function handler(event) {
  const ip = event.headers['x-nf-client-connection-ip']
    || (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || 'unknown'
  if (rateLimited(ip)) {
    return { statusCode: 429, body: JSON.stringify({ ok: false, error: 'Trop de requêtes — réessayez dans une minute.' }) }
  }

  if (!ensureAdmin()) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'not_configured' }) }
  }

  const token = String((event.queryStringParameters || {}).token || '').trim()
  if (!token || token.length > 100) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Lien invalide.' }) }
  }

  try {
    const db = getDatabase()
    const client = await trouverClientParToken(db, token)
    if (!client) return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Lien invalide ou expiré.' }) }

    const site = client.site || 'lome'
    const cle = (client.nom || '').trim().toLowerCase()
    const mois = new Date().toISOString().slice(0, 7)

    const [presencesSnap, abosSnap] = await Promise.all([
      db.ref('tp/gym_presences').orderByChild('clientNom').equalTo(client.nom).once('value'),
      db.ref('tp/gym_abonnements').orderByChild('clientNom').equalTo(client.nom).once('value')
    ])
    const presences = Object.values(presencesSnap.val() || {})
      .filter((p) => (p.clientNom || '').trim().toLowerCase() === cle && (p.site || 'lome') === site)
    const abonnements = Object.values(abosSnap.val() || {})
      .filter((a) => (a.clientNom || '').trim().toLowerCase() === cle && (a.site || 'lome') === site)
      .sort((a, b) => (a.dateFin < b.dateFin ? 1 : -1))

    const joursPresents = presences.filter((p) => (p.date || '').startsWith(mois)).map((p) => p.date)
    const aujourdhui = new Date().toISOString().slice(0, 10)
    const abonnementActifRow = abonnements.find((a) => (a.dateFin || '') >= aujourdhui)
    const pointeAujourdhui = presences.some((p) => p.date === aujourdhui)

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        nom: client.nom || '',
        mois,
        joursPresents,
        pointeAujourdhui,
        abonnementActif: !!abonnementActifRow,
        abonnementDateFin: abonnementActifRow?.dateFin || null,
        categorie: abonnementActifRow?.categorie || abonnements[0]?.categorie || null
      })
    }
  } catch (e) {
    console.error('[gym-carnet] erreur :', e?.message)
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Erreur — réessayez.' }) }
  }
}

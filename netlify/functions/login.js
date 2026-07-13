// Fonction serveur Netlify : authentification CÔTÉ SERVEUR.
//
// Avant ce fichier, la vérification du mot de passe se faisait dans le
// navigateur (lecture publique de la collection `users`, comparaison de hash
// en JS client). Comme les règles de la Realtime Database étaient ouvertes
// (.read/.write: true), n'importe qui pouvait lire tous les hash sans même
// se connecter. Cette fonction supprime ce besoin : le hash ne quitte plus
// jamais le serveur, et la base peut être verrouillée à `auth != null`.
//
// Flux :
//   1. Le client envoie { login, pass }.
//   2. On cherche le profil via le SDK Admin (accès total, ignore les règles).
//   3. On vérifie le mot de passe (nouveau schéma salé PBKDF2 ; ancien schéma
//      SHA-256 à sel unique accepté en repli + migration transparente).
//   4. On émet un jeton Firebase Auth personnalisé, avec pour uid la CLÉ RTDB
//      du profil (= même valeur que `$uid` dans database.rules.json), que le
//      client échange via signInWithCustomToken.
//
// Configuration requise (Netlify → Site settings → Environment variables) :
//   FIREBASE_SERVICE_ACCOUNT = JSON complet de la clé de compte de service
//     (Firebase Console → Paramètres du projet → Comptes de service →
//      Générer une nouvelle clé privée → coller tout le contenu du fichier).
//
// Tant que cette variable n'est pas configurée, la fonction répond
// "not_configured" et le client retombe sur l'ancien circuit applicatif
// (voir core/auth.js) — rien ne casse pendant la mise en place.
import { webcrypto } from 'node:crypto'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { getAuth } from 'firebase-admin/auth'

const DB_URL = process.env.VITE_FIREBASE_DATABASE_URL || 'https://max-agro-83baf-default-rtdb.firebaseio.com'
const PBKDF2_ITER = 100000

function ensureAdmin() {
  if (getApps().length) return true
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return false
  try {
    initializeApp({ credential: cert(JSON.parse(raw)), databaseURL: DB_URL })
    return true
  } catch (e) {
    console.error('[login] FIREBASE_SERVICE_ACCOUNT invalide :', e?.message)
    return false
  }
}

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16)
  return arr
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}
function randomSaltHex() {
  return bytesToHex(webcrypto.getRandomValues(new Uint8Array(16)))
}
async function pbkdf2(pass, saltHex) {
  const keyMaterial = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits'])
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: PBKDF2_ITER, hash: 'SHA-256' },
    keyMaterial, 256
  )
  return bytesToHex(new Uint8Array(bits))
}
// Ancien schéma (sel unique global, non salé par utilisateur) — vérification
// de repli uniquement, pour les comptes pas encore migrés.
async function legacySha256(pass) {
  const buf = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(`termitiere::${pass}`))
  return bytesToHex(new Uint8Array(buf))
}

// Limite de débit PAR IP — endpoint de connexion, cible privilégiée du brute-force.
const RL_MAX = 15
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

const GENERIC_ERROR = { ok: false, error: 'Identifiant ou mot de passe incorrect' }

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
  const login = String(body.login || '').trim()
  const pass = String(body.pass || '')
  if (!login || !pass || login.length > 100 || pass.length > 200) {
    return { statusCode: 200, body: JSON.stringify(GENERIC_ERROR) }
  }

  try {
    const db = getDatabase()
    const snap = await db.ref('tp/users').orderByChild('login').equalTo(login).limitToFirst(1).once('value')
    const val = snap.val()
    if (!val) return { statusCode: 200, body: JSON.stringify(GENERIC_ERROR) }
    const key = Object.keys(val)[0]
    const profile = val[key]
    if (profile.actif === false) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Compte désactivé par l\'administrateur' }) }
    }

    const secretSnap = await db.ref(`tp/users_secret/${key}`).once('value')
    const secret = secretSnap.val()

    let match = false
    if (secret?.salt && secret?.passHash) {
      match = (await pbkdf2(pass, secret.salt)) === secret.passHash
    } else {
      const legacyHash = secret?.passHash || profile.passHash
      if (legacyHash) {
        match = (await legacySha256(pass)) === legacyHash
        if (match) {
          // Migration transparente vers le hachage salé + nettoyage du champ
          // hérité (le profil `users` redevient lisible sans exposer de hash).
          const salt = randomSaltHex()
          const passHash = await pbkdf2(pass, salt)
          await db.ref(`tp/users_secret/${key}`).set({ salt, passHash })
          if (profile.passHash) await db.ref(`tp/users/${key}/passHash`).remove()
        }
      }
    }
    if (!match) return { statusCode: 200, body: JSON.stringify(GENERIC_ERROR) }

    const token = await getAuth().createCustomToken(key, { role: profile.role || 'agent' })
    return { statusCode: 200, body: JSON.stringify({ ok: true, token }) }
  } catch (e) {
    console.error('[login] erreur :', e?.message)
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Connexion impossible — réessayez.' }) }
  }
}

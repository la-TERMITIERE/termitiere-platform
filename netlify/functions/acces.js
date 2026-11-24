// Fonction serveur Netlify : DEMANDES D'ACCÈS (création de compte en libre-service, validée par la RH ou Info).
//
// Pourquoi côté serveur : un visiteur n'est pas connecté, donc la base (verrouillée à `auth != null`) lui refuse toute écriture ;
// et la création d'un compte (profil + secret) ne doit jamais dépendre d'un navigateur. Cette fonction écrit avec le SDK Admin.
//
// Deux actions :
//   { action: 'soumettre', nom, login, telephone, poste, pass, site }   (publique : le visiteur demande un accès)
//   { action: 'decider', id, decision: 'approuver' | 'refuser', motif } (réservée à la RH et à Info : jeton Firebase Auth exigé)
//
// Règles :
//   - le mot de passe est haché (PBKDF2 salé) dès la réception ; le hash va dans `demandes_acces_secret`, jamais lisible par la RH ;
//   - une demande approuvée crée un compte avec le rôle « agent » et le SEUL module E-TACHES ;
//   - le rôle Info n'est jamais attribuable ici ;
//   - limite de 5 demandes par adresse et par heure, champ piège « site » contre les robots.
import { webcrypto } from 'node:crypto'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { getAuth } from 'firebase-admin/auth'

const DB_URL = process.env.VITE_FIREBASE_DATABASE_URL || 'https://max-agro-83baf-default-rtdb.firebaseio.com'
const PBKDF2_ITER = 100000
const ROLES_DECIDEURS = ['rh', 'info'] // qui peut approuver ou refuser
const MODULES_PAR_DEFAUT = ['taches']  // accès d'un nouveau compte
const MAX_PAR_HEURE = 5

function ensureAdmin() {
  if (getApps().length) return true
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return false
  try {
    initializeApp({ credential: cert(JSON.parse(raw)), databaseURL: DB_URL })
    return true
  } catch (e) {
    console.error('[acces] FIREBASE_SERVICE_ACCOUNT invalide :', e?.message)
    return false
  }
}

const bytesToHex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
const randomSaltHex = () => bytesToHex(webcrypto.getRandomValues(new Uint8Array(16)))
async function pbkdf2(pass, saltHex) {
  const salt = new Uint8Array(saltHex.length / 2)
  for (let i = 0; i < salt.length; i++) salt[i] = parseInt(saltHex.substr(i * 2, 2), 16)
  const keyMaterial = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits'])
  const bits = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, keyMaterial, 256)
  return bytesToHex(new Uint8Array(bits))
}
async function sha256Hex(texte) {
  return bytesToHex(new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))))
}

// Même assainissement que src/core/users.js (clé de base : sans . # $ [ ] / ni espace).
const cleDeLogin = (login) => String(login || '').replace(/[.#$[\]/\s]/g, '_')

const reponse = (statusCode, corps) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
const texte = (v, max) => String(v ?? '').trim().slice(0, max)

async function soumettre(event, body) {
  // Champ piège : un visiteur humain ne remplit jamais « site ».
  if (body.site) return reponse(200, { ok: true })

  const nom = texte(body.nom, 80)
  const login = texte(body.login, 40)
  const telephone = texte(body.telephone, 30)
  const poste = texte(body.poste, 60)
  const pass = String(body.pass || '')
  if (nom.length < 2) return reponse(200, { ok: false, error: 'Indiquez votre nom et prénom.' })
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(login)) return reponse(200, { ok: false, error: "L'identifiant doit faire 3 à 40 caractères (lettres, chiffres, point, tiret)." })
  if (pass.length < 6 || pass.length > 100) return reponse(200, { ok: false, error: 'Le mot de passe doit faire au moins 6 caractères.' })

  const db = getDatabase()
  const ip = event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnue'
  const cleIp = (await sha256Hex(ip)).slice(0, 24)
  const maintenant = Date.now()

  // Limite par adresse (stockée sous forme hachée).
  const refLimite = db.ref(`tp/demandes_acces_limite/${cleIp}`)
  const lim = (await refLimite.once('value')).val() || { debut: maintenant, n: 0 }
  const frais = maintenant - lim.debut > 3600 * 1000 ? { debut: maintenant, n: 0 } : lim
  if (frais.n >= MAX_PAR_HEURE) return reponse(429, { ok: false, error: 'Trop de demandes depuis cette connexion : réessayez plus tard.' })

  // L'identifiant ne doit pas déjà exister (compte ou demande en attente).
  const dejaCompte = (await db.ref('tp/users').orderByChild('login').equalTo(login).limitToFirst(1).once('value')).exists()
  if (dejaCompte || (await db.ref(`tp/users/${cleDeLogin(login)}`).once('value')).exists()) {
    return reponse(200, { ok: false, error: 'Cet identifiant existe déjà : choisissez-en un autre.' })
  }
  const demandes = (await db.ref('tp/demandes_acces').orderByChild('login').equalTo(login).once('value')).val() || {}
  if (Object.values(demandes).some((d) => d.statut === 'en_attente')) {
    return reponse(200, { ok: false, error: 'Une demande est déjà en attente avec cet identifiant.' })
  }

  const salt = randomSaltHex()
  const passHash = await pbkdf2(pass, salt)
  const ref = db.ref('tp/demandes_acces').push()
  await ref.set({ nom, login, telephone, poste, statut: 'en_attente', creeLe: maintenant, createdAt: maintenant })
  await db.ref(`tp/demandes_acces_secret/${ref.key}`).set({ salt, passHash })
  await refLimite.set({ debut: frais.debut, n: frais.n + 1 })

  // Alerte dans la cloche de la RH et d'Info (même forme que src/core/notify.js).
  try {
    await db.ref('tp/notifications').push().set({
      type: 'demande', title: "🔑 Demande d'accès à la plateforme",
      body: `${nom}${poste ? ` (${poste})` : ''} demande un compte : identifiant « ${login} ». À approuver ou refuser dans RH, Demandes d'accès.`,
      module: 'rh', forRoles: ['rh', 'info'], forUsers: [], excludeUid: null, link: '/rh/acces', readBy: {}, createdAt: maintenant
    })
  } catch (e) { console.warn('[acces] notification non créée :', e?.message) }

  return reponse(200, { ok: true })
}

async function decider(event, body) {
  const entete = event.headers.authorization || event.headers.Authorization || ''
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7) : ''
  if (!jeton) return reponse(401, { ok: false, error: 'Connexion requise.' })

  let uid
  try { uid = (await getAuth().verifyIdToken(jeton)).uid } catch { return reponse(401, { ok: false, error: 'Session invalide : reconnectez-vous.' }) }

  const db = getDatabase()
  const moi = (await db.ref(`tp/users/${uid}`).once('value')).val()
  if (!moi || moi.actif === false || !ROLES_DECIDEURS.includes(moi.role)) return reponse(403, { ok: false, error: "Seules la RH et Info peuvent décider d'une demande d'accès." })

  const id = texte(body.id, 60)
  const decision = body.decision
  if (!id || !['approuver', 'refuser'].includes(decision)) return reponse(400, { ok: false, error: 'Demande invalide.' })
  const refDemande = db.ref(`tp/demandes_acces/${id}`)
  const demande = (await refDemande.once('value')).val()
  if (!demande) return reponse(404, { ok: false, error: 'Demande introuvable.' })
  if (demande.statut !== 'en_attente') return reponse(200, { ok: false, error: 'Cette demande a déjà été traitée.' })
  const maintenant = Date.now()
  // Info est un rôle fantôme : son nom n'apparaît jamais dans ce que la RH peut lire.
  const decideur = { decidePar: moi.role === 'info' ? "l'administration" : (moi.nom || moi.login || ''), decideLe: maintenant }

  if (decision === 'refuser') {
    await refDemande.update({ statut: 'refusee', motif: texte(body.motif, 200), ...decideur })
    await db.ref(`tp/demandes_acces_secret/${id}`).remove()
    return reponse(200, { ok: true })
  }

  // Approbation : création du compte (secret d'abord, puis profil : un échec ne laisse pas un compte sans mot de passe).
  const cle = cleDeLogin(demande.login)
  const dejaPris = (await db.ref('tp/users').orderByChild('login').equalTo(demande.login).limitToFirst(1).once('value')).exists()
    || (await db.ref(`tp/users/${cle}`).once('value')).exists()
  if (dejaPris) return reponse(200, { ok: false, error: "Cet identifiant est déjà utilisé par un compte : refusez la demande ou demandez-en un autre." })
  const secret = (await db.ref(`tp/demandes_acces_secret/${id}`).once('value')).val()
  if (!secret?.salt || !secret?.passHash) return reponse(200, { ok: false, error: 'Mot de passe introuvable : refusez la demande, la personne doit la refaire.' })

  await db.ref(`tp/users_secret/${cle}`).set({ salt: secret.salt, passHash: secret.passHash })
  await db.ref(`tp/users/${cle}`).set({
    uid: cle, login: demande.login, nom: demande.nom, role: 'agent', modules: MODULES_PAR_DEFAUT,
    telephone: demande.telephone || '', poste: demande.poste || '', secteur: '', actif: true, creeParDemande: true
  })
  await refDemande.update({ statut: 'approuvee', uidCree: cle, ...decideur })
  await db.ref(`tp/demandes_acces_secret/${id}`).remove()
  await db.ref('tp/audit_global').push().set({
    userId: uid, userNom: moi.nom || '', userRole: moi.role, module: 'portail', action: 'USER_CREATE',
    details: `${demande.login} : agent (demande d'accès approuvée)`, meta: null, timestamp: maintenant, createdAt: maintenant
  })
  return reponse(200, { ok: true })
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return reponse(405, { ok: false, error: 'Method Not Allowed' })
  if (!ensureAdmin()) return reponse(200, { ok: false, error: 'not_configured' })
  let body = {}
  try { body = JSON.parse(event.body || '{}') } catch { return reponse(400, { ok: false, error: 'JSON invalide' }) }
  try {
    if (body.action === 'soumettre') return await soumettre(event, body)
    if (body.action === 'decider') return await decider(event, body)
    return reponse(400, { ok: false, error: 'Action inconnue' })
  } catch (e) {
    console.error('[acces] erreur :', e?.message)
    return reponse(200, { ok: false, error: 'Service momentanément indisponible : réessayez.' })
  }
}

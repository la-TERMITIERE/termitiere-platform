// Fonction Netlify PLANIFIÉE : sauvegarde automatique de la base.
//
// Chaque nuit, lit l'intégralité du namespace `tp/` de la Realtime Database et
// envoie un instantané JSON daté EN PIÈCE JOINTE par e-mail (via Resend). La boîte
// mail du destinataire devient ainsi l'archive des sauvegardes (hors Firebase).
//
// LECTURE — deux chemins, dans cet ordre :
//   1. Compte de service Firebase Admin (FIREBASE_SERVICE_ACCOUNT) → jeton OAuth.
//      C'est le SEUL chemin qui continue de fonctionner une fois les règles de la
//      base verrouillées. À privilégier.
//   2. Repli REST non authentifié — fonctionne tant que la base est ouverte en
//      lecture. Conservé pour ne pas interrompre les sauvegardes AVANT le
//      verrouillage ; il cessera de fonctionner après, d'où l'alerte ci-dessous.
//
// ÉCHEC BRUYANT : toute erreur (lecture, envoi) déclenche un e-mail d'ALERTE. Une
// sauvegarde qui s'arrête en silence est pire que pas de sauvegarde du tout — on
// croit être protégé alors qu'on ne l'est plus.
//
// CHIFFREMENT (optionnel mais recommandé) : si BACKUP_PASSPHRASE est défini,
// l'archive est chiffrée en AES-256-GCM avant l'envoi (fichier .json.enc), avec le
// script de déchiffrement rappelé dans le corps de l'e-mail. Sans cette variable,
// la sauvegarde part en clair — comportement historique, inchangé.
//
// Variables d'environnement (Netlify → Site settings → Environment) :
//   RESEND_API_KEY           (obligatoire) clé API Resend
//   BACKUP_EMAIL_TO          (obligatoire) destinataire(s), séparés par des virgules
//   BACKUP_EMAIL_FROM        (optionnel)   expéditeur vérifié ; défaut onboarding@resend.dev
//   FIREBASE_DB_URL          (optionnel)   défaut = base de production max-agro-83baf
//   FIREBASE_SERVICE_ACCOUNT (recommandé)  JSON du compte de service (lecture authentifiée)
//   BACKUP_PASSPHRASE        (recommandé)  phrase secrète de chiffrement de l'archive
//
// ⚠️ Avec l'expéditeur par défaut onboarding@resend.dev, Resend n'autorise l'envoi
//    QUE vers l'adresse du compte Resend → mets BACKUP_EMAIL_TO = cet e-mail.
//    Pour envoyer vers n'importe quelle adresse (et donc vers PLUSIEURS boîtes,
//    fortement conseillé), vérifie un domaine dans Resend et renseigne
//    BACKUP_EMAIL_FROM (ex. sauvegarde@latermitiere.com).
import crypto from 'node:crypto'

const DB_URL = process.env.FIREBASE_DB_URL || 'https://max-agro-83baf-default-rtdb.firebaseio.com'
const RESEND_API_KEY = process.env.RESEND_API_KEY
const TO = process.env.BACKUP_EMAIL_TO
const FROM = process.env.BACKUP_EMAIL_FROM || 'onboarding@resend.dev'
const PASSPHRASE = process.env.BACKUP_PASSPHRASE
const ROOT = 'tp' // namespace Termitière (cf. src/core/db.firebase.js)

const destinataires = () => (TO || '').split(',').map((s) => s.trim()).filter(Boolean)

// ── Jeton d'accès Google à partir du compte de service (sans dépendance) ──
// Signe un JWT RS256 puis l'échange contre un access_token OAuth2. Renvoie null
// si le compte de service n'est pas configuré (→ repli non authentifié).
async function jetonAcces() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null
  let sa
  try { sa = JSON.parse(raw) } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT n\'est pas un JSON valide') }
  if (!sa.client_email || !sa.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT incomplet (client_email / private_key)')

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const scope = 'https://www.googleapis.com/auth/firebase.database.readonly https://www.googleapis.com/auth/userinfo.email'
  const entete = b64({ alg: 'RS256', typ: 'JWT' })
  const charge = b64({
    iss: sa.client_email, scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  })
  const signature = crypto.createSign('RSA-SHA256')
    .update(`${entete}.${charge}`)
    .sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${entete}.${charge}.${signature}`
    })
  })
  if (!res.ok) throw new Error(`OAuth Google ${res.status} ${await res.text().catch(() => '')}`)
  const { access_token } = await res.json()
  if (!access_token) throw new Error('OAuth Google : access_token absent')
  return access_token
}

// Chiffrement AES-256-GCM. Format du fichier : "TERMv1" | salt(16) | iv(12) | tag(16) | données.
// Déchiffrement : voir scripts/dechiffrer-sauvegarde.mjs
function chiffrer(texte, passphrase) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const cle = crypto.scryptSync(passphrase, salt, 32)
  const c = crypto.createCipheriv('aes-256-gcm', cle, iv)
  const donnees = Buffer.concat([c.update(texte, 'utf8'), c.final()])
  return Buffer.concat([Buffer.from('TERMv1'), salt, iv, c.getAuthTag(), donnees])
}

async function envoyerMail({ subject, text, attachments }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: destinataires(), subject, text, ...(attachments ? { attachments } : {}) })
  })
  if (!res.ok) throw new Error(`Resend ${res.status} ${await res.text().catch(() => '')}`)
}

// Alerte — best effort : si même l'alerte échoue, on ne masque pas l'erreur d'origine.
async function alerter(etape, message) {
  if (!RESEND_API_KEY || !destinataires().length) return
  try {
    await envoyerMail({
      subject: `🚨 ÉCHEC de la sauvegarde La Termitière — ${new Date().toISOString().slice(0, 10)}`,
      text: [
        'La sauvegarde automatique de la base a ÉCHOUÉ. Aucune copie n\'a été produite cette nuit.',
        '',
        `Étape   : ${etape}`,
        `Erreur  : ${message}`,
        '',
        'Causes fréquentes :',
        '- Les règles de la base ont été verrouillées mais FIREBASE_SERVICE_ACCOUNT n\'est pas',
        '  renseigné dans Netlify → la lecture est refusée (403/401).',
        '- La clé Resend a expiré ou le quota est dépassé.',
        '- La sauvegarde dépasse la taille maximale d\'une pièce jointe e-mail.',
        '',
        'À FAIRE : corriger, puis relancer manuellement la fonction depuis Netlify',
        '(Functions → backup-db → Run) et vérifier la bonne réception.'
      ].join('\n')
    })
  } catch (e) {
    console.error('[backup-db] alerte non envoyée :', e.message)
  }
}

export default async () => {
  if (!RESEND_API_KEY || !destinataires().length) {
    const msg = 'Config manquante : définir RESEND_API_KEY et BACKUP_EMAIL_TO dans Netlify.'
    console.error('[backup-db]', msg)
    return new Response(msg, { status: 500 })
  }

  // 1) Lecture de toute la base sous tp/ — authentifiée si possible, sinon repli.
  let json, mode
  try {
    let token = null
    try {
      token = await jetonAcces()
    } catch (e) {
      // Compte de service présent mais invalide : on le signale sans renoncer au repli.
      console.error('[backup-db] compte de service inutilisable :', e.message)
    }
    const url = `${DB_URL}/${ROOT}.json`
    const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
    if (!res.ok) {
      throw new Error(
        `Firebase REST ${res.status}` +
        (!token && (res.status === 401 || res.status === 403)
          ? ' — la base est verrouillée et FIREBASE_SERVICE_ACCOUNT n\'est pas configuré dans Netlify.'
          : '')
      )
    }
    json = await res.text()
    mode = token ? 'authentifiée (compte de service)' : 'non authentifiée (base ouverte)'
  } catch (e) {
    console.error('[backup-db] lecture base échouée :', e.message)
    await alerter('Lecture de la base', e.message)
    return new Response(`Lecture base échouée : ${e.message}`, { status: 502 })
  }

  const date = new Date().toISOString().slice(0, 10) // AAAA-MM-JJ
  const sizeKo = (Buffer.byteLength(json, 'utf8') / 1024).toFixed(0)
  const collections = (() => {
    try { return Object.keys(JSON.parse(json) || {}).length } catch { return '?' }
  })()

  // 2) Chiffrement optionnel de l'archive.
  const chiffree = !!PASSPHRASE
  const filename = chiffree ? `tp-${date}.json.enc` : `tp-${date}.json`
  const contenu = chiffree
    ? chiffrer(json, PASSPHRASE).toString('base64')
    : Buffer.from(json, 'utf8').toString('base64')

  // 3) Envoi par e-mail avec la sauvegarde en pièce jointe (Resend).
  try {
    await envoyerMail({
      subject: `Sauvegarde La Termitière — ${date}`,
      text: [
        'Sauvegarde automatique de la base de données (namespace tp/).',
        '',
        `Date          : ${date}`,
        `Collections   : ${collections}`,
        `Taille        : ${sizeKo} Ko`,
        `Fichier joint : ${filename}`,
        `Lecture       : ${mode}`,
        `Chiffrement   : ${chiffree ? 'AES-256-GCM (BACKUP_PASSPHRASE)' : 'AUCUN — archive en clair'}`,
        '',
        chiffree
          ? 'Pour déchiffrer :  node scripts/dechiffrer-sauvegarde.mjs ' + filename
          : '⚠️ Cette archive contient des données personnelles EN CLAIR. Définissez'
            + '\n   BACKUP_PASSPHRASE dans Netlify pour la chiffrer automatiquement.',
        '',
        'Conserve cet e-mail : la pièce jointe est une copie complète et restaurable.'
      ].join('\n'),
      attachments: [{ filename, content: contenu }]
    })
  } catch (e) {
    console.error('[backup-db] envoi e-mail échoué :', e.message)
    await alerter('Envoi de l\'e-mail', e.message)
    return new Response(`Envoi e-mail échoué : ${e.message}`, { status: 502 })
  }

  console.info(`[backup-db] OK — ${filename} (${sizeKo} Ko, ${collections} collections, lecture ${mode}) envoyé à ${TO}`)
  return new Response(`Sauvegarde envoyée : ${filename} (${sizeKo} Ko).`, { status: 200 })
}

// Planification : tous les jours à 03:00 UTC (= 03:00 au Togo, UTC+0).
export const config = { schedule: '0 3 * * *' }

// Fonction Netlify PLANIFIÉE : sauvegarde automatique de la base.
//
// Chaque nuit, lit l'intégralité du namespace `tp/` de la Realtime Database et
// envoie un instantané JSON daté EN PIÈCE JOINTE par e-mail (via Resend). La boîte
// mail du destinataire devient ainsi l'archive des sauvegardes (hors Firebase).
//
// Aucune clé Firebase nécessaire : la base est en lecture ouverte → simple requête
// REST `GET <db>/tp.json`. (Si un jour la base est verrouillée, il faudra passer à
// un compte de service Firebase Admin + jeton.)
//
// Variables d'environnement à définir dans Netlify (Site settings → Environment) :
//   RESEND_API_KEY     (obligatoire)  clé API Resend  (https://resend.com → API Keys)
//   BACKUP_EMAIL_TO    (obligatoire)  destinataire(s), séparés par des virgules
//   BACKUP_EMAIL_FROM  (optionnel)    expéditeur vérifié ; défaut onboarding@resend.dev
//   FIREBASE_DB_URL    (optionnel)    défaut = base de production max-agro-83baf
//
// ⚠️ Avec l'expéditeur par défaut onboarding@resend.dev, Resend n'autorise l'envoi
//    QUE vers l'adresse du compte Resend → mets BACKUP_EMAIL_TO = cet e-mail.
//    Pour envoyer vers n'importe quelle adresse, vérifie un domaine dans Resend et
//    renseigne BACKUP_EMAIL_FROM (ex. sauvegarde@latermitiere.com).

const DB_URL = process.env.FIREBASE_DB_URL || 'https://max-agro-83baf-default-rtdb.firebaseio.com'
const RESEND_API_KEY = process.env.RESEND_API_KEY
const TO = process.env.BACKUP_EMAIL_TO
const FROM = process.env.BACKUP_EMAIL_FROM || 'onboarding@resend.dev'
const ROOT = 'tp' // namespace Termitière (cf. src/core/db.firebase.js)

export default async () => {
  if (!RESEND_API_KEY || !TO) {
    const msg = 'Config manquante : définir RESEND_API_KEY et BACKUP_EMAIL_TO dans Netlify.'
    console.error('[backup-db]', msg)
    return new Response(msg, { status: 500 })
  }

  // 1) Lecture de toute la base sous tp/ (REST, lecture ouverte).
  let json
  try {
    const res = await fetch(`${DB_URL}/${ROOT}.json`)
    if (!res.ok) throw new Error(`Firebase REST ${res.status}`)
    json = await res.text()
  } catch (e) {
    console.error('[backup-db] lecture base échouée :', e.message)
    return new Response(`Lecture base échouée : ${e.message}`, { status: 502 })
  }

  const date = new Date().toISOString().slice(0, 10) // AAAA-MM-JJ
  const filename = `tp-${date}.json`
  const sizeKo = (Buffer.byteLength(json, 'utf8') / 1024).toFixed(0)
  const collections = (() => {
    try { return Object.keys(JSON.parse(json) || {}).length } catch { return '?' }
  })()

  // 2) Envoi par e-mail avec la sauvegarde en pièce jointe (Resend).
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM,
        to: TO.split(',').map((s) => s.trim()).filter(Boolean),
        subject: `Sauvegarde La Termitière — ${date}`,
        text: [
          'Sauvegarde automatique de la base de données (namespace tp/).',
          '',
          `Date         : ${date}`,
          `Collections  : ${collections}`,
          `Taille       : ${sizeKo} Ko`,
          `Fichier joint: ${filename}`,
          '',
          'Conserve cet e-mail : la pièce jointe est une copie complète et restaurable.'
        ].join('\n'),
        attachments: [{ filename, content: Buffer.from(json, 'utf8').toString('base64') }]
      })
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Resend ${res.status} ${detail}`)
    }
  } catch (e) {
    console.error('[backup-db] envoi e-mail échoué :', e.message)
    return new Response(`Envoi e-mail échoué : ${e.message}`, { status: 502 })
  }

  console.info(`[backup-db] OK — ${filename} (${sizeKo} Ko, ${collections} collections) envoyé à ${TO}`)
  return new Response(`Sauvegarde envoyée : ${filename} (${sizeKo} Ko).`, { status: 200 })
}

// Planification : tous les jours à 03:00 UTC (= 03:00 au Togo, UTC+0).
export const config = { schedule: '0 3 * * *' }

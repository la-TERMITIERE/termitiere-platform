// Sauvegarde MANUELLE de la base, depuis votre poste.
//
//   npm run sauvegarde              → sauvegarde en clair
//   npm run sauvegarde -- --chiffrer → sauvegarde chiffrée (demande une phrase secrète)
//
// Utile dans deux cas :
//   1. filet de sécurité si la sauvegarde automatique (Netlify) est en panne ;
//   2. avant toute opération risquée (migration, réinitialisation, import).
//
// La base étant désormais VERROUILLÉE, ce script s'authentifie avec votre session
// Firebase CLI locale (celle de `firebase login`). Aucun mot de passe à saisir.
// Si la session a expiré : `npx firebase-tools login`.
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'
import readline from 'node:readline'

const PROJET = 'max-agro-83baf'
const DB = `https://${PROJET}-default-rtdb.firebaseio.com`
const chiffrer = process.argv.includes('--chiffrer')

// Jeton d'accès à partir de la session Firebase CLI (identifiants client publics
// de firebase-tools, projet open source).
async function jetonDepuisCLI() {
  const p = os.homedir() + '/.config/configstore/firebase-tools.json'
  if (!fs.existsSync(p)) throw new Error('Session Firebase CLI introuvable. Lancez : npx firebase-tools login')
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  const refresh = j?.tokens?.refresh_token
  if (!refresh) throw new Error('Session Firebase CLI expirée. Lancez : npx firebase-tools login')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: refresh,
      grant_type: 'refresh_token'
    })
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('Authentification refusée : ' + (d.error_description || d.error))
  return d.access_token
}

function demanderPhrase() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(' Phrase secrète de chiffrement : ', (rep) => { rl.close(); resolve(rep) })
  })
}

console.log('\n═══ Sauvegarde locale — La Termitière ═══\n')
try {
  process.stdout.write('  Authentification…')
  const token = await jetonDepuisCLI()
  console.log(' OK')

  process.stdout.write('  Lecture de la base…')
  const r = await fetch(`${DB}/tp.json`, { headers: { Authorization: 'Bearer ' + token } })
  if (!r.ok) throw new Error(`la base a répondu HTTP ${r.status}`)
  const txt = await r.text()
  const obj = JSON.parse(txt)
  const collections = Object.keys(obj).length
  const enregistrements = Object.keys(obj).reduce((s, c) => s + Object.keys(obj[c] || {}).length, 0)
  console.log(' OK')

  const date = new Date().toISOString().slice(0, 10)
  let nom = `tp-${date}.json`
  let contenu = Buffer.from(txt, 'utf8')

  if (chiffrer) {
    const phrase = await demanderPhrase()
    if (!phrase) throw new Error('phrase secrète vide — sauvegarde annulée')
    const salt = crypto.randomBytes(16)
    const iv = crypto.randomBytes(12)
    const cle = crypto.scryptSync(phrase, salt, 32)
    const c = crypto.createCipheriv('aes-256-gcm', cle, iv)
    const donnees = Buffer.concat([c.update(txt, 'utf8'), c.final()])
    contenu = Buffer.concat([Buffer.from('TERMv1'), salt, iv, c.getAuthTag(), donnees])
    nom += '.enc'
  }

  fs.writeFileSync(nom, contenu)
  console.log('')
  console.log(`  \x1b[32m✔\x1b[0m ${nom}`)
  console.log(`     ${(contenu.length / 1024 / 1024).toFixed(2)} Mo · ${collections} collections · ${enregistrements} enregistrements`)
  console.log(chiffrer
    ? '     Relecture : node scripts/dechiffrer-sauvegarde.mjs ' + nom
    : '     ⚠️  Contient des données personnelles EN CLAIR — à mettre en lieu sûr.')
  console.log('\n  Restauration : Console Firebase → Realtime Database → nœud `tp` → Importer un JSON.')
  console.log('  (l\'import REMPLACE tout le nœud)\n')
} catch (e) {
  console.log('\n  \x1b[31m✘\x1b[0m Sauvegarde impossible : ' + e.message + '\n')
  process.exit(1)
}

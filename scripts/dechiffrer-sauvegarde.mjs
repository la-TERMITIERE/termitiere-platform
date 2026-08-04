// Déchiffre une sauvegarde produite par netlify/functions/backup-db.mjs quand
// BACKUP_PASSPHRASE est configuré (fichier .json.enc).
//
// Usage :
//   node scripts/dechiffrer-sauvegarde.mjs tp-2026-08-04.json.enc
//   node scripts/dechiffrer-sauvegarde.mjs tp-2026-08-04.json.enc sortie.json
//
// La phrase secrète est demandée de façon masquée, ou lue dans BACKUP_PASSPHRASE.
//
// Format du fichier : "TERMv1" | salt(16) | iv(12) | tag(16) | données AES-256-GCM
import fs from 'node:fs'
import crypto from 'node:crypto'
import readline from 'node:readline'

const MAGIC = 'TERMv1'

function demanderPhrase() {
  if (process.env.BACKUP_PASSPHRASE) return Promise.resolve(process.env.BACKUP_PASSPHRASE)
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    // Masque la saisie (pas d'écho du mot de passe à l'écran).
    const onData = (c) => {
      const s = c.toString()
      if (s === '\n' || s === '\r' || s === '') process.stdin.removeListener('data', onData)
      else process.stdout.write('\x1b[2K\x1b[200D Phrase secrète : ' + '*'.repeat(rl.line.length))
    }
    process.stdin.on('data', onData)
    rl.question(' Phrase secrète : ', (rep) => { rl.close(); process.stdout.write('\n'); resolve(rep) })
  })
}

const [, , entree, sortieArg] = process.argv
if (!entree) {
  console.error('Usage : node scripts/dechiffrer-sauvegarde.mjs <fichier.json.enc> [sortie.json]')
  process.exit(1)
}
if (!fs.existsSync(entree)) {
  console.error(`Fichier introuvable : ${entree}`)
  process.exit(1)
}

const brut = fs.readFileSync(entree)
if (brut.subarray(0, MAGIC.length).toString() !== MAGIC) {
  console.error(
    'Ce fichier n\'est pas une sauvegarde chiffrée La Termitière.\n' +
    'S\'il se termine par .json, il est déjà en clair : ouvrez-le directement.'
  )
  process.exit(1)
}

const phrase = await demanderPhrase()
const salt = brut.subarray(6, 22)
const iv = brut.subarray(22, 34)
const tag = brut.subarray(34, 50)
const donnees = brut.subarray(50)

try {
  const cle = crypto.scryptSync(phrase, salt, 32)
  const d = crypto.createDecipheriv('aes-256-gcm', cle, iv)
  d.setAuthTag(tag)
  const clair = Buffer.concat([d.update(donnees), d.final()]).toString('utf8')
  const sortie = sortieArg || entree.replace(/\.enc$/, '')
  fs.writeFileSync(sortie, clair)
  const collections = Object.keys(JSON.parse(clair) || {}).length
  console.log(`✅ Déchiffré : ${sortie} (${(clair.length / 1024).toFixed(0)} Ko, ${collections} collections)`)
  console.log('   Restauration : Console Firebase → Realtime Database → nœud `tp` → Importer un JSON.')
} catch {
  console.error('❌ Déchiffrement impossible : phrase secrète incorrecte, ou fichier altéré.')
  process.exit(1)
}

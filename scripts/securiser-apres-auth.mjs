// Ferme la base APRÈS activation de Firebase Authentication.
//
// À lancer une fois que vous avez fait, dans la console Firebase :
//   Authentication → Get started → Sign-in method → E-mail/Mot de passe → Enable
// et que vos utilisateurs se sont reconnectés au moins une fois.
//
//   node scripts/securiser-apres-auth.mjs            → diagnostic seul (ne change rien)
//   node scripts/securiser-apres-auth.mjs --publier  → publie les règles strictes
//
// Le script REFUSE de publier tant que l'authentification n'est pas active : sans
// elle, les règles strictes bloqueraient tous les utilisateurs.
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const PROJET = 'max-agro-83baf'
const CLE_WEB = 'AIzaSyDMuTQpe7ab2juY-Vw1xp_2qO2OtNAaPks' // clé publique (non secrète)
const DB = `https://${PROJET}-default-rtdb.firebaseio.com`
const publier = process.argv.includes('--publier')

const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`)
const ko = (m) => console.log(`  \x1b[31m✘\x1b[0m ${m}`)
const info = (m) => console.log(`  · ${m}`)

console.log('\n═══ Mise en sécurité de la base — La Termitière ═══\n')

// ── 1. L'authentification est-elle activée ? ─────────────────────────────────
console.log('1) Authentification Firebase')
let authActive = false
try {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CLE_WEB}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'sonde-verification@termitiere.local', password: 'x'.repeat(12), returnSecureToken: true })
  })
  const j = await r.json()
  const msg = j.error?.message || ''
  if (msg === 'CONFIGURATION_NOT_FOUND') {
    ko('NON ACTIVÉE — c\'est le blocage principal.')
    console.log('\n    À faire (gratuit, ~2 min) :')
    console.log('      console.firebase.google.com → projet Max Agro')
    console.log('      → Authentication → Get started')
    console.log('      → Sign-in method → E-mail/Mot de passe → Enable → Save')
    console.log('\n    Puis demandez à chaque utilisateur de se connecter une fois')
    console.log('    (l\'application crée son compte Firebase automatiquement),')
    console.log('    et relancez ce script.\n')
  } else {
    authActive = true
    ok(`ACTIVÉE (la sonde répond « ${msg || 'compte inexistant'} », ce qui est attendu)`)
  }
} catch (e) {
  ko(`Vérification impossible : ${e.message}`)
}

// ── 2. Exposition actuelle de la base ────────────────────────────────────────
console.log('\n2) Exposition actuelle (tests anonymes, sans aucun compte)')
const sonde = async (label, url, options) => {
  try {
    const r = await fetch(url, options)
    return { label, code: r.status }
  } catch { return { label, code: 0 } }
}
const tests = [
  await sonde('lecture des données métier', `${DB}/tp/users.json?shallow=true`),
  await sonde('écriture à la racine', `${DB}/_sonde.json`, { method: 'PUT', body: '"x"' }),
  await sonde('effacement total', `${DB}/tp.json`, { method: 'DELETE' })
]
for (const t of tests) {
  const ferme = t.code === 401 || t.code === 403
  ;(ferme ? ok : ko)(`${t.label} — HTTP ${t.code}${ferme ? ' (fermé)' : ' (OUVERT)'}`)
}

// ── 3. La sauvegarde fonctionne-t-elle toujours ? ────────────────────────────
console.log('\n3) Sauvegarde (priorité absolue — ne doit jamais casser)')
const sauv = await sonde('lecture complète GET /tp.json', `${DB}/tp.json?shallow=true`)
if (sauv.code === 200) {
  ok('La sauvegarde peut lire la base (lecture non authentifiée).')
} else {
  const aServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT
  if (aServiceAccount) ok('Lecture anonyme fermée — la sauvegarde passera par le compte de service.')
  else {
    ko(`Lecture refusée (HTTP ${sauv.code}) et FIREBASE_SERVICE_ACCOUNT absent.`)
    console.log('    ⚠️  LA SAUVEGARDE EST CASSÉE. Renseignez FIREBASE_SERVICE_ACCOUNT')
    console.log('        dans Netlify (Console Firebase → Paramètres du projet →')
    console.log('        Comptes de service → Générer une nouvelle clé privée).')
  }
}

// ── 4. Publication des règles strictes ───────────────────────────────────────
console.log('\n4) Règles strictes')
if (!publier) {
  info('Diagnostic seul. Relancez avec --publier pour appliquer les règles strictes.')
} else if (!authActive) {
  ko('REFUS DE PUBLIER : sans authentification, les règles strictes bloqueraient')
  console.log('    tous vos utilisateurs (ils se connecteraient sans voir aucune donnée).')
} else {
  const cfg = JSON.parse(fs.readFileSync('firebase.json', 'utf8'))
  const avant = cfg.database.rules
  try {
    cfg.database.rules = 'database.rules.json'
    fs.writeFileSync('firebase.json', JSON.stringify(cfg, null, 2) + '\n')
    info('Publication de database.rules.json (étage 1)…')
    execSync(`npx --yes firebase-tools@13 deploy --only database --project ${PROJET} --non-interactive`, { stdio: 'inherit' })
    ok('Règles strictes publiées.')
    console.log('\n    VÉRIFIEZ MAINTENANT, avec un vrai compte : connexion, puis')
    console.log('    affichage des données dans chaque module. En cas de problème :')
    console.log('      npx firebase-tools deploy --only database   (après avoir remis')
    console.log(`      "rules": "${avant}" dans firebase.json)`)
  } catch (e) {
    cfg.database.rules = avant
    fs.writeFileSync('firebase.json', JSON.stringify(cfg, null, 2) + '\n')
    ko(`Publication échouée : ${e.message}`)
  }
}

console.log('\nDétail complet : docs/URGENCE-SECURITE.md\n')

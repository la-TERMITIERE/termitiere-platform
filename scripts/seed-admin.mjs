// Script d'amorçage des comptes utilisateurs dans Firebase (Auth + profils Firestore).
//
// Pré-requis :
//   1. npm i -D firebase-admin
//   2. Télécharger la clé de compte de service depuis la console Firebase
//      (Paramètres du projet → Comptes de service → Générer une nouvelle clé privée)
//      et l'enregistrer sous : scripts/serviceAccountKey.json  (NE PAS COMMITER)
//   3. node scripts/seed-admin.mjs
//
// Le script est idempotent : relancé, il met à jour les comptes existants.
// ⚠️ Changez les mots de passe par défaut après la première connexion.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOMAIN = 'termitiere.internal'

// Comptes initiaux — adaptez les mots de passe avant exécution en production.
const USERS = [
  { login: 'admin', pass: 'admin123', nom: 'Administrateur', role: 'admin', modules: ['agro', 'logistique', 'evenementiel', 'rh'], secteur: 'Direction' },
  { login: 'controleur', pass: 'ctrl123', nom: 'Contrôleur', role: 'controleur', modules: ['agro', 'logistique'], secteur: 'Contrôle' },
  { login: 'agent', pass: 'agent123', nom: 'Agent Edah Josué', role: 'agent', modules: ['agro'], secteur: 'Élevage' },
  { login: 'agent_log', pass: 'log123', nom: 'Agent Logistique', role: 'agent', modules: ['logistique'], secteur: 'Transport' }
]

async function main() {
  let serviceAccount
  try {
    serviceAccount = JSON.parse(readFileSync(join(__dirname, 'serviceAccountKey.json'), 'utf8'))
  } catch {
    console.error('❌ scripts/serviceAccountKey.json introuvable. Voir l\'en-tête du script.')
    process.exit(1)
  }

  initializeApp({ credential: cert(serviceAccount) })
  const auth = getAuth()
  const db = getFirestore()

  for (const u of USERS) {
    const email = `${u.login}@${DOMAIN}`
    let uid
    try {
      // Crée le compte d'authentification
      const rec = await auth.createUser({ email, password: u.pass, displayName: u.nom })
      uid = rec.uid
      console.log(`✅ Compte créé : ${u.login}`)
    } catch (e) {
      if (e.code === 'auth/email-already-exists') {
        const rec = await auth.getUserByEmail(email)
        uid = rec.uid
        await auth.updateUser(uid, { password: u.pass, displayName: u.nom })
        console.log(`↻ Compte mis à jour : ${u.login}`)
      } else {
        console.error(`❌ ${u.login} :`, e.message)
        continue
      }
    }

    // Écrit / met à jour le profil Firestore
    await db.collection('users').doc(uid).set({
      uid,
      login: u.login,
      nom: u.nom,
      role: u.role,
      modules: u.modules,
      secteur: u.secteur,
      actif: true,
      createdAt: new Date().toISOString()
    }, { merge: true })
    console.log(`   profil users/${uid} enregistré`)
  }

  console.log('\n🎉 Amorçage terminé. Pensez à changer les mots de passe par défaut.')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

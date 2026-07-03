// Crée les comptes Supabase Auth pour chaque utilisateur existant + la table profiles.
// Mot de passe temporaire = l'identifiant (à changer à la 1re connexion).
// E-mail synthétique = <login>@latermitiere.local (les comptes sont login-based).
//
// Nécessite la clé SERVICE ROLE (admin) — Settings → API → service_role.
//   SUPABASE_URL=...  SUPABASE_SERVICE_KEY=...  node auth-migrate.mjs
//process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import fs from 'node:fs'
import ws from 'ws'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) { console.error('❌ SUPABASE_URL et SUPABASE_SERVICE_KEY requis.'); process.exit(1) }

const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false }, realtime: {transport: ws} })
const DOMAIN = 'latermitiere.local'

async function run() {
  // Source : table tp_users déjà migrée
  const { data: rows, error } = await admin.from('tp_users').select('id,data')
  if (error) throw new Error(error.message)

  let created = 0, skipped = 0
  for (const r of rows) {
    const u = r.data || {}
    const login = u.login
    if (!login) continue
    // E-mail synthétique : minuscule + caractères sûrs uniquement (le login peut contenir @, espaces…)
    const emailLocal = login.toLowerCase().replace(/[^a-z0-9._-]/g, '_')
    const email = `${emailLocal}@${DOMAIN}`
    const tempPass = login.length >= 6 ? login : `${login}-2026`
    const { data: made, error: e1 } = await admin.auth.admin.createUser({
      email, password: tempPass, email_confirm: true,
      user_metadata: { login, nom: u.nom, role: u.role }
    })
    if (e1) { console.log(`  ~ ${login} : ${e1.message}`); skipped++; continue }
    await admin.from('profiles').upsert({ uid: made.user.id, login, role: u.role || 'agent' })
    created++
    console.log(`  ✓ ${login}  (mot de passe temporaire : ${tempPass})`)
  }
  console.log(`\n✅ ${created} compte(s) Auth créé(s), ${skipped} ignoré(s)/déjà présent(s).`)
}
run().catch(e => { console.error('❌', e.message); process.exit(1) })

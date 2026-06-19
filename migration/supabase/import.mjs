// Importe l'export Firebase (migration/firebase-export.json) dans PostgreSQL / Supabase.
//
// - 1 table par collection du namespace tp/ : tp_<collection> (id, data jsonb, created_at)
// - L'ancienne application est préservée intégralement dans legacy_maxiagro (node, data)
// - Idempotent : ré-exécutable sans doublon (UPSERT sur la clé primaire).
//
// Utilisation :
//   1) Renseigner DATABASE_URL (voir .env.example) — chaîne de connexion Supabase/Postgres.
//   2) npm install
//   3) node import.mjs
import fs from 'node:fs'
import pg from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL manquant. Copiez .env.example en .env et renseignez la chaîne de connexion, puis relancez avec :  node --env-file=.env import.mjs')
  process.exit(1)
}

const exp = JSON.parse(fs.readFileSync(new URL('../firebase-export.json', import.meta.url)))
const tp = exp.tp || {}
const legacy = exp.maxiagro || {}

const toTs = (v) => {
  const ms = typeof v === 'number' ? v : (v?.createdAt || v?.timestamp || v?.savedAt)
  if (typeof ms !== 'number') return null
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// Supabase (distant) exige TLS ; un Postgres local n'en a pas besoin.
const isLocal = /(?:localhost|127\.0\.0\.1)/.test(DATABASE_URL)
const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false }
})

async function run() {
  await client.connect()
  console.log('✅ Connecté à la base PostgreSQL.\n')

  let totalDocs = 0
  const cols = Object.keys(tp).sort()
  for (const col of cols) {
    const table = `tp_${col}`
    await client.query(`create table if not exists ${table} (
      id text primary key, data jsonb not null, created_at timestamptz);`)
    await client.query(`create index if not exists idx_${table}_data on ${table} using gin (data);`)

    const docs = tp[col] || {}
    const ids = Object.keys(docs)
    await client.query('begin')
    for (const id of ids) {
      const data = docs[id] ?? {}
      await client.query(
        `insert into ${table} (id, data, created_at) values ($1, $2::jsonb, $3)
         on conflict (id) do update set data = excluded.data, created_at = excluded.created_at;`,
        [id, JSON.stringify(data), toTs(data)]
      )
    }
    await client.query('commit')
    totalDocs += ids.length
    console.log(`  ${table.padEnd(34)} ${ids.length} enregistrement(s)`)
  }

  // Ancienne application MAXI-AGRO : on conserve chaque nœud tel quel.
  await client.query(`create table if not exists legacy_maxiagro (node text primary key, data jsonb not null);`)
  await client.query('begin')
  for (const node of Object.keys(legacy)) {
    await client.query(
      `insert into legacy_maxiagro (node, data) values ($1, $2::jsonb)
       on conflict (node) do update set data = excluded.data;`,
      [node, JSON.stringify(legacy[node])]
    )
  }
  await client.query('commit')

  console.log(`\n✅ Import terminé : ${cols.length} collections, ${totalDocs} enregistrements tp/ + ${Object.keys(legacy).length} nœuds hérités.`)
  await client.end()
}

run().catch(async (e) => {
  console.error('❌ Erreur import :', e.message)
  try { await client.query('rollback') } catch {}
  try { await client.end() } catch {}
  process.exit(1)
})

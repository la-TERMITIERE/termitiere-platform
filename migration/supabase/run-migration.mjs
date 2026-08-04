// Exécute la migration complète vers le projet Supabase créé :
// 1) détecte la bonne chaîne de connexion (pooler session / direct / pooler transac)
// 2) applique le schéma, 3) importe toutes les données, 4) vérifie les comptes.
import fs from 'node:fs'
import pg from 'pg'

// Lecture JSON robuste : ignore un éventuel BOM UTF-8 en tête de fichier.
const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/^﻿/, ''))
const info = readJson('./.sbinfo.json')
const { ref, region, db_pass } = info
const exp = readJson('../firebase-export.json')
const tp = exp.tp || {}
const legacy = exp.maxiagro || {}
const schemaSql = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')

const toTs = (v) => {
  const ms = typeof v === 'number' ? v : (v?.createdAt || v?.timestamp || v?.savedAt)
  if (typeof ms !== 'number') return null
  const d = new Date(ms); return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const candidates = [
  { label: 'pooler session (5432)', url: `postgresql://postgres.${ref}:${db_pass}@aws-0-${region}.pooler.supabase.com:5432/postgres` },
  { label: 'connexion directe (5432)', url: `postgresql://postgres:${db_pass}@db.${ref}.supabase.co:5432/postgres` },
  { label: 'pooler transaction (6543)', url: `postgresql://postgres.${ref}:${db_pass}@aws-0-${region}.pooler.supabase.com:6543/postgres` }
]

async function pick() {
  for (const c of candidates) {
    const t = new pg.Client({ connectionString: c.url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 })
    try {
      await t.connect(); await t.query('select 1'); await t.end()
      console.log(`✅ Connexion OK via ${c.label}`)
      return c.url
    } catch (e) {
      console.log(`   ✗ ${c.label} : ${e.message}`)
      try { await t.end() } catch {}
    }
  }
  return null
}

const url = await pick()
if (!url) { console.error('❌ Aucune voie de connexion ne répond. Réessayez dans 1 min (provisionnement).'); process.exit(1) }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

console.log('\n→ Application du schéma…')
await client.query(schemaSql)

console.log('→ Import des données…')
let total = 0
for (const col of Object.keys(tp).sort()) {
  const table = `tp_${col}`
  const docs = tp[col] || {}
  const ids = Object.keys(docs)
  await client.query('begin')
  for (const id of ids) {
    const data = docs[id] ?? {}
    await client.query(
      `insert into ${table} (id, data, created_at) values ($1,$2::jsonb,$3)
       on conflict (id) do update set data = excluded.data, created_at = excluded.created_at;`,
      [id, JSON.stringify(data), toTs(data)]
    )
  }
  await client.query('commit')
  total += ids.length
}
await client.query('begin')
for (const node of Object.keys(legacy)) {
  await client.query(`insert into legacy_maxiagro (node,data) values ($1,$2::jsonb)
    on conflict (node) do update set data = excluded.data;`, [node, JSON.stringify(legacy[node])])
}
await client.query('commit')

// Vérification : compte réel en base par table
console.log('\n→ Vérification en base :')
let dbTotal = 0
for (const col of Object.keys(tp).sort()) {
  const r = await client.query(`select count(*)::int c from tp_${col}`)
  dbTotal += r.rows[0].c
}
const lr = await client.query('select count(*)::int c from legacy_maxiagro')
const ur = await client.query(`select data->>'role' role, count(*)::int n from tp_users group by 1 order by 2 desc`)

console.log(`   tp_* : ${dbTotal} enregistrements en base (attendu ${total})`)
console.log(`   legacy_maxiagro : ${lr.rows[0].c} nœud(s)`)
console.log('   utilisateurs par rôle : ' + ur.rows.map(r => `${r.role || '?'}=${r.n}`).join(', '))

await client.end()
// N'ÉCRIT PLUS la chaîne de connexion sur le disque : elle contient le mot de passe
// de la base en clair, et le fichier a fini par être commité (fuite du 2026-08-04).
// Le mot de passe reste disponible là où il doit l'être : dans la variable
// d'environnement SUPABASE_DB_URL / le coffre-fort d'entreprise.
console.log(`\n${dbTotal === total ? '✅ MIGRATION RÉUSSIE' : '❌ ÉCART'} — Supabase contient ${dbTotal}/${total} enregistrements.`)
process.exit(dbTotal === total ? 0 : 1)

// Sauvegarde COMPLÈTE de la base Supabase vers un fichier JSON horodaté.
// Sous ton contrôle : à lancer quand tu veux (npm run backup), ou à planifier.
//
//   cd migration/supabase
//   node backup.mjs
//
// Le fichier est écrit dans migration/backups/supabase-backup-<date>.json
import fs from 'node:fs'
import pg from 'pg'

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/^﻿/, ''))
const info = readJson('./.sbinfo.json')
const { ref, region, db_pass } = info

const url = `postgresql://postgres.${ref}:${db_pass}@aws-0-${region}.pooler.supabase.com:5432/postgres`
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

const outDir = new URL('../backups/', import.meta.url)
fs.mkdirSync(outDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outFile = new URL(`./supabase-backup-${stamp}.json`, outDir)

async function run() {
  await client.connect()
  const tables = (await client.query(
    `select tablename from pg_tables where schemaname='public' and (tablename like 'tp\\_%' or tablename='legacy_maxiagro') order by 1`
  )).rows.map(r => r.tablename)

  const dump = { exportedAt: new Date().toISOString(), project: ref, tables: {} }
  let total = 0
  for (const t of tables) {
    const rows = (await client.query(`select * from ${t}`)).rows
    dump.tables[t] = rows
    total += rows.length
  }
  fs.writeFileSync(outFile, JSON.stringify(dump, null, 2))
  await client.end()
  console.log(`✅ Sauvegarde écrite : ${outFile.pathname.replace(/^\//, '')}`)
  console.log(`   ${tables.length} tables, ${total} enregistrements.`)
}
run().catch(e => { console.error('❌ Sauvegarde échouée :', e.message); process.exit(1) })

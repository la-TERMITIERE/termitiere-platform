// Exécute un fichier .sql sur la base Supabase (via la connexion pooler + mot de passe DB).
//   node apply-sql.mjs secure-auth.sql
import fs from 'node:fs'
import pg from 'pg'

const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/^﻿/, ''))
const info = readJson('./.sbinfo.json')
const { ref, region, db_pass } = info

const file = process.argv[2]
if (!file) { console.error('Usage: node apply-sql.mjs <fichier.sql>'); process.exit(1) }
const sql = fs.readFileSync(new URL('./' + file, import.meta.url), 'utf8')

const url = `postgresql://postgres.${ref}:${db_pass}@aws-0-${region}.pooler.supabase.com:5432/postgres`
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

const run = async () => {
  await client.connect()
  await client.query(sql)
  await client.end()
  console.log(`✅ SQL appliqué : ${file}`)
}
run().catch(e => { console.error('❌', e.message); process.exit(1) })

// Génère schema.sql à partir de l'export Firebase (migration/firebase-export.json).
// 1 table PostgreSQL par collection du namespace tp/, au format id + data JSONB.
import fs from 'node:fs'

const exp = JSON.parse(fs.readFileSync(new URL('../firebase-export.json', import.meta.url)))
const tp = exp.tp || {}
const cols = Object.keys(tp).sort()

let out = ''
out += '-- Schema PostgreSQL / Supabase - Plateforme La Termitiere\n'
out += "-- Genere depuis l'export Firebase (namespace tp/). 1 table par collection.\n"
out += '-- Strategie sans perte : id + data JSONB (structure exacte preservee) + created_at.\n\n'

for (const c of cols) {
  const t = 'tp_' + c
  const n = Object.keys(tp[c] || {}).length
  out += `-- collection "${c}" (${n} enregistrements)\n`
  out += `create table if not exists ${t} (\n  id text primary key,\n  data jsonb not null,\n  created_at timestamptz\n);\n`
  out += `create index if not exists idx_${t}_data on ${t} using gin (data);\n\n`
}

out += '-- Donnees heritees de l ancienne application (preservees integralement)\n'
out += 'create table if not exists legacy_maxiagro (\n  node text primary key,\n  data jsonb not null\n);\n'

fs.writeFileSync(new URL('./schema.sql', import.meta.url), out)
console.log(`schema.sql genere : ${cols.length} tables tp_* + legacy_maxiagro`)

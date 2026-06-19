// Validation de bout en bout SANS serveur : applique schema.sql et importe les
// données réelles dans un PostgreSQL embarqué (PGlite), puis vérifie que le nombre
// de lignes en base correspond exactement à l'export Firebase.
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const exp = JSON.parse(fs.readFileSync(new URL('../firebase-export.json', import.meta.url)))
const tp = exp.tp || {}
const legacy = exp.maxiagro || {}
const schemaSql = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')

const toTs = (v) => {
  const ms = typeof v === 'number' ? v : (v?.createdAt || v?.timestamp || v?.savedAt)
  if (typeof ms !== 'number') return null
  const d = new Date(ms); return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const db = new PGlite()
await db.exec(schemaSql)
console.log('✅ schema.sql appliqué sans erreur.\n')

let okAll = true
let totalSrc = 0, totalDb = 0
for (const col of Object.keys(tp).sort()) {
  const table = `tp_${col}`
  const docs = tp[col] || {}
  const ids = Object.keys(docs)
  for (const id of ids) {
    const data = docs[id] ?? {}
    await db.query(
      `insert into ${table} (id, data, created_at) values ($1, $2::jsonb, $3)
       on conflict (id) do update set data = excluded.data;`,
      [id, JSON.stringify(data), toTs(data)]
    )
  }
  const r = await db.query(`select count(*)::int as c from ${table}`)
  const c = r.rows[0].c
  const ok = c === ids.length
  okAll = okAll && ok
  totalSrc += ids.length; totalDb += c
  console.log(`  ${ok ? '✓' : '✗'} ${table.padEnd(34)} export=${String(ids.length).padStart(4)}  base=${String(c).padStart(4)}`)
}

// Legacy
for (const node of Object.keys(legacy)) {
  await db.query(`insert into legacy_maxiagro (node, data) values ($1, $2::jsonb) on conflict (node) do nothing;`,
    [node, JSON.stringify(legacy[node])])
}
const lr = await db.query('select count(*)::int as c from legacy_maxiagro')

// Test d'une requête SQL réelle sur le JSONB (preuve d'exploitabilité)
const q = await db.query(`select data->>'role' as role, count(*)::int as n from tp_users group by 1 order by 2 desc`)

console.log(`\n  legacy_maxiagro : ${lr.rows[0].c} nœud(s)`)
console.log(`\n📊 Exemple de requête SQL sur le JSONB — utilisateurs par rôle :`)
q.rows.forEach((row) => console.log(`     ${(row.role||'(n/a)').padEnd(14)} ${row.n}`))

console.log(`\n${okAll ? '✅ VALIDATION RÉUSSIE' : '❌ ÉCART DÉTECTÉ'} — total export=${totalSrc}, total base=${totalDb}`)
process.exit(okAll ? 0 : 1)

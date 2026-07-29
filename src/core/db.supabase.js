// Implémentation PostgreSQL / Supabase de la couche de données.
// Active uniquement pour la cible self-hosted (VITE_USE_SUPABASE=true). Même API
// publique que db.firebase.js → aucun autre fichier de l'app n'a besoin de changer.
//
// Modèle : 1 table par collection `tp_<name>` (id text, data jsonb, created_at).
// On expose des documents { id, ...data }, identiques à l'ancienne API Firebase.
// Toutes les écritures sont assainies (sanitize.js) et limitées en débit (rateLimit.js).
//
// Temps réel : rafraîchissement périodique (polling léger). Robuste et sans config.
// À optimiser plus tard avec Supabase Realtime (inclus dans le stack self-hosted).
import { supabase } from './supabaseClient'
import { sanitizeData } from './sanitize'
import { checkRate } from './rateLimit'

const POLL_MS = 5000
const table = (name) => `tp_${name}`
const toRow = (r) => ({ id: r.id, ...(r.data || {}) })
const genId = () => 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export async function getAll(name) {
  const { data, error } = await supabase.from(table(name)).select('id,data')
  if (error) { console.error(`[db.supabase] getAll ${name}:`, error.message); return [] }
  return (data || []).map(toRow)
}

export async function getOne(name, id) {
  const { data, error } = await supabase.from(table(name)).select('id,data').eq('id', id).maybeSingle()
  if (error || !data) return null
  return toRow(data)
}

export async function addItem(name, data) {
  checkRate(name, 'write')
  data = sanitizeData(data)
  const id = genId()
  const payload = { ...data, createdAt: Date.now() }
  const { error } = await supabase.from(table(name)).insert({ id, data: payload, created_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  return id
}

// Crée ou fusionne (merge au niveau supérieur, comme l'update Firebase RTDB).
export async function setItem(name, id, data) {
  checkRate(name, 'write')
  data = sanitizeData(data)
  const { data: existing } = await supabase.from(table(name)).select('data').eq('id', id).maybeSingle()
  if (existing) {
    const merged = { ...(existing.data || {}), ...data }
    const { error } = await supabase.from(table(name)).update({ data: merged }).eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from(table(name)).insert({ id, data, created_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
  }
  return id
}

// Même sémantique de fusion que setItem (cohérent avec db.firebase.js).
export async function updateItem(name, id, data) {
  return setItem(name, id, data)
}

export async function removeItem(name, id) {
  const { error } = await supabase.from(table(name)).delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Réclame une ligne de façon ATOMIQUE : s'appuie sur la contrainte d'unicité de
// `id` — l'INSERT échoue avec le code 23505 si quelqu'un d'autre a déjà réclamé
// cet id entre-temps. Voir db.firebase.js pour l'équivalent RTDB (transaction).
export async function claimOnce(name, id, data = {}) {
  checkRate(name, 'write')
  data = sanitizeData(data)
  const payload = { ...data, createdAt: Date.now() }
  const { error } = await supabase.from(table(name)).insert({ id, data: payload, created_at: new Date().toISOString() })
  if (error) {
    if (error.code === '23505') return false
    throw new Error(error.message)
  }
  return true
}

// « Temps réel » par interrogation périodique. Renvoie une fonction de désinscription.
export function subscribeCollection(name, callback) {
  let stopped = false
  const tick = async () => { if (!stopped) callback(await getAll(name)) }
  tick()
  const interval = setInterval(tick, POLL_MS)
  return () => { stopped = true; clearInterval(interval) }
}

export const ts = () => Date.now()

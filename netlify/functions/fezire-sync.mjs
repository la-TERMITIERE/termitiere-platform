// Fonction Netlify : passerelle Termitière → FEZIRE (via Fezire Connect).
//
// AUTHENTIFICATION FEZIRE — deux chemins, dans cet ordre :
//   1. Clé API d'organisation (FEZIRE → Paramètres › Clés API), envoyée dans
//      l'en-tête `X-API-Key` comme l'indique FEZIRE.
//   2. OAuth2 client_credentials (accès Connect « La Termitière Platform ») sur
//      /api/identity/oauth2/token, puis `Authorization: Bearer <jeton>`.
//      ⚠️ Au 3 oct. 2026 ce client n'offre que des scopes OIDC (openid…), refusés
//      en client_credentials : chemin inutilisable tant que FEZIRE n'a pas ouvert
//      de scopes métier (quota de connexions Connect à débloquer par l'éditeur).
//
// ROUTAGE : FEZIRE expose chaque service sous /api/<service>, le reste du chemin
// est celui de sa doc Swagger (/api/<service>/docs) privé du préfixe /api.
//   ex. inventory « /api/products »       → /api/inventory/products
//       connect   « /api/v1/connections » → /api/connect/v1/connections
//
// ÉTAPE ACTUELLE : LECTURE SEULE. L'action `test` vérifie que les identifiants
// fonctionnent et liste ce que FEZIRE contient déjà, sans rien écrire. Les envois
// (produits, stock, factures, dépenses…) viendront ensuite, un par un.
//
// APPEL (réservé à l'administration) :
//   GET /.netlify/functions/fezire-sync?action=test
//   en-tête  x-sync-secret: <FEZIRE_SYNC_SECRET>
//
// Variables d'environnement (Netlify → Site settings → Environment variables) :
//   FEZIRE_SYNC_SECRET    (obligatoire) phrase secrète protégeant cette fonction
//   FEZIRE_API_KEY        (chemin 1)    clé API d'organisation FEZIRE
//   FEZIRE_CLIENT_ID      (chemin 2)    identifiant client émis par Connect
//   FEZIRE_CLIENT_SECRET  (chemin 2)    secret émis par Connect (affiché UNE fois)
//   FEZIRE_SCOPE          (chemin 2)    autorisations demandées, séparées par des espaces
//   FEZIRE_ORG_ID         (optionnel)   organisation FEZIRE (en-tête x-organization-id)
//   FEZIRE_BASE_URL       (optionnel)   défaut https://demo.fezire.com
// Aucune de ces valeurs ne doit apparaître dans le code ni côté navigateur.

const BASE = (process.env.FEZIRE_BASE_URL || 'https://demo.fezire.com').replace(/\/+$/, '')

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body, null, 2)
})

// Comparaison à temps constant (évite de deviner le secret caractère par caractère).
function secretValide(fourni) {
  const attendu = process.env.FEZIRE_SYNC_SECRET || ''
  if (!attendu || typeof fourni !== 'string' || fourni.length !== attendu.length) return false
  let diff = 0
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ fourni.charCodeAt(i)
  return diff === 0
}

async function jetonOAuth() {
  const { FEZIRE_CLIENT_ID: id, FEZIRE_CLIENT_SECRET: secret, FEZIRE_SCOPE: scope } = process.env
  if (!id || !secret) throw new Error('Ni FEZIRE_API_KEY ni FEZIRE_CLIENT_ID / FEZIRE_CLIENT_SECRET ne sont configurés dans Netlify')
  const corps = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret })
  if (scope) corps.set('scope', scope)
  const r = await fetch(`${BASE}/api/identity/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corps
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || !data.access_token) {
    throw new Error(`Jeton FEZIRE refusé (HTTP ${r.status}) : ${data.message || data.error_description || data.error || 'réponse inattendue'}`)
  }
  return data.access_token
}

// En-têtes d'authentification pour tous les appels FEZIRE (+ méthode retenue).
async function authFezire() {
  const entetes = {}
  if (process.env.FEZIRE_ORG_ID) entetes['x-organization-id'] = process.env.FEZIRE_ORG_ID
  if (process.env.FEZIRE_API_KEY) return { methode: 'cle-api', entetes: { ...entetes, 'X-API-Key': process.env.FEZIRE_API_KEY } }
  return { methode: 'oauth2', entetes: { ...entetes, Authorization: `Bearer ${await jetonOAuth()}` } }
}

// GET en lecture seule ; renvoie un résumé (statut + nombre d'éléments), jamais d'erreur bloquante.
async function lire(entetes, chemin) {
  try {
    const r = await fetch(`${BASE}${chemin}`, { headers: entetes })
    const data = await r.json().catch(() => null)
    const liste = Array.isArray(data) ? data : (data?.data || data?.items || data?.results)
    return {
      chemin,
      http: r.status,
      ok: r.ok,
      elements: Array.isArray(liste) ? liste.length : undefined,
      total: data?.total ?? data?.meta?.total,
      message: r.ok ? undefined : (data?.message || null)
    }
  } catch (e) {
    return { chemin, ok: false, message: e.message }
  }
}

async function actionTest() {
  const { methode, entetes } = await authFezire()
  const verifications = await Promise.all([
    lire(entetes, '/api/connect/v1/applications/qui-suis-je'),
    lire(entetes, '/api/connect/v1/connections'),
    lire(entetes, '/api/inventory/products'),
    lire(entetes, '/api/inventory/warehouses'),
    lire(entetes, '/api/commerce/invoices'),
    lire(entetes, '/api/accounting/accounts'),
    lire(entetes, '/api/accounting/journals'),
    lire(entetes, '/api/treasury/treasury/accounts')
  ])
  return { base: BASE, authentification: methode, verifications }
}

export const handler = async (event) => {
  const secret = event.headers['x-sync-secret'] || event.headers['X-Sync-Secret']
  if (!secretValide(secret)) return json(401, { error: 'Non autorisé' })

  const action = event.queryStringParameters?.action || 'test'
  try {
    if (action === 'test') return json(200, await actionTest())
    return json(400, { error: `Action inconnue : ${action}` })
  } catch (e) {
    return json(502, { error: e.message })
  }
}

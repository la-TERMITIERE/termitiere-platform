// Fonction Netlify : exposition des données Termitière au format canonique FEZIRE.
//
// Fezire Connect (connexion « La Termitière Platform », fournisseur API REST, sens
// ENTRANT) vient LIRE nos données ici, puis les enregistre dans FEZIRE en suivant
// les correspondances définies dans Connect. Nos réponses portent DIRECTEMENT les
// noms de champs canoniques FEZIRE (cf. docs/FEZIRE_CONNECT.md) : chaque règle de
// correspondance est donc une simple copie à l'identique.
//
// PÉRIMÈTRE ACTUEL : MAXI AGRO uniquement. LECTURE SEULE — rien n'est jamais écrit.
//
// ADRESSES (cf. redirection dans netlify.toml) :
//   GET /api/fezire/v1/<ressource>?page=1&per_page=100&since=AAAA-MM-JJ
//   <ressource> : categories | products | warehouses | stocks | stock-movements |
//                 customers | orders | invoices | payments   (ou le code FEZIRE : PRODUCT…)
//   Côté Connect, l'adresse de base de la connexion est `<site>/api/fezire/v1` : sa
//   convention REST standard y ajoute le nom de la ressource (vérifié le 8 oct. 2026).
//   Réponse : { data: [...], meta: { ressource, total, page, per_page, pages } }
//
// AUTHENTIFICATION : la clé que FEZIRE nous présente (« clé fournie par la
// plateforme », enregistrée à l'étape 4 de l'assistant Connect), dans l'en-tête
// `X-API-Key` (ou `Authorization: Bearer <clé>`).
//
// Variables d'environnement (Netlify → Site settings → Environment variables) :
//   FEZIRE_INBOUND_KEY       (obligatoire) clé que FEZIRE présente à chaque appel
//   FIREBASE_SERVICE_ACCOUNT (recommandé)  lecture authentifiée de la base (cf. backup-db)
//   FIREBASE_DB_URL          (optionnel)   défaut = base de production max-agro-83baf
import crypto from 'node:crypto'

const DB_URL = process.env.FIREBASE_DB_URL || 'https://max-agro-83baf-default-rtdb.firebaseio.com'
const ROOT = 'tp' // namespace Termitière (cf. src/core/db.firebase.js)
const DEVISE = 'XOF'
const PAYS = 'TG'
const ENTREPOT_AGRO = 'agro-ferme'

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
})

// ───────────────────────── Authentification de FEZIRE ─────────────────────────

function egaliteConstante(a, b) {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

function cleValide(headers) {
  const attendue = process.env.FEZIRE_INBOUND_KEY
  if (!attendue) return false
  const h = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]))
  const authz = h.authorization || ''
  const fournie = h['x-api-key'] || (authz.startsWith('Bearer ') ? authz.slice(7) : '')
  return egaliteConstante(fournie, attendue)
}

// ───────────────────────── Lecture Firebase (REST) ─────────────────────────

// Jeton Google à partir du compte de service (même mécanique que backup-db).
async function jetonFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null
  const sa = JSON.parse(raw)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const entete = b64({ alg: 'RS256', typ: 'JWT' })
  const charge = b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database.readonly https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  })
  const signature = crypto.createSign('RSA-SHA256').update(`${entete}.${charge}`)
    .sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${entete}.${charge}.${signature}` })
  })
  if (!r.ok) throw new Error(`OAuth Google ${r.status}`)
  return (await r.json()).access_token
}

// Collection RTDB → tableau [{ id, ...data }] (la clé fait foi, comme snapToRows).
async function lireCollection(nom, jeton) {
  const url = new URL(`${DB_URL}/${ROOT}/${nom}.json`)
  if (jeton) url.searchParams.set('access_token', jeton)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Lecture ${nom} refusée (HTTP ${r.status})`)
  const val = await r.json()
  return val ? Object.entries(val).map(([id, data]) => ({ ...(data || {}), id })) : []
}

// ───────────────────────── Transformations Maxi Agro → canonique ─────────────────────────

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const iso = (d) => (d ? new Date(d).toISOString() : null)
const entier = (v) => parseInt(v, 10) || 0
const nombre = (v) => parseFloat(v) || 0

const idCategorie = (cat) => `agro-cat-${slug(cat)}`
const idProduit = (articleId) => `agro-art-${articleId}`
const skuProduit = (articleId) => `AGRO-${String(articleId).toUpperCase()}`
const idClient = (client) => `agro-cli-${slug(client?.nom) || 'inconnu'}`

// Référentiel d'articles : espèces (animaux) + aliments/divers.
export function produits(referentiel) {
  return referentiel.filter((r) => r.type === 'espece' || r.type === 'aliment').map((r) => ({
    external_id: idProduit(r.id),
    sku: skuProduit(r.id),
    name: r.nom || r.id,
    description: [r.type === 'espece' ? 'Animal' : 'Aliment / divers', r.cat, r.unite].filter(Boolean).join(' · '),
    price: nombre(r.prix),
    currency: DEVISE,
    category_id: r.cat ? idCategorie(r.cat) : null,
    active: true
  }))
}

export function categories(referentiel) {
  const cats = [...new Set(referentiel.map((r) => r.cat).filter(Boolean))].sort()
  return cats.map((cat) => ({ external_id: idCategorie(cat), name: `Maxi Agro · ${cat}`, parent_id: null }))
}

export function entrepots() {
  return [{ external_id: ENTREPOT_AGRO, name: 'Ferme Maxi Agro', location: 'Maxi Agro', active: true }]
}

// Niveaux de stock = EF Final du dernier inventaire enregistré, par article.
export function stocks(inventaires) {
  const dernier = [...inventaires].filter((i) => i.date).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  if (!dernier) return []
  const lignes = []
  for (const [coll, data] of [['animaux', dernier.animaux], ['aliments', dernier.aliments]]) {
    for (const [articleId, v] of Object.entries(data || {})) {
      lignes.push({
        external_id: `agro-stock-${articleId}`,
        product_id: idProduit(articleId),
        sku: skuProduit(articleId),
        warehouse_id: ENTREPOT_AGRO,
        quantity: entier(v?.fin),
        reserved: 0,
        updated_at: iso(dernier.date),
        _famille: coll
      })
    }
  }
  return lignes.map(({ _famille, ...l }) => l)
}

// Mouvements = lignes typées (entrées +, sorties −) de chaque inventaire journalier,
// + ventes issues des demandes de sortie certifiées (dont celles des factures).
export function mouvements(inventaires, demandes) {
  const out = []
  for (const inv of inventaires) {
    if (!inv.date) continue
    for (const famille of ['animaux', 'aliments']) {
      for (const [articleId, v] of Object.entries(inv[famille] || {})) {
        ;(v?.entrees || []).forEach((l, i) => {
          if (!entier(l.qte)) return
          out.push({
            external_id: `agro-mv-${inv.date}-${articleId}-e${i}`, product_id: idProduit(articleId),
            warehouse_id: ENTREPOT_AGRO, quantity: entier(l.qte),
            reason: [l.type, l.label].filter(Boolean).join(' : ') || 'Entrée', moved_at: iso(inv.date)
          })
        })
        ;(v?.sorties || []).forEach((l, i) => {
          if (!entier(l.qte)) return
          out.push({
            external_id: `agro-mv-${inv.date}-${articleId}-s${i}`, product_id: idProduit(articleId),
            warehouse_id: ENTREPOT_AGRO, quantity: -entier(l.qte),
            reason: [l.type, l.label].filter(Boolean).join(' : ') || 'Sortie', moved_at: iso(inv.date)
          })
        })
      }
    }
  }
  for (const d of demandes) {
    if (!['certifie', 'certifiee', 'approuve', 'approuvee'].includes(d.statut) || !entier(d.qte) || !d.articleId) continue
    out.push({
      external_id: `agro-dem-${d.id}`, product_id: idProduit(d.articleId), warehouse_id: ENTREPOT_AGRO,
      quantity: -entier(d.qte), reason: [d.motif || 'Sortie sur demande', d.num].filter(Boolean).join(' · '),
      moved_at: iso(d.dateSortie || d.date)
    })
  }
  return out.sort((a, b) => String(a.moved_at).localeCompare(String(b.moved_at)))
}

export function clients(factures) {
  const parId = new Map()
  for (const f of factures) {
    if (statutFacture(f) === 'brouillon') continue // mêmes clients que les commandes exportées
    const c = f.client || {}
    if (!(c.nom || '').trim()) continue
    const id = idClient(c)
    const prec = parId.get(id)
    if (prec && String(prec._date) > String(f.date)) continue // garde les coordonnées les plus récentes
    parId.set(id, {
      external_id: id, firstname: null, lastname: c.nom.trim(), company: null,
      email: c.email || null, phone: c.tel || null, country: PAYS, city: null, address: c.adresse || null,
      _date: f.date || ''
    })
  }
  return [...parId.values()].map(({ _date, ...c }) => c)
}

// Statuts canoniques (libellés simples, à ajuster si FEZIRE en impose d'autres).
const STATUT_COMMANDE = {
  brouillon: 'draft', sortie_demandee: 'pending', modif_demandee: 'pending',
  sortie_approuvee: 'confirmed', certifiee: 'completed', refusee: 'cancelled'
}
const statutFacture = (f) => f.statut || 'certifiee' // factures héritées = certifiées

const lignesEffectives = (f) => (f.lignesReelles?.length ? f.lignesReelles : f.lignes) || []
function totaux(f) {
  const lignes = lignesEffectives(f)
  const totalHT = lignes.reduce((s, l) => s + (nombre(l.total) || entier(l.qte) * nombre(l.prixUnit ?? l.prix)), 0)
  const apresRemise = totalHT * (1 - nombre(f.remise) / 100)
  const taxe = apresRemise * (nombre(f.tva) / 100)
  return { total: Math.round(apresRemise + taxe), tax_total: Math.round(taxe) }
}

export function commandes(factures) {
  return factures.filter((f) => statutFacture(f) !== 'brouillon').map((f) => {
    const { total, tax_total } = totaux(f)
    return {
      external_id: `agro-cmd-${f.id}`,
      customer_id: f.client?.nom ? idClient(f.client) : null,
      reference: f.numero || f.id,
      currency: DEVISE, total, tax_total,
      status: STATUT_COMMANDE[statutFacture(f)] || 'pending',
      ordered_at: iso(f.date),
      lines: lignesEffectives(f).filter((l) => l.articleId || entier(l.qte)).map((l, i) => ({
        external_id: `agro-cmd-${f.id}-l${i + 1}`,
        product_id: l.articleId ? idProduit(l.articleId) : null,
        sku: l.articleId ? skuProduit(l.articleId) : null,
        label: l.article || '',
        quantity: entier(l.qte),
        unit_price: nombre(l.prixUnit ?? l.prix),
        total: nombre(l.total) || entier(l.qte) * nombre(l.prixUnit ?? l.prix)
      }))
    }
  })
}

// Seules les factures CERTIFIÉES sont des factures définitives.
export function factures(facturesAgro) {
  return facturesAgro.filter((f) => statutFacture(f) === 'certifiee').map((f) => ({
    external_id: `agro-fac-${f.id}`,
    order_id: `agro-cmd-${f.id}`,
    customer_id: f.client?.nom ? idClient(f.client) : null,
    number: f.numero || f.id,
    total: totaux(f).total,
    currency: DEVISE,
    status: 'issued',
    issued_at: iso(f.certifieeLe || f.date),
    due_at: null
  }))
}

// ───────────────────────── Routage des ressources ─────────────────────────

const RESSOURCES = {
  categories: 'CATEGORY', products: 'PRODUCT', warehouses: 'WAREHOUSE', stocks: 'STOCK',
  'stock-movements': 'STOCK_MOVEMENT', customers: 'CUSTOMER', orders: 'ORDER',
  invoices: 'INVOICE', payments: 'PAYMENT'
}
// Connect appelle « <adresse de base>/<ressource> » selon sa convention REST standard
// (vérifié : /categories). On tolère les variantes d'écriture : casse, tirets ou
// soulignés, singulier/pluriel (stock-movements, stock_movements, STOCK_MOVEMENT, product…).
const cle = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '').replace(/(ies|s)$/, (m) => (m === 'ies' ? 'y' : ''))
const PAR_CLE = Object.fromEntries([
  ...Object.entries(RESSOURCES).map(([k, v]) => [cle(k), v]),
  ...Object.values(RESSOURCES).map((v) => [cle(v), v])
])
export const codeRessource = (brut) => PAR_CLE[cle(brut)] || null

// Collections RTDB nécessaires par ressource (on ne lit que le strict utile).
const BESOINS = {
  CATEGORY: ['agro_referentiel'], PRODUCT: ['agro_referentiel'], WAREHOUSE: [],
  STOCK: ['agro_inventaires'], STOCK_MOVEMENT: ['agro_inventaires', 'agro_demandes'],
  CUSTOMER: ['agro_factures'], ORDER: ['agro_factures'], INVOICE: ['agro_factures'], PAYMENT: []
}

export function construire(code, d) {
  switch (code) {
    case 'CATEGORY': return categories(d.agro_referentiel)
    case 'PRODUCT': return produits(d.agro_referentiel)
    case 'WAREHOUSE': return entrepots()
    case 'STOCK': return stocks(d.agro_inventaires)
    case 'STOCK_MOVEMENT': return mouvements(d.agro_inventaires, d.agro_demandes)
    case 'CUSTOMER': return clients(d.agro_factures)
    case 'ORDER': return commandes(d.agro_factures)
    case 'INVOICE': return factures(d.agro_factures)
    case 'PAYMENT': return [] // Maxi Agro ne suit pas encore les encaissements
    default: return null
  }
}

// Date de référence d'un élément, pour le filtre incrémental `since`.
const dateElement = (e) => e.moved_at || e.ordered_at || e.issued_at || e.updated_at || null

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Méthode non autorisée' })
  if (!cleValide(event.headers)) return json(401, { error: 'Clé invalide ou absente' })

  const q = event.queryStringParameters || {}
  // La ressource vient du chemin (/api/fezire/v1/<ressource>) : quand l'appel porte
  // ses propres paramètres (?page=…), Netlify ne transmet pas le `?ressource=` de la
  // redirection. Le paramètre reste accepté pour l'appel direct de la fonction.
  const duChemin = /\/api\/fezire\/v1\/([^/?#]+)/.exec(event.path || '')?.[1]
  const brut = decodeURIComponent(duChemin || q.ressource || '').trim()
  const code = codeRessource(brut)
  if (!code) {
    return json(404, { error: `Ressource inconnue : « ${brut} »`, ressources: Object.keys(RESSOURCES) })
  }

  try {
    const jeton = await jetonFirebase()
    const donnees = Object.fromEntries(await Promise.all(
      BESOINS[code].map(async (col) => [col, await lireCollection(col, jeton)])
    ))
    let elements = construire(code, donnees)
    if (q.since) {
      const depuis = new Date(q.since)
      if (!isNaN(depuis)) elements = elements.filter((e) => !dateElement(e) || new Date(dateElement(e)) >= depuis)
    }
    const perPage = Math.min(Math.max(entier(q.per_page) || 100, 1), 500)
    const pages = Math.max(1, Math.ceil(elements.length / perPage))
    const page = Math.min(Math.max(entier(q.page) || 1, 1), pages)
    return json(200, {
      data: elements.slice((page - 1) * perPage, page * perPage),
      meta: { ressource: code, total: elements.length, page, per_page: perPage, pages }
    })
  } catch (e) {
    console.error('[fezire-export]', code, e.message)
    return json(502, { error: 'Lecture des données impossible pour le moment' })
  }
}

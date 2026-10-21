// Fonction Netlify : exposition des données Termitière au format canonique FEZIRE.
//
// Fezire Connect (connexion « La Termitière Platform », fournisseur API REST, sens
// ENTRANT) vient LIRE nos données ici, puis les enregistre dans FEZIRE en suivant
// les correspondances définies dans Connect. Nos réponses portent DIRECTEMENT les
// noms de champs canoniques FEZIRE (cf. docs/FEZIRE_CONNECT.md) : chaque règle de
// correspondance est donc une simple copie à l'identique.
//
// PÉRIMÈTRE : Maxi Agro, Briqueterie, Logistique, Maxi Gym, Garderie. LECTURE SEULE —
// rien n'est jamais écrit dans notre base.
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
//   FEZIRE_MOUVEMENTS_DEPUIS (optionnel)   date de départ des mouvements de stock (défaut 2026-10-09)
import crypto from 'node:crypto'

const DB_URL = process.env.FIREBASE_DB_URL || 'https://max-agro-83baf-default-rtdb.firebaseio.com'
const ROOT = 'tp' // namespace Termitière (cf. src/core/db.firebase.js)
const DEVISE = 'XOF'
const PAYS = 'TG'
const ENTREPOT_AGRO = 'agro-ferme'
// Les niveaux de stock (STOCK) envoient l'état ACTUEL, qui intègre déjà tout l'historique.
// Rejouer les mouvements antérieurs dans FEZIRE fausserait donc les quantités (constaté
// lors du premier import du 8 oct. 2026) : seuls les mouvements datés à partir de ce
// jour partent. Réglable par FEZIRE_MOUVEMENTS_DEPUIS (AAAA-MM-JJ).
const MOUVEMENTS_DEPUIS = process.env.FEZIRE_MOUVEMENTS_DEPUIS || '2026-10-09'

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
  const depuis = new Date(MOUVEMENTS_DEPUIS)
  return out
    .filter((m) => !m.moved_at || new Date(m.moved_at) >= depuis)
    .sort((a, b) => String(a.moved_at).localeCompare(String(b.moved_at)))
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

// Une ligne n'est envoyée que si son article existe au référentiel (donc a été importé
// comme produit) : FEZIRE refuse toute commande dont une ligne ne désigne pas un
// produit connu (« Chaque ligne doit désigner un produit externe »). Une commande
// sans aucune ligne valable n'est pas envoyée.
function lignesCommande(f, articles) {
  return lignesEffectives(f)
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.articleId && articles.has(l.articleId))
    .map(({ l, i }) => ({
      external_id: `agro-cmd-${f.id}-l${i + 1}`,
      product_id: idProduit(l.articleId),
      sku: skuProduit(l.articleId),
      label: l.article || '',
      quantity: entier(l.qte),
      unit_price: nombre(l.prixUnit ?? l.prix),
      total: nombre(l.total) || entier(l.qte) * nombre(l.prixUnit ?? l.prix)
    }))
}

const articlesConnus = (referentiel) => new Set(
  referentiel.filter((r) => r.type === 'espece' || r.type === 'aliment').map((r) => r.id)
)

export function commandes(factures, referentiel) {
  const articles = articlesConnus(referentiel)
  return factures.filter((f) => statutFacture(f) !== 'brouillon').map((f) => {
    const lines = lignesCommande(f, articles)
    if (!lines.length) return null
    const { total, tax_total } = totaux(f)
    return {
      external_id: `agro-cmd-${f.id}`,
      customer_id: f.client?.nom ? idClient(f.client) : null,
      reference: f.numero || f.id,
      currency: DEVISE, total, tax_total,
      status: STATUT_COMMANDE[statutFacture(f)] || 'pending',
      ordered_at: iso(f.date),
      lines
    }
  }).filter(Boolean)
}

// Seules les factures CERTIFIÉES sont des factures définitives.
export function factures(facturesAgro, referentiel) {
  const articles = articlesConnus(referentiel)
  return facturesAgro.filter((f) => statutFacture(f) === 'certifiee').map((f) => ({
    external_id: `agro-fac-${f.id}`,
    order_id: lignesCommande(f, articles).length ? `agro-cmd-${f.id}` : null,
    customer_id: f.client?.nom ? idClient(f.client) : null,
    number: f.numero || f.id,
    total: totaux(f).total,
    currency: DEVISE,
    status: 'issued',
    issued_at: iso(f.certifieeLe || f.date),
    due_at: null
  }))
}

// ───────────────────────── Autres modules ─────────────────────────
// Chaque module verse ses données dans les MÊMES listes canoniques que Maxi Agro,
// sous un préfixe propre (briq-, logi-, gym-, gard-) : aucun doublon, aucune
// correspondance supplémentaire à créer dans Connect. Pas de niveaux ni de
// mouvements de stock pour ces modules tant que la sémantique de l'import STOCK
// de FEZIRE n'est pas clarifiée (cf. docs/FEZIRE_CONNECT.md).

const produit = (prefixe, id, nom, prix, cat, description) => ({
  external_id: `${prefixe}-art-${id}`,
  sku: `${prefixe.toUpperCase()}-${String(id).toUpperCase()}`,
  name: nom || id,
  description: description || null,
  price: nombre(prix),
  currency: DEVISE,
  category_id: cat ? `${prefixe}-cat-${slug(cat)}` : null,
  active: true
})
const categorie = (prefixe, libelleModule, cat) => ({
  external_id: `${prefixe}-cat-${slug(cat)}`, name: `${libelleModule} · ${cat}`, parent_id: null
})
const client = (prefixe, nom, tel, adresse, email) => ({
  external_id: `${prefixe}-cli-${slug(nom) || 'inconnu'}`, firstname: null, lastname: String(nom).trim(),
  company: null, email: email || null, phone: tel || null, country: PAYS, city: null, address: adresse || null
})
// Dédoublonne par identifiant ; garde la fiche la plus renseignée.
function uniques(liste) {
  const m = new Map()
  for (const e of liste) {
    const prec = m.get(e.external_id)
    if (!prec || Object.values(e).filter(Boolean).length > Object.values(prec).filter(Boolean).length) m.set(e.external_id, e)
  }
  return [...m.values()]
}
// Une vente « simple » : commande + facture (+ paiement) à partir de lignes déjà canoniques.
function vente(prefixe, f, { numero, date, clientNom, lignes, total, statutCommande = 'completed' }) {
  const cliId = (clientNom || '').trim() ? `${prefixe}-cli-${slug(clientNom)}` : null
  const cmd = lignes.length ? {
    external_id: `${prefixe}-cmd-${f.id}`, customer_id: cliId, reference: numero || f.id, currency: DEVISE,
    total: Math.round(nombre(total)), tax_total: 0, status: statutCommande, ordered_at: iso(date), lines: lignes
  } : null
  const fac = {
    external_id: `${prefixe}-fac-${f.id}`, order_id: cmd ? cmd.external_id : null, customer_id: cliId,
    number: numero || f.id, total: Math.round(nombre(total)), currency: DEVISE, status: 'issued',
    issued_at: iso(date), due_at: null
  }
  return { cmd, fac }
}

// BRIQUETERIE (module « evenementiel ») : briques et matières, factures au format Maxi Agro.
const BRIQ = 'briq'
const briqueterie = {
  categories: () => ['BRIQUES', 'MATIÈRES'].map((c) => categorie(BRIQ, 'Briqueterie', c)),
  produits: (ref) => [
    ...ref.filter((r) => r.type === 'brique').map((b) => produit(BRIQ, b.id, b.nom, b.tarifVente, 'BRIQUES', 'Brique')),
    ...ref.filter((r) => r.type === 'matiere').map((m) => produit(BRIQ, m.id, m.nom, 0, 'MATIÈRES', ['Matière première', m.unite].filter(Boolean).join(' · ')))
  ],
  entrepots: () => [{ external_id: `${BRIQ}-site`, name: 'Briqueterie', location: 'Briqueterie', active: true }],
  ventes: (facs, ref) => {
    const articles = new Set(ref.filter((r) => r.type === 'brique' || r.type === 'matiere').map((r) => r.id))
    return facs.filter((f) => !['brouillon', 'annulee'].includes(f.statut)).map((f) => {
      const lignes = (f.lignes || []).map((l, i) => ({ l, i })).filter(({ l }) => l.articleId && articles.has(l.articleId))
        .map(({ l, i }) => ({
          external_id: `${BRIQ}-cmd-${f.id}-l${i + 1}`, product_id: `${BRIQ}-art-${l.articleId}`,
          sku: `${BRIQ.toUpperCase()}-${String(l.articleId).toUpperCase()}`, label: l.article || '',
          quantity: entier(l.qte), unit_price: nombre(l.prixUnit), total: nombre(l.total) || entier(l.qte) * nombre(l.prixUnit)
        }))
      return { f, ...vente(BRIQ, f, { numero: f.numero, date: f.date, clientNom: f.client?.nom, lignes, total: f.totalTTC ?? totaux(f).total }) }
    })
  },
  clients: (facs) => facs.filter((f) => (f.client?.nom || '').trim() && !['brouillon', 'annulee'].includes(f.statut))
    .map((f) => client(BRIQ, f.client.nom, f.client.tel, f.client.adresse, f.client.email))
}

// LOGISTIQUE : location de matériel (sites Lomé / Kara). Seules les factures APPROUVÉES sont définitives.
const LOGI = 'logi'
const logistique = {
  categories: (ref) => [...new Set(ref.filter((r) => r.type === 'materiel').map((m) => m.cat).filter(Boolean))].sort()
    .map((c) => categorie(LOGI, 'Logistique', c)),
  produits: (ref) => ref.filter((r) => r.type === 'materiel')
    .map((m) => produit(LOGI, m.id, m.nom, m.tarifLocation, m.cat, ['Location', m.unite].filter(Boolean).join(' · '))),
  entrepots: () => [
    { external_id: `${LOGI}-lome`, name: 'Logistique · Lomé', location: 'Lomé', active: true },
    { external_id: `${LOGI}-kara`, name: 'Logistique · Kara', location: 'Kara', active: true }
  ],
  ventes: (facs, ref) => {
    const articles = new Set(ref.filter((r) => r.type === 'materiel').map((r) => r.id))
    return facs.filter((f) => f.statut === 'approuvee').map((f) => {
      const lignes = (f.lignes || []).map((l, i) => ({ l, i })).filter(({ l }) => l.materielId && articles.has(l.materielId))
        .map(({ l, i }) => {
          const jours = entier(l.nbJours) || 1
          return {
            external_id: `${LOGI}-cmd-${f.id}-l${i + 1}`, product_id: `${LOGI}-art-${l.materielId}`,
            sku: `${LOGI.toUpperCase()}-${String(l.materielId).toUpperCase()}`,
            label: `${l.materielNom || ''} · ${jours} jour(s)`.trim(),
            quantity: entier(l.qte), unit_price: nombre(l.tarifUnitaire) * jours,
            total: nombre(l.montant) || entier(l.qte) * jours * nombre(l.tarifUnitaire)
          }
        })
      return { f, ...vente(LOGI, f, { numero: f.num, date: f.date, clientNom: f.clientNom, lignes, total: f.totalTTC ?? f.totalHT }) }
    })
  },
  clients: (facs, fiches) => facs.filter((f) => f.statut === 'approuvee' && (f.clientNom || '').trim()).map((f) => {
    const fiche = fiches.find((c) => slug(c.nom) === slug(f.clientNom)) || {}
    return client(LOGI, f.clientNom, fiche.telephone || fiche.tel, fiche.adresse, fiche.email)
  })
}

// MAXI GYM : séances, abonnements et règlements partenaires (reçus encaissés immédiatement).
const GYM = 'gym'
const SERVICES_GYM = { seance: 'Séance', abonnement: 'Abonnement', reglement_partenaire: 'Règlement partenaire' }
const serviceGym = (t) => (SERVICES_GYM[t] ? t : 'seance')
const maxiGym = {
  categories: () => [categorie(GYM, 'Maxi Gym', 'SERVICES')],
  produits: () => Object.entries(SERVICES_GYM).map(([id, nom]) => produit(GYM, id, `Maxi Gym · ${nom}`, 0, 'SERVICES', 'Service')),
  ventes: (facs) => facs.filter((f) => nombre(f.montant) > 0).map((f) => {
    const s = serviceGym(f.sourceType)
    const lignes = [{
      external_id: `${GYM}-cmd-${f.id}-l1`, product_id: `${GYM}-art-${s}`, sku: `GYM-${s.toUpperCase()}`,
      label: f.description || SERVICES_GYM[s], quantity: 1, unit_price: nombre(f.montant), total: nombre(f.montant)
    }]
    const { cmd, fac } = vente(GYM, f, { numero: f.numero, date: f.date, clientNom: f.clientNom, lignes, total: f.montant })
    const pay = {
      external_id: `${GYM}-pay-${f.id}`, order_id: cmd.external_id, amount: Math.round(nombre(f.montant)),
      currency: DEVISE, method: 'cash', status: 'paid', paid_at: iso(f.date)
    }
    return { f, cmd, fac, pay }
  }),
  clients: (facs, fiches) => facs.filter((f) => (f.clientNom || '').trim()).map((f) => {
    const fiche = fiches.find((c) => slug(c.nom) === slug(f.clientNom)) || {}
    return client(GYM, f.clientNom, f.clientTelephone || fiche.telephone, null, null)
  })
}

// GARDERIE : frais encaissés. Le client est le PARENT (aucune donnée d'enfant envoyée).
const GARD = 'gard'
const SERVICES_GARD = { inscription: 'Inscription', mensuel: 'Scolarité mensuelle', journalier: 'Garde journalière' }
const serviceGard = (t) => (SERVICES_GARD[t] ? t : 'mensuel')
const parentDe = (p, enfants) => {
  const e = enfants.find((x) => x.id === p.enfantId) || {}
  return { nom: (e.parentNom || '').trim() || `Parent ${String(p.enfantId || p.id).slice(-6)}`, tel: e.parentContact || null }
}
const garderie = {
  categories: () => [categorie(GARD, 'Garderie', 'SERVICES')],
  produits: () => Object.entries(SERVICES_GARD).map(([id, nom]) => produit(GARD, id, `Garderie · ${nom}`, 0, 'SERVICES', 'Service')),
  ventes: (paiements, enfants) => paiements.filter((p) => nombre(p.montantDu) > 0 || nombre(p.montantPaye) > 0).map((p) => {
    const s = serviceGard(p.type)
    const du = nombre(p.montantDu) || nombre(p.montantPaye)
    const periode = p.mois && p.annee ? ` ${String(p.mois).padStart(2, '0')}/${p.annee}` : ''
    const parent = parentDe(p, enfants)
    const lignes = [{
      external_id: `${GARD}-cmd-${p.id}-l1`, product_id: `${GARD}-art-${s}`, sku: `GARD-${s.toUpperCase()}`,
      label: `${SERVICES_GARD[s]}${periode}`, quantity: 1, unit_price: du, total: du
    }]
    const { cmd, fac } = vente(GARD, p, { numero: `GARD-${p.id}`, date: p.date, clientNom: parent.nom, lignes, total: du })
    const paye = nombre(p.montantPaye)
    const pay = paye > 0 ? {
      external_id: `${GARD}-pay-${p.id}`, order_id: cmd.external_id, amount: Math.round(paye), currency: DEVISE,
      method: p.modePaiement || 'cash', status: paye >= du ? 'paid' : 'partial', paid_at: iso(p.date)
    } : null
    return { f: p, cmd, fac, pay }
  }),
  clients: (paiements, enfants) => paiements.map((p) => {
    const parent = parentDe(p, enfants)
    return client(GARD, parent.nom, parent.tel, null, null)
  })
}

// Assemble toutes les ventes des modules non-Agro (calculé une fois par appel).
function ventesModules(d) {
  return [
    ...briqueterie.ventes(d.evenementiel_factures || [], d.evenementiel_referentiel || []),
    ...logistique.ventes(d.logistique_factures || [], d.logistique_referentiel || []),
    ...maxiGym.ventes(d.gym_factures || []),
    ...garderie.ventes(d.garderie_paiements || [], d.garderie_enfants || [])
  ]
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
const REFERENTIELS = ['agro_referentiel', 'evenementiel_referentiel', 'logistique_referentiel']
const VENTES = [
  'evenementiel_factures', 'evenementiel_referentiel', 'logistique_factures', 'logistique_referentiel',
  'gym_factures', 'garderie_paiements', 'garderie_enfants'
]
const BESOINS = {
  CATEGORY: REFERENTIELS, PRODUCT: REFERENTIELS, WAREHOUSE: [],
  STOCK: ['agro_inventaires'], STOCK_MOVEMENT: ['agro_inventaires', 'agro_demandes'],
  CUSTOMER: ['agro_factures', 'evenementiel_factures', 'logistique_factures', 'logistique_clients',
    'gym_factures', 'gym_clients', 'garderie_paiements', 'garderie_enfants'],
  ORDER: ['agro_factures', 'agro_referentiel', ...VENTES],
  INVOICE: ['agro_factures', 'agro_referentiel', ...VENTES],
  PAYMENT: ['gym_factures', 'garderie_paiements', 'garderie_enfants']
}

export function construire(code, d) {
  const v = (col) => d[col] || []
  switch (code) {
    case 'CATEGORY': return [
      ...categories(v('agro_referentiel')), ...briqueterie.categories(),
      ...logistique.categories(v('logistique_referentiel')), ...maxiGym.categories(), ...garderie.categories()
    ]
    case 'PRODUCT': return [
      ...produits(v('agro_referentiel')), ...briqueterie.produits(v('evenementiel_referentiel')),
      ...logistique.produits(v('logistique_referentiel')), ...maxiGym.produits(), ...garderie.produits()
    ]
    case 'WAREHOUSE': return [...entrepots(), ...briqueterie.entrepots(), ...logistique.entrepots()]
    case 'STOCK': return stocks(v('agro_inventaires'))
    case 'STOCK_MOVEMENT': return mouvements(v('agro_inventaires'), v('agro_demandes'))
    case 'CUSTOMER': return [
      ...clients(v('agro_factures')),
      ...uniques([
        ...briqueterie.clients(v('evenementiel_factures')),
        ...logistique.clients(v('logistique_factures'), v('logistique_clients')),
        ...maxiGym.clients(v('gym_factures'), v('gym_clients')),
        ...garderie.clients(v('garderie_paiements'), v('garderie_enfants'))
      ])
    ]
    case 'ORDER': return [...commandes(v('agro_factures'), v('agro_referentiel')), ...ventesModules(d).map((x) => x.cmd).filter(Boolean)]
    case 'INVOICE': return [...factures(v('agro_factures'), v('agro_referentiel')), ...ventesModules(d).map((x) => x.fac)]
    case 'PAYMENT': return [
      ...maxiGym.ventes(v('gym_factures')).map((x) => x.pay),
      ...garderie.ventes(v('garderie_paiements'), v('garderie_enfants')).map((x) => x.pay)
    ].filter(Boolean)
    default: return null
  }
}

// Date de référence d'un élément, pour le filtre incrémental `since`.
const dateElement = (e) => e.moved_at || e.ordered_at || e.issued_at || e.paid_at || e.updated_at || null

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

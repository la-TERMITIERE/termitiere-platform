// Stock des POINTS DE VENTE de MAXI-AGRO : Lomé et les autres localités.
//
// Les animaux (surtout les volailles) quittent souvent la ferme pour être stockés ailleurs, où ils se vendent. Trois mouvements :
//   1. TRANSFERT : à la ferme, l'agent enregistre dans la Saisie journalière une sortie « Transfert Lomé », ou « Transfert autre localité » en
//      tapant la localité. Le stock de la ferme baisse (comme toute sortie) et celui du point de vente augmente d'autant.
//   2. VENTE SUR PLACE : une facture dont le lieu de vente est Lomé (ou une autre localité, nommée) ne décompte PAS la ferme (les bêtes n'y sont
//      plus) mais le stock de ce point de vente. Le circuit reste le même (demande de sortie, approbation, écart, certification).
//   3. PERTE SUR PLACE : décès ou perte constatés au point de vente, déclarés dans le volet « Points de vente ».
// Rien n'est stocké en double : le stock de chaque point de vente est CALCULÉ à partir des saisies, des factures et des déclarations de pertes.
//
// Un point de vente se repère par une clé : 'lome', ou 'autre:<localité sans accent ni majuscule>' (« Kara », « kara » et « KARA » sont le même lieu).
import { factureStatut } from './data'
import { TYPE_TRANSFERT_LOME, TYPE_TRANSFERT_AUTRE } from './logic'

export const COL_AJUSTEMENTS_LOME = 'agro_lome_ajustements'
export const MOTIFS_PERTE_LOME = ['Décès', 'Perte', 'Autres']

// Une facture engage le stock du point de vente dès que sa sortie est approuvée (puis jusqu'à la certification).
const STATUTS_ENGAGES = ['sortie_approuvee', 'modif_demandee', 'certifiee']
const entier = (v) => parseInt(v) || 0
const lignesDe = (f) => (f.lignesReelles?.length ? f.lignesReelles : f.lignes) || []

const normaliser = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
export const CLE_LOME = 'lome'
export const cleLocalite = (localite) => `autre:${normaliser(localite)}`
export const estLome = (cle) => cle === CLE_LOME
export const estAutre = (cle) => String(cle || '').startsWith('autre:')

// Lieu d'une facture : { cle, nom } pour Lomé ou une autre localité, null pour une vente à la ferme.
export function lieuDeFacture(f) {
  if (f?.lieuVente === 'lome') return { cle: CLE_LOME, nom: 'Lomé' }
  if (f?.lieuVente === 'autre' && normaliser(f.localite)) return { cle: cleLocalite(f.localite), nom: String(f.localite).trim() }
  return null
}
// Vente hors de la ferme (Lomé, ou autre localité même si son nom manque encore) : la ferme n'est pas décomptée.
export const venteHorsFerme = (f) => f?.lieuVente === 'lome' || f?.lieuVente === 'autre'
export const venteALome = (f) => f?.lieuVente === 'lome'
// Lieu d'une déclaration de perte (les plus anciennes n'ont pas de lieu : c'était Lomé).
const lieuDePerte = (a) => (a.lieu ? { cle: a.lieu, nom: a.lieu === CLE_LOME ? 'Lomé' : (a.localite || a.lieu.replace(/^autre:/, '')) } : { cle: CLE_LOME, nom: 'Lomé' })

const filtreLome = (cle) => cle === CLE_LOME
export const filtreAutres = (cle) => estAutre(cle)

// Transferts reçus par les points de vente : une ligne par mouvement saisi à la ferme.
export function transfertsPointsVente(inventaires, especes = []) {
  const nomDe = new Map(especes.map((e) => [e.id, e]))
  const out = []
  ;(inventaires || []).forEach((inv) => {
    Object.entries(inv.animaux || {}).forEach(([id, n]) => {
      const sorties = Array.isArray(n?.sorties) ? n.sorties : n?.sorties && typeof n.sorties === 'object' ? Object.values(n.sorties) : []
      sorties.forEach((l) => {
        const qte = entier(l.qte)
        if (qte <= 0) return
        let lieu = null
        if (l.type === TYPE_TRANSFERT_LOME) lieu = { cle: CLE_LOME, nom: 'Lomé' }
        else if (l.type === TYPE_TRANSFERT_AUTRE && normaliser(l.label)) lieu = { cle: cleLocalite(l.label), nom: String(l.label).trim() }
        if (!lieu) return
        out.push({ date: inv.date, articleId: id, nom: nomDe.get(id)?.nom || id, cat: nomDe.get(id)?.cat || '', qte, agent: l.agentNom || '', lieu: lieu.cle, localite: lieu.nom })
      })
    })
  })
  return out.sort((a, b) => (a.date < b.date ? 1 : -1))
}
export const transfertsLome = (inventaires, especes) => transfertsPointsVente(inventaires, especes).filter((t) => t.lieu === CLE_LOME)

// Ce que chaque vente retire du stock : { articleId: { vendu, mort } }. `mort` = décès constatés lors de l'écart (hors reliquat retourné, qui reste
// au point de vente).
function sortiesDesVentes(factures, filtre) {
  const map = {}
  const ligne = (id) => (map[id] ||= { vendu: 0, mort: 0 })
  ;(factures || []).filter((f) => { const l = lieuDeFacture(f); return l && filtre(l.cle) && STATUTS_ENGAGES.includes(factureStatut(f)) }).forEach((f) => {
    lignesDe(f).forEach((l) => { if (l.articleId && (l.articleType || 'animal') === 'animal') ligne(l.articleId).vendu += entier(l.qte) })
    const base = f.lignesDemandees || f.lignes || []
    ;(f.ecartAjustements || []).forEach((a) => {
      const l = base[a.ligneIdx]
      if (l?.articleId && (l.articleType || 'animal') === 'animal') ligne(l.articleId).mort += Math.max(0, entier(a.dead))
    })
  })
  return map
}

// Stock par espèce des points de vente retenus par `filtre` (par défaut Lomé ; `filtreAutres` : toutes les autres localités ensemble).
// Renvoie { lignes, total, transferts }, une ligne par espèce ayant bougé (ou toutes si `toutes`).
export function stockLome({ inventaires = [], factures = [], ajustements = [], especes = [], toutes = false, filtre = filtreLome }) {
  const transferts = transfertsPointsVente(inventaires, especes).filter((t) => filtre(t.lieu))
  const ventes = sortiesDesVentes(factures, filtre)
  const parId = new Map()
  const ligne = (id) => {
    if (!parId.has(id)) {
      const e = especes.find((x) => x.id === id)
      parId.set(id, { id, nom: e?.nom || id, cat: e?.cat || '', transfere: 0, vendu: 0, mort: 0, perdu: 0, stock: 0 })
    }
    return parId.get(id)
  }
  transferts.forEach((t) => { ligne(t.articleId).transfere += t.qte })
  Object.entries(ventes).forEach(([id, v]) => { const l = ligne(id); l.vendu += v.vendu; l.mort += v.mort })
  ;(ajustements || []).forEach((a) => { if (a.articleId && filtre(lieuDePerte(a).cle)) ligne(a.articleId).perdu += entier(a.qte) })
  if (toutes) especes.forEach((e) => ligne(e.id))
  const lignes = [...parId.values()].map((l) => ({ ...l, stock: l.transfere - l.vendu - l.mort - l.perdu }))
    .sort((a, b) => (a.cat === b.cat ? a.nom.localeCompare(b.nom) : a.cat.localeCompare(b.cat)))
  const total = lignes.reduce((t, l) => ({
    transfere: t.transfere + l.transfere, vendu: t.vendu + l.vendu, mort: t.mort + l.mort, perdu: t.perdu + l.perdu, stock: t.stock + l.stock
  }), { transfere: 0, vendu: 0, mort: 0, perdu: 0, stock: 0 })
  return { lignes, total, transferts }
}

// Les autres localités connues (envoyées, vendues ou avec une perte), triées par nom : [{ cle, nom }].
export function localitesAutres({ inventaires = [], factures = [], ajustements = [] }) {
  const map = new Map()
  const ajoute = (cle, nom) => { if (estAutre(cle) && cle !== 'autre:' && !map.has(cle)) map.set(cle, nom) }
  transfertsPointsVente(inventaires).forEach((t) => ajoute(t.lieu, t.localite))
  ;(factures || []).forEach((f) => { const l = lieuDeFacture(f); if (l) ajoute(l.cle, l.nom) })
  ;(ajustements || []).forEach((a) => { const l = lieuDePerte(a); ajoute(l.cle, l.nom) })
  return [...map.entries()].map(([cle, nom]) => ({ cle, nom })).sort((a, b) => a.nom.localeCompare(b.nom))
}

// Lignes d'une facture hors ferme qui dépassent ce que le point de vente a en stock (avertissement avant l'enregistrement).
export function depassementsLome(facture, stockLignes) {
  const dispo = new Map(stockLignes.map((l) => [l.id, l.stock]))
  const demande = {}
  ;(facture?.lignes || []).forEach((l) => { if (l.articleId && (l.articleType || 'animal') === 'animal') demande[l.articleId] = (demande[l.articleId] || 0) + entier(l.qte) })
  return Object.entries(demande).filter(([id, q]) => q > Math.max(0, dispo.get(id) || 0)).map(([id, q]) => ({ id, demande: q, stock: Math.max(0, dispo.get(id) || 0) }))
}

// Filtre de stock correspondant au lieu d'une facture en cours de saisie.
export function filtreDuLieu(facture) {
  const l = lieuDeFacture(facture)
  const cle = l?.cle
  return (c) => c === cle
}

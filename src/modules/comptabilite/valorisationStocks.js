// COMPTABILITÉ — valorisation des stocks (classe 3) et écritures de variation de stock
// (inventaire intermittent SYSCOHADA). Source : inventaires journaliers de Maxi Agro
// (`agro_inventaires` : animaux et aliments, quantité de fin de journée par article).
// Coût unitaire : coût saisi en Comptabilité › Stocks, sinon prix du référentiel Maxi Agro.
//
// À chaque fin de mois, l'écart entre la valeur du stock de fin et celle du mois précédent
// est comptabilisé (journal ST) :
//   aliments  D 321000 Matières et fournitures   / C 603200 Variation des stocks de matières  (hausse)
//   animaux   D 362000 Cheptel (produits)        / C 736000 Variation des stocks de produits  (hausse)
// (sens inverse en cas de baisse).
import { ESPECES, ALIMENTS } from '../agro/data'

export const COMPTES_STOCK = {
  aliments: { stock: '321000', variation: '603200', label: 'Aliments et fournitures' },
  animaux: { stock: '362000', variation: '736000', label: 'Cheptel (animaux)' }
}
const n = (v) => Number(v) || 0

// Référentiel effectif : collection agro_referentiel, sinon valeurs par défaut du module.
export function referentielAgro(collection = []) {
  if (collection.length) return collection.map((r) => ({ id: r.id, nom: r.nom || r.id, prix: n(r.prix), famille: r.type === 'espece' ? 'animaux' : 'aliments', unite: r.unite || '' }))
  return [
    ...ESPECES.map((e) => ({ id: e.id, nom: e.nom, prix: n(e.prix), famille: 'animaux', unite: 'têtes' })),
    ...ALIMENTS.map((a) => ({ id: a.id, nom: a.nom, prix: n(a.prix), famille: 'aliments', unite: a.unite || '' }))
  ]
}

// Quantité en stock de chaque article à une date : dernier inventaire (≤ date) qui le mentionne.
export function quantitesAu(inventaires, date) {
  const tri = inventaires.filter((i) => i.date && (!date || i.date <= date)).sort((a, b) => (a.date < b.date ? -1 : 1))
  const q = {}
  for (const inv of tri) {
    for (const famille of ['animaux', 'aliments']) {
      for (const [id, v] of Object.entries(inv[famille] || {})) {
        if (v && v.fin !== undefined && v.fin !== null && v.fin !== '') q[id] = { qte: n(v.fin), famille, date: inv.date }
      }
    }
  }
  return q
}

export function valeurStocks({ inventaires = [], referentiel = [], couts = {}, date = null }) {
  const ref = new Map(referentiel.map((r) => [r.id, r]))
  const q = quantitesAu(inventaires, date)
  const lignes = Object.entries(q).map(([id, x]) => {
    const r = ref.get(id) || { nom: id, prix: 0, famille: x.famille, unite: '' }
    const cout = couts[id] !== undefined && couts[id] !== '' ? n(couts[id]) : r.prix
    return { id, nom: r.nom, famille: x.famille || r.famille, unite: r.unite, qte: x.qte, cout, valeur: Math.round(x.qte * cout), coutSaisi: couts[id] !== undefined && couts[id] !== '', dateInventaire: x.date }
  }).filter((l) => l.qte !== 0).sort((a, b) => b.valeur - a.valeur)
  const total = (f) => lignes.filter((l) => l.famille === f).reduce((s, l) => s + l.valeur, 0)
  return { lignes, animaux: total('animaux'), aliments: total('aliments'), total: lignes.reduce((s, l) => s + l.valeur, 0) }
}

const finDeMois = (annee, mois) => new Date(Date.UTC(annee, mois + 1, 0)).toISOString().slice(0, 10)

// Écritures de variation de stock, fin de chaque mois depuis le premier inventaire jusqu'au
// mois en cours (le mois en cours est arrêté à la date du jour).
export function ecrituresVariationStocks({ inventaires = [], referentiel = [], couts = {}, aujourdhui = new Date().toISOString().slice(0, 10) }) {
  const dates = inventaires.map((i) => i.date).filter(Boolean).sort()
  if (!dates.length) return []
  const out = []
  let [a, m] = [Number(dates[0].slice(0, 4)), Number(dates[0].slice(5, 7)) - 1]
  let prec = { animaux: 0, aliments: 0 }
  while (true) {
    let fin = finDeMois(a, m)
    const dernier = fin >= aujourdhui
    if (dernier) fin = aujourdhui
    const v = valeurStocks({ inventaires, referentiel, couts, date: fin })
    for (const famille of ['aliments', 'animaux']) {
      const variation = v[famille] - prec[famille]
      if (!variation) continue
      const c = COMPTES_STOCK[famille]
      const lib = `Variation de stock ${c.label} : ${fin.slice(0, 7)}`
      out.push({
        id: `auto_stk_${famille}_${fin.slice(0, 7)}`, date: fin, journal: 'ST', libelle: lib, piece: `STK-${fin.slice(0, 7)}-${famille === 'animaux' ? 'A' : 'F'}`,
        statut: 'validee', source: 'auto', module: 'stocks', secteur: 'agro',
        lignes: variation > 0
          ? [{ compte: c.stock, libelle: lib, debit: variation, credit: 0 }, { compte: c.variation, libelle: lib, debit: 0, credit: variation }]
          : [{ compte: c.variation, libelle: lib, debit: -variation, credit: 0 }, { compte: c.stock, libelle: lib, debit: 0, credit: -variation }]
      })
    }
    prec = { animaux: v.animaux, aliments: v.aliments }
    if (dernier) break
    m += 1; if (m > 11) { m = 0; a += 1 }
  }
  return out
}

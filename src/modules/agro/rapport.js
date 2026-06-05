// Construction de rapports MAXI-AGRO propres, exportables en Excel (multi-feuilles).
// Couvre TOUT : synthèse, animaux par espèce, aliments, évolution dans le temps
// (granularité jour / semaine / mois) et factures, sur une période donnée.

import { formatDateShort } from '../../utils/formatters'

// Clé de regroupement temporel selon la granularité choisie.
function bucketKey(date, gran) {
  if (gran === 'mois') return date.slice(0, 7) // YYYY-MM
  if (gran === 'semaine') {
    // Numéro de semaine ISO 8601.
    const d = new Date(date + 'T00:00:00Z')
    const day = (d.getUTCDay() + 6) % 7
    d.setUTCDate(d.getUTCDate() - day + 3)
    const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
    const week = 1 + Math.round((((d - firstThu) / 86400000) - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
    return `${d.getUTCFullYear()}-S${String(week).padStart(2, '0')}`
  }
  return date // jour
}

const GRAN_LABEL = { jour: 'Journalier', semaine: 'Hebdomadaire', mois: 'Mensuel' }

// Somme des effectifs finaux d'un inventaire.
const totalFin = (coll) => Object.values(coll || {}).reduce((s, a) => s + (a.fin || 0), 0)

// Construit les feuilles du rapport. Renvoie { sheets, fichier }.
export function construireRapport({ inventaires, especes, aliments, factures, start, end, gran = 'jour' }) {
  const invPeriode = (inventaires || [])
    .filter((i) => i.date >= start && i.date <= end)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const premier = invPeriode[0]
  const dernier = invPeriode[invPeriode.length - 1]

  // ── Cumuls animaux sur la période ──
  let nNaiss = 0, nEnt = 0, nSor = 0, nDec = 0
  invPeriode.forEach((i) => Object.values(i.animaux || {}).forEach((a) => {
    nNaiss += a.naiss || 0; nEnt += a.ent || 0; nSor += a.sor || 0; nDec += a.dec || 0
  }))

  const facturesPeriode = (factures || []).filter((f) => f.date >= start && f.date <= end)
  const caTTC = facturesPeriode.reduce((s, f) => s + (f.totalTTC || 0), 0)

  // ── Feuille 1 : Synthèse ──
  const synthese = [
    { Indicateur: 'Période', Valeur: GRAN_LABEL[gran] || gran },
    { Indicateur: 'Du', Valeur: formatDateShort(start) },
    { Indicateur: 'Au', Valeur: formatDateShort(end) },
    { Indicateur: 'Saisies enregistrées', Valeur: invPeriode.length },
    { Indicateur: 'Effectif animal en début de période', Valeur: premier ? totalFin(premier.animaux) : 0 },
    { Indicateur: 'Effectif animal en fin de période', Valeur: dernier ? totalFin(dernier.animaux) : 0 },
    { Indicateur: 'Naissances (cumul)', Valeur: nNaiss },
    { Indicateur: 'Entrées (cumul)', Valeur: nEnt },
    { Indicateur: 'Sorties (cumul)', Valeur: nSor },
    { Indicateur: 'Décès (cumul)', Valeur: nDec },
    { Indicateur: 'Stock aliments/divers (fin de période)', Valeur: dernier ? totalFin(dernier.aliments) : 0 },
    { Indicateur: 'Factures émises', Valeur: facturesPeriode.length },
    { Indicateur: "Chiffre d'affaires TTC", Valeur: caTTC }
  ]

  // ── Feuille 2 : Animaux par espèce ──
  const animaux = especes.map((e) => {
    let naiss = 0, ent = 0, sor = 0, dec = 0
    invPeriode.forEach((i) => { const a = i.animaux?.[e.id]; if (a) { naiss += a.naiss || 0; ent += a.ent || 0; sor += a.sor || 0; dec += a.dec || 0 } })
    return {
      Espèce: e.nom,
      Catégorie: e.cat,
      'EF initial': premier?.animaux?.[e.id]?.init || 0,
      Naissances: naiss,
      Entrées: ent,
      Sorties: sor,
      Décès: dec,
      'EF final': dernier?.animaux?.[e.id]?.fin || 0
    }
  })

  // ── Feuille 3 : Aliments & divers ──
  const alim = aliments.map((x) => {
    let ent = 0, sor = 0
    invPeriode.forEach((i) => { const a = i.aliments?.[x.id]; if (a) { ent += a.ent || 0; sor += a.sor || 0 } })
    return {
      Article: x.nom,
      Catégorie: x.cat,
      'Stock initial': premier?.aliments?.[x.id]?.init || 0,
      Entrées: ent,
      Sorties: sor,
      'Stock final': dernier?.aliments?.[x.id]?.fin || 0,
      Variation: ent - sor
    }
  })

  // ── Feuille 4 : Évolution (granularité) ──
  const buckets = {}
  invPeriode.forEach((i) => {
    const k = bucketKey(i.date, gran)
    if (!buckets[k]) buckets[k] = { label: k, naiss: 0, ent: 0, sor: 0, dec: 0, finAnim: 0, finAlim: 0, _last: '' }
    const b = buckets[k]
    Object.values(i.animaux || {}).forEach((a) => { b.naiss += a.naiss || 0; b.ent += a.ent || 0; b.sor += a.sor || 0; b.dec += a.dec || 0 })
    if (i.date >= b._last) { b._last = i.date; b.finAnim = totalFin(i.animaux); b.finAlim = totalFin(i.aliments) }
  })
  const evolution = Object.values(buckets)
    .sort((a, b) => (a.label < b.label ? -1 : 1))
    .map((b) => ({
      Période: b.label,
      'Effectif animal (fin)': b.finAnim,
      Naissances: b.naiss,
      Entrées: b.ent,
      Sorties: b.sor,
      Décès: b.dec,
      'Stock aliments (fin)': b.finAlim
    }))

  // ── Feuille 5 : Factures ──
  const facturesRows = facturesPeriode
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((f) => ({
      'N°': f.numero,
      Date: formatDateShort(f.date),
      Client: f.client?.nom || '',
      Téléphone: f.client?.tel || '',
      'Total HT': f.totalHT || 0,
      'Total TTC': f.totalTTC || 0
    }))

  const sheets = [
    { name: 'Synthèse', rows: synthese },
    { name: 'Animaux', rows: animaux },
    { name: 'Aliments & Divers', rows: alim },
    { name: `Évolution ${GRAN_LABEL[gran] || ''}`.trim(), rows: evolution.length ? evolution : [{ Période: '—' }] },
    { name: 'Factures', rows: facturesRows.length ? facturesRows : [{ 'N°': '—' }] }
  ]
  const fichier = `rapport-${gran}-${start}_${end}.xlsx`
  return { sheets, fichier }
}

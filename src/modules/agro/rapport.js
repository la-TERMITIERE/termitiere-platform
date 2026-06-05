// Construction des SECTIONS d'un rapport MAXI-AGRO (animaux, aliments, clients,
// factures, santé, évolution, synthèse), prêtes à être exportées en Excel stylé
// (voir utils/excelReport.js). Chaque section porte ses colonnes typées + totaux.

import { formatDateShort } from '../../utils/formatters'

// Métadonnées des sections (ordre + libellés pour la case à cocher de l'UI).
export const SECTIONS_RAPPORT = [
  { id: 'synthese', label: 'Synthèse' },
  { id: 'animaux', label: 'Animaux (par espèce)' },
  { id: 'aliments', label: 'Aliments & Divers' },
  { id: 'evolution', label: 'Évolution dans le temps' },
  { id: 'clients', label: 'Clients (CA)' },
  { id: 'factures', label: 'Factures (détail)' },
  { id: 'sante', label: 'Santé animale' }
]

const GRAN_LABEL = { jour: 'Journalier', semaine: 'Hebdomadaire', mois: 'Mensuel' }
const totalFin = (coll) => Object.values(coll || {}).reduce((s, a) => s + (a.fin || 0), 0)

function bucketKey(date, gran) {
  if (gran === 'mois') return date.slice(0, 7)
  if (gran === 'semaine') {
    const d = new Date(date + 'T00:00:00Z')
    const day = (d.getUTCDay() + 6) % 7
    d.setUTCDate(d.getUTCDate() - day + 3)
    const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
    const week = 1 + Math.round((((d - firstThu) / 86400000) - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
    return `${d.getUTCFullYear()}-S${String(week).padStart(2, '0')}`
  }
  return date
}

// Somme une colonne numérique sur des lignes.
const sumCol = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)

// Construit toutes les sections disponibles. L'appelant choisit lesquelles exporter.
// Renvoie { [id]: { id, name, title, subtitle, columns, rows, totals? } }.
export function sectionsRapport({ inventaires, especes, aliments, factures = [], sante = [], start, end, gran = 'jour' }) {
  const periode = `Période : du ${formatDateShort(start)} au ${formatDateShort(end)}`
  const invPeriode = (inventaires || [])
    .filter((i) => i.date >= start && i.date <= end)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const premier = invPeriode[0]
  const dernier = invPeriode[invPeriode.length - 1]

  let nNaiss = 0, nEnt = 0, nSor = 0, nDec = 0
  invPeriode.forEach((i) => Object.values(i.animaux || {}).forEach((a) => {
    nNaiss += a.naiss || 0; nEnt += a.ent || 0; nSor += a.sor || 0; nDec += a.dec || 0
  }))
  const facturesPeriode = (factures || []).filter((f) => f.date >= start && f.date <= end)
  const caTTC = facturesPeriode.reduce((s, f) => s + (f.totalTTC || 0), 0)
  const santePeriode = (sante || []).filter((f) => f.date >= start && f.date <= end)

  // ── Synthèse ──
  const synthese = {
    id: 'synthese', name: 'Synthèse', title: 'Synthèse du rapport', subtitle: periode,
    columns: [
      { key: 'Indicateur', label: 'Indicateur', width: 42 },
      { key: 'Valeur', label: 'Valeur', width: 24, align: 'right' }
    ],
    rows: [
      { Indicateur: 'Type de rapport', Valeur: GRAN_LABEL[gran] || gran },
      { Indicateur: 'Saisies enregistrées', Valeur: invPeriode.length },
      { Indicateur: 'Effectif animal — début de période', Valeur: premier ? totalFin(premier.animaux) : 0 },
      { Indicateur: 'Effectif animal — fin de période', Valeur: dernier ? totalFin(dernier.animaux) : 0 },
      { Indicateur: 'Naissances (cumul)', Valeur: nNaiss },
      { Indicateur: 'Entrées (cumul)', Valeur: nEnt },
      { Indicateur: 'Sorties (cumul)', Valeur: nSor },
      { Indicateur: 'Décès (cumul)', Valeur: nDec },
      { Indicateur: 'Stock aliments & divers — fin de période', Valeur: dernier ? totalFin(dernier.aliments) : 0 },
      { Indicateur: 'Factures émises', Valeur: facturesPeriode.length },
      { Indicateur: "Chiffre d'affaires TTC", Valeur: caTTC },
      { Indicateur: 'Interventions sanitaires', Valeur: santePeriode.length }
    ]
  }

  // ── Animaux par espèce ──
  const animauxRows = especes.map((e) => {
    let naiss = 0, ent = 0, sor = 0, dec = 0
    invPeriode.forEach((i) => { const a = i.animaux?.[e.id]; if (a) { naiss += a.naiss || 0; ent += a.ent || 0; sor += a.sor || 0; dec += a.dec || 0 } })
    return {
      Espèce: e.nom, Catégorie: e.cat,
      'EF initial': premier?.animaux?.[e.id]?.init || 0,
      Naissances: naiss, Entrées: ent, Sorties: sor, Décès: dec,
      'EF final': dernier?.animaux?.[e.id]?.fin || 0
    }
  })
  const animaux = {
    id: 'animaux', name: 'Animaux', title: 'Inventaire animal par espèce', subtitle: periode,
    columns: [
      { key: 'Espèce', label: 'Espèce', width: 26 },
      { key: 'Catégorie', label: 'Catégorie', width: 16 },
      { key: 'EF initial', label: 'EF initial', width: 12, type: 'number' },
      { key: 'Naissances', label: 'Naissances', width: 12, type: 'number' },
      { key: 'Entrées', label: 'Entrées', width: 11, type: 'number' },
      { key: 'Sorties', label: 'Sorties', width: 11, type: 'number' },
      { key: 'Décès', label: 'Décès', width: 10, type: 'number' },
      { key: 'EF final', label: 'EF final', width: 12, type: 'number' }
    ],
    rows: animauxRows,
    totals: {
      __label: 'TOTAL', 'EF initial': sumCol(animauxRows, 'EF initial'), Naissances: sumCol(animauxRows, 'Naissances'),
      Entrées: sumCol(animauxRows, 'Entrées'), Sorties: sumCol(animauxRows, 'Sorties'), Décès: sumCol(animauxRows, 'Décès'),
      'EF final': sumCol(animauxRows, 'EF final')
    }
  }

  // ── Aliments & divers ──
  const alimRows = aliments.map((x) => {
    let ent = 0, sor = 0
    invPeriode.forEach((i) => { const a = i.aliments?.[x.id]; if (a) { ent += a.ent || 0; sor += a.sor || 0 } })
    return {
      Article: x.nom, Catégorie: x.cat,
      'Stock initial': premier?.aliments?.[x.id]?.init || 0,
      Entrées: ent, Sorties: sor,
      'Stock final': dernier?.aliments?.[x.id]?.fin || 0,
      Variation: ent - sor
    }
  })
  const alimentsSec = {
    id: 'aliments', name: 'Aliments & Divers', title: 'Stocks aliments & divers', subtitle: periode,
    columns: [
      { key: 'Article', label: 'Article', width: 26 },
      { key: 'Catégorie', label: 'Catégorie', width: 14 },
      { key: 'Stock initial', label: 'Stock initial', width: 13, type: 'number' },
      { key: 'Entrées', label: 'Entrées', width: 11, type: 'number' },
      { key: 'Sorties', label: 'Sorties', width: 11, type: 'number' },
      { key: 'Stock final', label: 'Stock final', width: 12, type: 'number' },
      { key: 'Variation', label: 'Variation', width: 11, type: 'number' }
    ],
    rows: alimRows,
    totals: {
      __label: 'TOTAL', 'Stock initial': sumCol(alimRows, 'Stock initial'), Entrées: sumCol(alimRows, 'Entrées'),
      Sorties: sumCol(alimRows, 'Sorties'), 'Stock final': sumCol(alimRows, 'Stock final'), Variation: sumCol(alimRows, 'Variation')
    }
  }

  // ── Évolution (granularité) ──
  const buckets = {}
  invPeriode.forEach((i) => {
    const k = bucketKey(i.date, gran)
    if (!buckets[k]) buckets[k] = { Période: k, naiss: 0, ent: 0, sor: 0, dec: 0, finAnim: 0, finAlim: 0, _last: '' }
    const b = buckets[k]
    Object.values(i.animaux || {}).forEach((a) => { b.naiss += a.naiss || 0; b.ent += a.ent || 0; b.sor += a.sor || 0; b.dec += a.dec || 0 })
    if (i.date >= b._last) { b._last = i.date; b.finAnim = totalFin(i.animaux); b.finAlim = totalFin(i.aliments) }
  })
  const evoRows = Object.values(buckets).sort((a, b) => (a.Période < b.Période ? -1 : 1)).map((b) => ({
    Période: b.Période, 'Effectif animal (fin)': b.finAnim, Naissances: b.naiss,
    Entrées: b.ent, Sorties: b.sor, Décès: b.dec, 'Stock aliments (fin)': b.finAlim
  }))
  const evolution = {
    id: 'evolution', name: `Évolution ${GRAN_LABEL[gran] || ''}`.trim(),
    title: `Évolution ${(GRAN_LABEL[gran] || '').toLowerCase()}`, subtitle: periode,
    columns: [
      { key: 'Période', label: 'Période', width: 16 },
      { key: 'Effectif animal (fin)', label: 'Effectif animal (fin)', width: 18, type: 'number' },
      { key: 'Naissances', label: 'Naissances', width: 12, type: 'number' },
      { key: 'Entrées', label: 'Entrées', width: 11, type: 'number' },
      { key: 'Sorties', label: 'Sorties', width: 11, type: 'number' },
      { key: 'Décès', label: 'Décès', width: 10, type: 'number' },
      { key: 'Stock aliments (fin)', label: 'Stock aliments (fin)', width: 18, type: 'number' }
    ],
    rows: evoRows.length ? evoRows : [{ Période: '—' }],
    totals: evoRows.length ? {
      __label: 'CUMUL', Naissances: sumCol(evoRows, 'Naissances'), Entrées: sumCol(evoRows, 'Entrées'),
      Sorties: sumCol(evoRows, 'Sorties'), Décès: sumCol(evoRows, 'Décès')
    } : undefined
  }

  // ── Clients (CA) ──
  const cmap = {}
  facturesPeriode.forEach((f) => {
    const nom = f.client?.nom || 'Inconnu'
    if (!cmap[nom]) cmap[nom] = { Client: nom, Commandes: 0, 'CA TTC': 0 }
    cmap[nom].Commandes += 1
    cmap[nom]['CA TTC'] += f.totalTTC || 0
  })
  const clientRows = Object.values(cmap).sort((a, b) => b['CA TTC'] - a['CA TTC'])
  const clients = {
    id: 'clients', name: 'Clients', title: "Chiffre d'affaires par client", subtitle: periode,
    columns: [
      { key: 'Client', label: 'Client', width: 30 },
      { key: 'Commandes', label: 'Commandes', width: 12, type: 'number' },
      { key: 'CA TTC', label: 'CA TTC', width: 18, type: 'money' }
    ],
    rows: clientRows.length ? clientRows : [{ Client: '—' }],
    totals: clientRows.length ? { __label: 'TOTAL', Commandes: sumCol(clientRows, 'Commandes'), 'CA TTC': sumCol(clientRows, 'CA TTC') } : undefined
  }

  // ── Factures (détail) ──
  const factRows = facturesPeriode.sort((a, b) => (a.date < b.date ? -1 : 1)).map((f) => ({
    'N°': f.numero, Date: formatDateShort(f.date), Client: f.client?.nom || '',
    Téléphone: f.client?.tel || '', 'Total HT': f.totalHT || 0, 'Total TTC': f.totalTTC || 0
  }))
  const facturesSec = {
    id: 'factures', name: 'Factures', title: 'Factures émises', subtitle: periode,
    columns: [
      { key: 'N°', label: 'N°', width: 18 },
      { key: 'Date', label: 'Date', width: 12 },
      { key: 'Client', label: 'Client', width: 28 },
      { key: 'Téléphone', label: 'Téléphone', width: 16 },
      { key: 'Total HT', label: 'Total HT', width: 16, type: 'money' },
      { key: 'Total TTC', label: 'Total TTC', width: 16, type: 'money' }
    ],
    rows: factRows.length ? factRows : [{ 'N°': '—' }],
    totals: factRows.length ? { __label: 'TOTAL', 'Total HT': sumCol(factRows, 'Total HT'), 'Total TTC': sumCol(factRows, 'Total TTC') } : undefined
  }

  // ── Santé animale ──
  const labelType = (t) => ({ vaccination: 'Vaccination', traitement: 'Traitement', deparasitage: 'Déparasitage', autre: 'Autre' }[t] || t)
  const santeRows = santePeriode.sort((a, b) => (a.date < b.date ? -1 : 1)).map((f) => ({
    Date: formatDateShort(f.date), Espèce: f.especeNom || '', Type: labelType(f.type), Produit: f.produit || '',
    Dosage: f.dosage || '', 'Nb animaux': f.nombreAnimaux || 0, 'N° animaux': f.animauxIds || '',
    Vétérinaire: f.veterinaire || '', 'Prochain RDV': f.prochainRdv ? formatDateShort(f.prochainRdv) : ''
  }))
  const santeSec = {
    id: 'sante', name: 'Santé animale', title: 'Interventions sanitaires', subtitle: periode,
    columns: [
      { key: 'Date', label: 'Date', width: 12 },
      { key: 'Espèce', label: 'Espèce', width: 18 },
      { key: 'Type', label: 'Type', width: 14 },
      { key: 'Produit', label: 'Produit', width: 20 },
      { key: 'Dosage', label: 'Dosage', width: 14 },
      { key: 'Nb animaux', label: 'Nb animaux', width: 11, type: 'number' },
      { key: 'N° animaux', label: 'N° animaux', width: 20 },
      { key: 'Vétérinaire', label: 'Vétérinaire', width: 18 },
      { key: 'Prochain RDV', label: 'Prochain RDV', width: 14 }
    ],
    rows: santeRows.length ? santeRows : [{ Date: '—' }],
    totals: santeRows.length ? { __label: 'TOTAL', 'Nb animaux': sumCol(santeRows, 'Nb animaux') } : undefined
  }

  return { synthese, animaux, aliments: alimentsSec, evolution, clients, factures: facturesSec, sante: santeSec }
}

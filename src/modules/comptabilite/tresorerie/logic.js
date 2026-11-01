// TRÉSORERIE — moteur (pur, sans interface). Reprend la Trésorerie de FEZIRE (caisses,
// banques, Mobile Money, virements internes, créances, balance âgée, pilotage du
// recouvrement, rapprochement bancaire) en s'appuyant sur ce qui existe déjà :
//   - les comptes bancaires et leurs dépôts/retraits (« Mouvements bancaires », `*_banque`),
//   - les ventes de tous les secteurs (src/shared/ventes.js),
//   - les dépenses décaissées (E-DÉPENSES) et les rentrées saisies à la main.
// Seuls les éléments propres à la Trésorerie sont stockés (collections `treso_*`) ; tout
// le reste est recalculé, sans double saisie.
import { modeCanonique, LIBELLE_SECTEUR } from '../../../shared/ventes'

export const COL_TRESO = {
  comptes: 'treso_comptes',         // caisses et comptes Mobile Money (les banques viennent de compta_banques)
  mouvements: 'treso_mouvements',   // encaissements / décaissements saisis en Trésorerie
  virements: 'treso_virements',     // virements internes entre comptes
  creances: 'treso_creances',       // surcouche d'une vente : à crédit, échéance, litige, échéancier…
  reglements: 'treso_reglements',   // règlements imputés à une vente à crédit
  releves: 'treso_releves',         // relevés bancaires (rapprochement)
  params: 'treso_params'            // doc 'config' : affectations, tranches, délai de paiement, seuil d'alerte
}

// Collections des dépôts/retraits bancaires par secteur (cf. shared/banque/comptes.js).
export const COLLECTIONS_BANQUE = ['agro', 'logistique', 'gym', 'garderie', 'bat', 'evenementiel', 'transport', 'siege', 'autres']
  .map((s) => ({ secteur: s, col: `${s}_banque` }))

export const TYPES_COMPTE_TRESO = {
  CAISSE_CENTRALE: { label: 'Caisse centrale', compte: '530000', journal: 'CA', couleur: '#ea580c' },
  CAISSE_SECTEUR: { label: 'Caisse de secteur (vente)', compte: '530000', journal: 'CA', couleur: '#f59e0b' },
  BANQUE: { label: 'Banque', compte: '512000', journal: 'BQ', couleur: '#2563eb' },
  MOBILE_MONEY: { label: 'Mobile Money', compte: '521000', journal: 'TR', couleur: '#7c3aed' }
}

// Natures d'un mouvement saisi : choisissent le compte de contrepartie (comme `nature` chez FEZIRE).
export const NATURES = {
  IN: [
    { id: 'VENTE_COMPTANT', label: 'Vente au comptant', compte: '707000' },
    { id: 'ENCAISSEMENT_CLIENT', label: 'Encaissement client', compte: '411100' },
    { id: 'APPORT', label: 'Apport du promoteur', compte: '104000' },
    { id: 'EMPRUNT', label: 'Emprunt reçu', compte: '162000' },
    { id: 'SUBVENTION', label: 'Subvention reçue', compte: '718000' },
    { id: 'AUTRE_PRODUIT', label: 'Autre produit', compte: '758000' },
    { id: 'RESTITUTION_AVANCE', label: 'Restitution d\'avance de mission', compte: '425000' }
  ],
  OUT: [
    { id: 'ACHAT', label: 'Achat / fournisseur', compte: '401100' },
    { id: 'SALAIRE', label: 'Salaire versé', compte: '421000' },
    { id: 'AVANCE_MISSION', label: 'Avance de mission', compte: '425000' },
    { id: 'IMPOT', label: 'Impôts et taxes', compte: '631000' },
    { id: 'CNSS', label: 'Cotisations sociales (CNSS)', compte: '431000' },
    { id: 'FRAIS_BANCAIRES', label: 'Frais bancaires', compte: '627000' },
    { id: 'REMBOURSEMENT_EMPRUNT', label: 'Remboursement d\'emprunt', compte: '162000' },
    { id: 'RETRAIT_PROMOTEUR', label: 'Retrait du promoteur', compte: '104000' },
    { id: 'AUTRE_CHARGE', label: 'Autre charge', compte: '658000' }
  ]
}
export const natureDe = (sens, id) => (NATURES[sens] || []).find((n) => n.id === id) || null
export const libelleNature = (id) => [...NATURES.IN, ...NATURES.OUT].find((n) => n.id === id)?.label
  || ({ VENTE: 'Vente encaissée', REGLEMENT: 'Règlement client', DEPENSE: 'Dépense décaissée', REVENU: 'Rentrée saisie',
    VIREMENT_INTERNE: 'Virement interne', VERSEMENT_BANQUE: 'Versement en banque', RETRAIT_BANQUE: 'Retrait en banque',
    SOLDE_OUVERTURE: 'Solde d\'ouverture' }[id]) || id

export const TRANCHES_DEFAUT = [
  { min: 0, max: 30, label: '0 à 30 jours' },
  { min: 31, max: 60, label: '31 à 60 jours' },
  { min: 61, max: 90, label: '61 à 90 jours' },
  { min: 91, max: 180, label: '91 à 180 jours' },
  { min: 181, max: 360, label: '181 à 360 jours' },
  { min: 361, max: null, label: 'Plus de 360 jours' }
]
export const PARAMS_DEFAUT = { delaiPaiement: 30, seuilAlerte: 0, tranches: TRANCHES_DEFAUT, affectations: {} }
export const paramsEffectifs = (doc) => ({ ...PARAMS_DEFAUT, ...(doc || {}), tranches: doc?.tranches?.length ? doc.tranches : TRANCHES_DEFAUT, affectations: doc?.affectations || {} })

const n = (v) => Number(v) || 0
const jour = (d) => {
  if (d === null || d === undefined || d === '') return ''
  if (typeof d === 'number' || /^\d{11,}$/.test(String(d))) return new Date(Number(d)).toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}
export const aujourdhui = () => new Date().toISOString().slice(0, 10)
export const ajouterJours = (date, j) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + j); return d.toISOString().slice(0, 10) }
export const ecartJours = (de, a) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000)

// ── Comptes de trésorerie ────────────────────────────────────────────────────
export const CAISSE_CENTRALE_ID = 'caisse-centrale'
export const BANQUE_INCONNUE_ID = 'banque:non-precisee'
const idBanque = (banqueId) => (banqueId ? `banque:${banqueId}` : BANQUE_INCONNUE_ID)

// Caisses / Mobile Money (treso_comptes) + banques (compta_banques). Une caisse centrale
// existe toujours : sans compte saisi, elle est virtuelle (id CAISSE_CENTRALE_ID).
export function comptesTresorerie({ comptes = [], banques = [] } = {}) {
  const propres = comptes.map((c) => ({
    id: c.id, nom: c.nom, type: c.type || 'CAISSE_SECTEUR', devise: c.devise || 'XOF',
    compteComptable: c.compteComptable || TYPES_COMPTE_TRESO[c.type || 'CAISSE_SECTEUR']?.compte || '530000',
    soldeInitial: n(c.soldeInitial), dateSoldeInitial: jour(c.dateSoldeInitial), actif: c.actif !== false,
    numero: c.numero || '', secteur: c.secteur || '', seuilAlerte: n(c.seuilAlerte), source: 'treso',
    // Code d'intégration attendu par FEZIRE sur le compte de trésorerie correspondant.
    codeFezire: c.codeFezire || c.id
  }))
  const banquesCompta = banques.map((b) => ({
    id: idBanque(b.id), nom: b.nom, type: 'BANQUE', devise: 'XOF', compteComptable: '512000',
    // Le solde d'ouverture d'une banque est porté par ses mouvements « ouverture » (cf. fluxTresorerie).
    soldeInitial: 0, dateSoldeInitial: '', actif: b.actif !== false, numero: b.numero || '', secteur: '', seuilAlerte: 0, source: 'banque', banqueId: b.id, codeFezire: b.codeFezire || idBanque(b.id)
  }))
  const liste = [...propres, ...banquesCompta]
  if (!liste.some((c) => c.id === CAISSE_CENTRALE_ID || c.type === 'CAISSE_CENTRALE')) {
    liste.unshift({ id: CAISSE_CENTRALE_ID, nom: 'Caisse centrale', type: 'CAISSE_CENTRALE', devise: 'XOF', compteComptable: '530000', soldeInitial: 0, dateSoldeInitial: '', actif: true, numero: '', secteur: '', seuilAlerte: 0, source: 'virtuel', codeFezire: CAISSE_CENTRALE_ID })
  }
  return liste
}

// Compte de la caisse centrale effective (saisie ou virtuelle).
export const caisseCentrale = (comptes) => comptes.find((c) => c.type === 'CAISSE_CENTRALE') || comptes.find((c) => c.id === CAISSE_CENTRALE_ID)

// Où atterrit l'argent d'un secteur (ventes) ou d'où il sort (dépenses) : paramétrable par
// secteur (et site), par défaut la caisse centrale.
export function compteAffecte(params, comptes, cle, site = null) {
  const a = params?.affectations || {}
  const id = (site && a[`${cle}:${site}`]) || a[cle]
  return (id && comptes.some((c) => c.id === id)) ? id : caisseCentrale(comptes)?.id || CAISSE_CENTRALE_ID
}

// ── Flux : tous les mouvements d'argent, quelle que soit leur origine ─────────
// { id, date, compteId, sens:'IN'|'OUT', montant, nature, libelle, contrepartie, source, reference, mode, tiers, secteur, lie }
export function fluxTresorerie({
  comptes = [], params = {}, mouvements = [], virements = [], mvtsBanque = [], ventes = [],
  depenses = [], revenusManuels = [], facturesFournisseurs = []
} = {}) {
  const out = []
  const push = (f) => { if (n(f.montant) > 0 && f.date) out.push({ ...f, montant: Math.round(n(f.montant) * 100) / 100 }) }

  for (const m of mouvements) {
    if (m.statut === 'annule') continue
    const nat = natureDe(m.sens, m.nature)
    push({ id: `mvt-${m.id}`, date: jour(m.date), compteId: m.compteId, sens: m.sens, montant: m.montant, nature: m.nature,
      libelle: m.libelle || nat?.label || 'Mouvement', contrepartie: m.contrepartie || nat?.compte || '471000', source: 'tresorerie',
      reference: m.reference || '', mode: m.mode || 'CASH', tiers: m.tiers || '', secteur: m.secteur || '', docId: m.id, regularisation: m.regularisation || null })
  }
  for (const v of virements) {
    if (v.statut === 'annule') continue
    const lib = v.libelle || 'Virement interne'
    push({ id: `vir-${v.id}-out`, date: jour(v.date), compteId: v.de, sens: 'OUT', montant: v.montant, nature: 'VIREMENT_INTERNE', libelle: lib, contrepartie: null, source: 'virement', reference: v.reference || '', mode: 'BANK_TRANSFER', lie: v.vers, docId: v.id })
    push({ id: `vir-${v.id}-in`, date: jour(v.date), compteId: v.vers, sens: 'IN', montant: v.montant, nature: 'VIREMENT_INTERNE', libelle: lib, contrepartie: null, source: 'virement', reference: v.reference || '', mode: 'BANK_TRANSFER', lie: v.de, docId: v.id })
  }
  // Dépôts / retraits bancaires des secteurs : l'argent passe de la caisse du secteur à la banque (et inversement).
  for (const m of mvtsBanque) {
    const banque = idBanque(m.banqueId)
    const caisse = compteAffecte(params, comptes, m.secteur === 'siege' ? 'depense' : m.secteur, m.site)
    const lib = m.libelle || m.description || m.motif || ''
    if (m.type === 'ouverture') {
      push({ id: `bq-${m.secteur}-${m.id}`, date: jour(m.date), compteId: banque, sens: 'IN', montant: m.montant, nature: 'SOLDE_OUVERTURE', libelle: `Solde d'ouverture : ${m.secteur}`, contrepartie: '110000', source: 'banque', secteur: m.secteur, mode: 'BANK_TRANSFER' })
    } else if (m.type === 'depot') {
      push({ id: `bq-${m.secteur}-${m.id}-in`, date: jour(m.date), compteId: banque, sens: 'IN', montant: m.montant, nature: 'VERSEMENT_BANQUE', libelle: lib || `Versement en banque (${LIBELLE_SECTEUR[m.secteur] || m.secteur})`, contrepartie: null, source: 'banque', secteur: m.secteur, lie: caisse, mode: 'CASH' })
      push({ id: `bq-${m.secteur}-${m.id}-out`, date: jour(m.date), compteId: caisse, sens: 'OUT', montant: m.montant, nature: 'VERSEMENT_BANQUE', libelle: lib || `Versement en banque (${LIBELLE_SECTEUR[m.secteur] || m.secteur})`, contrepartie: null, source: 'banque', secteur: m.secteur, lie: banque, mode: 'CASH' })
    } else if (m.type === 'retrait') {
      push({ id: `bq-${m.secteur}-${m.id}-out`, date: jour(m.date), compteId: banque, sens: 'OUT', montant: m.montant, nature: 'RETRAIT_BANQUE', libelle: lib || `Retrait en banque (${LIBELLE_SECTEUR[m.secteur] || m.secteur})`, contrepartie: null, source: 'banque', secteur: m.secteur, lie: caisse, mode: 'CASH' })
      push({ id: `bq-${m.secteur}-${m.id}-in`, date: jour(m.date), compteId: caisse, sens: 'IN', montant: m.montant, nature: 'RETRAIT_BANQUE', libelle: lib || `Retrait en banque (${LIBELLE_SECTEUR[m.secteur] || m.secteur})`, contrepartie: null, source: 'banque', secteur: m.secteur, lie: banque, mode: 'CASH' })
    }
  }
  // Encaissements des ventes (immédiats ou règlements de créances).
  for (const v of ventes) {
    for (const e of v.encaissements || []) {
      push({ id: `enc-${e.id}`, date: e.date, compteId: e.compteId || compteAffecte(params, comptes, v.secteur, v.site), sens: 'IN', montant: e.montant,
        nature: e.immediat ? 'VENTE' : 'REGLEMENT', libelle: `${v.libelle}${v.client?.nom ? ` : ${v.client.nom}` : ''}`, contrepartie: '411100',
        source: 'vente', reference: v.numero, mode: modeCanonique(e.mode), tiers: v.client?.nom || '', secteur: v.secteur, venteCle: v.cle })
    }
  }
  // Dépenses décaissées (E-DÉPENSES).
  for (const d of depenses) {
    if (d.statut && d.statut !== 'decaissee') continue
    push({ id: `dep-${d.id}`, date: jour(d.dateDecaissement || d.date), compteId: compteAffecte(params, comptes, 'depense', d.site), sens: 'OUT', montant: d.montant,
      nature: 'DEPENSE', libelle: d.description || d.categorie || 'Dépense', contrepartie: null, source: 'depense', reference: d.numero || '',
      mode: modeCanonique(d.modePaiement), tiers: d.beneficiaireNom || d.fournisseur || '', secteur: d.secteurId || '', categorie: d.categorie })
  }
  // Règlements des factures fournisseurs (Comptabilité › Factures fournisseurs).
  for (const ff of facturesFournisseurs) {
    if (ff.statut !== 'validee') continue
    for (const r of ff.reglements || []) {
      push({ id: `ff-${ff.id}-${r.id}`, date: jour(r.date), compteId: r.compteId || compteAffecte(params, comptes, 'depense'), sens: 'OUT', montant: r.montant,
        nature: 'ACHAT', libelle: `Règlement ${ff.numero || ''} : ${ff.fournisseur || ''}`.trim(), contrepartie: '401100', source: 'fournisseur',
        reference: r.reference || ff.numero || '', mode: modeCanonique(r.mode), tiers: ff.fournisseur || '', secteur: ff.secteur || '' })
    }
  }
  // Rentrées saisies à la main (E-DÉPENSES › Sources de revenus).
  for (const r of revenusManuels) {
    push({ id: `rev-${r.id}`, date: jour(r.date), compteId: compteAffecte(params, comptes, r.secteurId || 'depense', r.site), sens: 'IN', montant: r.montant,
      nature: 'REVENU', libelle: r.description || r.libelle || 'Rentrée', contrepartie: '708000', source: 'revenu', reference: '', mode: modeCanonique(r.modePaiement), tiers: '', secteur: r.secteurId || '' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

// Solde de chaque compte à une date (incluse) : solde initial + entrées − sorties.
export function soldesComptes(comptes, flux, { jusqua = null } = {}) {
  const res = new Map(comptes.map((c) => [c.id, { ...c, entrees: 0, sorties: 0, solde: c.soldeInitial }]))
  for (const f of flux) {
    if (jusqua && f.date > jusqua) continue
    if (!res.has(f.compteId)) {
      // Compte inconnu (supprimé, ou banque non précisée) : on le montre quand même pour ne rien perdre.
      res.set(f.compteId, { id: f.compteId, nom: f.compteId === BANQUE_INCONNUE_ID ? 'Banque non précisée' : 'Compte supprimé', type: f.compteId.startsWith('banque:') ? 'BANQUE' : 'CAISSE_SECTEUR', compteComptable: f.compteId.startsWith('banque:') ? '512000' : '530000', soldeInitial: 0, actif: true, entrees: 0, sorties: 0, solde: 0, source: 'orphelin' })
    }
    const c = res.get(f.compteId)
    if (f.sens === 'IN') { c.entrees += f.montant; c.solde += f.montant } else { c.sorties += f.montant; c.solde -= f.montant }
  }
  return [...res.values()]
}

export function totauxParType(soldes) {
  const t = { CAISSE_CENTRALE: 0, CAISSE_SECTEUR: 0, BANQUE: 0, MOBILE_MONEY: 0 }
  for (const c of soldes) t[c.type] = (t[c.type] || 0) + c.solde
  return { ...t, total: Object.values(t).reduce((s, v) => s + v, 0) }
}

// ── Créances ──────────────────────────────────────────────────────────────────
// État d'une vente vis-à-vis de son recouvrement, à la date `ref`.
export function creances(ventes, params, ref = aujourdhui()) {
  const delai = n(params?.delaiPaiement) || 30
  return ventes.map((v) => {
    const s = v.surcouche || {}
    const echeance = s.echeance || ajouterJours(v.date, v.encaissements?.some((e) => e.immediat) ? 0 : delai)
    const retard = v.reste > 0 ? Math.max(0, ecartJours(echeance, ref)) : 0
    let etat = 'soldee'
    if (v.reste > 0) {
      if (s.statut === 'irrecouvrable') etat = 'irrecouvrable'
      else if (s.statut === 'contestee') etat = 'contestee'
      else if (s.echeancier?.length) etat = 'echeancier'
      else etat = echeance < ref ? 'echue' : 'non_echue'
    }
    const contestee = etat === 'contestee' ? v.reste : 0
    const irrecouvrable = etat === 'irrecouvrable' ? v.reste : 0
    return { ...v, echeance, retard, etat, recouvrable: Math.max(0, v.reste - contestee - irrecouvrable), irrecouvrable }
  })
}

export const ETATS_CREANCE = {
  non_echue: { label: 'Non échue', tone: 'info' },
  echue: { label: 'Échue', tone: 'danger' },
  contestee: { label: 'En litige', tone: 'warning' },
  echeancier: { label: 'Sous échéancier', tone: 'purple' },
  irrecouvrable: { label: 'Irrécouvrable', tone: 'neutral' },
  soldee: { label: 'Soldée', tone: 'success' }
}

export function syntheseCreances(liste) {
  const ouvertes = liste.filter((c) => c.reste > 0)
  const s = (f) => ouvertes.filter(f).reduce((t, c) => t + c.reste, 0)
  return {
    totale: liste.reduce((t, c) => t + c.total, 0),
    restant: s(() => true),
    exigible: s((c) => c.etat !== 'non_echue'),
    echue: s((c) => c.etat === 'echue'),
    recouvrable: ouvertes.reduce((t, c) => t + c.recouvrable, 0),
    irrecouvrable: s((c) => c.etat === 'irrecouvrable'),
    contestee: s((c) => c.etat === 'contestee'),
    echeancier: s((c) => c.etat === 'echeancier'),
    recouvre: liste.reduce((t, c) => t + c.encaisse, 0),
    nbOuvertes: ouvertes.length
  }
}

// Balance âgée : retard des créances échues, réparti par tranche.
export function balanceAgee(liste, tranches = TRANCHES_DEFAUT) {
  const echues = liste.filter((c) => c.reste > 0 && c.retard > 0 && c.etat !== 'irrecouvrable')
  const total = echues.reduce((t, c) => t + c.reste, 0)
  const lignes = tranches.map((t) => {
    const dans = echues.filter((c) => c.retard >= t.min && (t.max === null || t.max === undefined || c.retard <= t.max))
    const montantT = dans.reduce((s, c) => s + c.reste, 0)
    return { ...t, nb: dans.length, montant: montantT, part: total ? montantT / total : 0, creances: dans }
  })
  const classees = new Set(lignes.flatMap((l) => l.creances.map((c) => c.cle)))
  const sansClasse = echues.filter((c) => !classees.has(c.cle))
  const nonEchues = liste.filter((c) => c.reste > 0 && c.retard === 0 && c.etat !== 'irrecouvrable')
  return {
    lignes, total, nb: echues.length,
    sansClasse: { nb: sansClasse.length, montant: sansClasse.reduce((t, c) => t + c.reste, 0) },
    nonEchues: { nb: nonEchues.length, montant: nonEchues.reduce((t, c) => t + c.reste, 0) }
  }
}

// Indicateurs du recouvrement (Pilotage).
export function pilotage(liste, { debut = null, fin = null, ref = aujourdhui() } = {}) {
  const dansPeriode = (d) => (!debut || d >= debut) && (!fin || d <= fin)
  const emises = liste.filter((c) => dansPeriode(c.date))
  const encPeriode = liste.flatMap((c) => (c.encaissements || []).filter((e) => !e.immediat && dansPeriode(e.date)).map((e) => ({ ...e, vente: c })))
  const echues = liste.filter((c) => c.reste > 0 && c.retard > 0)
  const ageMoyen = echues.length ? Math.round(echues.reduce((s, c) => s + c.retard, 0) / echues.length) : null
  const seuil = (j) => { const l = echues.filter((c) => c.retard > j); return { nb: l.length, montant: l.reduce((s, c) => s + c.reste, 0) } }
  const credit = liste.filter((c) => c.surcouche?.aCredit || c.payeImmediat < c.total)
  const recouvrable = credit.reduce((s, c) => s + c.total, 0)
  const recouvreCredit = credit.reduce((s, c) => s + c.encaisse, 0)
  const delais = encPeriode.map((e) => ecartJours(e.vente.date, e.date)).filter((j) => j >= 0)
  const echeanciers = liste.filter((c) => c.surcouche?.echeancier?.length)
  const termes = echeanciers.flatMap((c) => c.surcouche.echeancier.filter((t) => t.date <= ref).map((t) => ({ ...t, c })))
  const respectes = termes.filter((t) => {
    const paye = (t.c.encaissements || []).filter((e) => e.date <= t.date).reduce((s, e) => s + e.montant, 0)
    const du = t.c.surcouche.echeancier.filter((x) => x.date <= t.date).reduce((s, x) => s + n(x.montant), 0)
    return paye >= du
  })
  return {
    emis: emises.reduce((s, c) => s + c.total, 0),
    encaisseCredit: encPeriode.reduce((s, e) => s + e.montant, 0),
    ageMoyen,
    plus30: seuil(30), plus90: seuil(90), plus180: seuil(180), plus365: seuil(365), plus730: seuil(730),
    tauxRecouvrement: recouvrable ? recouvreCredit / recouvrable : null,
    respectEcheanciers: termes.length ? respectes.length / termes.length : null,
    delaiMoyen: delais.length ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null,
    nbEcheanciers: echeanciers.length,
    promesses: liste.filter((c) => c.surcouche?.promesse?.date && c.reste > 0).length,
    relances: liste.reduce((s, c) => s + (c.surcouche?.relances?.length || 0), 0)
  }
}

// ── Prévision de trésorerie (au-delà de FEZIRE) ──────────────────────────────
// Solde de départ + encaissements attendus (échéances des créances, termes d'échéancier,
// promesses) − décaissements attendus (dépenses approuvées non encore décaissées),
// semaine par semaine.
export function prevision({ soldeDepart = 0, creancesListe = [], depensesAVenir = [], dettesFournisseurs = [], semaines = 12, ref = aujourdhui() }) {
  const evts = []
  for (const c of creancesListe) {
    if (c.reste <= 0 || c.etat === 'irrecouvrable') continue
    const ech = c.surcouche?.echeancier?.filter((t) => n(t.montant) > 0)
    if (ech?.length) {
      let restant = c.reste
      for (const t of [...ech].sort((a, b) => a.date.localeCompare(b.date))) {
        if (restant <= 0) break
        const m = Math.min(restant, n(t.montant)); restant -= m
        evts.push({ date: t.date < ref ? ref : t.date, montant: m, sens: 'IN', libelle: `${c.numero} : ${c.client?.nom || ''}` })
      }
    } else {
      const d = c.surcouche?.promesse?.date || c.echeance
      evts.push({ date: d < ref ? ref : d, montant: c.etat === 'contestee' ? 0 : c.reste, sens: 'IN', libelle: `${c.numero} : ${c.client?.nom || ''}` })
    }
  }
  for (const f of dettesFournisseurs) if (f.reste > 0) evts.push({ date: (f.echeance || ref) < ref ? ref : f.echeance, montant: f.reste, sens: 'OUT', libelle: `${f.numero || 'Facture'} : ${f.fournisseur || ''}` })
  for (const d of depensesAVenir) evts.push({ date: (jour(d.date) || ref) < ref ? ref : jour(d.date), montant: n(d.montant), sens: 'OUT', libelle: d.description || d.categorie || 'Dépense approuvée' })
  const res = []
  let solde = soldeDepart
  for (let i = 0; i < semaines; i++) {
    const debut = ajouterJours(ref, i * 7); const fin = ajouterJours(ref, i * 7 + 6)
    const dans = evts.filter((e) => e.date >= debut && e.date <= fin && e.montant > 0)
    const entrees = dans.filter((e) => e.sens === 'IN').reduce((s, e) => s + e.montant, 0)
    const sorties = dans.filter((e) => e.sens === 'OUT').reduce((s, e) => s + e.montant, 0)
    solde += entrees - sorties
    res.push({ debut, fin, entrees, sorties, solde, details: dans })
  }
  const auDela = evts.filter((e) => e.date > ajouterJours(ref, semaines * 7 - 1))
  return { semaines: res, auDela: { entrees: auDela.filter((e) => e.sens === 'IN').reduce((s, e) => s + e.montant, 0), sorties: auDela.filter((e) => e.sens === 'OUT').reduce((s, e) => s + e.montant, 0) } }
}

// ── Rapprochement bancaire ───────────────────────────────────────────────────
// Écart entre le solde du relevé et le solde comptable du compte à la date du relevé,
// et liste des flux non pointés (à justifier).
export function rapprochement(releve, flux, soldeInitial = 0) {
  const date = jour(releve.date)
  const duCompte = flux.filter((f) => f.compteId === releve.compteId && f.date <= date)
  const solde = soldeInitial + duCompte.reduce((s, f) => s + (f.sens === 'IN' ? f.montant : -f.montant), 0)
  const pointes = new Set(releve.pointes || [])
  const nonPointes = duCompte.filter((f) => !pointes.has(f.id))
  const soldePointe = soldeInitial + duCompte.filter((f) => pointes.has(f.id)).reduce((s, f) => s + (f.sens === 'IN' ? f.montant : -f.montant), 0)
  return { soldeComptable: solde, soldeReleve: n(releve.soldeReleve), ecart: n(releve.soldeReleve) - solde, ecartPointe: n(releve.soldeReleve) - soldePointe, nonPointes, nbPointes: pointes.size }
}

// ── Factures fournisseurs : totaux et reste à payer ──────────────────────────
export function totauxFactureFournisseur(f) {
  const lignes = f.lignes || []
  const ht = lignes.reduce((s, l) => s + n(l.montantHT), 0)
  const tva = lignes.reduce((s, l) => s + Math.round(n(l.montantHT) * n(l.tauxTva) / 100), 0)
  const ttc = ht + tva
  const regle = (f.reglements || []).reduce((s, r) => s + n(r.montant), 0)
  return { ht, tva, ttc, regle, reste: Math.max(0, ttc - regle) }
}
export function dettesFournisseurs(factures = [], ref = aujourdhui()) {
  return factures.filter((f) => f.statut === 'validee').map((f) => {
    const t = totauxFactureFournisseur(f)
    const echeance = f.echeance || f.date
    return { ...f, ...t, echeance, retard: t.reste > 0 ? Math.max(0, ecartJours(echeance, ref)) : 0 }
  })
}

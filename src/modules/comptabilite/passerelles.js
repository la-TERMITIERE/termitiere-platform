// Passerelles automatiques — convertit les données des AUTRES modules en écritures
// comptables (partie double), SANS double saisie ni double stockage.
//
// Principe (repris de la passerelle read-only de src/modules/depense/logic.js) :
// les écritures générées ici sont VIRTUELLES — calculées à la volée à partir des
// collections existantes (dépenses, revenus…), jamais réécrites en base. Elles
// alimentent le grand livre, la balance et le résultat au même titre que les
// écritures saisies à la main, mais restent en lecture seule (source: 'auto').
//
// Ainsi « tous les achats faits sur les autres modules » remontent automatiquement
// dans la comptabilité, mappés sur le plan comptable SYSCOHADA.

// Une dépense est réellement décaissée (compte dans la compta) si elle n'a pas de
// circuit d'autorisation en cours. Inliné pour ne pas coupler au module Dépenses.
const estDecaissee = (d) => !d.statut || d.statut === 'decaissee'

// ── Catégorie de dépense (E-DÉPENSES) → compte de charge SYSCOHADA (6 chiffres, FEZIRE) ──
export const MAP_CATEGORIE_COMPTE = {
  salaires:      '641000', // Rémunérations du personnel
  fournitures:   '607000', // Achats de marchandises
  transport:     '605300', // Carburant et lubrifiants
  entretien:     '615000', // Entretien, réparations et maintenance
  communication: '626000', // Frais de télécoms / Internet
  loyer:         '614000', // Locations et charges locatives
  services:      '605000', // Autres achats (services & prestataires)
  impots:        '631000', // Impôts et taxes
  matieres:      '601000', // Achats de matières premières (passerelle briqueterie)
  remboursement_pau: '104000', // Remboursement au PAU (compte de l'exploitant)
  autre:         '605000'  // Autres achats
}
export const COMPTE_CHARGE_DEFAUT = '605000'
// Un achat d'ACTIF durable (natureFlux « investissement ») n'est pas une charge :
// il entre à l'actif immobilisé (classe 2) — matériel et outillage par défaut.
export const COMPTE_IMMO_DEFAUT = '218100'

// Compte à créditer (origine des fonds).
//   - Apport du PAU        → 104000 Compte de l'exploitant (dette envers le promoteur)
//   - Fonds de l'entreprise → 530000 Caisse (à défaut d'info de paiement)
function compteContrepartie(dep) {
  return (dep.sourceFinancement === 'pau') ? '104000' : '530000'
}

function compteDebit(dep) {
  if ((dep.natureFlux || 'exploitation') === 'investissement') return COMPTE_IMMO_DEFAUT
  return MAP_CATEGORIE_COMPTE[dep.categorie] || COMPTE_CHARGE_DEFAUT
}

// ── Dépenses (achats) → écritures d'achat (journal AC) ────────────────────────
// `depenses` = collection `depense_depenses`. Ne retient que les dépenses décaissées.
export function ecrituresDepuisDepenses(depenses = []) {
  return depenses
    .filter((d) => estDecaissee(d) && (Number(d.montant) || 0) > 0)
    .map((d) => {
      const montant = Number(d.montant) || 0
      const libelle = d.description || d.categorie || 'Achat / dépense'
      const debit = compteDebit(d)
      const credit = compteContrepartie(d)
      return {
        id: `auto_dep_${d.id}`,
        date: d.date ? String(d.date).slice(0, 10) : '',
        journal: 'AC',
        libelle,
        piece: `AUTO-DEP-${d.id}`,
        statut: 'validee',
        source: 'auto',
        module: 'depense',
        secteur: d.secteurId || '',
        lignes: [
          { compte: debit, libelle, debit: montant, credit: 0 },
          { compte: credit, libelle, debit: 0, credit: montant }
        ]
      }
    })
}

// ── Revenus manuels → écritures de vente (journal VE) ─────────────────────────
// `revenus` = collection `depense_revenus_manuels`. Débit caisse, crédit produit.
export function ecrituresDepuisRevenusManuels(revenus = []) {
  return revenus
    .filter((r) => (Number(r.montant) || 0) > 0)
    .map((r) => {
      const montant = Number(r.montant) || 0
      const libelle = r.description || r.libelle || 'Revenu'
      return {
        id: `auto_rev_${r.id}`,
        date: r.date ? String(r.date).slice(0, 10) : '',
        journal: 'VE',
        libelle,
        piece: `AUTO-REV-${r.id}`,
        statut: 'validee',
        source: 'auto',
        module: 'revenus',
        secteur: r.secteurId || '',
        lignes: [
          { compte: '530000', libelle, debit: montant, credit: 0 },
          { compte: '708000', libelle, debit: 0, credit: montant }
        ]
      }
    })
}

// ── Bulletins de paie (module RH) → écritures de paie (journal PA) ────────────
// `bulletins` = collection `rh_bulletins`. Seuls les bulletins validés/payés sont
// comptabilisés. Écriture SYSCOHADA (équilibrée : brut + CNSS employeur de part
// et d'autre) :
//   D 641000 Rémunérations (brut)        C 421000 Personnel dû (net)
//   D 664000 Charges sociales (CNSS emp) C 431000 Sécurité sociale (CNSS sal. + emp.)
//                                        C 447000 État, ITS retenu (impôt)
const estComptabilisable = (b) => b.statut === 'valide' || b.statut === 'paye'

export function ecrituresDepuisBulletins(bulletins = []) {
  return bulletins
    .filter((b) => estComptabilisable(b) && (Number(b.brutTotal) || 0) > 0)
    .map((b) => {
      const brut = Number(b.brutTotal) || 0
      const net = Number(b.net) || 0
      const cnssSal = Number(b.cnssSalarie) || 0
      const cnssEmp = Number(b.cnssEmployeur) || 0
      const its = Number(b.its) || 0
      const libelle = `Paie ${b.mois || ''} — ${b.employeNom || ''}`.trim()
      const lignes = [
        { compte: '641000', libelle, debit: brut, credit: 0 },
        { compte: '421000', libelle, debit: 0, credit: net },
        { compte: '431000', libelle, debit: 0, credit: cnssSal },
        { compte: '447000', libelle, debit: 0, credit: its }
      ]
      // Part patronale CNSS (charge de l'employeur) — n'impacte pas le net.
      if (cnssEmp > 0) {
        lignes.push({ compte: '664000', libelle, debit: cnssEmp, credit: 0 })
        lignes.push({ compte: '431000', libelle, debit: 0, credit: cnssEmp })
      }
      return {
        id: `auto_paie_${b.id}`,
        date: b.mois ? `${b.mois}-28` : '',
        journal: 'PA',
        libelle,
        piece: `AUTO-PAIE-${b.id}`,
        statut: 'validee',
        source: 'auto',
        module: 'rh',
        secteur: b.departement || '',
        lignes
      }
    })
}

// ── Factures de vente des modules → écritures de vente (journal VE) ───────────
// Mêmes critères que src/modules/depense/revenus.js (chiffre d'affaires réalisé) :
//   agro → factures « certifiée » ; logistique → « approuvée » ; briqueterie →
//   toutes ; garderie → paiements encaissés. Débit 530000 Caisse, crédit compte
//   de produit selon le secteur. Montant = totalTTC (ou montantPaye pour garderie).
const COMPTE_PRODUIT = { agro: '701000', evenementiel: '701000', logistique: '706000', garderie: '706000' }

function ecritureVente({ id, prefixe, module, date, montant, libelle }) {
  const cp = COMPTE_PRODUIT[module] || '707000'
  return {
    id: `auto_vte_${prefixe}_${id}`,
    date: date ? String(date).slice(0, 10) : '',
    journal: 'VE', libelle, piece: `AUTO-VE-${prefixe.toUpperCase()}-${id}`,
    statut: 'validee', source: 'auto', module, secteur: module,
    lignes: [
      { compte: '530000', libelle, debit: montant, credit: 0 },
      { compte: cp, libelle, debit: 0, credit: montant }
    ]
  }
}

export function ecrituresDepuisVentes({ facturesAgro = [], facturesLogistique = [], facturesEvenementiel = [], paiementsGarderie = [] } = {}) {
  const out = []
  facturesAgro.filter((f) => f.statut === 'certifiee' && (Number(f.totalTTC) || 0) > 0).forEach((f) =>
    out.push(ecritureVente({ id: f.id, prefixe: 'agro', module: 'agro', date: f.date, montant: Number(f.totalTTC) || 0, libelle: `Vente MAXI-AGRO ${f.numero || f.client || ''}`.trim() })))
  facturesLogistique.filter((f) => f.statut === 'approuvee' && (Number(f.totalTTC) || 0) > 0).forEach((f) =>
    out.push(ecritureVente({ id: f.id, prefixe: 'log', module: 'logistique', date: f.date, montant: Number(f.totalTTC) || 0, libelle: `Vente MAXI LOGISTIQUE ${f.numero || f.client || ''}`.trim() })))
  facturesEvenementiel.filter((f) => (Number(f.totalTTC) || 0) > 0).forEach((f) =>
    out.push(ecritureVente({ id: f.id, prefixe: 'briq', module: 'evenementiel', date: f.date, montant: Number(f.totalTTC) || 0, libelle: `Vente E-BRIQUETERIE ${f.numero || f.client || ''}`.trim() })))
  paiementsGarderie.filter((p) => (Number(p.montantPaye) || 0) > 0).forEach((p) => {
    const date = p.type === 'journalier' ? p.date : `${p.annee}-${String(p.mois).padStart(2, '0')}-28`
    out.push(ecritureVente({ id: p.id, prefixe: 'gard', module: 'garderie', date, montant: Number(p.montantPaye) || 0, libelle: `Encaissement E-GARDERIE ${p.enfantNom || ''}`.trim() }))
  })
  return out
}

// ── Agrégat : toutes les écritures automatiques ───────────────────────────────
export function ecrituresAuto({ depenses = [], revenusManuels = [], bulletins = [], ventes = {} } = {}) {
  return [
    ...ecrituresDepuisDepenses(depenses),
    ...ecrituresDepuisRevenusManuels(revenusManuels),
    ...ecrituresDepuisBulletins(bulletins),
    ...ecrituresDepuisVentes(ventes)
  ]
}

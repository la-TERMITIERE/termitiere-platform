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

// ── Agrégat : toutes les écritures automatiques ───────────────────────────────
export function ecrituresAuto({ depenses = [], revenusManuels = [] } = {}) {
  return [
    ...ecrituresDepuisDepenses(depenses),
    ...ecrituresDepuisRevenusManuels(revenusManuels)
  ]
}

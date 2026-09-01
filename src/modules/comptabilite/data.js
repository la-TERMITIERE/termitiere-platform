// Données de référence du module COMPTABILITÉ.
//
// Aligné sur le module Comptabilité de FEZIRE (relevé du 28/08/2026, tenant
// LA TERMITIERE) : plan SYSCOHADA Révisé, comptes à 6 chiffres, types de compte
// en anglais (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE), 11 journaux typés, exercices
// fiscaux, axes analytiques, TVA 18 %/0 %. Le plan ci-dessous est le jeu par défaut,
// éditable/extensible depuis l'écran Plan Comptable (personnalisations en Firebase,
// collection `compta_comptes`, fusionnées avec ces valeurs — cf. logic.js).

// ── Collections Firebase (namespace tp/, cf. core/db.firebase.js) ─────────────
export const COL = {
  comptes: 'compta_comptes',              // comptes personnalisés (surcouche du plan par défaut)
  ecritures: 'compta_ecritures',          // écritures (pièces) — chacune porte des lignes[] débit/crédit
  immobilisations: 'compta_immobilisations', // registre des immobilisations
  patrimoine: 'compta_patrimoine',        // patrimoine immobilier (terrains, bâtiments…)
  exercices: 'compta_exercices',          // exercices fiscaux
  tiers: 'compta_tiers',                  // clients & fournisseurs (comptabilité tiers)
  centres: 'compta_centres',              // centres analytiques (axes)
  modeles: 'compta_modeles',              // modèles d'écritures (saisies répétitives)
  params: 'compta_params'                 // paramètres — doc id 'config'
}

// ── Types de compte (badge FEZIRE, en anglais) ────────────────────────────────
export const TYPES_COMPTE = {
  ASSET:     { label: 'Actif',   sens: 'debit',  groupe: 'bilan',    categorie: 'ACTIF' },
  LIABILITY: { label: 'Passif',  sens: 'credit', groupe: 'bilan',    categorie: 'PASSIF' },
  EQUITY:    { label: 'Capitaux', sens: 'credit', groupe: 'bilan',   categorie: 'CAPITAUX' },
  INCOME:    { label: 'Produit', sens: 'credit', groupe: 'resultat', categorie: 'PRODUIT' },
  EXPENSE:   { label: 'Charge',  sens: 'debit',  groupe: 'resultat', categorie: 'CHARGE' }
}

// ── Les 9 classes SYSCOHADA (descriptions FEZIRE) ─────────────────────────────
export const CLASSES = [
  { num: '1', label: 'Capitaux', desc: 'Fonds propres, emprunts' },
  { num: '2', label: 'Immobilisations', desc: 'Actifs durables, matériel' },
  { num: '3', label: 'Stocks', desc: 'Matières premières, marchandises' },
  { num: '4', label: 'Tiers', desc: 'Clients, fournisseurs, personnel' },
  { num: '5', label: 'Financiers', desc: 'Banques, caisse, régies' },
  { num: '6', label: 'Charges', desc: 'Achats, frais, charges de personnel' },
  { num: '7', label: 'Produits', desc: 'Ventes, prestations de services, revenus' },
  { num: '8', label: 'Spéciaux / HAO', desc: 'Charges et produits hors activité ordinaire (HAO)' },
  { num: '9', label: 'Analytique', desc: 'Comptabilité analytique de gestion & Engagements' }
]

export const classeDe = (numeroCompte) => String(numeroCompte || '').charAt(0)
export const getClasse = (numeroCompte) => CLASSES.find((c) => c.num === classeDe(numeroCompte)) || null

// ── Plan comptable par défaut (SYSCOHADA Révisé, 6 chiffres) ──────────────────
// Les 19 comptes marqués `fezire:true` reproduisent EXACTEMENT le plan par défaut du
// tenant FEZIRE. Les autres complètent le référentiel pour l'activité multi-secteurs
// (agro, logistique, briqueterie, foncier, garderie, gym, voyage) — même schéma 6 chiffres.
export const PLAN_COMPTABLE_DEFAUT = [
  // Classe 1 — Capitaux
  { num: '101000', label: 'Capital social', type: 'EQUITY', fezire: true },
  { num: '104000', label: 'Compte de l\'exploitant (apports PAU)', type: 'EQUITY' },
  { num: '106000', label: 'Réserves', type: 'EQUITY' },
  { num: '110000', label: 'Report à nouveau', type: 'EQUITY' },
  { num: '120000', label: 'Résultat de l\'exercice (Bénéfice)', type: 'EQUITY', fezire: true },
  { num: '129000', label: 'Résultat de l\'exercice (Perte)', type: 'EQUITY', fezire: true },
  { num: '162000', label: 'Emprunts auprès des établissements de crédit', type: 'LIABILITY' },

  // Classe 2 — Immobilisations
  { num: '211000', label: 'Terrains', type: 'ASSET', fezire: true },
  { num: '213000', label: 'Constructions (bâtiments)', type: 'ASSET' },
  { num: '215000', label: 'Matériel de transport', type: 'ASSET', fezire: true },
  { num: '218100', label: 'Matériel et outillage', type: 'ASSET' },
  { num: '218300', label: 'Matériel informatique', type: 'ASSET', fezire: true },
  { num: '218400', label: 'Mobilier de bureau', type: 'ASSET' },
  { num: '241000', label: 'Matériel agricole et d\'élevage', type: 'ASSET' },
  { num: '281300', label: 'Amortissements des constructions', type: 'LIABILITY' },
  { num: '281800', label: 'Amortissements du matériel et mobilier', type: 'LIABILITY' },

  // Classe 3 — Stocks
  { num: '311000', label: 'Stocks de marchandises', type: 'ASSET', fezire: true },
  { num: '321000', label: 'Matières premières', type: 'ASSET' },
  { num: '322000', label: 'Matières consommables (ciment, sable…)', type: 'ASSET' },
  { num: '361000', label: 'Produits finis (briques, appâts…)', type: 'ASSET' },

  // Classe 4 — Tiers
  { num: '401100', label: 'Fournisseurs d\'exploitation', type: 'LIABILITY', fezire: true },
  { num: '409000', label: 'Fournisseurs débiteurs (avances versées)', type: 'ASSET' },
  { num: '411100', label: 'Clients d\'exploitation', type: 'ASSET', fezire: true },
  { num: '419000', label: 'Clients créditeurs (avances reçues)', type: 'LIABILITY' },
  { num: '421000', label: 'Personnel, rémunérations dues', type: 'LIABILITY' },
  { num: '431000', label: 'Sécurité sociale (CNSS)', type: 'LIABILITY' },
  { num: '445660', label: 'TVA déductible sur biens et services', type: 'ASSET', fezire: true },
  { num: '445710', label: 'TVA collectée (18%)', type: 'LIABILITY', fezire: true },
  { num: '447000', label: 'État, impôts retenus à la source', type: 'LIABILITY' },

  // Classe 5 — Financiers
  { num: '512000', label: 'Banques', type: 'ASSET', fezire: true },
  { num: '521000', label: 'Mobile Money (Flooz / T-Money)', type: 'ASSET' },
  { num: '530000', label: 'Caisse', type: 'ASSET', fezire: true },
  { num: '585000', label: 'Virements de fonds (internes)', type: 'ASSET' },

  // Classe 6 — Charges
  { num: '601000', label: 'Achats de matières premières', type: 'EXPENSE' },
  { num: '605000', label: 'Autres achats (eau, électricité, carburant)', type: 'EXPENSE' },
  { num: '605300', label: 'Carburant et lubrifiants', type: 'EXPENSE' },
  { num: '607000', label: 'Achats de marchandises', type: 'EXPENSE', fezire: true },
  { num: '612000', label: 'Transports', type: 'EXPENSE' },
  { num: '614000', label: 'Locations et charges locatives (loyer)', type: 'EXPENSE' },
  { num: '615000', label: 'Entretien, réparations et maintenance', type: 'EXPENSE' },
  { num: '616000', label: 'Primes d\'assurances', type: 'EXPENSE', fezire: true },
  { num: '626000', label: 'Frais de télécoms / Internet', type: 'EXPENSE', fezire: true },
  { num: '627000', label: 'Services bancaires', type: 'EXPENSE' },
  { num: '631000', label: 'Impôts et taxes', type: 'EXPENSE' },
  { num: '641000', label: 'Rémunérations du personnel', type: 'EXPENSE', fezire: true },
  { num: '664000', label: 'Charges sociales (CNSS employeur)', type: 'EXPENSE' },
  { num: '681000', label: 'Dotations aux amortissements d\'exploitation', type: 'EXPENSE' },

  // Classe 7 — Produits
  { num: '701000', label: 'Ventes de produits finis', type: 'INCOME' },
  { num: '706000', label: 'Services vendus (prestations, locations)', type: 'INCOME' },
  { num: '707000', label: 'Ventes de marchandises', type: 'INCOME', fezire: true },
  { num: '708000', label: 'Produits annexes / Prestations de services', type: 'INCOME', fezire: true },
  { num: '752000', label: 'Revenus des immeubles (loyers perçus)', type: 'INCOME' },
  { num: '781000', label: 'Reprises d\'amortissements et provisions', type: 'INCOME' },

  // Classe 8 — Spéciaux / HAO
  { num: '812000', label: 'Valeurs comptables des cessions d\'immobilisations', type: 'EXPENSE' },
  { num: '822000', label: 'Produits des cessions d\'immobilisations', type: 'INCOME' }
]

export const typeCompteDe = (plan, num) => plan.find((c) => c.num === String(num))?.type || null

// ── Journaux (11 — codes & types exacts FEZIRE) ───────────────────────────────
// `type` = type sémantique FEZIRE (PURCHASE/SALE/BANK/CASH/OPENING/ASSET/GENERAL/PAYROLL/STOCK).
export const JOURNAUX = [
  { code: 'AC', label: 'Journal des Achats (FAE)', type: 'PURCHASE', tone: 'warning' },
  { code: 'AN', label: 'Journal des À-nouveaux', type: 'OPENING', tone: 'neutral' },
  { code: 'BQ', label: 'Journal de la Banque', type: 'BANK', tone: 'info' },
  { code: 'CA', label: 'Journal de la Caisse', type: 'CASH', tone: 'primary' },
  { code: 'HA', label: 'Journal des Achats', type: 'PURCHASE', tone: 'warning' },
  { code: 'IM', label: 'Journal des Immobilisations', type: 'ASSET', tone: 'purple' },
  { code: 'OD', label: 'Journal des Opérations Diverses', type: 'GENERAL', tone: 'neutral' },
  { code: 'PA', label: 'Journal de Paie', type: 'PAYROLL', tone: 'info' },
  { code: 'ST', label: 'Journal des Stocks', type: 'STOCK', tone: 'success' },
  { code: 'TR', label: 'Journal de Trésorerie', type: 'BANK', tone: 'info' },
  { code: 'VE', label: 'Journal des Ventes', type: 'SALE', tone: 'success' }
]
export const getJournal = (code) => JOURNAUX.find((j) => j.code === code) || null
export const journalDefaut = 'OD'

// ── TVA (codes FEZIRE) ────────────────────────────────────────────────────────
// Togo (UEMOA) : taux normal 18 %.
export const TAUX_TVA = [
  { code: 'TVA18', taux: 18, label: 'TVA 18% (Standard)' },
  { code: 'TVA0', taux: 0, label: 'TVA 0% (Exonéré)' }
]
export const tvaDefaut = 'TVA18'
export const COMPTE_TVA_COLLECTEE = '445710'
export const COMPTE_TVA_DEDUCTIBLE = '445660'

// ── Immobilisations : méthodes & catégories ───────────────────────────────────
export const METHODES_AMORT = [
  { id: 'lineaire', label: 'Linéaire' },
  { id: 'degressif', label: 'Dégressif' },
  { id: 'aucune', label: 'Non amortissable' }
]
export const CATEGORIES_IMMO = [
  { id: 'terrain', label: 'Terrain', compte: '211000', dureeAmort: 0, methode: 'aucune' },
  { id: 'batiment', label: 'Bâtiment / Construction', compte: '213000', dureeAmort: 20, methode: 'lineaire' },
  { id: 'materiel', label: 'Matériel et outillage', compte: '218100', dureeAmort: 5, methode: 'lineaire' },
  { id: 'vehicule', label: 'Véhicule / Matériel de transport', compte: '215000', dureeAmort: 4, methode: 'lineaire' },
  { id: 'informatique', label: 'Matériel informatique', compte: '218300', dureeAmort: 3, methode: 'lineaire' },
  { id: 'mobilier', label: 'Mobilier de bureau', compte: '218400', dureeAmort: 10, methode: 'lineaire' },
  { id: 'agricole', label: 'Matériel agricole / élevage', compte: '241000', dureeAmort: 5, methode: 'lineaire' }
]
export const getCategorieImmo = (id) => CATEGORIES_IMMO.find((c) => c.id === id) || null

// ── Patrimoine immobilier — nature du bien ────────────────────────────────────
export const NATURES_BIEN = [
  { id: 'terrain', label: 'Terrain nu', compte: '211000' },
  { id: 'terrain_bati', label: 'Terrain bâti', compte: '213000' },
  { id: 'immeuble', label: 'Immeuble / Bâtiment', compte: '213000' },
  { id: 'local_commercial', label: 'Local commercial', compte: '213000' },
  { id: 'entrepot', label: 'Entrepôt / Magasin', compte: '213000' },
  { id: 'ferme', label: 'Ferme / Exploitation agricole', compte: '213000' }
]
export const getNatureBien = (id) => NATURES_BIEN.find((n) => n.id === id) || null

export const STATUTS_BIEN = {
  proprietaire: { label: 'Propriété (titre foncier)', tone: 'success' },
  en_acquisition: { label: 'En cours d\'acquisition', tone: 'warning' },
  loue: { label: 'Donné en location', tone: 'info' },
  litige: { label: 'En litige', tone: 'danger' }
}

// ── Statut d'une écriture ─────────────────────────────────────────────────────
export const STATUTS_ECRITURE = {
  brouillon: { label: 'Brouillon', tone: 'warning' },
  validee: { label: 'Validée', tone: 'success' }
}

// ── Type de tiers ─────────────────────────────────────────────────────────────
export const TYPES_TIERS = {
  client: { label: 'Client', compte: '411100', tone: 'info' },
  fournisseur: { label: 'Fournisseur', compte: '401100', tone: 'warning' }
}

export const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

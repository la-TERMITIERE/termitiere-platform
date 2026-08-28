// Moteur d'écritures automatiques — catalogue de « faits comptables » (événements
// métier) et « modèles d'imputation » (règles fait → écriture), à la manière de FEZIRE
// (Faits comptables → Automatisation d'écriture → Supervision du moteur).
//
// Version termitière : le catalogue reflète les événements réellement émis par nos
// autres modules, et les modèles reflètent les règles appliquées par passerelles.js.

// Catalogue des faits comptables émis par la plateforme termitière.
export const CATALOGUE_FAITS = [
  { code: 'DEPENSE_DECAISSEE', label: 'Dépense décaissée', source: 'E-DÉPENSES', desc: 'Une dépense validée et payée dans un module.' },
  { code: 'DEPENSE_PAU', label: 'Dépense financée par le PAU', source: 'E-DÉPENSES', desc: 'Dépense payée sur l\'apport personnel du promoteur.' },
  { code: 'REVENU_MANUEL', label: 'Revenu manuel encaissé', source: 'E-DÉPENSES', desc: 'Une rentrée d\'argent saisie manuellement.' },
  { code: 'ACHAT_MATIERES', label: 'Achat de matières (Briqueterie)', source: 'E-BRIQUETERIE', desc: 'Coût des matières premières entrées.' },
  { code: 'FACTURE_VENTE', label: 'Facture de vente émise', source: 'Multi-modules', desc: 'Une facture client émise (agro, logistique, briqueterie…).' },
  { code: 'IMMO_ACQUISE', label: 'Immobilisation acquise', source: 'COMPTABILITÉ', desc: 'Un actif durable entré au registre.' },
  { code: 'IMMO_DOTATION', label: 'Dotation aux amortissements', source: 'COMPTABILITÉ', desc: 'Amortissement annuel d\'une immobilisation.' }
]

// Modèles d'imputation actifs (règles fait → écriture) appliqués par passerelles.js.
export const MODELES_ACTIFS = [
  { code: 'MOD_DEPENSE', fait: 'DEPENSE_DECAISSEE', label: 'Imputation dépense décaissée', journal: 'AC', debit: 'Compte de charge (selon catégorie)', credit: '530000 Caisse', statut: 'actif' },
  { code: 'MOD_DEPENSE_PAU', fait: 'DEPENSE_PAU', label: 'Imputation dépense PAU', journal: 'AC', debit: 'Compte de charge', credit: '104000 Compte de l\'exploitant', statut: 'actif' },
  { code: 'MOD_REVENU', fait: 'REVENU_MANUEL', label: 'Imputation revenu manuel', journal: 'VE', debit: '530000 Caisse', credit: '708000 Produits annexes', statut: 'actif' }
]

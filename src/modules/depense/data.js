// Données de référence du module Dépenses.

// Secteurs de l'entreprise — reprend les mêmes couleurs que les modules
// correspondants pour une cohérence visuelle immédiate.
export const SECTEURS = [
  { id: 'agro',         label: 'MAXI-AGRO',          color: '#2EAA3F' },
  { id: 'logistique',   label: 'MAXI LOGISTIQUE',    color: '#BC3C31' },
  { id: 'bat',          label: 'MAXI BAT',           color: '#0d9488' },
  { id: 'evenementiel', label: 'BRIQUETERIE',        color: '#7c3aed' },
  { id: 'garderie',     label: 'GARDERIE',           color: '#E8390E' },
  { id: 'divers',       label: 'HORS SECTEUR', color: '#64748b' }
]

export const CATEGORIES_DEPENSE = [
  { id: 'salaires',      label: 'Salaires & primes' },
  { id: 'fournitures',   label: 'Fournitures & matériel' },
  { id: 'transport',     label: 'Transport & carburant' },
  { id: 'entretien',     label: 'Entretien & réparations' },
  { id: 'communication', label: 'Communication & télécom' },
  { id: 'loyer',         label: 'Loyer & charges' },
  { id: 'services',      label: 'Services & prestataires' },
  { id: 'impots',        label: 'Impôts & taxes' },
  { id: 'autre',         label: 'Autre' }
]

// Nature comptable du flux — indépendante de la catégorie. Sert à établir le solde
// de trésorerie par type de flux (exploitation / investissement / perte).
export const NATURES_FLUX = {
  exploitation:   { label: 'Exploitation',   tone: 'info',    desc: 'Fonctionnement courant : salaires, achats, loyer, transport…' },
  investissement: { label: 'Investissement', tone: 'success', desc: 'Achat d\'actif durable : terrain, bâtiment, véhicule, gros équipement…' },
  perte:          { label: 'Perte',          tone: 'danger',  desc: 'Argent perdu sans contrepartie : casse, mortalité, créance irrécouvrable…' }
}
export const natureFluxDefaut = 'exploitation'

// Source de financement de la dépense — distingue l'argent de l'entreprise de l'apport
// personnel du promoteur (PAU). Un apport du PAU compte comme un revenu du secteur/mois
// (cf. revenuPauSecteurMois) en plus de rester une dette envers lui (cf. Dashboard).
export const SOURCES_FINANCEMENT = {
  entreprise: { label: 'Fonds de l\'entreprise', tone: 'info',    desc: 'Payé avec la trésorerie / les revenus de l\'entreprise.' },
  pau:        { label: 'Apport du PAU',          tone: 'purple',  desc: 'Payé par le promoteur (PAU) avec son argent personnel.' }
}
export const sourceFinancementDefaut = 'entreprise'

// Seuil au-delà duquel une dépense E-DÉPENSES (saisie directe, hors E-G.Pro qui a son
// propre circuit via les besoins) devient automatiquement une demande d'autorisation
// envoyée au PAU — même si elle est « prévue ». S'ajoute au dépassement du budget alloué
// du secteur (cf. budgetRestantSecteur dans logic.js) : n'importe lequel des deux suffit.
export const SEUIL_APPROBATION_PAU = 20000

// Circuit d'autorisation de décaissement (2 niveaux) :
//   en_attente → approuvee → decaissee (argent réellement sorti, compté dans le budget)
//   ou refusee à n'importe quelle étape.
export const STATUTS_DECAISSEMENT = {
  en_attente: { label: 'En attente d\'approbation', tone: 'warning' },
  approuvee:  { label: 'Approuvée — à décaisser', tone: 'info' },
  decaissee:  { label: 'Décaissée', tone: 'success' },
  refusee:    { label: 'Refusée', tone: 'danger' }
}

// Compte bancaire — types de mouvement (dépôt = entrée d'argent en banque, retrait
// = sortie). `signe` sert au calcul du solde courant (cf. Banque.jsx).
export const TYPES_MOUVEMENT_BANQUE = {
  depot:   { label: 'Dépôt',   tone: 'success', signe: 1 },
  retrait: { label: 'Retrait', tone: 'danger',  signe: -1 }
}

export const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

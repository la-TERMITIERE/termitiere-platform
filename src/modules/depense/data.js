// Données de référence du module Dépenses.

// Secteurs de l'entreprise — reprend les mêmes couleurs que les modules
// correspondants pour une cohérence visuelle immédiate.
// CAISSE COMMUNE en tête : c'est le secteur central (dépenses transverses, apports),
// consulté en premier — les listes « Budget par secteur »/« Répartition » suivent
// simplement cet ordre de déclaration, donc l'ordre ici pilote directement l'affichage.
export const SECTEURS = [
  { id: 'divers',       label: 'CAISSE COMMUNE', color: '#64748b' },
  { id: 'agro',         label: 'MAXI-AGRO',          color: '#2EAA3F' },
  { id: 'logistique',   label: 'MAXI LOGISTIQUE',    color: '#BC3C31' },
  { id: 'bat',          label: 'MAXI BAT',           color: '#0d9488' },
  { id: 'evenementiel', label: 'BRIQUETERIE',        color: '#7c3aed' },
  { id: 'garderie',     label: 'GARDERIE',           color: '#E8390E' },
  { id: 'gym',          label: 'MAXI-GYM',           color: '#E8850F' }
]

// MAXI LOGISTIQUE a deux sites indépendants (Lomé/Kara, cf. src/modules/logistique/site/
// useSite.jsx) avec chacun leur propre budget alloué — c'est le SEUL secteur scindé ainsi
// dans E-DÉPENSES (budget, suivi de consommation, alertes, saisie de dépense). Mêmes ids
// que SITES dans useSite.jsx — à garder synchronisés.
export const LOGISTIQUE_SITES = [
  { id: 'lome', label: 'Lomé' },
  { id: 'kara', label: 'Kara' }
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

// Source de financement d'une dépense E-DÉPENSES : toujours la trésorerie de
// l'entreprise — l'apport personnel du promoteur (PAU) ne se suit plus qu'au niveau
// des projets, exclusivement dans E-G.Pro (cf. projet/Depenses.jsx).
export const sourceFinancementDefaut = 'entreprise'

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

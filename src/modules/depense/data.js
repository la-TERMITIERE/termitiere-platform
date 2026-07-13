// Données de référence du module Dépenses.

// Secteurs de l'entreprise — reprend les mêmes couleurs que les modules
// correspondants pour une cohérence visuelle immédiate.
export const SECTEURS = [
  { id: 'agro',         label: 'MAXI-AGRO',          color: '#2EAA3F' },
  { id: 'logistique',   label: 'MAXI LOGISTIQUE',    color: '#BC3C31' },
  { id: 'bat',          label: 'MAXI BAT',           color: '#0d9488' },
  { id: 'evenementiel', label: 'BRIQUETERIE',        color: '#7c3aed' },
  { id: 'garderie',     label: 'GARDERIE',           color: '#E8390E' },
  { id: 'divers',       label: 'DIVERS / HORS SECTEUR', color: '#64748b' }
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

// Circuit d'autorisation de décaissement (2 niveaux) :
//   en_attente → approuvee → decaissee (argent réellement sorti, compté dans le budget)
//   ou refusee à n'importe quelle étape.
export const STATUTS_DECAISSEMENT = {
  en_attente: { label: 'En attente d\'approbation', tone: 'warning' },
  approuvee:  { label: 'Approuvée — à décaisser', tone: 'info' },
  decaissee:  { label: 'Décaissée', tone: 'success' },
  refusee:    { label: 'Refusée', tone: 'danger' }
}

export const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

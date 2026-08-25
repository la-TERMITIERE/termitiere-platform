// Référentiel VOYAGES & ACHATS — devises et taux de conversion vers le FCFA (XOF).
// `tauxFCFA` = combien de FCFA vaut 1 unité de la devise. La conversion d'un prix
// se fait donc : prix (devise) × tauxFCFA = prix en FCFA. Ces taux sont ajustables
// dans « Devises & taux » (édition manuelle) et peuvent être actualisés en direct.

export const DEVISES = [
  { id: 'XOF', code: 'XOF', nom: 'Franc CFA (BCEAO)', symbole: 'FCFA', tauxFCFA: 1 },
  { id: 'EUR', code: 'EUR', nom: 'Euro', symbole: '€', tauxFCFA: 655.957 },
  { id: 'USD', code: 'USD', nom: 'Dollar américain', symbole: '$', tauxFCFA: 600 },
  { id: 'CNY', code: 'CNY', nom: 'Yuan chinois (renminbi)', symbole: '¥', tauxFCFA: 84 },
  { id: 'QAR', code: 'QAR', nom: 'Riyal qatari', symbole: 'ر.ق', tauxFCFA: 165 },
  { id: 'AED', code: 'AED', nom: 'Dirham (Émirats)', symbole: 'د.إ', tauxFCFA: 163 },
  { id: 'TRY', code: 'TRY', nom: 'Livre turque', symbole: '₺', tauxFCFA: 18 },
  { id: 'GBP', code: 'GBP', nom: 'Livre sterling', symbole: '£', tauxFCFA: 760 },
  { id: 'MAD', code: 'MAD', nom: 'Dirham marocain', symbole: 'DH', tauxFCFA: 60 }
]

// Devise « FCFA » : jamais convertie (taux 1). Sert de base au calcul des taux croisés.
export const DEVISE_BASE = 'XOF'

// Gammes / domaines d'achat proposés (saisie libre autorisée en plus).
export const GAMMES = [
  'Cosmétique', 'Maxi-Gym / Équipement sportif', 'Électronique', 'Électroménager',
  'Textile / Habillement', 'Alimentaire', 'Matériel / Outillage', 'Mobilier',
  'Pièces détachées', 'Emballage', 'Divers'
]

// Pays d'achat fréquents (saisie libre autorisée).
export const PAYS_FREQUENTS = ['Chine', 'Qatar', 'Émirats arabes unis (Dubaï)', 'Turquie', 'Maroc', 'France', 'Inde', 'Royaume-Uni', 'États-Unis']

export const STATUTS_VOYAGE = {
  en_cours: { label: 'En cours', tone: 'info' },
  cloture:  { label: 'Clôturé', tone: 'success' }
}

// Poste de dépense du voyage (hors achats d'articles) — billet, hôtel, visa, per diem…
export const POSTES_DEPENSE = ['Billet d\'avion', 'Hôtel / hébergement', 'Visa', 'Transport local', 'Restauration / per diem', 'Fret / expédition', 'Douane', 'Divers']

// Icônes qui identifient d'un coup d'œil chaque ligne de la Caisse : une dotation (argent donné à la caisse)
// et chaque famille de dépense (salaires, transport, carburant, loyer, eau, électricité…).
import {
  HandCoins, Receipt, Users, Gift, Package, Wrench, Boxes, Truck, Fuel, Phone, House, Droplets, Zap, Briefcase,
  Landmark, ShieldCheck, GraduationCap, Megaphone, Laptop, UtensilsCrossed, BedDouble, Sparkles, Heart, Repeat,
  TriangleAlert, Shield, Hammer, Banknote
} from 'lucide-react'

export const ICONE_DOTATION = HandCoins
export const COULEUR_DOTATION = '#16a34a'
export const COULEUR_DEPENSE = '#dc2626'

// Famille de dépense : icône et teinte propres (la couleur du domaine reste portée par la ligne).
const PAR_CATEGORIE = {
  salaires: Users, salaires_primes: Users, primes: Gift,
  fournitures: Package, fournitures_materiel: Package, bureau: Package, materiel: Hammer, location: Hammer, matieres: Boxes,
  transport: Truck, transport_carburant: Truck, deplacement: Truck, peage: Truck, carburant: Fuel,
  entretien: Wrench, entretien_reparations: Wrench, reparations: Wrench,
  communication: Phone, communication_telecom: Phone, telecom: Phone,
  loyer: House, loyer_charges: House, charges: House, eau: Droplets, electricite: Zap,
  services: Briefcase, services_prestations: Briefcase, prestations: Briefcase, honoraires: Briefcase,
  impots: Landmark, taxes: Landmark, impots_taxes: Landmark, bancaire: Banknote,
  assurance: ShieldCheck, gardiennage: Shield, formation: GraduationCap, publicite: Megaphone, informatique: Laptop,
  restauration: UtensilsCrossed, hebergement: BedDouble, nettoyage: Sparkles, dons: Heart, abonnements: Repeat, amendes: TriangleAlert
}

// { icone, couleur, libelle } d'une ligne de la Caisse (type 'dotation' ou 'depense').
export function iconeLigne(ligne) {
  if (ligne?.type === 'dotation') {
    const baisse = (ligne.sortie || 0) > 0
    return { icone: ICONE_DOTATION, couleur: baisse ? COULEUR_DEPENSE : COULEUR_DOTATION, libelle: baisse ? 'Réduction de dotation' : 'Dotation de caisse' }
  }
  const cat = ligne?.categorie || ligne?.brut?.categorie
  return { icone: PAR_CATEGORIE[cat] || Receipt, couleur: COULEUR_DEPENSE, libelle: 'Dépense' }
}

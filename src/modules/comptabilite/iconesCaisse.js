// Icônes qui identifient d'un coup d'œil chaque ligne de la Caisse : une dotation (argent donné à la caisse)
// et chaque famille de dépense (salaires, transport, carburant, loyer, eau, électricité…).
import {
  HandCoins, Receipt, Users, Gift, Package, Wrench, Boxes, Truck, Fuel, Phone, House, Droplets, Zap, Briefcase,
  Landmark, ShieldCheck, GraduationCap, Megaphone, Laptop, UtensilsCrossed, BedDouble, Sparkles, Heart, Repeat,
  TriangleAlert, Shield, Hammer, Banknote, Undo2
} from 'lucide-react'
import { CATEGORIES_DEPENSE } from '../depense/data'

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

// Icône d'une catégorie de dépense : par identifiant, par libellé exact ou, à défaut, par mot-clé (la catégorie est parfois
// saisie à la main, ex. « Achat de carburant »). Receipt si rien ne correspond.
const sansAccent = (v) => String(v || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
const MOTS_CLES = [
  [/carburant|essence|gasoil/, Fuel], [/transport|deplac|peage|voyage/, Truck], [/salaire/, Users], [/prime/, Gift],
  [/fourniture|bureau|papeterie/, Package], [/entretien|repar|maintenance/, Wrench], [/telecom|communication|credit|forfait|internet|wifi/, Phone],
  [/loyer|charge/, House], [/\beau\b|verna/, Droplets], [/electric|courant|cash power|unite/, Zap], [/impot|taxe|fisc/, Landmark],
  [/assurance/, ShieldCheck], [/gardien/, Shield], [/formation/, GraduationCap], [/pub|flyer|affiche|impression/, Megaphone],
  [/inform|ordinateur|telephone|logiciel/, Laptop], [/restaur|repas|nourriture|aliment/, UtensilsCrossed], [/heberg|hotel/, BedDouble],
  [/nettoy|balai|serpill|entretien menager/, Sparkles], [/don\b|dons/, Heart], [/abonn/, Repeat], [/amende/, TriangleAlert],
  [/honorai|prestat|service/, Briefcase], [/bancaire|banque|frais de tenue/, Banknote], [/materiel|outil|location|quincaill/, Hammer], [/matiere|stock/, Boxes]
]
export function iconeCategorie(cat) {
  if (PAR_CATEGORIE[cat]) return PAR_CATEGORIE[cat]
  const n = sansAccent(cat)
  if (!n) return Receipt
  const parLibelle = CATEGORIES_DEPENSE.find((c) => c.id === n || sansAccent(c.label) === n)
  if (parLibelle && PAR_CATEGORIE[parLibelle.id]) return PAR_CATEGORIE[parLibelle.id]
  const trouve = MOTS_CLES.find(([re]) => re.test(n))
  return trouve ? trouve[1] : Receipt
}

// { icone, couleur, libelle } d'une ligne de la Caisse (type 'dotation' ou 'depense').
export function iconeLigne(ligne) {
  if (ligne?.type === 'retour') return { icone: Undo2, couleur: COULEUR_DOTATION, libelle: 'Retour de reliquat' }
  if (ligne?.type === 'dotation') {
    const baisse = (ligne.sortie || 0) > 0
    return { icone: ICONE_DOTATION, couleur: baisse ? COULEUR_DEPENSE : COULEUR_DOTATION, libelle: baisse ? 'Réduction de dotation' : 'Dotation de caisse' }
  }
  const cat = ligne?.categorie || ligne?.brut?.categorie
  return { icone: PAR_CATEGORIE[cat] || Receipt, couleur: COULEUR_DEPENSE, libelle: 'Dépense' }
}

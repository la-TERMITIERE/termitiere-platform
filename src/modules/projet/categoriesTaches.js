// Catégories de tâches (champ libre `phase`) — icône symbolique par mots-clés,
// partagée entre ProjetsExplorer.jsx et TachesExplorer.jsx.
import {
  ListChecks, Layers, Building2, Home, Sparkles, CheckCircle2, Mountain, Wrench, TreePine,
  PenTool, Code2, TestTube2, Rocket, Sprout, Droplets, Wheat, ShoppingCart,
  Warehouse, PawPrint, Utensils, Syringe, Repeat, Search, Factory, Megaphone,
  ClipboardList, Truck, PartyPopper, Shield
} from 'lucide-react'

export const NON_CLASSEES = '__non_classees__'
export const PALETTE_CATEGORIES = ['#0d9488', '#B45309', '#7c3aed', '#0369a1', '#dc2626', '#16a34a', '#d97706', '#64748b']

const DIACRITIQUES = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')
const normalise = (s) => (s || '').toLowerCase().normalize('NFD').replace(DIACRITIQUES, '')

// Détectée par mots-clés dans le nom de la catégorie (texte libre, suggéré selon le
// type de projet dans data.js → ETAPES_PAR_TYPE, mais non normalisé).
const ICONES_CATEGORIE = [
  [/fondation/, Layers],
  [/elevation|structure/, Building2],
  [/charpente|toiture|couverture/, Home],
  [/finition/, Sparkles],
  [/reception|livraison/, CheckCircle2],
  [/terrassement|nivellement/, Mountain],
  [/viabilisation|reseau|plomberie|electricite/, Wrench],
  [/espace vert|jardin|engazonnement/, TreePine],
  [/analyse|cadrage|conception|maquette/, PenTool],
  [/developpement|integration/, Code2],
  [/test|recette|debug/, TestTube2],
  [/deploiement|mise en (ligne|prod)/, Rocket],
  [/sol|labour|semis|plantation/, Sprout],
  [/entretien|irrigation|arrosage|fertilisation|desherbage|traitement/, Droplets],
  [/recolte/, Wheat],
  [/enclos|batiment/, Warehouse],
  [/acquisition des animaux|achat des animaux|reproduction des animaux/, PawPrint],
  [/alimentation|abreuvement/, Utensils],
  [/sanitaire|vaccination|sante/, Syringe],
  [/reproduction/, Repeat],
  [/etude de marche/, Search],
  [/production/, Factory],
  [/promotion|publicite|campagne/, Megaphone],
  [/logistique/, Truck],
  [/animation/, PartyPopper],
  [/cloture|rangement|securite/, Shield],
  [/commercialisation|vente|negociation/, ShoppingCart],
  [/preparation/, ClipboardList]
]
export const iconeCategorie = (phase) => {
  const n = normalise(phase)
  return ICONES_CATEGORIE.find(([re]) => re.test(n))?.[1] || ListChecks
}

// Un <option> HTML ne peut pas afficher d'icône JSX — on lui donne un emoji
// équivalent pour le menu déroulant, aligné sur la même icône que la carte.
const EMOJI_PAR_ICONE = new Map([
  [Layers, '🧱'], [Building2, '🏢'], [Home, '🏠'], [Sparkles, '✨'], [CheckCircle2, '✅'],
  [Mountain, '⛰️'], [Wrench, '🔧'], [TreePine, '🌳'], [PenTool, '✏️'], [Code2, '💻'],
  [TestTube2, '🧪'], [Rocket, '🚀'], [Sprout, '🌱'], [Droplets, '💧'], [Wheat, '🌾'],
  [ShoppingCart, '🛒'], [Warehouse, '🏚️'], [PawPrint, '🐾'], [Utensils, '🍽️'], [Syringe, '💉'],
  [Repeat, '🔁'], [Search, '🔍'], [Factory, '🏭'], [Megaphone, '📣'], [ClipboardList, '📋'],
  [Truck, '🚚'], [PartyPopper, '🎉'], [Shield, '🛡️'], [ListChecks, '📝']
])
export const emojiCategorie = (phase) => EMOJI_PAR_ICONE.get(iconeCategorie(phase)) || '📝'

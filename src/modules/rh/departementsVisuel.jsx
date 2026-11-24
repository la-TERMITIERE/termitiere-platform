// Visuel d'un département : les départements sont les modules de l'entreprise (sauf E-DÉPENSES et E-G.Pro).
// Ordre de choix du logo : image ajoutée par l'utilisateur, puis logo du module, puis icône du module, puis icône de la CATÉGORIE
// (choisie, ou devinée d'après le nom), puis icône par défaut.
import { Building2, Sprout, Truck, BrickWall, MapPin, Baby, Calculator, HeartPulse, ShoppingCart, Cpu, Crown } from 'lucide-react'
import { MODULES } from '../../shared/modules'
import { icone3D } from '../../utils/color'

const EXCLUS = ['depense', 'projet']
export const MODULES_DEPARTEMENTS = MODULES.filter((m) => !EXCLUS.includes(m.id))

// Catégories de départements. `mots` sert à deviner la catégorie d'après le nom saisi.
export const CATEGORIES_DEPARTEMENT = [
  { id: 'agriculture', label: 'Agriculture et élevage', icone: Sprout, couleur: '#16a34a', mots: /agro|agri|[ée]levage|ferme|culture|animal|b[ée]tail|v[ée]to/i },
  { id: 'logistique', label: 'Logistique et transport', icone: Truck, couleur: '#BC3C31', mots: /logisti|transport|livraison|magasin|stock/i },
  { id: 'construction', label: 'Construction et matériaux', icone: BrickWall, couleur: '#475569', mots: /brique|construct|btp|b[âa]timent|mat[ée]riau/i },
  { id: 'immobilier', label: 'Immobilier et foncier', icone: MapPin, couleur: '#059669', mots: /foncier|immobil|terrain|cadastre/i },
  { id: 'education', label: 'Éducation et petite enfance', icone: Baby, couleur: '#E8390E', mots: /garderie|[ée]cole|enfan|[ée]duc|formation/i },
  { id: 'finance', label: 'Finance et comptabilité', icone: Calculator, couleur: '#ea580c', mots: /compta|financ|tr[ée]sor|caisse|paie|budget/i },
  { id: 'sante', label: 'Santé et bien-être', icone: HeartPulse, couleur: '#E8850F', mots: /sant[ée]|gym|sport|fitness|bien-?[êe]tre|m[ée]dic/i },
  { id: 'commercial', label: 'Commercial et ventes', icone: ShoppingCart, couleur: '#0d9488', mots: /commerc|vente|marketing|client|achat/i },
  { id: 'technique', label: 'Technique et informatique', icone: Cpu, couleur: '#6366f1', mots: /informatique|\btech|\bit\b|digital|maintenance|r[ée]seau/i },
  { id: 'administration', label: 'Direction et administration', icone: Crown, couleur: '#7c3aed', mots: /direction|admin|ressources|\brh\b|gestion|secr[ée]tariat/i },
  { id: 'autre', label: 'Autre', icone: Building2, couleur: '#0284c7', mots: null }
]
export const categorieParId = (id) => CATEGORIES_DEPARTEMENT.find((c) => c.id === id) || null

// Catégorie par défaut de chaque module (MAXI-GYM : santé et bien-être, etc.).
export const CATEGORIE_DU_MODULE = {
  agro: 'agriculture', logistique: 'logistique', evenementiel: 'construction', foncier: 'immobilier',
  garderie: 'education', comptabilite: 'finance', rh: 'administration', gym: 'sante'
}
export const categorieParNom = (nom) => CATEGORIES_DEPARTEMENT.find((c) => c.mots && c.mots.test(String(nom || '')))?.id || ''

function moduleDe(d) {
  const nom = String(d?.nom || '').trim().toLowerCase()
  return MODULES_DEPARTEMENTS.find((m) => m.id === d?.moduleId) || MODULES_DEPARTEMENTS.find((m) => m.nom.toLowerCase() === nom) || null
}

// Catégorie conseillée pour un département en cours de saisie (module choisi, sinon deviné d'après le nom).
export function categorieAuto(d) {
  const mod = moduleDe(d)
  return (mod && CATEGORIE_DU_MODULE[mod.id]) || categorieParNom(d?.nom) || ''
}

export function visuelDepartement(d) {
  const mod = moduleDe(d)
  const base = categorieParId(d?.categorie) || categorieParId(categorieAuto(d)) || categorieParId('autre')
  // « Autre catégorie » : le nom saisi par l'utilisateur devient le libellé (et la clé de regroupement).
  const libre = base.id === 'autre' && String(d?.categorieLibelle || '').trim()
  const cat = { ...base, label: libre || base.label, cle: libre ? `autre:${libre.toLowerCase()}` : base.id }
  if (mod) return { module: mod, categorie: cat, logo: d?.logo || mod.logo || '', Icone: mod.icon, couleur: mod.color }
  return { module: null, categorie: cat, logo: d?.logo || '', Icone: cat.icone, couleur: cat.couleur }
}

// Pastille du logo : l'image sur fond blanc, ou l'icône en relief à la couleur du département.
export function LogoDepartement({ visuel, taille = 56 }) {
  const { logo, Icone, couleur } = visuel
  const base = { width: taille, height: taille, borderRadius: Math.round(taille * 0.3) }
  return logo ? (
    <span className="flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-[0_10px_20px_-10px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.9)]" style={base}>
      <img src={logo} alt="" className="h-full w-full object-contain p-1.5" />
    </span>
  ) : (
    <span className="flex shrink-0 items-center justify-center" style={{ ...icone3D(couleur), ...base }}>
      <Icone size={Math.round(taille * 0.45)} />
    </span>
  )
}

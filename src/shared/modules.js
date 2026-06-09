// Configuration centrale des modules de la plateforme et de leur navigation interne.
import {
  Leaf, Truck, BrickWall, Calculator, MapPin,
  LayoutDashboard, ClipboardList, FileText, TrendingUp, Stethoscope, Send, BookOpen, Settings,
  Boxes, BadgeDollarSign, UserCircle, RotateCcw, Factory, Package
} from 'lucide-react'

export const MODULES = [
  {
    id: 'agro',
    nom: 'MAXI-AGRO',
    description: 'Élevage & gestion de stock',
    icon: Leaf,
    emoji: '🌿',
    color: '#BC3C31',
    path: '/agro',
    statut: 'actif'
  },
  {
    id: 'logistique',
    nom: 'LOGISTIQUE ET ÉVÉNEMENTIEL',
    description: 'Matériel, location & prestations',
    icon: Truck,
    emoji: '🎪',
    color: '#0284c7',
    path: '/logistique',
    statut: 'actif'
  },
  {
    id: 'evenementiel',
    nom: 'BRIQUETERIE',
    description: 'Production & vente de briques',
    icon: BrickWall,
    emoji: '🧱',
    color: '#7c3aed',
    path: '/evenementiel',
    statut: 'actif'
  },
  {
    id: 'foncier',
    nom: 'FONCIER',
    description: 'Titres fonciers, morcellement & mutation',
    icon: MapPin,
    emoji: '📍',
    color: '#059669',
    path: '/foncier',
    statut: 'actif'
  },
  {
    id: 'rh',
    nom: 'COMPTABILITÉ',
    description: 'Finances & suivi comptable',
    icon: Calculator,
    emoji: '📊',
    color: '#ea580c',
    path: '/rh',
    statut: 'bientot'
  }
]

export const getModule = (id) => MODULES.find((m) => m.id === id)

export const MODULE_NAV = {
  agro: [
    { label: 'Dashboard', to: '/agro', icon: LayoutDashboard, end: true },
    { label: 'Saisie journalière', to: '/agro/saisie', icon: ClipboardList },
    { label: 'Facturation', to: '/agro/factures', icon: FileText },
    { label: 'Pilotage & Analyses', to: '/agro/analyses', icon: TrendingUp },
    { label: 'Santé animale', to: '/agro/sante', icon: Stethoscope },
    { label: 'Demandes de sortie', to: '/agro/demandes', icon: Send, badgeKey: 'agroDemandes' },
    { label: 'Journal', to: '/agro/journal', icon: BookOpen },
    { label: 'Paramètres', to: '/agro/params', icon: Settings }
  ],
  logistique: [
    { label: 'Dashboard', to: '/logistique', icon: LayoutDashboard, end: true },
    { label: 'Saisie magasin', to: '/logistique/saisie', icon: ClipboardList },
    { label: 'Prestations / Location', to: '/logistique/prestations', icon: BadgeDollarSign },
    { label: 'Facturation', to: '/logistique/factures', icon: FileText },
    { label: 'Autorisations sortie', to: '/logistique/demandes', icon: Send, badgeKey: 'logistiqueDemandes' },
    { label: 'Retours matériel', to: '/logistique/retours', icon: RotateCcw },
    { label: 'Référentiel matériel', to: '/logistique/referentiel', icon: Boxes },
    { label: 'Clients', to: '/logistique/clients', icon: UserCircle },
    { label: 'Fournisseurs', to: '/logistique/fournisseurs', icon: Factory },
    { label: 'Journal', to: '/logistique/journal', icon: BookOpen },
    { label: 'Paramètres', to: '/logistique/params', icon: Settings }
  ],
  evenementiel: [
    { label: 'Dashboard', to: '/evenementiel', icon: LayoutDashboard, end: true },
    { label: 'Saisie matières', to: '/evenementiel/saisie', icon: ClipboardList },
    { label: 'Production', to: '/evenementiel/production', icon: Factory },
    { label: 'Stock briques', to: '/evenementiel/stock', icon: Package },
    { label: 'Ventes', to: '/evenementiel/ventes', icon: FileText },
    { label: 'Autorisations sortie', to: '/evenementiel/demandes', icon: Send, badgeKey: 'briqueterieDemandes' },
    { label: 'Journal', to: '/evenementiel/journal', icon: BookOpen },
    { label: 'Paramètres', to: '/evenementiel/params', icon: Settings },
    { label: 'Clients', to: '/evenementiel/clients', icon: UserCircle }
  ],
  foncier: [
    { label: 'Dashboard', to: '/foncier', icon: LayoutDashboard, end: true },
    { label: 'Dossiers fonciers', to: '/foncier/dossiers', icon: FileText },
    { label: 'Journal', to: '/foncier/journal', icon: BookOpen },
    { label: 'Paramètres', to: '/foncier/params', icon: Settings }
  ],
  rh: [
    { label: 'Tableau de bord', to: '/rh', icon: LayoutDashboard, end: true }
  ]
}

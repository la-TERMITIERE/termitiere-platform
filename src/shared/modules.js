// Configuration centrale des modules de la plateforme et de leur navigation interne.
import {
  Leaf, Truck, BrickWall, Calculator, MapPin, Baby,
  LayoutDashboard, ClipboardList, FileText, TrendingUp, Stethoscope, Send, BookOpen, Settings,
  Boxes, BadgeDollarSign, UserCircle, RotateCcw, Factory, Package, History,
  Users, CreditCard, AlertTriangle, CalendarCheck, UtensilsCrossed, BarChart2
} from 'lucide-react'

export const MODULES = [
  {
    id: 'agro',
    nom: 'MAXI-AGRO',
    description: 'Élevage & gestion de stock',
    icon: Leaf,
    emoji: '🌿',
    color: '#2EAA3F',
    path: '/agro',
    statut: 'actif',
    logo: '/maxi-agro-logo.png'
  },
  {
    id: 'logistique',
    nom: 'MAXI LOGISTIQUE',
    description: 'Matériel, location & prestations',
    icon: Truck,
    emoji: '🚛',
    color: '#BC3C31',
    sidebarGradient: 'linear-gradient(180deg, #BC3C31 0%, #6B1A10 50%, #1A1A1A 100%)',
    path: '/logistique',
    statut: 'actif',
    logo: '/logo_maxi_logistique.png'
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
    id: 'garderie',
    nom: 'GARDERIE',
    description: 'Enfants, personnel, présences & paiements',
    icon: Baby,
    emoji: '🍼',
    color: '#E8390E',
    path: '/garderie',
    statut: 'actif',
    logo: '/garderie-logo.png'
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
    { label: 'Historique', to: '/agro/historique', icon: History },
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
    { label: 'Facturation', to: '/evenementiel/factures', icon: FileText },
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
  ],
  garderie: [
    { label: 'Dashboard',          to: '/garderie',           icon: LayoutDashboard, end: true },
    { label: 'Enfants inscrits',   to: '/garderie/enfants',   icon: Baby,            roles: ['super_admin','pau','ge','gerant','gerante_garderie','superviseur','tata'] },
    { label: 'Personnel / Tatas',  to: '/garderie/personnel', icon: Users,           roles: ['super_admin','pau','ge','gerant','gerante_garderie'] },
    { label: 'Présences enfants',  to: '/garderie/presences', icon: CalendarCheck },
    { label: 'Paiements',          to: '/garderie/paiements', icon: CreditCard,      roles: ['super_admin','pau','ge','gerant','gerante_garderie','superviseur'] },
    { label: 'Cantine & Repas',    to: '/garderie/cantine',   icon: UtensilsCrossed },
    { label: 'Incidents & Santé',  to: '/garderie/incidents', icon: AlertTriangle },
    { label: 'Analyse & Pilotage', to: '/garderie/analyses',  icon: BarChart2,       roles: ['super_admin','pau','ge','gerant','superviseur'] },
    { label: 'Journal',            to: '/garderie/journal',   icon: BookOpen,        roles: ['super_admin','pau','ge','gerant','superviseur'] },
    { label: 'Paramètres',         to: '/garderie/params',    icon: Settings,        roles: ['super_admin','pau','ge'] }
  ]
}

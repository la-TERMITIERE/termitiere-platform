// Configuration centrale des modules de la plateforme et de leur navigation interne.
// Sert au portail (grille de cartes), à la sidebar et au contrôle d'accès.
import {
  Leaf, Truck, PartyPopper, Users,
  LayoutDashboard, ClipboardList, FileText, TrendingUp, Stethoscope,
  Send, BookOpen, Settings, Car, Package, Factory, Boxes,
  CalendarDays, BadgeDollarSign, Tent, UserCircle, CalendarCheck
} from 'lucide-react'

// Métadonnées des modules (ordre = ordre d'affichage portail)
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
    nom: 'LOGISTIQUE',
    description: 'Transport & livraisons',
    icon: Truck,
    emoji: '🚛',
    color: '#0284c7',
    path: '/logistique',
    statut: 'actif'
  },
  {
    id: 'evenementiel',
    nom: 'ÉVÉNEMENTIEL',
    description: 'Mariages & conférences',
    icon: PartyPopper,
    emoji: '🎪',
    color: '#7c3aed',
    path: '/evenementiel',
    statut: 'actif'
  },
  {
    id: 'rh',
    nom: 'RESSOURCES HUMAINES',
    description: 'Employés & présences',
    icon: Users,
    emoji: '👥',
    color: '#ea580c',
    path: '/rh',
    statut: 'bientot'
  }
]

export const getModule = (id) => MODULES.find((m) => m.id === id)

// Navigation interne de chaque module : [{ label, to, icon, badge? }]
export const MODULE_NAV = {
  agro: [
    { label: 'Dashboard', to: '/agro', icon: LayoutDashboard, end: true },
    { label: 'Saisie journalière', to: '/agro/saisie', icon: ClipboardList },
    { label: 'Facturation', to: '/agro/factures', icon: FileText },
    { label: 'Analyses', to: '/agro/analyses', icon: TrendingUp },
    { label: 'Santé animale', to: '/agro/sante', icon: Stethoscope },
    { label: 'Demandes de sortie', to: '/agro/demandes', icon: Send, badgeKey: 'agroDemandes' },
    { label: 'Journal', to: '/agro/journal', icon: BookOpen },
    { label: 'Paramètres', to: '/agro/params', icon: Settings }
  ],
  logistique: [
    { label: 'Dashboard', to: '/logistique', icon: LayoutDashboard, end: true },
    { label: 'Véhicules', to: '/logistique/vehicules', icon: Car },
    { label: 'Livraisons', to: '/logistique/livraisons', icon: Package },
    { label: 'Fournisseurs', to: '/logistique/fournisseurs', icon: Factory },
    { label: 'Stock matériel', to: '/logistique/stock', icon: Boxes }
  ],
  evenementiel: [
    { label: 'Dashboard', to: '/evenementiel', icon: LayoutDashboard, end: true },
    { label: 'Événements', to: '/evenementiel/evenements', icon: CalendarDays },
    { label: 'Devis & Facturation', to: '/evenementiel/devis', icon: BadgeDollarSign },
    { label: 'Matériel & Location', to: '/evenementiel/materiel', icon: Tent },
    { label: 'Clients', to: '/evenementiel/clients', icon: UserCircle }
  ],
  rh: [
    { label: 'Dashboard', to: '/rh', icon: LayoutDashboard, end: true },
    { label: 'Employés', to: '/rh/employes', icon: UserCircle },
    { label: 'Présences & Congés', to: '/rh/presences', icon: CalendarCheck }
  ]
}

// Configuration centrale des modules de la plateforme et de leur navigation interne.
import {
  Leaf, Truck, BrickWall, Calculator, MapPin, Baby, FolderKanban,
  LayoutDashboard, ClipboardList, FileText, TrendingUp, Stethoscope, Send, BookOpen, Settings,
  Boxes, BadgeDollarSign, UserCircle, RotateCcw, Factory, Package,
  Users, CreditCard, CalendarCheck, UtensilsCrossed, BarChart2, ListChecks, CalendarDays, PieChart, Paperclip, Images,
  Wallet, Gauge, Receipt, Landmark, Stamp, Waves, PackagePlus, Handshake, Wrench, Scale
} from 'lucide-react'
import { FINANCE_VIEW_ROLES, PROJET_VOLETS_RESTREINTS_ROLES, PROJET_PILOTAGE_ROLES, PROJET_JOURNAL_ROLES, PROJET_DEPENSES_ROLES, FULL_ACCESS_ROLES } from '../core/roles'

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
    nom: 'E-BRIQUETERIE',
    description: 'Production & vente de briques',
    icon: BrickWall,
    emoji: '🧱',
    color: '#7c3aed',
    path: '/evenementiel',
    statut: 'actif'
  },
  {
    id: 'foncier',
    nom: 'E-FONCIER',
    description: 'Titres fonciers, morcellement & mutation',
    icon: MapPin,
    emoji: '📍',
    color: '#059669',
    path: '/foncier',
    statut: 'actif'
  },
  {
    id: 'garderie',
    nom: 'E-GARDERIE',
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
  },
  {
    id: 'projet',
    nom: 'E-G.Pro',
    description: 'Projets, tâches, équipes & avancement',
    icon: FolderKanban,
    emoji: '📋',
    color: '#0d9488',
    path: '/projet',
    statut: 'actif'
  },
  {
    id: 'depense',
    nom: 'E-DÉPENSES',
    description: 'Budget mensuel et suivi des dépenses par secteur',
    icon: Landmark,
    emoji: '💰',
    color: '#B45309',
    path: '/depense',
    statut: 'actif'
  }
]

export const getModule = (id) => MODULES.find((m) => m.id === id)

export const MODULE_NAV = {
  agro: [
    { label: 'Dashboard', to: '/agro', icon: LayoutDashboard, end: true },
    { label: 'Saisie journalière', to: '/agro/saisie', icon: ClipboardList },
    { label: 'Facturation', to: '/agro/factures', icon: FileText },
    { label: 'Dépense', to: '/agro/finances', icon: Scale, roles: FINANCE_VIEW_ROLES },
    { label: 'Pilotage & Analyses', to: '/agro/analyses', icon: TrendingUp, roles: FINANCE_VIEW_ROLES },
    { label: 'Santé animale', to: '/agro/sante', icon: Stethoscope },
    { label: 'Demandes de sortie', to: '/agro/demandes', icon: Send, badgeKey: 'agroDemandes' },
    { label: 'Partenaires', to: '/agro/partenaires', icon: Handshake, perm: 'partenaires' },
    { label: 'Journal et Historique', to: '/agro/journal', icon: BookOpen },
    { label: 'Paramètres', to: '/agro/params', icon: Settings }
  ],
  logistique: [
    { label: 'Dashboard', to: '/logistique', icon: LayoutDashboard, end: true },
    { label: 'Saisie magasin', to: '/logistique/saisie', icon: ClipboardList },
    { label: 'Prestations / Location', to: '/logistique/prestations', icon: BadgeDollarSign },
    { label: 'Pilotage & Analyses', to: '/logistique/pilotage', icon: TrendingUp, roles: FINANCE_VIEW_ROLES },
    { label: 'Dépense', to: '/logistique/finances', icon: Scale, roles: FINANCE_VIEW_ROLES },
    { label: 'Facturation', to: '/logistique/factures', icon: FileText },
    { label: 'Autorisations sortie', to: '/logistique/demandes', icon: Send, badgeKey: 'logistiqueDemandes' },
    { label: 'Retours matériel', to: '/logistique/retours', icon: RotateCcw },
    { label: 'Référentiel matériel', to: '/logistique/referentiel', icon: Boxes },
    { label: 'Clients', to: '/logistique/clients', icon: UserCircle },
    { label: 'Fournisseurs', to: '/logistique/fournisseurs', icon: Factory },
    { label: 'Partenaires', to: '/logistique/partenaires', icon: Handshake, perm: 'partenaires' },
    { label: 'Journal et Historique', to: '/logistique/journal', icon: BookOpen },
    { label: 'Paramètres', to: '/logistique/params', icon: Settings }
  ],
  evenementiel: [
    { label: 'Dashboard', to: '/evenementiel', icon: LayoutDashboard, end: true },
    { label: 'Production', to: '/evenementiel/production', icon: Factory },
    { label: 'Stock briques', to: '/evenementiel/stock', icon: Package },
    { label: 'Ventes', to: '/evenementiel/ventes', icon: FileText },
    { label: 'Facturation', to: '/evenementiel/factures', icon: FileText },
    { label: 'Pilotage & Analyses', to: '/evenementiel/pilotage', icon: TrendingUp, roles: FINANCE_VIEW_ROLES },
    { label: 'Dépense', to: '/evenementiel/finances', icon: Scale, roles: FINANCE_VIEW_ROLES },
    { label: 'Autorisations sortie', to: '/evenementiel/demandes', icon: Send, badgeKey: 'briqueterieDemandes' },
    { label: 'Journal et Historique', to: '/evenementiel/journal', icon: BookOpen },
    { label: 'Paramètres', to: '/evenementiel/params', icon: Settings },
    { label: 'Clients', to: '/evenementiel/clients', icon: UserCircle },
    { label: 'Partenaires', to: '/evenementiel/partenaires', icon: Handshake, perm: 'partenaires' }
  ],
  foncier: [
    { label: 'Dashboard', to: '/foncier', icon: LayoutDashboard, end: true },
    { label: 'Dossiers fonciers', to: '/foncier/dossiers', icon: FileText },
    { label: 'Partenaires', to: '/foncier/partenaires', icon: Handshake, perm: 'partenaires' },
    { label: 'Journal et Historique', to: '/foncier/journal', icon: BookOpen },
    { label: 'Paramètres', to: '/foncier/params', icon: Settings }
  ],
  rh: [
    { label: 'Tableau de bord', to: '/rh', icon: LayoutDashboard, end: true }
  ],
  projet: [
    { label: 'Dashboard',   to: '/projet',             icon: LayoutDashboard, end: true },
    { label: 'Pilotage & Contrôle', to: '/projet/pilotage', icon: Gauge, roles: PROJET_PILOTAGE_ROLES },
    { label: 'Projets',     to: '/projet/projets',     icon: FolderKanban, badgeKey: 'projetProjets' },
    { label: 'Tâches',      to: '/projet/taches',      icon: ListChecks, badgeKey: 'projetTaches' },
    { label: 'Planning',    to: '/projet/planning',    icon: CalendarDays },
    { label: 'Documents',   to: '/projet/documents',   icon: Paperclip, badgeKey: 'projetDocuments' },
    { label: 'Galerie photos', to: '/projet/galerie',  icon: Images, badgeKey: 'projetGalerie' },
    { label: 'Dépenses',    to: '/projet/depenses',    icon: Wallet, badgeKey: 'projetDepenses', roles: PROJET_DEPENSES_ROLES },
    { label: 'Besoins',      to: '/projet/besoins',      icon: PackagePlus, badgeKey: 'projetBesoins' },
    { label: 'Matériel & Matériaux', to: '/projet/materiel', icon: Wrench, badgeKey: 'projetMateriel' },
    { label: 'Prestataires', to: '/projet/prestataires', icon: UserCircle },
    // `roles: ['agent']` en plus de `perm` : l'agent E-G.Pro voit cet onglet (en lecture
    // seule, cf. Partenaires.jsx → peutGerer) même sans la permission gerePartenaires,
    // qui reste nécessaire pour ajouter/modifier/supprimer un partenaire.
    { label: 'Partenaires', to: '/projet/partenaires', icon: Handshake, perm: 'partenaires', roles: ['agent'] },
    { label: 'Rapports',    to: '/projet/rapports',    icon: PieChart },
    { label: 'Journal et Historique', to: '/projet/journal', icon: BookOpen, roles: PROJET_JOURNAL_ROLES },
    { label: 'Paramètres',  to: '/projet/params',      icon: Settings, roles: PROJET_VOLETS_RESTREINTS_ROLES }
  ],
  garderie: [
    { label: 'Dashboard',          to: '/garderie',           icon: LayoutDashboard, end: true },
    { label: 'Enfants inscrits',   to: '/garderie/enfants',   icon: Baby,            roles: [...FULL_ACCESS_ROLES,'gerant','gerante_garderie','superviseur','partenaire','tata'] },
    { label: 'Personnel / Tatas',  to: '/garderie/personnel', icon: Users,           roles: [...FULL_ACCESS_ROLES,'gerant','gerante_garderie'] },
    { label: 'Présences enfants',  to: '/garderie/presences', icon: CalendarCheck },
    { label: 'Paiements',          to: '/garderie/paiements', icon: CreditCard,      roles: [...FULL_ACCESS_ROLES,'gerant','gerante_garderie','superviseur','partenaire'] },
    { label: 'Cantine & Repas',    to: '/garderie/cantine',   icon: UtensilsCrossed },
    { label: 'Santé & Infirmerie', to: '/garderie/incidents', icon: Stethoscope },
    { label: 'Tâches',             to: '/garderie/taches',    icon: ListChecks },
    { label: 'Analyse & Pilotage', to: '/garderie/analyses',  icon: BarChart2,       roles: [...FULL_ACCESS_ROLES,'gerant','superviseur','partenaire'] },
    { label: 'Dépense', to: '/garderie/finances', icon: Scale,          roles: [...FULL_ACCESS_ROLES,'gerant','gerante_garderie','superviseur','partenaire'] },
    { label: 'Partenaires',        to: '/garderie/partenaires', icon: Handshake,     perm: 'partenaires' },
    { label: 'Journal et Historique', to: '/garderie/journal', icon: BookOpen,       roles: [...FULL_ACCESS_ROLES,'gerant','superviseur','partenaire'] },
    { label: 'Paramètres',         to: '/garderie/params',    icon: Settings,        roles: [...FULL_ACCESS_ROLES] }
  ],
  depense: [
    { label: 'Dashboard',                    to: '/depense',              icon: LayoutDashboard, end: true },
    { label: 'Dépenses',                     to: '/depense/liste',        icon: Wallet, badgeKey: 'depenseDepenses' },
    { label: 'Revenus & Budget',            to: '/depense/recettes-depenses', icon: Scale, roles: FINANCE_VIEW_ROLES },
    { label: 'Autorisation de décaissement', to: '/depense/autorisations', icon: Stamp },
    { label: 'Analyses',                     to: '/depense/analyses',     icon: BarChart2,       roles: [...FINANCE_VIEW_ROLES, 'agent'] },
    { label: 'Rentabilité',                  to: '/depense/rentabilite',  icon: TrendingUp,      roles: FINANCE_VIEW_ROLES },
    { label: 'Flux de trésorerie',           to: '/depense/flux',        icon: Waves,           roles: FINANCE_VIEW_ROLES },
    { label: 'Partenaires',                  to: '/depense/partenaires',  icon: Handshake,       perm: 'partenaires' },
    { label: 'Journal et Historique',        to: '/depense/journal',      icon: BookOpen,        roles: FINANCE_VIEW_ROLES },
    { label: 'Paramètres',                   to: '/depense/params',       icon: Settings,        roles: FINANCE_VIEW_ROLES }
  ]
}

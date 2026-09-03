// Configuration centrale des modules de la plateforme et de leur navigation interne.
import {
  Leaf, Truck, BrickWall, Calculator, MapPin, Baby, FolderKanban,
  LayoutDashboard, ClipboardList, FileText, TrendingUp, Stethoscope, Send, BookOpen, Settings,
  Boxes, BadgeDollarSign, UserCircle, RotateCcw, Factory, Package,
  Users, CreditCard, CalendarCheck, UtensilsCrossed, BarChart2, ListChecks, CalendarDays, PieChart, Paperclip, Images,
  Wallet, Gauge, Receipt, Landmark, Stamp, Waves, PackagePlus, Handshake, Wrench, Scale, HardHat, Lightbulb, Coins, Repeat, Dumbbell, Ticket, Tag, Plane, UserCog
} from 'lucide-react'
import { FINANCE_VIEW_ROLES, PROJET_PILOTAGE_ROLES, PROJET_DEPENSES_ROLES, FULL_ACCESS_ROLES, ADMIN_VOLETS_ROLES } from '../core/roles'

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
    id: 'comptabilite',
    nom: 'COMPTABILITÉ',
    description: 'Comptabilité générale — écritures, balance, grand livre, TVA, immobilisations',
    icon: Calculator,
    emoji: '📊',
    color: '#ea580c',
    path: '/comptabilite',
    statut: 'actif'
  },
  {
    id: 'rh',
    nom: 'RESSOURCES HUMAINES',
    description: 'Employés, contrats, congés, paie, recrutement & compétences',
    icon: Users,
    emoji: '🧑‍💼',
    color: '#0284c7',
    path: '/rh',
    statut: 'actif'
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
  },
  {
    id: 'gym',
    nom: 'MAXI-GYM',
    description: 'Salle de sport — séances et abonnements clients',
    icon: Dumbbell,
    emoji: '🏋️',
    // Couleurs reprises directement du logo (orange du ruban + rouge de l'icône) —
    // pas de couleur inventée, cf. moduleTheme.js pour le dégradé complet.
    color: '#E8850F',
    path: '/gym',
    statut: 'actif',
    logo: '/Maxi_Gym.png'
  },
  {
    id: 'voyage',
    nom: 'E-VOYAGE',
    description: 'Voyages d\'achat à l\'étranger, fournisseurs & conversion FCFA',
    icon: Plane,
    emoji: '✈️',
    color: '#4f46e5',
    path: '/voyage',
    statut: 'actif'
  }
]

export const getModule = (id) => MODULES.find((m) => m.id === id)

export const MODULE_NAV = {
  agro: [
    { label: 'Tâches Routinières', to: '/agro/routine', icon: Repeat },
    { label: 'Dashboard', to: '/agro', icon: LayoutDashboard, end: true },
    { label: 'Saisie journalière', to: '/agro/saisie', icon: ClipboardList },
    { label: 'Facturation', to: '/agro/factures', icon: FileText },
    { label: 'Dépense', to: '/agro/finances', icon: Scale, roles: [...FINANCE_VIEW_ROLES, 'secretaire'] },
    { label: 'Pilotage & Analyses', to: '/agro/analyses', icon: TrendingUp, roles: FINANCE_VIEW_ROLES },
    { label: 'Santé animale', to: '/agro/sante', icon: Stethoscope },
    { label: 'Demandes de sortie', to: '/agro/demandes', icon: Send, badgeKey: 'agroDemandes' },
    // Ouvert à tout le monde, volontairement sans `roles` — n'importe qui doit pouvoir
    // signaler un besoin ; seule l'administration valide/refuse (dans l'écran lui-même).
    { label: 'Besoins', to: '/agro/besoins', icon: PackagePlus, badgeKey: 'agroBesoins' },
    { label: 'Partenaires', to: '/agro/partenaires', icon: Handshake, perm: 'partenaires' },
    { label: 'Journal et Historique', to: '/agro/journal', icon: BookOpen, roles: ADMIN_VOLETS_ROLES },
    { label: 'Paramètres', to: '/agro/params', icon: Settings, roles: ADMIN_VOLETS_ROLES }
  ],
  logistique: [
    { label: 'Tâches Routinières', to: '/logistique/routine', icon: Repeat },
    { label: 'Dashboard', to: '/logistique', icon: LayoutDashboard, end: true },
    { label: 'Saisie magasin', to: '/logistique/saisie', icon: ClipboardList },
    { label: 'Prestations / Location', to: '/logistique/prestations', icon: BadgeDollarSign },
    { label: 'Pilotage & Analyses', to: '/logistique/pilotage', icon: TrendingUp, roles: FINANCE_VIEW_ROLES },
    { label: 'Dépense', to: '/logistique/finances', icon: Scale, roles: [...FINANCE_VIEW_ROLES, 'secretaire'] },
    { label: 'Facturation', to: '/logistique/factures', icon: FileText },
    { label: 'Autorisations sortie', to: '/logistique/demandes', icon: Send, badgeKey: 'logistiqueDemandes' },
    { label: 'Besoins', to: '/logistique/besoins', icon: PackagePlus, badgeKey: 'logistiqueBesoins' },
    { label: 'Retours matériel', to: '/logistique/retours', icon: RotateCcw },
    { label: 'Référentiel matériel', to: '/logistique/referentiel', icon: Boxes },
    { label: 'Clients', to: '/logistique/clients', icon: UserCircle },
    { label: 'Fournisseurs', to: '/logistique/fournisseurs', icon: Factory },
    { label: 'Partenaires', to: '/logistique/partenaires', icon: Handshake, perm: 'partenaires' },
    { label: 'Journal et Historique', to: '/logistique/journal', icon: BookOpen, roles: ADMIN_VOLETS_ROLES },
    { label: 'Paramètres', to: '/logistique/params', icon: Settings, roles: ADMIN_VOLETS_ROLES }
  ],
  evenementiel: [
    { label: 'Dashboard', to: '/evenementiel', icon: LayoutDashboard, end: true },
    { label: 'Production', to: '/evenementiel/production', icon: Factory },
    { label: 'Stock briques', to: '/evenementiel/stock', icon: Package },
    { label: 'Ventes', to: '/evenementiel/ventes', icon: FileText },
    { label: 'Transport', to: '/evenementiel/transport', icon: Truck },
    { label: 'Facturation', to: '/evenementiel/factures', icon: FileText },
    { label: 'Pilotage & Analyses', to: '/evenementiel/pilotage', icon: TrendingUp, roles: FINANCE_VIEW_ROLES },
    { label: 'Marge & Bénéfice', to: '/evenementiel/marge', icon: Scale, roles: [...FINANCE_VIEW_ROLES, 'secretaire', 'agent'] },
    // Dépense ouverte aussi aux AGENTS : ils saisissent leurs dépenses briqueterie
    // (revenus masqués, budget en lecture seule) — cf. index.jsx.
    { label: 'Dépense', to: '/evenementiel/finances', icon: Scale, roles: [...FINANCE_VIEW_ROLES, 'secretaire', 'agent'] },
    { label: 'Autorisations sortie', to: '/evenementiel/demandes', icon: Send, badgeKey: 'briqueterieDemandes' },
    { label: 'Besoins', to: '/evenementiel/besoins', icon: PackagePlus, badgeKey: 'evenementielBesoins' },
    { label: 'Matériel & Matériaux', to: '/evenementiel/materiel', icon: Wrench, badgeKey: 'evenementielMateriel' },
    { label: 'Journal et Historique', to: '/evenementiel/journal', icon: BookOpen, roles: ADMIN_VOLETS_ROLES },
    // Paramètres ouverts aux agents (ajuster prix/tarifs/rendement) ; la réinitialisation
    // des données reste réservée à l'administration (garde interne à l'écran).
    { label: 'Paramètres', to: '/evenementiel/params', icon: Settings, roles: [...ADMIN_VOLETS_ROLES, 'secretaire', 'agent'] },
    { label: 'Clients', to: '/evenementiel/clients', icon: UserCircle },
    { label: 'Partenaires', to: '/evenementiel/partenaires', icon: Handshake, perm: 'partenaires' }
  ],
  foncier: [
    { label: 'Dashboard', to: '/foncier', icon: LayoutDashboard, end: true },
    { label: 'Dossiers fonciers', to: '/foncier/dossiers', icon: FileText },
    { label: 'Besoins', to: '/foncier/besoins', icon: PackagePlus, badgeKey: 'foncierBesoins' },
    { label: 'Partenaires', to: '/foncier/partenaires', icon: Handshake, perm: 'partenaires' },
    { label: 'Journal et Historique', to: '/foncier/journal', icon: BookOpen, roles: ADMIN_VOLETS_ROLES },
    { label: 'Paramètres', to: '/foncier/params', icon: Settings, roles: ADMIN_VOLETS_ROLES }
  ],
  rh: [
    { label: 'Tableau de bord', to: '/rh', icon: LayoutDashboard, end: true },
    { heading: 'Structure RH' },
    { label: 'Départements', to: '/rh/departements', icon: Factory },
    { label: 'Postes de travail', to: '/rh/postes', icon: ClipboardList },
    { label: 'Organigramme', to: '/rh/organigramme', icon: Users },
    { heading: 'Collaborateurs & Contrats' },
    { label: 'Employés & Annuaire', to: '/rh/employes', icon: UserCircle },
    { label: 'Contrats de travail', to: '/rh/contrats', icon: FileText },
    { label: 'Onboarding / Offboarding', to: '/rh/onboarding', icon: Repeat },
    { label: 'Rattachement des comptes', to: '/rh/rattachements', icon: Handshake },
    { label: 'Diplômes & badges', to: '/rh/titres-badges', icon: Tag },
    { heading: 'Temps & Paie' },
    { label: 'Congés & Absences', to: '/rh/conges', icon: CalendarDays },
    { label: 'Présences & Pointages', to: '/rh/presences', icon: CalendarCheck },
    { label: 'Paie & Bulletins', to: '/rh/paie', icon: Receipt },
    { label: 'Configuration de la paie', to: '/rh/paie-configuration', icon: Settings },
    { label: 'État des salaires', to: '/rh/etat-salaires', icon: BarChart2 },
    { heading: 'Talent & Développement' },
    { label: 'Recrutement & Offres', to: '/rh/recrutement', icon: Send },
    { label: 'Formulaires & candidature', to: '/rh/formulaires', icon: ClipboardList },
    { label: 'Formations', to: '/rh/formations', icon: BookOpen },
    { label: 'Évaluations', to: '/rh/evaluations', icon: Gauge },
    { label: 'Compétences & GPEC', to: '/rh/competences', icon: TrendingUp },
    { heading: 'Pilotage & Conformité' },
    { label: 'Conformité & Alertes RH', to: '/rh/conformite', icon: Scale },
    { heading: "Vie d'Équipe" },
    { label: "Tâches d'équipe", to: '/rh/taches', icon: ListChecks },
    { label: 'Impact Collègue', to: '/rh/impacts', icon: Lightbulb },
    { heading: 'Missions & Frais' },
    { label: 'Missions & frais', to: '/rh/missions', icon: Plane },
    { label: 'Configuration missions', to: '/rh/missions-configuration', icon: Settings }
  ],
  comptabilite: [
    { label: 'Tableau de bord',        to: '/comptabilite',                 icon: LayoutDashboard, end: true },
    { label: 'Saisie d\'Écritures',    to: '/comptabilite/ecritures',       icon: ClipboardList },
    { label: 'Faits comptables',       to: '/comptabilite/faits',           icon: Repeat },
    { label: 'Automatisation d\'écriture', to: '/comptabilite/automatisation', icon: Wrench },
    { label: 'Supervision du moteur',  to: '/comptabilite/supervision',     icon: Gauge },
    { label: 'Tiers',                  to: '/comptabilite/tiers',           icon: Users },
    { label: 'Balance & Grand Livre',  to: '/comptabilite/grand-livre',     icon: Scale },
    { label: 'Comptabilité Analytique', to: '/comptabilite/analytique',     icon: PieChart },
    { label: 'États Financiers',       to: '/comptabilite/etats',           icon: BarChart2 },
    { label: 'Fiscalité & TVA',        to: '/comptabilite/tva',             icon: Receipt },
    { label: 'Immobilisations',        to: '/comptabilite/immobilisations', icon: Boxes },
    { label: 'Immobilier / Patrimoine', to: '/comptabilite/patrimoine',     icon: Landmark },
    { label: 'Plan Comptable',         to: '/comptabilite/plan',            icon: BookOpen },
    { label: 'Modèles de Plans',       to: '/comptabilite/modeles-plans',   icon: FileText },
    { label: 'Paramètres',             to: '/comptabilite/params',          icon: Settings }
  ],
  gym: [
    { label: 'Dashboard', to: '/gym', icon: LayoutDashboard, end: true },
    { label: 'Nos forfaits', to: '/gym/forfaits', icon: Tag },
    { label: 'Séances', to: '/gym/seances', icon: Ticket },
    { label: 'Abonnements', to: '/gym/abonnements', icon: CreditCard },
    { label: 'Facturation', to: '/gym/facturation', icon: Receipt },
    { label: 'Clients', to: '/gym/clients', icon: UserCircle },
    { label: 'Coachs', to: '/gym/coachs', icon: UserCog },
    { label: 'Pilotage & Analyses', to: '/gym/pilotage', icon: TrendingUp, roles: FINANCE_VIEW_ROLES },
    { label: 'Dépense', to: '/gym/finances', icon: Scale, roles: FINANCE_VIEW_ROLES },
    { label: 'Besoins', to: '/gym/besoins', icon: PackagePlus, badgeKey: 'gymBesoins' },
    { label: 'Partenaires', to: '/gym/partenaires', icon: Handshake, perm: 'partenaires' },
    { label: 'Journal et Historique', to: '/gym/journal', icon: BookOpen, roles: ADMIN_VOLETS_ROLES },
    { label: 'Paramètres', to: '/gym/params', icon: Settings, roles: ADMIN_VOLETS_ROLES }
  ],
  voyage: [
    { label: 'Dashboard', to: '/voyage', icon: LayoutDashboard, end: true },
    { label: 'Voyages', to: '/voyage/voyages', icon: Plane },
    { label: 'Devises & taux', to: '/voyage/devises', icon: Coins }
  ],
  projet: [
    { label: 'Dashboard',   to: '/projet',             icon: LayoutDashboard, end: true },
    { label: 'Pilotage & Contrôle', to: '/projet/pilotage', icon: Gauge, roles: PROJET_PILOTAGE_ROLES },
    { label: 'Charge de travail', to: '/projet/charge-travail', icon: Users, roles: PROJET_PILOTAGE_ROLES },
    { label: 'Projets',     to: '/projet/projets',     icon: FolderKanban, badgeKey: 'projetProjets' },
    { label: 'Tâches',      to: '/projet/taches',      icon: ListChecks, badgeKey: 'projetTaches' },
    { label: 'BTP',         to: '/projet/btp',         icon: HardHat, roles: ADMIN_VOLETS_ROLES },
    { label: 'Planning',    to: '/projet/planning',    icon: CalendarDays },
    { label: 'Documents',   to: '/projet/documents',   icon: Paperclip, badgeKey: 'projetDocuments' },
    { label: 'Galerie photos', to: '/projet/galerie',  icon: Images, badgeKey: 'projetGalerie' },
    { label: 'Dépenses',    to: '/projet/depenses',    icon: Wallet, badgeKey: 'projetDepenses', roles: PROJET_DEPENSES_ROLES },
    { label: 'Besoins',      to: '/projet/besoins',      icon: PackagePlus, badgeKey: 'projetBesoins' },
    // Ouvert à tout le monde, volontairement sans `roles` — n'importe qui doit pouvoir
    // proposer un projet ; seule l'administration approuve/rejette (dans l'écran lui-même).
    { label: 'Propositions', to: '/projet/propositions', icon: Lightbulb, badgeKey: 'projetPropositions' },
    { label: 'Matériel & Matériaux', to: '/projet/materiel', icon: Wrench, badgeKey: 'projetMateriel' },
    { label: 'Prestataires', to: '/projet/prestataires', icon: UserCircle },
    // `roles: ['agent']` en plus de `perm` : l'agent E-G.Pro voit cet onglet (en lecture
    // seule, cf. Partenaires.jsx → peutGerer) même sans la permission gerePartenaires,
    // qui reste nécessaire pour ajouter/modifier/supprimer un partenaire.
    { label: 'Partenaires', to: '/projet/partenaires', icon: Handshake, perm: 'partenaires', roles: ['agent'] },
    { label: 'Rapports',    to: '/projet/rapports',    icon: PieChart },
    { label: 'Journal et Historique', to: '/projet/journal', icon: BookOpen, roles: ADMIN_VOLETS_ROLES },
    { label: 'Paramètres',  to: '/projet/params',      icon: Settings, roles: ADMIN_VOLETS_ROLES }
  ],
  garderie: [
    { label: 'Tâches Routinières', to: '/garderie/routine',   icon: Repeat },
    { label: 'Dashboard',          to: '/garderie',           icon: LayoutDashboard, end: true },
    { label: 'Enfants inscrits',   to: '/garderie/enfants',   icon: Baby,            roles: [...FULL_ACCESS_ROLES,'gerant','gerante_garderie','superviseur','partenaire','tata'] },
    { label: 'Personnel / Tatas',  to: '/garderie/personnel', icon: Users,           roles: [...FULL_ACCESS_ROLES,'gerant','gerante_garderie'] },
    { label: 'Présences enfants',  to: '/garderie/presences', icon: CalendarCheck },
    { label: 'Paiements',          to: '/garderie/paiements', icon: CreditCard,      roles: [...FULL_ACCESS_ROLES,'gerant','gerante_garderie','superviseur','partenaire'] },
    { label: 'Cantine & Repas',    to: '/garderie/cantine',   icon: UtensilsCrossed },
    { label: 'Santé & Infirmerie', to: '/garderie/incidents', icon: Stethoscope },
    { label: 'Tâches',             to: '/garderie/taches',    icon: ListChecks },
    { label: 'Besoins',            to: '/garderie/besoins',   icon: PackagePlus,     badgeKey: 'garderieBesoins' },
    { label: 'Analyse & Pilotage', to: '/garderie/analyses',  icon: BarChart2,       roles: [...FULL_ACCESS_ROLES,'gerant','superviseur','partenaire'] },
    { label: 'Dépense', to: '/garderie/finances', icon: Scale,          roles: [...FULL_ACCESS_ROLES,'gerant','gerante_garderie','superviseur','partenaire','secretaire'] },
    { label: 'Partenaires',        to: '/garderie/partenaires', icon: Handshake,     perm: 'partenaires' },
    { label: 'Journal et Historique', to: '/garderie/journal', icon: BookOpen,       roles: ADMIN_VOLETS_ROLES },
    { label: 'Paramètres',         to: '/garderie/params',    icon: Settings,        roles: ADMIN_VOLETS_ROLES }
  ],
  depense: [
    { label: 'Dashboard',                    to: '/depense',              icon: LayoutDashboard, end: true },
    { label: 'Dépenses',                     to: '/depense/liste',        icon: Wallet, badgeKey: 'depenseDepenses' },
    { label: 'Budget',                       to: '/depense/recettes-depenses', icon: Scale, roles: FINANCE_VIEW_ROLES },
    { label: 'Sources de revenus',           to: '/depense/revenus',      icon: Coins,           roles: [...ADMIN_VOLETS_ROLES, 'secretaire'] },
    { label: 'Autorisation de décaissement', to: '/depense/autorisations', icon: Stamp },
    { label: 'Analyses',                     to: '/depense/analyses',     icon: BarChart2,       roles: [...FINANCE_VIEW_ROLES, 'agent'] },
    { label: 'Flux de trésorerie',           to: '/depense/flux',        icon: Waves,           roles: FINANCE_VIEW_ROLES },
    { label: 'Compte bancaire',              to: '/depense/banque',      icon: Landmark,        roles: FINANCE_VIEW_ROLES },
    { label: 'Partenaires',                  to: '/depense/partenaires',  icon: Handshake,       perm: 'partenaires' },
    { label: 'Journal et Historique',        to: '/depense/journal',      icon: BookOpen,        roles: ADMIN_VOLETS_ROLES },
    { label: 'Paramètres',                   to: '/depense/params',       icon: Settings,        roles: ADMIN_VOLETS_ROLES }
  ]
}

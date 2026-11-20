// RH : volets regroupés en onglets (étape 1 de la simplification du menu). Chaque groupe est UNE entrée du menu latéral ;
// ses volets restent des pages à part entière (mêmes adresses), reliées par la barre d'onglets de RhOnglets.
import {
  UserCircle, Factory, ClipboardList, Users, CalendarDays, CalendarCheck, Receipt, BarChart2, Settings,
  FileText, Repeat, Tag, Send, BookOpen, Gauge, TrendingUp, Plane, Handshake, Clock3, ShieldCheck, CalendarHeart, Package, Gift, HandCoins
} from 'lucide-react'

export const GROUPES_RH = [
  {
    id: 'equipe',
    onglets: [
      { to: '/rh/employes', label: 'Annuaire', icone: UserCircle },
      { to: '/rh/departements', label: 'Départements', icone: Factory },
      { to: '/rh/postes', label: 'Postes', icone: ClipboardList },
      { to: '/rh/organigramme', label: 'Organigramme', icone: Users }
    ]
  },
  {
    id: 'paie',
    onglets: [
      { to: '/rh/paie', label: 'Bulletins', icone: Receipt },
      { to: '/rh/etat-salaires', label: 'État des salaires', icone: BarChart2 },
      { to: '/rh/autorisations-salaire', label: 'Autorisation de salaire', icone: ShieldCheck }
    ]
  }
]

// Étape 2 : contrats et dossiers, recrutement, développement, missions.
GROUPES_RH.push(
  {
    id: 'contrats',
    onglets: [
      { to: '/rh/contrats', label: 'Contrats', icone: FileText },
      { to: '/rh/onboarding', label: 'Arrivées et départs', icone: Repeat },
      { to: '/rh/titres-badges', label: 'Diplômes et badges', icone: Tag }
    ]
  },
  {
    id: 'recrutement',
    onglets: [
      { to: '/rh/recrutement', label: 'Offres', icone: Send },
      { to: '/rh/formulaires', label: 'Candidatures et formulaires', icone: ClipboardList }
    ]
  },
  {
    id: 'developpement',
    onglets: [
      { to: '/rh/formations', label: 'Formations', icone: BookOpen },
      { to: '/rh/evaluations', label: 'Évaluations', icone: Gauge },
      { to: '/rh/competences', label: 'Compétences', icone: TrendingUp }
    ]
  },
  {
    id: 'primesavances',
    onglets: [
      { to: '/rh/primes', label: 'Primes', icone: Gift },
      { to: '/rh/avances', label: 'Avances et prêts', icone: HandCoins }
    ]
  },
  {
    id: 'missions',
    onglets: [
      { to: '/rh/missions', label: 'Missions et frais', icone: Plane }
    ]
  },
  // Étape 3 : vie d'équipe, et Paramètres RH (réglages réservés à l'administration, sortis des volets de travail).
  {
    id: 'vie',
    onglets: [
      { to: '/rh/anniversaires', label: 'Anniversaires', icone: CalendarHeart },
      { to: '/rh/dotations', label: 'Dotations', icone: Package }
    ]
  },
  {
    id: 'parametres',
    onglets: [
      { to: '/rh/paie-configuration', label: 'Paie', icone: Receipt },
      { to: '/rh/missions-configuration', label: 'Missions', icone: Plane },
      { to: '/rh/primes-configuration', label: 'Primes', icone: Gift },
      { to: '/rh/presences-configuration', label: 'Présences', icone: Clock3 },
      { to: '/rh/conges-configuration', label: 'Congés', icone: CalendarDays },
      { to: '/rh/rattachements', label: 'Comptes', icone: Handshake }
    ]
  }
)

export const cheminsDuGroupe = (id) => (GROUPES_RH.find((g) => g.id === id)?.onglets || []).map((o) => o.to)
export const groupeDeChemin = (pathname) => GROUPES_RH.find((g) => g.onglets.some((o) => pathname === o.to || pathname.startsWith(o.to + '/')))

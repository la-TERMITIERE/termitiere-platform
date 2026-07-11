// Référentiel central des rôles de la plateforme La Termitière.
//
// Hiérarchie (du plus large au plus restreint) :
//   super_admin → pau → ge → superviseur (lecture seule) → gerant → agent
//
// Workflow d'autorisation à DEUX niveaux :
//   - APPROVER_ROLES  : approuvent une demande (1er niveau)
//   - CERTIFIER_ROLES : certifient l'approbation (2e niveau, définitif)
//
// Les anciens rôles `admin` et `controleur` (déploiements existants) restent
// pris en charge : `admin` est traité comme accès total, `controleur` comme
// approbateur — d'où leur présence dans les groupes ci-dessous.

export const ROLES = [
  { value: 'super_admin',      label: 'Super-admin',       desc: 'Concepteur — contrôle total + technique' },
  { value: 'pau',              label: 'PAU',               desc: 'Direction — contrôle total sur les applications' },
  { value: 'ge',               label: 'Gérante exécutive', desc: 'Accès total + certifie les autorisations' },
  { value: 'directeur',        label: 'Directeur / Directrice', desc: 'Direction — accès total à tous les modules' },
  { value: 'superviseur',      label: 'Superviseur',       desc: 'Consulte tout (lecture seule) — aucune action' },
  { value: 'gerant',           label: 'Gérant',            desc: 'Approuve les sorties et les demandes' },
  { value: 'agent',            label: 'Agent',             desc: 'Saisie des données + demandes d\'autorisation' },
  { value: 'gerante_garderie', label: 'Gérante Garderie',  desc: 'Gestion complète de la garderie (sauf paramètres, journal et analyses)' },
  { value: 'tata',             label: 'Tata',              desc: 'Personnel de terrain garderie — présences, cantine, incidents' },
  { value: 'secretaire',       label: 'Secrétaire',        desc: 'Administratif — E-G.Pro complet sauf Pilotage, Journal et Paramètres' },
  { value: 'chef_projet',    label: 'Chef de projet',  desc: 'E-G.Pro — accès complet, limité aux projets dont il est responsable ou collaborateur ; pas de Pilotage ni de suppression' },
]

// Accès total : tous modules + pages Paramètres + gestion des utilisateurs + actions.
export const FULL_ACCESS_ROLES = ['super_admin', 'pau', 'ge', 'directeur', 'admin']
// Voit TOUS les modules (full access + superviseur en lecture seule).
export const VIEW_ALL_ROLES = ['super_admin', 'pau', 'ge', 'directeur', 'admin', 'superviseur']
// 1er niveau d'approbation d'une demande de sortie (le superviseur n'approuve pas).
export const APPROVER_ROLES = ['super_admin', 'pau', 'ge', 'directeur', 'gerant', 'admin', 'controleur']
// 2e niveau : certification définitive (déclenche l'effet métier).
export const CERTIFIER_ROLES = ['super_admin', 'pau', 'ge', 'directeur', 'admin']

// Rôles autorisés à voir les données FINANCIÈRES (chiffre d'affaires, montants)
// et le menu « Pilotage & Analyses ». = toute la hiérarchie SAUF l'agent de saisie.
export const FINANCE_VIEW_ROLES = ['super_admin', 'pau', 'ge', 'directeur', 'admin', 'superviseur', 'gerant', 'controleur']

// E-G.Pro : volet Paramètres — tout le monde SAUF la secrétaire/l'agent (administratif)
// et le chef de projet (terrain).
export const PROJET_VOLETS_RESTREINTS_ROLES = ROLES.map((r) => r.value)
  .filter((v) => !['secretaire', 'agent', 'chef_projet'].includes(v))
  .concat(['admin', 'controleur'])

// E-G.Pro : volet Pilotage & Contrôle — vue stratégique, tout le monde SAUF la
// secrétaire/l'agent (administratif) et le chef de projet (terrain, cloisonné à ses projets).
export const PROJET_PILOTAGE_ROLES = ROLES.map((r) => r.value)
  .filter((v) => !['secretaire', 'agent', 'chef_projet'].includes(v))
  .concat(['admin', 'controleur'])

// E-G.Pro : volet Journal — historique global des actions, en lecture seule pour
// tout le monde SAUF le chef de projet (terrain) et la secrétaire. La secrétaire
// est exclue volontairement : ce volet trace notamment son niveau de fiabilité
// (saisies, corrections…) et elle ne doit pas pouvoir consulter ce suivi sur elle-même.
export const PROJET_JOURNAL_ROLES = ROLES.map((r) => r.value)
  .filter((v) => !['chef_projet', 'secretaire'].includes(v))
  .concat(['admin', 'controleur'])

// E-G.Pro : rôles dont la visibilité des projets est cloisonnée — ne voient que les
// projets dont ils sont désignés « Responsable » (p.responsableUid) ou « Collaborateur »
// (p.collaborateurs[]) (cf. logic.js → projetsVisibles).
export const PROJET_ROLES_CLOISONNES = ['chef_projet']

// E-G.Pro : volet Dépenses — accès complet à tous les rôles E-G.Pro.
export const PROJET_DEPENSES_ROLES = ROLES.map((r) => r.value)
  .concat(['admin', 'controleur'])

// Gestion des « Partenaires » (contacts externes : vétérinaires, techniciens,
// prestataires… — PAS des employés). Réservée aux rôles à accès total ET à tout
// utilisateur interne à qui la direction a explicitement « donné la main »
// (champ `gerePartenaires` du profil). L'onglet n'apparaît que pour ces personnes.
export const canManagePartenaires = (role, user) =>
  FULL_ACCESS_ROLES.includes(role) || user?.gerePartenaires === true

export const isFullAccessRole  = (r) => FULL_ACCESS_ROLES.includes(r)
export const isViewAllRole     = (r) => VIEW_ALL_ROLES.includes(r)
export const isApproverRole    = (r) => APPROVER_ROLES.includes(r)
export const isCertifierRole   = (r) => CERTIFIER_ROLES.includes(r)
export const canViewFinance    = (r) => FINANCE_VIEW_ROLES.includes(r)
export const canViewPilotage   = (r) => FINANCE_VIEW_ROLES.includes(r)

// Rôles garderie
export const isGeranteGarderie = (r) => r === 'gerante_garderie'
export const isTata            = (r) => r === 'tata'
export const isRoleGarderie    = (r) => ['gerante_garderie', 'tata'].includes(r)

// Droits garderie détaillés
export const garderieCanEdit   = (r) => !['tata', 'superviseur'].includes(r) || FULL_ACCESS_ROLES.includes(r)
export const garderieCanManage = (r) => [...FULL_ACCESS_ROLES, 'gerante_garderie'].includes(r)

const LEGACY_LABEL = { admin: 'Administrateur', controleur: 'Contrôleur' }

export const roleLabel = (r) =>
  ROLES.find((x) => x.value === r)?.label || LEGACY_LABEL[r] || r || '—'

// Ton de badge (cf. shared/ui/Badge) selon le niveau du rôle.
export const roleTone = (r) => {
  if (FULL_ACCESS_ROLES.includes(r)) return 'primary'
  if (r === 'superviseur') return 'info'
  if (r === 'gerant' || r === 'controleur') return 'info'
  if (r === 'gerante_garderie') return 'warning'
  if (r === 'tata') return 'success'
  return 'neutral'
}

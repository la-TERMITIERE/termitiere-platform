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
  { value: 'chef_projet',    label: 'Chef de projet',  desc: 'Terrain E-G.Pro — tâches, dépenses, photos, planning, rapports ; projets en consultation seule' },
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

// E-G.Pro : volets Pilotage & Contrôle / Journal / Paramètres — tout le monde SAUF
// la secrétaire (administratif) et le chef de projet (terrain).
export const PROJET_VOLETS_RESTREINTS_ROLES = ROLES.map((r) => r.value)
  .filter((v) => !['secretaire', 'chef_projet'].includes(v))
  .concat(['admin', 'controleur'])

// E-G.Pro : volet Alertes — tout le monde SAUF le chef de projet (la secrétaire y a accès).
export const PROJET_ALERTES_ROLES = ROLES.map((r) => r.value)
  .filter((v) => v !== 'chef_projet')
  .concat(['admin', 'controleur'])

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

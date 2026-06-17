// Référentiel central des rôles de la plateforme La Termitière.
//
// Hiérarchie (du plus large au plus restreint) :
//   super_admin → pdg → ge → gerant → agent
//
// Workflow d'autorisation à DEUX niveaux :
//   - APPROVER_ROLES  : approuvent une demande (1er niveau)
//   - CERTIFIER_ROLES : certifient l'approbation (2e niveau, définitif)
//
// Les anciens rôles `admin` et `controleur` (déploiements existants) restent
// pris en charge : `admin` est traité comme accès total, `controleur` comme
// approbateur — d'où leur présence dans les groupes ci-dessous.

export const ROLES = [
  { value: 'super_admin', label: 'Super-admin', desc: 'Concepteur — contrôle total + technique' },
  { value: 'pdg', label: 'PDG', desc: 'Direction — contrôle total sur les applications' },
  { value: 'ge', label: 'Gérante exécutive', desc: 'Accès total + certifie les autorisations' },
  { value: 'gerant', label: 'Gérant', desc: 'Approuve les sorties et les demandes' },
  { value: 'agent', label: 'Agent', desc: 'Saisie des données + demandes d\'autorisation' }
]

// Accès total à tous les modules + pages Paramètres + gestion des utilisateurs.
export const FULL_ACCESS_ROLES = ['super_admin', 'pdg', 'ge', 'admin']
// 1er niveau d'approbation d'une demande de sortie.
export const APPROVER_ROLES = ['super_admin', 'pdg', 'ge', 'gerant', 'admin', 'controleur']
// 2e niveau : certification définitive (déclenche l'effet métier).
export const CERTIFIER_ROLES = ['super_admin', 'pdg', 'ge', 'admin']

export const isFullAccessRole = (r) => FULL_ACCESS_ROLES.includes(r)
export const isApproverRole = (r) => APPROVER_ROLES.includes(r)
export const isCertifierRole = (r) => CERTIFIER_ROLES.includes(r)

const LEGACY_LABEL = { admin: 'Administrateur', controleur: 'Contrôleur' }

export const roleLabel = (r) =>
  ROLES.find((x) => x.value === r)?.label || LEGACY_LABEL[r] || r || '—'

// Ton de badge (cf. shared/ui/Badge) selon le niveau du rôle.
export const roleTone = (r) => {
  if (FULL_ACCESS_ROLES.includes(r)) return 'primary'
  if (r === 'gerant' || r === 'controleur') return 'info'
  return 'neutral'
}

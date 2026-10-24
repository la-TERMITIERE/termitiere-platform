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
  { value: 'super_admin',      label: 'Super-admin',       desc: 'Concepteur : contrôle total + technique' },
  { value: 'info',             label: 'Info',              desc: 'Informatique : accès total, comme un administrateur' },
  { value: 'assistant_pau',    label: 'Assistant PAU',     desc: 'Assiste le PAU : accès total, comme Info' },
  { value: 'pau',              label: 'PAU',               desc: 'Direction : contrôle total sur les applications' },
  { value: 'ge',               label: 'Gérante exécutive', desc: 'Accès total + certifie les autorisations' },
  { value: 'df',               label: 'DF',                desc: 'Directeur financier : mêmes droits que la Gérante exécutive' },
  { value: 'directeur',        label: 'Directeur / Directrice', desc: 'Direction : accès total à tous les modules' },
  { value: 'superviseur',      label: 'Superviseur',       desc: 'Lecture seule : voit uniquement les modules qui lui sont attribués, aucune action' },
  { value: 'gerant',           label: 'Gérant',            desc: 'Approuve les sorties et les demandes' },
  { value: 'agent',            label: 'Agent',             desc: 'Saisie des données + demandes d\'autorisation' },
  { value: 'gerante_garderie', label: 'Gérante Garderie',  desc: 'Gestion complète de la garderie (sauf paramètres et journal)' },
  { value: 'tata',             label: 'Tata',              desc: 'Personnel de terrain garderie : présences, cantine, incidents' },
  { value: 'secretaire',       label: 'Secrétaire',        desc: 'Administratif : E-G.Pro complet sauf Pilotage, Journal et Paramètres' },
  { value: 'chef_projet',    label: 'Chef de projet',  desc: 'E-G.Pro : accès complet, limité aux projets dont il est responsable ou collaborateur ; pas de Pilotage ni de suppression' },
  { value: 'partenaire',       label: 'Partenaire',        desc: 'Externe : lecture seule sur SES modules uniquement (sectorisé) ; voit le pilotage, ne modifie rien' },
]

// Accès total : tous modules + pages Paramètres + gestion des utilisateurs + actions.
// `info` (informatique) a les mêmes droits qu'un administrateur. `assistant_pau`
// a exactement les mêmes droits qu'`info` (décision explicite : assiste le PAU).
export const FULL_ACCESS_ROLES = ['super_admin', 'info', 'assistant_pau', 'pau', 'ge', 'df', 'directeur', 'admin']
// Voit TOUS les modules automatiquement, sans attribution individuelle.
// Le superviseur N'EN FAIT PAS PARTIE (décision explicite du 07/09/2026) : bien
// qu'il soit en lecture seule partout (cf. READONLY_ROLES), il ne voit que les
// modules qui lui sont explicitement attribués (comme le partenaire) — c'est
// à l'administration (PAU/Info/GE…) de lui donner accès module par module
// depuis Utilisateurs, pas un accès automatique à tout.
export const VIEW_ALL_ROLES = ['super_admin', 'info', 'assistant_pau', 'pau', 'ge', 'df', 'directeur', 'admin']

// Modules à visibilité RESTREINTE par rôle : même attribué à un utilisateur, un
// module listé ici n'est accessible qu'aux rôles indiqués (contrôle appliqué dans
// hasModule → couvre le portail, la barre latérale ET la garde de route).
export const MODULE_ROLES = {
  voyage: FULL_ACCESS_ROLES // E-VOYAGE : réservé aux admins, au PAU et à la GE
}
export const moduleRoleOk = (mod, role) => !MODULE_ROLES[mod] || MODULE_ROLES[mod].includes(role)
// 1er niveau d'approbation d'une demande de sortie (le superviseur n'approuve pas).
export const APPROVER_ROLES = ['super_admin', 'info', 'assistant_pau', 'pau', 'ge', 'df', 'directeur', 'gerant', 'admin', 'controleur']
// 2e niveau : certification définitive (déclenche l'effet métier).
export const CERTIFIER_ROLES = ['super_admin', 'info', 'assistant_pau', 'pau', 'ge', 'df', 'directeur', 'admin']

// Rôles autorisés à voir les données FINANCIÈRES (chiffre d'affaires, montants)
// et le menu « Pilotage & Analyses ». = toute la hiérarchie SAUF l'agent de saisie.
// Le PARTENAIRE (externe, lecture seule) voit aussi le pilotage — mais uniquement
// sur les modules qui lui sont attribués (sectorisation par `modules`).
// La SECRÉTAIRE y a explicitement accès (décision plateforme) : elle voit les
// montants et les KPI partout où ils interviennent, mais ne valide jamais seule au
// niveau final (cf. CERTIFIER_ROLES, dont elle reste exclue) et ne voit jamais
// l'identité de qui a validé (cf. `logistiqueVoitValidateur`, réutilisé hors logistique).
export const FINANCE_VIEW_ROLES = ['super_admin', 'info', 'assistant_pau', 'pau', 'ge', 'df', 'directeur', 'admin', 'superviseur', 'gerant', 'controleur', 'partenaire', 'secretaire']

// Volet « Analyses » d'E-DÉPENSES — décision explicite du 09/09/2026 : la
// secrétaire garde Flux de trésorerie (FINANCE_VIEW_ROLES, inchangé) mais PAS
// Analyses. Dérivé de FINANCE_VIEW_ROLES (sans secretaire) + agent, plutôt qu'une
// liste recopiée à la main, pour rester aligné si FINANCE_VIEW_ROLES change.
export const ANALYSES_DEPENSE_ROLES = [...FINANCE_VIEW_ROLES.filter((r) => r !== 'secretaire'), 'agent']
export const canViewAnalysesDepense = (r) => ANALYSES_DEPENSE_ROLES.includes(r)

// Export Excel des listes de RECETTES (factures, sources de revenus…) — volontairement
// restreint à PAU/GE/Info UNIQUEMENT (décision explicite du 05/09/2026) : ni le reste
// de la direction (super_admin, admin, directeur, assistant_pau), ni la hiérarchie
// opérationnelle (gérant, contrôleur…) n'y ont accès, contrairement à FULL_ACCESS_ROLES
// et FINANCE_VIEW_ROLES ci-dessus qui sont donc impropres à cet usage précis.
export const EXCEL_EXPORT_ROLES = ['pau', 'ge', 'df', 'info']
export const canExportExcel = (r) => EXCEL_EXPORT_ROLES.includes(r)

// MAXI-GYM : décision explicite — l'agent a aussi accès aux exports (Excel/PDF)
// du module, en plus de EXCEL_EXPORT_ROLES ci-dessus. Propre à gym, ne touche
// pas la règle globale canExportExcel réutilisée ailleurs.
export const canExportGym = (r) => canExportExcel(r) || r === 'agent'

// Volet « Compte bancaire » (par secteur : MAXI-AGRO, MAXI LOGISTIQUE, MAXI-GYM,
// E-GARDERIE) — réservé UNIQUEMENT à PAU, Assistant PAU, GE et Info (décision
// explicite du 05/09/2026) : ni le reste de la direction (super_admin, admin,
// directeur), ni la hiérarchie opérationnelle n'y ont accès. Différent de
// EXCEL_EXPORT_ROLES ci-dessus (qui inclut PAU/GE/Info mais PAS Assistant PAU) —
// à ne pas fusionner, ce sont deux décisions distinctes.
export const BANQUE_ROLES = ['pau', 'assistant_pau', 'ge', 'df', 'info']
export const peutVoirBanque = (r) => BANQUE_ROLES.includes(r)

// Volet « BTP » d'E-G.Pro — réservé UNIQUEMENT à PAU, Assistant PAU, GE et Info
// (décision explicite du 07/09/2026) : ni le reste de la direction (super_admin,
// admin, directeur), ni la hiérarchie opérationnelle n'y ont accès. Même liste
// que BANQUE_ROLES mais gardée comme constante à part (deux décisions distinctes,
// susceptibles de diverger plus tard — ne pas fusionner).
export const BTP_ROLES = ['pau', 'assistant_pau', 'ge', 'df', 'info']
export const peutVoirBtp = (r) => BTP_ROLES.includes(r)

// Graphique « Chiffre d'affaires par mois » du Dashboard Logistique : PAU, Assistant PAU, GE et Info seulement.
export const CA_MENSUEL_ROLES = ['pau', 'assistant_pau', 'ge', 'df', 'info']
export const peutVoirCaMensuel = (r) => CA_MENSUEL_ROLES.includes(r)

// Rôles en LECTURE SEULE stricte : consultent, n'écrivent JAMAIS.
//   - superviseur : interne, voit TOUS les modules ;
//   - partenaire  : externe, voit UNIQUEMENT ses modules attribués (sectorisé).
export const READONLY_ROLES = ['superviseur', 'partenaire']
export const isReadOnlyRole = (r) => READONLY_ROLES.includes(r)

// MAXI-GYM (décision du 16/10/2026, étendue à l'Assistant PAU) : seuls les AGENTS (réception), INFO et l'ASSISTANT PAU écrivent
// dans ce module ; tous les autres profils y sont en lecture seule. Le verrou est posé dans db.js (collections `gym_*`) ; l'affichage suit ces règles.
//   - peutEcrireGym : enregistrer, modifier, pointer, renouveler ;
//   - peutPurgerClientGym : supprimer un client dont l'abonnement est terminé (les agents y ont droit) ;
//   - peutAdministrerGym : suppressions ordinaires, forfaits, règlements : Info et Assistant PAU (un agent ne supprime jamais).
// ── Droits par module (réglés dans Paramètres, Utilisateurs) ──────────────────────────────────────────────────────────
// Chaque compte peut être limité à la LECTURE sur un module donné (`droitsModules[module] = 'lecture'`) ; sans réglage, il garde
// l'écriture (CRUD) que son rôle lui donne. Le verrou est posé dans db.js, sur le préfixe de la collection (`gym_*` → gym).
const PREFIXE_MODULE = { agro: 'agro', logistique: 'logistique', evenementiel: 'evenementiel', foncier: 'foncier', garderie: 'garderie', compta: 'comptabilite', rh: 'rh', projet: 'projet', projets: 'projet', depense: 'depense', gym: 'gym', voyage: 'voyage' }
export const moduleDeCollection = (collection) => PREFIXE_MODULE[String(collection || '').split('_')[0]] || null
// `droitsModules[module]` : absent = tout est permis (selon le rôle) ; 'lecture' = rien d'autre que lire ; ou un objet qui ne liste que
// les actions REFUSÉES, par exemple { supprimer: false, modifier: false }. Lire est le socle : le retirer, c'est retirer le module.
export const ACTIONS_DROIT = ['creer', 'modifier', 'supprimer']
export const actionAutorisee = (droitsModules, moduleId, action) => {
  const d = droitsModules?.[moduleId]
  if (!d) return true
  if (d === 'lecture') return false
  return d[action] !== false
}
export const moduleEnLecture = (droitsModules, moduleId) => !!moduleId && ACTIONS_DROIT.every((a) => !actionAutorisee(droitsModules, moduleId, a))

// ── Retraits individuels (Utilisateurs, fiche d'accès) ──────────────────────────────────────────────────────────────────
// Info peut retirer à un compte un module ENTIER (`modulesRetires`, utile pour les rôles « voit tout ») ou seulement certains
// volets d'un module (`voletsRetires = { module: ['/chemin/du/volet'] }`). Le retrait s'ajoute aux limites du rôle, il ne les lève jamais.
export const moduleRetire = (user, moduleId) => Array.isArray(user?.modulesRetires) && user.modulesRetires.includes(moduleId)
export const voletRetire = (user, moduleId, to) => Array.isArray(user?.voletsRetires?.[moduleId]) && user.voletsRetires[moduleId].includes(to)

export const GYM_ECRITURE_ROLES = ['agent', 'info', 'assistant_pau']
export const peutEcrireGym = (r) => GYM_ECRITURE_ROLES.includes(r)
export const peutPurgerClientGym = (r) => GYM_ECRITURE_ROLES.includes(r)
// Le rôle seul impose la lecture sur ce module (superviseur, partenaire ; MAXI-GYM hors agent / Info / Assistant PAU) : le réglage
// individuel n'y change rien, l'écran des utilisateurs le verrouille donc sur « Lecture seule ».
export const lectureImposeeParRole = (role, moduleId) => isReadOnlyRole(role) || (moduleId === 'gym' && !GYM_ECRITURE_ROLES.includes(role))
// Ce que le rôle interdit déjà, quel que soit le réglage individuel : un agent ne supprime jamais, et les profils en lecture seule ne modifient rien.
export const actionImposeeInterdite = (role, moduleId, action) => lectureImposeeParRole(role, moduleId) || (action === 'supprimer' && role === 'agent')
export const peutAdministrerGym = (r) => r === 'info' || r === 'assistant_pau'
// Corriger une erreur de saisie sur un abonnement (donc sa facture) : les agents peuvent le MODIFIER ; Info et l'administration
// (PAU, GE, DF, Assistant PAU) peuvent le MODIFIER et le SUPPRIMER. Droit limité aux collections `gym_abonnements` et `gym_factures`
// (le reste de MAXI-GYM reste en lecture pour PAU, GE et DF) ; un agent ne supprime jamais.
export const GYM_CORRECTION_ADMIN_ROLES = ['pau', 'ge', 'df', 'info', 'assistant_pau']
export const peutModifierAbonnementGym = (r) => peutEcrireGym(r) || GYM_CORRECTION_ADMIN_ROLES.includes(r)
export const peutSupprimerAbonnementGym = (r) => GYM_CORRECTION_ADMIN_ROLES.includes(r)
export const estCollectionCorrectionGym = (collection) => collection === 'gym_abonnements' || collection === 'gym_factures'
// Écriture permise sur une collection `gym_*` (hors banque) : agents, Info, Assistant PAU, et la correction d'abonnement pour l'administration.
export const peutEcrireCollectionGym = (r, collection) => peutEcrireGym(r) || (estCollectionCorrectionGym(collection) && peutModifierAbonnementGym(r))

// E-G.Pro : volet Pilotage & Contrôle — vue stratégique, tout le monde SAUF la
// secrétaire/l'agent (administratif) et le chef de projet (terrain, cloisonné à ses projets).
export const PROJET_PILOTAGE_ROLES = ROLES.map((r) => r.value)
  .filter((v) => !['secretaire', 'agent', 'chef_projet'].includes(v))
  .concat(['admin', 'controleur'])

// Volets « Journal et Historique » et « Paramètres » — réservés à l'administration
// (super-admin, PAU, GE, directeur/directrice, admin) dans TOUS les modules. Tout le
// reste de la hiérarchie (gérant, superviseur, contrôleur, chefs de projet, secrétaires,
// agents, partenaires…) en est exclu : ces volets tracent l'activité de tous, y compris
// la leur, et exposent la configuration sensible du module.
// L'Assistant PAU en est EXCLU (décision explicite du 02/10/2026) : malgré son accès
// total ailleurs, il ne voit ni le Journal/Historique ni les Paramètres d'aucun module.
export const ADMIN_VOLETS_ROLES = FULL_ACCESS_ROLES.filter((r) => r !== 'assistant_pau')
export const peutVoirVoletsAdmin = (r) => ADMIN_VOLETS_ROLES.includes(r)

// MAXI LOGISTIQUE : rôles qui ne doivent voir AUCUN montant (tarifs, totaux, frais,
// dépenses). Historiquement la secrétaire en était privée — accès explicitement
// accordé depuis (cf. Factures.jsx/Prestations.jsx qui l'ajoutent en plus de ce
// groupe), cette liste ne sert donc plus qu'aux rôles encore restreints.
export const LOGISTIQUE_SANS_MONTANT_ROLES = []
export const logistiqueVoitMontants = (r) => !LOGISTIQUE_SANS_MONTANT_ROLES.includes(r)

// Réutilisé pour TOUTES les demandes de sortie de la plateforme (Maxi-Agro, Maxi
// Logistique, E-Briqueterie — nom conservé pour compatibilité) : la secrétaire voit
// les montants mais pas QUI a approuvé/certifié une demande, une facture ou une
// prestation (juste le fait que c'est approuvé) — l'identité du validateur reste
// réservée aux gérants/direction.
export const logistiqueVoitValidateur = (r) => r !== 'secretaire'

// Réutilisé pour TOUTES les demandes de sortie de la plateforme (nom conservé pour
// compatibilité) : la secrétaire approuve au 1er niveau (comme un `gerant`), mais
// ne certifie jamais — la certification a un impact définitif (CA, décompte stock)
// et reste donc à la direction (CERTIFIER_ROLES). Ne pas l'ajouter à APPROVER_ROLES
// directement : cela lui donnerait aussi les pouvoirs de gestion complète attachés
// à `canManage()` (retours, écarts, correctifs…), au-delà de la simple validation
// d'une demande en attente.
export const logistiquePeutApprouver = (r) => isApproverRole(r) || r === 'secretaire'

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

// E-DÉPENSES : par décision explicite, super_admin/admin/directeur sont ramenés au
// niveau d'un AGENT dans ce module précis (visibilité financière, fenêtre de saisie
// à 2 mois, Journal/Paramètres, approbation des décaissements…) — seuls pau, ge,
// info et assistant_pau y gardent l'accès complet. `depenseRoleEffectif` substitue
// le rôle réel par 'agent' pour ces trois-là ; tout le reste du code d'E-DÉPENSES
// continue de lire un simple `role` et se comporte donc correctement sans
// modification supplémentaire.
export const DEPENSE_ROLES_LIMITES = ['super_admin', 'admin', 'directeur']
export const depenseRoleEffectif = (r) => (DEPENSE_ROLES_LIMITES.includes(r) ? 'agent' : r)

// Gestion des utilisateurs (création, modification, droits) : réservée au PAU, au DF, à la GE, à Info et à l'Administrateur.
// Personne d'autre n'y accède, pas même les autres rôles à accès total.
export const GESTION_UTILISATEURS_ROLES = ['pau', 'df', 'ge', 'info', 'admin']
export const peutGererUtilisateurs = (r) => GESTION_UTILISATEURS_ROLES.includes(r)
// Les comptes du rôle Info n'existent que pour Info : personne d'autre ne les voit, ni le rôle dans les listes.
export const profilVisible = (roleDeLObservateur, profil) => profil?.role !== 'info' || roleDeLObservateur === 'info'

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
export const garderieCanEdit   = (r) => !['tata', 'superviseur', 'partenaire'].includes(r) || FULL_ACCESS_ROLES.includes(r)
export const garderieCanManage = (r) => [...FULL_ACCESS_ROLES, 'gerante_garderie'].includes(r)

const LEGACY_LABEL = { admin: 'Administrateur', controleur: 'Contrôleur' }

export const roleLabel = (r) =>
  ROLES.find((x) => x.value === r)?.label || LEGACY_LABEL[r] || r || '—'

// Ton de badge (cf. shared/ui/Badge) selon le niveau du rôle.
export const roleTone = (r) => {
  if (FULL_ACCESS_ROLES.includes(r)) return 'primary'
  if (r === 'superviseur') return 'info'
  if (r === 'partenaire') return 'warning'
  if (r === 'gerant' || r === 'controleur') return 'info'
  if (r === 'gerante_garderie') return 'warning'
  if (r === 'tata') return 'success'
  return 'neutral'
}

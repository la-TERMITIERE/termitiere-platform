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
  { value: 'directeur',        label: 'Directeur / Directrice', desc: 'Direction : voit tous les modules, en lecture seule par défaut (Info lui accorde l\'écriture module par module)' },
  { value: 'rh',               label: 'RH (Ressources humaines)', desc: 'Mêmes droits que le Directeur (lecture seule par défaut), avec tous les droits sur le module Ressources humaines' },
  { value: 'superviseur',      label: 'Superviseur',       desc: 'Lecture seule : voit uniquement les modules qui lui sont attribués, aucune action' },
  { value: 'gerant',           label: 'Gérant',            desc: 'Approuve les sorties et les demandes' },
  { value: 'agent',            label: 'Agent',             desc: 'Saisie des données + demandes d\'autorisation' },
  { value: 'gerante_garderie', label: 'Gérante Garderie',  desc: 'Gestion complète de la garderie (sauf paramètres et journal)' },
  { value: 'tata',             label: 'Tata',              desc: 'Personnel de terrain garderie : présences, cantine, incidents' },
  { value: 'secretaire',       label: 'Secrétaire',        desc: 'Administratif : E-G.Pro complet sauf Pilotage, Journal et Paramètres' },
  { value: 'assistant_comptable', label: 'Assistant(e) comptable', desc: 'Mêmes droits que la Secrétaire' },
  { value: 'assistant_ge',     label: 'Assistant(e) GE',   desc: 'Cumule les droits de l\'Agent et de la Secrétaire ; tableau de bord global sans aucun montant, avec ses exports' },
  { value: 'chef_projet',    label: 'Chef de projet',  desc: 'E-G.Pro : accès complet, limité aux projets dont il est responsable ou collaborateur ; pas de Pilotage ni de suppression' },
  { value: 'partenaire',       label: 'Partenaire',        desc: 'Externe : lecture seule sur SES modules uniquement (sectorisé) ; voit le pilotage, ne modifie rien' },
]

// Accès total : tous modules + pages Paramètres + gestion des utilisateurs + actions.
// `info` (informatique) a les mêmes droits qu'un administrateur. `assistant_pau`
// a exactement les mêmes droits qu'`info` (décision explicite : assiste le PAU).
export const FULL_ACCESS_ROLES = ['super_admin', 'info', 'assistant_pau', 'pau', 'ge', 'df', 'directeur', 'rh', 'admin']
// Voit TOUS les modules automatiquement, sans attribution individuelle.
// Le superviseur N'EN FAIT PAS PARTIE (décision explicite du 07/09/2026) : bien
// qu'il soit en lecture seule partout (cf. READONLY_ROLES), il ne voit que les
// modules qui lui sont explicitement attribués (comme le partenaire) — c'est
// à l'administration (PAU/Info/GE…) de lui donner accès module par module
// depuis Utilisateurs, pas un accès automatique à tout.
export const VIEW_ALL_ROLES = ['super_admin', 'info', 'assistant_pau', 'pau', 'ge', 'df', 'directeur', 'rh', 'admin']

// Modules à visibilité RESTREINTE par rôle : même attribué à un utilisateur, un
// module listé ici n'est accessible qu'aux rôles indiqués (contrôle appliqué dans
// hasModule → couvre le portail, la barre latérale ET la garde de route).
export const MODULE_ROLES = {}
export const moduleRoleOk = (mod, role) => !MODULE_ROLES[mod] || MODULE_ROLES[mod].includes(role)
// 1er niveau d'approbation d'une demande de sortie (le superviseur n'approuve pas).
export const APPROVER_ROLES = ['super_admin', 'info', 'assistant_pau', 'pau', 'ge', 'df', 'directeur', 'rh', 'gerant', 'admin', 'controleur']
// 2e niveau : certification définitive (déclenche l'effet métier).
export const CERTIFIER_ROLES = ['super_admin', 'info', 'assistant_pau', 'pau', 'ge', 'df', 'directeur', 'rh', 'admin']

// Rôles autorisés à voir les données FINANCIÈRES (chiffre d'affaires, montants)
// et le menu « Pilotage & Analyses ». = toute la hiérarchie SAUF l'agent de saisie.
// Le PARTENAIRE (externe, lecture seule) voit aussi le pilotage — mais uniquement
// sur les modules qui lui sont attribués (sectorisation par `modules`).
// La SECRÉTAIRE y a explicitement accès (décision plateforme) : elle voit les
// montants et les KPI partout où ils interviennent, mais ne valide jamais seule au
// niveau final (cf. CERTIFIER_ROLES, dont elle reste exclue) et ne voit jamais
// l'identité de qui a validé (cf. `logistiqueVoitValidateur`, réutilisé hors logistique).
export const FINANCE_VIEW_ROLES = ['super_admin', 'info', 'assistant_pau', 'pau', 'ge', 'df', 'directeur', 'rh', 'admin', 'superviseur', 'gerant', 'controleur', 'partenaire', 'secretaire']

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
// Le rôle `info` est UNIVERSEL : il fait tout ce que fait chaque autre rôle, y compris les actions réservées aux agents
// (saisie du jour, facturation, demandes de sortie). Les écrans testent `agirCommeAgent(role)` à la place de `role === 'agent'`
// pour ces droits d'action. Les LIMITES propres à l'agent (pas de suppression, fenêtre du mois courant) ne s'appliquent pas à Info.
export const agirCommeAgent = (r) => r === 'agent' || r === 'info' || aAussiLesDroitsAgent(r)
export const canExportGym = (r) => canExportExcel(r) || r === 'agent' || aAussiLesDroitsAgent(r)

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
const PREFIXE_MODULE = { agro: 'agro', logistique: 'logistique', evenementiel: 'evenementiel', foncier: 'foncier', garderie: 'garderie', compta: 'comptabilite', rh: 'rh', projet: 'projet', projets: 'projet', depense: 'depense', gym: 'gym', taches: 'taches' }
export const moduleDeCollection = (collection) => PREFIXE_MODULE[String(collection || '').split('_')[0]] || null
// `droitsModules[module]` : absent = tout est permis (selon le rôle) ; 'lecture' = rien d'autre que lire ; ou un objet qui ne liste que
// les actions REFUSÉES, par exemple { supprimer: false, modifier: false }. Lire est le socle : le retirer, c'est retirer le module.
export const ACTIONS_DROIT = ['creer', 'modifier', 'supprimer']
// Lecture seule PAR DÉFAUT : le directeur sur tous les modules, le RH sur tous sauf Ressources humaines. Info leur accorde l'écriture module par module
// (fiche d'accès). `droitsModules[module]` vaut alors 'ecriture' (tout), ou un objet { creer, modifier, supprimer } de booléens (true = accordé).
export const ROLES_LECTURE_PAR_DEFAUT = ['directeur', 'rh']
// E-TACHES est un outil collaboratif (confier, discuter, rendre compte) : le directeur et le RH y écrivent comme tout le monde.
const ecritureParDefautDuRole = (role, moduleId) => moduleId === 'taches' || !(role === 'directeur' || (role === 'rh' && moduleId !== 'rh'))
// `droitsModules[module]` : absent = ce que le rôle donne par défaut ; 'lecture' = rien d'autre que lire ; 'ecriture' = tout accordé ; ou un objet par action
// (true accordé, false refusé, absent = le défaut du rôle). Lire est le socle : le retirer, c'est retirer le module.
// `role` : le rôle effectif du compte ; sans lui, le défaut est l'écriture.
export const actionAutorisee = (droitsModules, moduleId, action, role) => {
  const d = droitsModules?.[moduleId]
  if (d === 'ecriture') return true
  if (d === 'lecture') return false
  if (d && typeof d === 'object') {
    if (d[action] === true) return true
    if (d[action] === false) return false
  }
  return ecritureParDefautDuRole(role, moduleId)
}
export const moduleEnLecture = (droitsModules, moduleId, role) => !!moduleId && ACTIONS_DROIT.every((a) => !actionAutorisee(droitsModules, moduleId, a, role))

// ── Retraits individuels (Utilisateurs, fiche d'accès) ──────────────────────────────────────────────────────────────────
// Info peut retirer à un compte un module ENTIER (`modulesRetires`, utile pour les rôles « voit tout ») ou seulement certains
// volets d'un module (`voletsRetires = { module: ['/chemin/du/volet'] }`). Le retrait s'ajoute aux limites du rôle, il ne les lève jamais.
export const moduleRetire = (user, moduleId) => Array.isArray(user?.modulesRetires) && user.modulesRetires.includes(moduleId)
export const voletRetire = (user, moduleId, to) => Array.isArray(user?.voletsRetires?.[moduleId]) && user.voletsRetires[moduleId].includes(to)

export const GYM_ECRITURE_ROLES = ['agent', 'info', 'assistant_pau']
export const peutEcrireGym = (r) => GYM_ECRITURE_ROLES.includes(r) || aAussiLesDroitsAgent(r) || gymAccordeALaSession()
export const peutPurgerClientGym = (r) => peutEcrireGym(r)
// Ce que le rôle interdit SANS APPEL, quel que soit le réglage individuel : les profils en lecture seule (superviseur, partenaire) ne modifient rien
// (on change leur rôle pour cela) et un agent ne supprime jamais. Tout le reste (MAXI-GYM hors agents, directeur, RH) n'est qu'un DÉFAUT : Info le lève.
export const lectureImposeeParRole = (role) => isReadOnlyRole(role)
export const actionImposeeInterdite = (role, moduleId, action) => lectureImposeeParRole(role) || (action === 'supprimer' && role === 'agent')
// Écriture par défaut d'un compte sur un module, avant tout réglage individuel (rôle effectif, rôle réel).
export const lectureParDefaut = (role, moduleId, roleReel) => {
  if (!ecritureParDefautDuRole(role, moduleId)) return true
  if (moduleId === 'gym') return !(GYM_ECRITURE_ROLES.includes(role) || (role === 'secretaire' && ROLES_AGENT_EN_PLUS.includes(roleReel)))
  return false
}
export const droitParDefaut = (user, moduleId, action) => {
  const role = roleEffectif(user?.role)
  return !actionImposeeInterdite(role, moduleId, action) && !lectureParDefaut(role, moduleId, user?.role)
}
// Droit réel d'un compte sur une action d'un module : interdiction absolue, puis réglage individuel, puis défaut du rôle.
export function droitEffectif(user, moduleId, action) {
  if (actionImposeeInterdite(roleEffectif(user?.role), moduleId, action)) return false
  const d = user?.droitsModules?.[moduleId]
  if (d === 'ecriture') return true
  if (d === 'lecture') return false
  if (d && typeof d === 'object' && typeof d[action] === 'boolean') return d[action]
  return droitParDefaut(user, moduleId, action)
}
// Enregistrement d'un état voulu { creer, modifier, supprimer } : rien si c'est le défaut du rôle, 'lecture', 'ecriture', ou le détail par action.
export function encoderDroits(user, moduleId, etat) {
  if (ACTIONS_DROIT.every((a) => etat[a] === droitParDefaut(user, moduleId, a))) return undefined
  if (ACTIONS_DROIT.every((a) => !etat[a])) return 'lecture'
  if (ACTIONS_DROIT.every((a) => etat[a])) return 'ecriture'
  return Object.fromEntries(ACTIONS_DROIT.map((a) => [a, !!etat[a]]))
}
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
export const DEPENSE_ROLES_LIMITES = ['super_admin', 'admin', 'directeur', 'rh']
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

// Rôles qui ont EXACTEMENT les droits d'un autre rôle : l'Assistant(e) GE est une secrétaire (tous les contrôles du type `role === 'secretaire'`
// s'appliquent à elle). La session garde le rôle réel (`roleReel`) pour l'affichage et pour ce qui la distingue (le bilan global).
export const ROLES_ASSIMILES = { assistant_ge: 'secretaire', assistant_comptable: 'secretaire' }
export const roleEffectif = (r) => ROLES_ASSIMILES[r] || r

// L'Assistant(e) GE CUMULE deux rôles : secrétaire (rôle effectif ci-dessus) ET agent. Les droits positifs de l'agent (saisie, facturation,
// MAXI-GYM, exports de MAXI-GYM) lui sont donc ouverts en plus ; ses limites (pas de suppression, pas de restriction de mois) ne lui sont pas
// imposées plus qu'à la secrétaire. Le rôle réel est lu dans la session, branchée par auth.js (même procédé que db.js).
export const ROLES_AGENT_EN_PLUS = ['assistant_ge']
let _lireRoleReel = () => null
export function _brancherRoleReel(fn) { _lireRoleReel = fn }
let _lireDroitsSession = () => null
export function _brancherDroitsSession(fn) { _lireDroitsSession = fn }
// Info a accordé l'écriture sur MAXI-GYM à la session courante (quel que soit son rôle).
function gymAccordeALaSession() {
  const d = _lireDroitsSession()?.gym
  return d === 'ecriture' || (!!d && typeof d === 'object' && ACTIONS_DROIT.some((a) => d[a] === true))
}
// Vrai pour le rôle effectif `secretaire` quand la session courante est celle d'une Assistant(e) GE.
function aAussiLesDroitsAgent(roleEffectifCourant) {
  return roleEffectifCourant === 'secretaire' && ROLES_AGENT_EN_PLUS.includes(_lireRoleReel())
}
export const agentEnPlus = (roleReel) => ROLES_AGENT_EN_PLUS.includes(roleReel)

// Tableau de bord global (Bilan global) : quatre niveaux.
//  - 'finance' : PAU, GE, DF et Info voient tout : l'argent, les secteurs et les exports Excel et PDF ;
//  - 'admin'   : le reste de l'administration voit l'activité et les alertes, jamais l'argent ;
//  - 'export'  : l'Assistant(e) GE voit comme 'admin' (aucun montant) et garde les boutons d'export, dont les fichiers ne contiennent aucun montant ;
//  - 'jour'    : un autre compte à qui Info a donné l'accès (`accesBilanGlobal`) ne voit que le récap du jour des secteurs, sans aucun montant ;
//  - null      : pas d'accès (le cas par défaut des employés).
export const ROLES_BILAN_FINANCE = ['pau', 'ge', 'df', 'info']
export const ROLES_BILAN_EXPORT_SANS_MONTANT = ['assistant_ge']
export function niveauBilanGlobal(roleReel, user) {
  if (ROLES_BILAN_FINANCE.includes(roleReel)) return 'finance'
  if (ROLES_BILAN_EXPORT_SANS_MONTANT.includes(roleReel)) return 'export'
  if (FULL_ACCESS_ROLES.includes(roleReel)) return 'admin'
  return user?.accesBilanGlobal === true ? 'jour' : null
}
// Accès par défaut (sans réglage individuel) : administration et Assistant(e) GE.
export const bilanParDefaut = (roleReel) => ROLES_BILAN_FINANCE.includes(roleReel) || ROLES_BILAN_EXPORT_SANS_MONTANT.includes(roleReel) || FULL_ACCESS_ROLES.includes(roleReel)

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

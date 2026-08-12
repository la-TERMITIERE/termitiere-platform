// Gestion de Projet — modèle métier : types, statuts, priorités, phases.

export const TYPES_PROJET = [
  { id: 'construction', label: 'Construction / BTP', description: 'Chantiers, bâtiments, infrastructures' },
  { id: 'amenagement', label: 'Aménagement', description: 'Aménagement de terrain ou d\'espace' },
  { id: 'informatique', label: 'Informatique / Digital', description: 'Développement, outils, systèmes' },
  { id: 'agricole', label: 'Projet agricole', description: 'Culture, exploitation rurale' },
  { id: 'elevage', label: 'Élevage', description: 'Élevage d\'animaux, production animale' },
  { id: 'commercial', label: 'Commercial / Marketing', description: 'Lancement produit, campagne, vente' },
  { id: 'evenementiel', label: 'Événementiel', description: 'Organisation d\'événements' },
  { id: 'autre', label: 'Autre', description: 'Projet ne rentrant pas dans les catégories ci-dessus' }
]

// Unités de superficie — projets agricoles (surface cultivée). Suggestions de base ; le
// champ de saisie (ChampAutocomplete) accepte aussi toute unité libre non listée ici.
export const UNITES_SUPERFICIE = {
  ha:  { label: 'Hectares (ha)',      court: 'ha' },
  are: { label: 'Ares (a)',           court: 'a'  },
  m2:  { label: 'Mètres carrés (m²)', court: 'm²' }
}
// `u` peut être une ancienne clé (ha/are/m2) ou déjà le texte court d'une unité saisie
// librement (ex: "acre", "planche") — dans ce cas on l'affiche telle quelle.
export const uniteSuperficie = (u) => UNITES_SUPERFICIE[u]?.court || u || 'ha'

export const STATUTS_PROJET = {
  planification: { label: 'Planification', tone: 'info' },
  en_cours:      { label: 'En cours',       tone: 'warning' },
  en_pause:      { label: 'En pause',        tone: 'neutral' },
  termine:       { label: 'Terminé',         tone: 'success' },
  annule:        { label: 'Annulé',          tone: 'danger' }
}

export const PRIORITES = {
  basse:  { label: 'Basse',  tone: 'neutral', order: 1 },
  normale: { label: 'Normale', tone: 'info',    order: 2 },
  haute:  { label: 'Haute',  tone: 'warning', order: 3 },
  urgente: { label: 'Urgente', tone: 'danger',  order: 4 }
}

export const STATUTS_TACHE = {
  a_faire:    { label: 'À faire',    tone: 'neutral' },
  en_cours:   { label: 'En cours',   tone: 'warning' },
  bloquee:    { label: 'Bloquée',    tone: 'danger'  },
  terminee:   { label: 'Terminée',   tone: 'success' },
  annulee:    { label: 'Annulée',    tone: 'neutral' }
}

export const PHASES_PROJET = [
  { id: 'initiation',    label: 'Initiation',    ordre: 1 },
  { id: 'planification', label: 'Planification',  ordre: 2 },
  { id: 'execution',     label: 'Exécution',      ordre: 3 },
  { id: 'controle',      label: 'Contrôle',       ordre: 4 },
  { id: 'cloture',       label: 'Clôture',        ordre: 5 }
]

// Phases indicatives par type de projet — utilisées comme suggestions pour le tag "Phase" des tâches
// (regroupement dans les rapports), sans budget propre : construction → niveaux, agricole → étapes de culture, etc.
export const ETAPES_PAR_TYPE = {
  construction: ['Fondation', 'Élévation', 'Charpente & Toiture', 'Finitions', 'Réception'],
  amenagement:  ['Terrassement', 'Viabilisation', 'Espaces verts', 'Finitions'],
  informatique: ['Analyse & cadrage', 'Conception', 'Développement', 'Tests & recette', 'Déploiement'],
  agricole:     ['Préparation du sol', 'Semis / Plantation', 'Entretien', 'Récolte', 'Commercialisation'],
  elevage:      ['Préparation de l\'enclos/bâtiment', 'Acquisition des animaux', 'Alimentation & entretien', 'Suivi sanitaire', 'Reproduction', 'Vente / commercialisation'],
  commercial:   ['Étude de marché', 'Production', 'Promotion', 'Vente'],
  evenementiel: ['Préparation', 'Logistique', 'Animation', 'Clôture'],
  autre:        []
}

// Libellé du champ "Phase" — uniformisé en « Catégorie » partout (même terminologie
// que les volets Projets/Tâches/BTP, qui parlent tous de « catégorie de tâches »),
// au lieu d'un libellé différent par type de projet.
export const LIBELLE_ETAPE_SINGULIER = 'Catégorie'

// Suggestions de tâches par type de projet — évitent de tout ressaisir à chaque fois.
export const TACHES_SUGGESTIONS_PAR_TYPE = {
  construction: ['Terrassement', 'Fondations / semelles', 'Ferraillage', 'Coffrage', 'Coulage béton', 'Élévation des murs', 'Chaînage', 'Charpente', 'Toiture / couverture', 'Enduit / crépissage', 'Plomberie', 'Électricité', 'Menuiserie', 'Carrelage', 'Peinture', 'Nettoyage de chantier'],
  amenagement:  ['Débroussaillage', 'Terrassement', 'Nivellement', 'Drainage', 'Pose de bordures', 'Plantation', 'Engazonnement', 'Éclairage extérieur', 'Finitions'],
  informatique: ['Recueil des besoins', 'Cahier des charges', 'Maquettage', 'Développement', 'Intégration', 'Tests', 'Correction de bugs', 'Déploiement', 'Formation utilisateurs', 'Documentation'],
  agricole:     ['Préparation du sol', 'Labour', 'Semis / plantation', 'Fertilisation', 'Désherbage', 'Traitement phytosanitaire', 'Arrosage / irrigation', 'Récolte', 'Conditionnement', 'Transport / vente'],
  elevage:      ['Construction/aménagement de l\'enclos', 'Achat des animaux', 'Alimentation quotidienne', 'Abreuvement', 'Nettoyage des locaux', 'Vaccination', 'Suivi sanitaire', 'Pesée / suivi de croissance', 'Reproduction', 'Transport des animaux', 'Vente / commercialisation'],
  commercial:   ['Étude de marché', 'Prospection', 'Production', 'Conditionnement', 'Campagne publicitaire', 'Négociation', 'Vente', 'Suivi client'],
  evenementiel: ['Réservation du lieu', 'Location matériel', 'Restauration / traiteur', 'Sonorisation', 'Décoration', 'Invitations', 'Sécurité', 'Animation', 'Rangement'],
  autre:        []
}
// Suggestions selon le type ; sans type, on propose l'union dédupliquée de toutes les suggestions.
export const tachesSuggestions = (type) =>
  (type && TACHES_SUGGESTIONS_PAR_TYPE[type])
    ? TACHES_SUGGESTIONS_PAR_TYPE[type]
    : [...new Set(Object.values(TACHES_SUGGESTIONS_PAR_TYPE).flat())]

export const etapesDefaut = (type) => ETAPES_PAR_TYPE[type] || ETAPES_PAR_TYPE.autre
export const libelleEtape  = () => LIBELLE_ETAPE_SINGULIER

// Catégories indicatives par SECTEUR du projet (agro/logistique/bat/evenementiel=
// Briqueterie/garderie/divers — cf. SECTEURS dans depense/data.js), en complément des
// suggestions par type ci-dessus : un projet garde un `type` assez générique (ex.
// « autre ») mais peut être explicitement rattaché à un secteur métier (`secteurId`)
// qui, lui, n'a pas toujours de bonnes suggestions côté ETAPES_PAR_TYPE (ex. aucun
// type ne correspond à « logistique » ou « garderie »). Les deux listes se combinent
// dans le formulaire — l'utilisateur reste toujours libre de saisir autre chose.
export const ETAPES_PAR_SECTEUR = {
  agro:         ['Préparation du sol', 'Semis / Plantation', 'Entretien', 'Récolte', 'Alimentation & entretien (élevage)', 'Suivi sanitaire', 'Commercialisation'],
  logistique:   ['Réception marchandise', 'Stockage', 'Préparation commande', 'Transport / Livraison', 'Maintenance véhicules', 'Inventaire'],
  bat:          ['Fondation', 'Élévation', 'Charpente & Toiture', 'Finitions', 'Réception'],
  evenementiel: ['Approvisionnement matières premières', 'Production', 'Séchage', 'Stockage', 'Vente / Livraison'], // secteur Briqueterie
  garderie:     ['Aménagement locaux', 'Inscription enfants', 'Recrutement personnel', 'Activités pédagogiques', 'Santé & sécurité'],
  divers:       []
}
export const etapesSecteurDefaut = (secteurId) => ETAPES_PAR_SECTEUR[secteurId] || []

// Seuils par défaut de déclenchement des alertes — réglables dans Paramètres.
export const SEUILS_DEFAUT = { budget: 100, inactivite: 7 }

// Catégories de dépense de projet — partagées entre l'écran Dépenses et le volet BTP
// (détail par chantier). Vit ici plutôt que dans Depenses.jsx pour que ce dernier ne
// garde qu'un export de composant (React Fast Refresh évite ainsi un remount complet
// de l'app à chaque modification du fichier en développement).
export const CATEGORIES_DEPENSE_PROJET = [
  { id: 'main_oeuvre',  label: 'Main d\'œuvre'   },
  { id: 'materiaux',    label: 'Matériaux'        },
  { id: 'equipement',   label: 'Équipement'       },
  { id: 'transport',    label: 'Transport'        },
  { id: 'sous_traitance', label: 'Sous-traitance' },
  { id: 'administratif', label: 'Administratif'   },
  { id: 'autre',        label: 'Autre'            }
]

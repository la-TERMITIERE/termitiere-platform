// Gestion de Projet — modèle métier : types, statuts, priorités, phases.

export const TYPES_PROJET = [
  { id: 'construction', label: 'Construction / BTP', description: 'Chantiers, bâtiments, infrastructures' },
  { id: 'amenagement', label: 'Aménagement', description: 'Aménagement de terrain ou d\'espace' },
  { id: 'informatique', label: 'Informatique / Digital', description: 'Développement, outils, systèmes' },
  { id: 'agricole', label: 'Projet agricole', description: 'Culture, élevage, exploitation rurale' },
  { id: 'commercial', label: 'Commercial / Marketing', description: 'Lancement produit, campagne, vente' },
  { id: 'evenementiel', label: 'Événementiel', description: 'Organisation d\'événements' },
  { id: 'autre', label: 'Autre', description: 'Projet ne rentrant pas dans les catégories ci-dessus' }
]

// Unités de superficie — projets agricoles (surface cultivée).
export const UNITES_SUPERFICIE = {
  ha:  { label: 'Hectares (ha)',      court: 'ha' },
  are: { label: 'Ares (a)',           court: 'a'  },
  m2:  { label: 'Mètres carrés (m²)', court: 'm²' }
}
export const uniteSuperficie = (u) => UNITES_SUPERFICIE[u]?.court || 'ha'

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
  commercial:   ['Étude de marché', 'Production', 'Promotion', 'Vente'],
  evenementiel: ['Préparation', 'Logistique', 'Animation', 'Clôture'],
  autre:        []
}

// Libellé au singulier du champ "Phase" (adapté au type de projet).
export const LIBELLE_ETAPE_SINGULIER = {
  construction: 'Niveau de construction',
  amenagement:  'Phase d\'aménagement',
  informatique: 'Phase du projet',
  agricole:     'Étape de culture',
  commercial:   'Phase commerciale',
  evenementiel: 'Phase de l\'événement',
  autre:        'Étape du projet'
}

// Suggestions de tâches par type de projet — évitent de tout ressaisir à chaque fois.
export const TACHES_SUGGESTIONS_PAR_TYPE = {
  construction: ['Terrassement', 'Fondations / semelles', 'Ferraillage', 'Coffrage', 'Coulage béton', 'Élévation des murs', 'Chaînage', 'Charpente', 'Toiture / couverture', 'Enduit / crépissage', 'Plomberie', 'Électricité', 'Menuiserie', 'Carrelage', 'Peinture', 'Nettoyage de chantier'],
  amenagement:  ['Débroussaillage', 'Terrassement', 'Nivellement', 'Drainage', 'Pose de bordures', 'Plantation', 'Engazonnement', 'Éclairage extérieur', 'Finitions'],
  informatique: ['Recueil des besoins', 'Cahier des charges', 'Maquettage', 'Développement', 'Intégration', 'Tests', 'Correction de bugs', 'Déploiement', 'Formation utilisateurs', 'Documentation'],
  agricole:     ['Préparation du sol', 'Labour', 'Semis / plantation', 'Fertilisation', 'Désherbage', 'Traitement phytosanitaire', 'Arrosage / irrigation', 'Récolte', 'Conditionnement', 'Transport / vente'],
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
export const libelleEtape  = (type) => LIBELLE_ETAPE_SINGULIER[type] || LIBELLE_ETAPE_SINGULIER.autre

// Seuils par défaut de déclenchement des alertes — réglables dans Paramètres.
export const SEUILS_DEFAUT = { budget: 100, inactivite: 7 }

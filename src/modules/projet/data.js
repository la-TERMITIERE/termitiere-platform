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

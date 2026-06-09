// Foncier — types de dossiers, modes d'acquisition, étapes administratives.

export const TYPES_DOSSIER = [
  {
    id: 'achat_titre',
    label: 'Achat terrain avec titre foncier',
    description: 'Enregistrement des informations du domaine acquis avec titre existant'
  },
  {
    id: 'morcellement',
    label: 'Titre global — Morcellement',
    description: 'Actes administratifs liés au morcellement d\'un titre foncier global'
  },
  {
    id: 'mutation',
    label: 'Mutation de nom',
    description: 'Changement du nom figurant sur le titre foncier'
  },
  {
    id: 'titre_en_cours',
    label: 'Titre en cours d\'obtention',
    description: 'Suivi du dossier jusqu\'à la sortie du titre, puis morcellement ou mutation'
  }
]

export const MODES_ACQUISITION = [
  { id: 'heritage', label: 'Héritage' },
  { id: 'donation', label: 'Donation / Cession' },
  { id: 'achat', label: 'Achat' }
]

// Étapes pour obtenir un titre foncier au Togo.
export const ETAPES_TITRE = [
  { id: 'recu_achat', label: 'Reçu d\'achat / acte initial', ordre: 1 },
  { id: 'plan_parcellaire', label: 'Plan parcellaire', ordre: 2 },
  { id: 'verification_cadastre', label: 'Vérification cadastre (non-dangerosité)', ordre: 3 },
  { id: 'avis_otr', label: 'Avis favorable OTR', ordre: 4 },
  { id: 'acte_notarie', label: 'Acte notarié', ordre: 5 },
  { id: 'titre_obtenu', label: 'Titre foncier obtenu', ordre: 6 }
]

// Étapes supplémentaires pour le morcellement.
export const ETAPES_MORCELEMENT = [
  { id: 'demande_morcellement', label: 'Demande de morcellement', ordre: 1 },
  { id: 'plan_morcellement', label: 'Plan de morcellement', ordre: 2 },
  { id: 'approbation_admin', label: 'Approbation administrative', ordre: 3 },
  { id: 'publication', label: 'Publication / enregistrement', ordre: 4 },
  { id: 'titres_individuels', label: 'Titres individuels délivrés', ordre: 5 }
]

// Étapes pour la mutation.
export const ETAPES_MUTATION = [
  { id: 'demande_mutation', label: 'Demande de mutation', ordre: 1 },
  { id: 'pieces_justificatives', label: 'Pièces justificatives', ordre: 2 },
  { id: 'verification_otr', label: 'Vérification OTR', ordre: 3 },
  { id: 'acte_mutation', label: 'Acte de mutation notarié', ordre: 4 },
  { id: 'titre_mute', label: 'Titre muté / mis à jour', ordre: 5 }
]

export const STATUTS_DOSSIER = {
  ouvert: { label: 'Ouvert', tone: 'info' },
  en_cours: { label: 'En cours', tone: 'warning' },
  titre_obtenu: { label: 'Titre obtenu', tone: 'success' },
  morcellement: { label: 'Morcellement en cours', tone: 'warning' },
  mutation: { label: 'Mutation en cours', tone: 'warning' },
  cloture: { label: 'Clôturé', tone: 'success' },
  suspendu: { label: 'Suspendu', tone: 'danger' }
}

export const STATUTS_ETAPE = {
  a_faire: { label: 'À faire', tone: 'neutral' },
  en_cours: { label: 'En cours', tone: 'warning' },
  termine: { label: 'Terminé', tone: 'success' },
  bloque: { label: 'Bloqué', tone: 'danger' }
}

export function etapesPourType(typeId) {
  if (typeId === 'morcellement') return [...ETAPES_TITRE.slice(0, 1), ...ETAPES_MORCELEMENT]
  if (typeId === 'mutation') return [...ETAPES_TITRE.slice(0, 1), ...ETAPES_MUTATION]
  if (typeId === 'titre_en_cours') return ETAPES_TITRE
  return ETAPES_TITRE
}

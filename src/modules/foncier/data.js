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
  },
  {
    id: 'contrat_gestion',
    label: 'Contrat de gestion — surface rurale',
    description: 'Gestion de surfaces rurales : localisation, lotissement, suivi contractuel avec propriétaires ou autorités compétentes'
  },
  {
    id: 'morcellement_vente',
    label: 'Morcellement pour vente en lots',
    description: 'Morcellement de grands domaines en vue de la vente de lots individuels — prospection, viabilisation, commercialisation'
  },
  {
    id: 'heritage_reconstitution',
    label: 'Reconstitution dossier héritage',
    description: 'Reconstitution et régularisation d\'un domaine héritage : identification des héritiers, actes successoraux, droits à régulariser'
  }
]

export const MODES_ACQUISITION = [
  { id: 'heritage', label: 'Héritage' },
  { id: 'donation', label: 'Donation / Cession' },
  { id: 'achat', label: 'Achat' },
  { id: 'gestion_deleguee', label: 'Gestion déléguée' },
  { id: 'lotissement', label: 'Lotissement / Lotissement vente' }
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

// Étapes pour contrat de gestion surface rurale.
export const ETAPES_CONTRAT_GESTION = [
  { id: 'prospection_terrain', label: 'Prospection terrain / localisation', ordre: 1 },
  { id: 'identification_proprietaire', label: 'Identification du propriétaire ou autorité', ordre: 2 },
  { id: 'plan_surface', label: 'Plan de la surface / délimitation parcelles', ordre: 3 },
  { id: 'accord_principe', label: 'Accord de principe signé', ordre: 4 },
  { id: 'redaction_contrat', label: 'Rédaction contrat de gestion', ordre: 5 },
  { id: 'signature_autorites', label: 'Signature autorités compétentes', ordre: 6 },
  { id: 'enregistrement', label: 'Enregistrement / publication', ordre: 7 },
  { id: 'gestion_active', label: 'Gestion active en cours', ordre: 8 }
]

// Étapes pour morcellement grands domaines — vente en lots.
export const ETAPES_MORCELLEMENT_VENTE = [
  { id: 'identification_domaine', label: 'Identification du grand domaine', ordre: 1 },
  { id: 'prospection_equipe', label: 'Mission prospection équipe terrain', ordre: 2 },
  { id: 'plan_lotissement', label: 'Plan de lotissement (géomètre)', ordre: 3 },
  { id: 'approbation_admin', label: 'Approbation administrative (autorités compétentes)', ordre: 4 },
  { id: 'creation_lots', label: 'Création des lots individuels', ordre: 5 },
  { id: 'commercialisation', label: 'Commercialisation / vente des lots', ordre: 6 },
  { id: 'titres_acheteurs', label: 'Titres délivrés aux acheteurs', ordre: 7 }
]

// Étapes pour reconstitution dossier héritage.
export const ETAPES_HERITAGE = [
  { id: 'identification_heritiers', label: 'Identification des héritiers', ordre: 1 },
  { id: 'acte_succession', label: 'Acte de succession / jugement d\'hérédité', ordre: 2 },
  { id: 'inventaire_biens', label: 'Inventaire des biens fonciers', ordre: 3 },
  { id: 'regularisation_fiscale', label: 'Régularisation fiscale (OTR)', ordre: 4 },
  { id: 'acte_notarie', label: 'Acte notarié de partage', ordre: 5 },
  { id: 'mutations_titres', label: 'Mutations de titres au nom des héritiers', ordre: 6 },
  { id: 'cloture', label: 'Clôture et archivage', ordre: 7 }
]

export const STATUTS_DOSSIER = {
  ouvert: { label: 'Ouvert', tone: 'info' },
  en_cours: { label: 'En cours', tone: 'warning' },
  titre_obtenu: { label: 'Titre obtenu', tone: 'success' },
  morcellement: { label: 'Morcellement en cours', tone: 'warning' },
  mutation: { label: 'Mutation en cours', tone: 'warning' },
  contrat_actif: { label: 'Contrat actif', tone: 'success' },
  vente_lots: { label: 'Vente lots en cours', tone: 'warning' },
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
  if (typeId === 'contrat_gestion') return ETAPES_CONTRAT_GESTION
  if (typeId === 'morcellement_vente') return ETAPES_MORCELLEMENT_VENTE
  if (typeId === 'heritage_reconstitution') return ETAPES_HERITAGE
  return ETAPES_TITRE
}

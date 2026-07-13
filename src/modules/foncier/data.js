// Foncier Togo — modèle métier : acteurs, parcelle, types de dossiers,
// workflows (étapes administratives), cession/vente, coûts, appréciation base.
//
// Sources (procédures réelles Togo, vérifiées) : Guichet Foncier Unique (GUF)
// rattaché à l'OTR + plateforme e-Foncière ; Direction du Cadastre, de la
// Conservation Foncière et de l'Enregistrement (DCCFE) ; bornage contradictoire
// par géomètre assermenté ; publication au Journal Officiel (délai d'opposition
// 3 mois) ; mutation : droit fixe 35 000 FCFA + taxe sur la plus-value (7 %).

// ───────────────────────── ACTEURS & PIÈCES ─────────────────────────

// Rôles d'acteurs intervenant dans un dossier foncier.
export const ACTEURS_ROLES = [
  { id: 'proprietaire', label: 'Propriétaire' },
  { id: 'cedant', label: 'Cédant (vendeur)' },
  { id: 'acquereur', label: 'Acquéreur (acheteur)' },
  { id: 'donateur', label: 'Donateur' },
  { id: 'beneficiaire', label: 'Bénéficiaire' },
  { id: 'heritier', label: 'Héritier' },
  { id: 'notaire', label: 'Notaire' },
  { id: 'geometre', label: 'Géomètre / expert' },
  { id: 'conservateur', label: 'Conservateur foncier' },
  { id: 'mandataire', label: 'Mandataire / Représentant' }
]

// Pièces d'identité/état civil exigées pour un acteur (personne physique).
export const PIECES_ACTEUR = [
  { id: 'cni', label: 'CNI / Passeport / Carte de séjour (copie légalisée)', requis: true },
  { id: 'acte_naissance', label: 'Acte de naissance (< 3 mois)', requis: true },
  { id: 'nif', label: 'NIF — Numéro d\'Identification Fiscale', requis: true },
  { id: 'certificat_residence', label: 'Certificat de résidence', requis: false },
  { id: 'procuration', label: 'Procuration légalisée (si mandataire)', requis: false }
]

// ───────────────────────── PARCELLE ─────────────────────────

// Champs descriptifs d'une parcelle / d'un domaine.
export const PARCELLE_CHAMPS = [
  { id: 'numRequisition', label: 'N° de réquisition d\'immatriculation' },
  { id: 'numTitre', label: 'N° de Titre Foncier (original)' },
  { id: 'numLeve', label: 'N° de levé topographique' },
  { id: 'attestationCoutumiere', label: 'Attestation de détention de droit coutumier' },
  { id: 'planParcellaire', label: 'Plan visé' },
  { id: 'prefecture', label: 'Préfecture' },
  { id: 'commune', label: 'Commune' },
  { id: 'quartier', label: 'Quartier / Canton' },
  { id: 'lot', label: 'Référence — Lot' },
  { id: 'hectares', label: 'Référence — Hectare(s)' },
  { id: 'superficie', label: 'Superficie (m²)' }
]

// Plan visé : effectué ou non (facultatif).
export const PLAN_VISE_OPTIONS = [
  { id: '', label: '— Non renseigné —' },
  { id: 'effectue', label: 'Effectué' },
  { id: 'non_effectue', label: 'Non effectué' }
]
export const planViseLabel = (id) => PLAN_VISE_OPTIONS.find((o) => o.id === id)?.label || '—'

// Documents fonciers attachables à une parcelle (pièces jointes PDF/images).
export const PIECES_PARCELLE = [
  { id: 'titre_foncier', label: 'Titre foncier (original)' },
  { id: 'attestation_coutumiere', label: 'Attestation de détention coutumière' },
  { id: 'plan_parcellaire', label: 'Plan parcellaire visé' },
  { id: 'leve_topo', label: 'Levé topographique' },
  { id: 'reçu_achat', label: 'Reçu / contrat d\'achat' }
]

// ───────────────────────── TYPES DE DOSSIERS ─────────────────────────

export const TYPES_DOSSIER = [
  {
    id: 'vente_cession',
    label: 'Cession / Vente de terrain',
    description: 'Vente d\'un terrain — appréciation des documents du cédant puis accompagnement jusqu\'au titre foncier (3 catégories : terrain nu, levé parcellaire, acte notarié).'
  },
  {
    id: 'titre_en_cours',
    label: 'Immatriculation — Titre en cours',
    description: 'Procédure foncière standard & bornage : du levé topographique jusqu\'à la délivrance du titre foncier (GUF/OTR).'
  },
  {
    id: 'achat_titre',
    label: 'Achat terrain avec titre foncier',
    description: 'Acquisition d\'un domaine disposant déjà d\'un titre foncier — vérification puis mutation au nom de l\'acquéreur.'
  },
  {
    id: 'mutation',
    label: 'Mutation de nom',
    description: 'Transfert de propriété : substitution du nouveau propriétaire sur le titre foncier (droit fixe + taxe sur la plus-value).'
  },
  {
    id: 'morcellement',
    label: 'Titre global — Morcellement',
    description: 'Division d\'un titre foncier global en plusieurs titres individuels.'
  },
  {
    id: 'donation',
    label: 'Donation',
    description: 'Transmission à titre gratuit : acte authentique notarié, enregistrement OTR, dépôt au Guichet Unique.'
  },
  {
    id: 'heritage_reconstitution',
    label: 'Reconstitution dossier héritage',
    description: 'Régularisation d\'un domaine d\'héritage : héritiers, actes successoraux, droits à régulariser, mutation au nom des héritiers.'
  },
  {
    id: 'lotissement',
    label: 'Lotissement',
    description: 'Division/aménagement d\'un domaine en lots — autorisation préalable du Ministère de l\'Urbanisme (via Mairie/Préfecture).'
  },
  {
    id: 'contrat_gestion',
    label: 'Contrat de gestion — surface rurale',
    description: 'Gestion de surfaces rurales : localisation, lotissement, suivi contractuel avec propriétaires ou autorités compétentes.'
  },
  {
    id: 'morcellement_vente',
    label: 'Morcellement pour vente en lots',
    description: 'Morcellement de grands domaines en vue de la vente de lots — prospection, viabilisation, commercialisation.'
  }
]

export const MODES_ACQUISITION = [
  { id: 'achat', label: 'Achat' },
  { id: 'heritage', label: 'Héritage' },
  { id: 'donation', label: 'Donation / Cession' },
  { id: 'gestion_deleguee', label: 'Gestion déléguée' },
  { id: 'lotissement', label: 'Lotissement / Lotissement vente' }
]

// ───────────────────────── CESSION / VENTE ─────────────────────────
// 3 catégories de terrain à la vente, chacune avec les pièces essentielles que
// le CÉDANT doit fournir à l'acquéreur pour que la mission soit « approuvée par
// la base ». À défaut → approbation annulée.

export const CESSION_CATEGORIES = [
  {
    id: 'terrain_nu',
    label: 'Terrain nu (sans dossier préalable)',
    description: 'Terrain coutumier sans levé ni titre. Risque élevé — vérifications renforcées avant toute mission.',
    docsCedant: [
      'Attestation de détention de droit coutumier',
      'Pièces d\'identité légalisées du/des cédant(s)',
      'Certificat administratif de non-litige (Maire / Préfet)',
      'Témoignage / PV de la collectivité coutumière (si terrain familial)'
    ]
  },
  {
    id: 'terrain_leve',
    label: 'Terrain avec levé parcellaire',
    description: 'Terrain disposant d\'un levé topographique / plan parcellaire mais sans titre foncier.',
    docsCedant: [
      'Plan parcellaire visé / levé topographique',
      'Attestation coutumière ou acte de vente antérieur',
      'Pièces d\'identité légalisées du/des cédant(s)',
      'Certificat administratif de non-litige (Maire / Préfet)'
    ]
  },
  {
    id: 'terrain_acte_notarie',
    label: 'Terrain avec acte notarié et consorts',
    description: 'Terrain disposant d\'un acte notarié et/ou d\'un titre foncier — sécurité juridique la plus élevée.',
    docsCedant: [
      'Titre foncier (original) ou acte notarié',
      'Expédition + cadastres à jour',
      'Pièces d\'identité légalisées du/des cédant(s)',
      'Quitus fiscal / NIF'
    ]
  }
]

// Critères BLOQUANTS d'appréciation : si l'un est constaté, la mission est
// « annulée » (la base n'approuve pas). Vérifiables par nous après enquête.
export const APPRECIATION_CRITERES = [
  { id: 'requisition_domaine', label: 'Réquisition existante sur le domaine', bloquant: true },
  { id: 'titre_tiers', label: 'Titre foncier déjà établi au nom d\'un tiers', bloquant: true },
  { id: 'litige_jugement', label: 'Litige / jugement en cours sur la parcelle', bloquant: true },
  { id: 'zone_non_immatriculable', label: 'Parcelle en zone non immatriculable / domaine public', bloquant: true },
  { id: 'pieces_incompletes', label: 'Pièces essentielles du cédant incomplètes', bloquant: true },
  { id: 'incoherence_superficie', label: 'Incohérence superficie / limites (bornage)', bloquant: false },
  { id: 'multi_vente', label: 'Soupçon de vente multiple du même terrain', bloquant: true }
]

export const VERDICTS_APPRECIATION = {
  en_attente: { label: 'En attente d\'appréciation', tone: 'neutral' },
  approuvee: { label: 'Mission approuvée par la base', tone: 'success' },
  annulee: { label: 'Approbation annulée', tone: 'danger' },
  reserve: { label: 'Approuvée sous réserve', tone: 'warning' }
}

// ───────────────────────── COÛTS (indicatifs, FCFA) ─────────────────────────
// Repères de coûts par opération — éditables côté dossier. Mutation : droit fixe
// 35 000 FCFA (enregistrement + timbres + conservation) ; taxe sur la plus-value
// 7 % (cession à titre onéreux, bien détenu < 5 ans).
export const COUTS_REFERENCE = [
  { id: 'avis_guf', label: 'Avis favorable GUF (vérification charges)', montant: null, note: 'Vérification ~72 h' },
  { id: 'bornage', label: 'Bornage contradictoire (géomètre assermenté)', montant: null, note: 'Selon superficie' },
  { id: 'valeur_venale', label: 'Frais de valeur vénale', montant: null },
  { id: 'acte_notarie', label: 'Honoraires notaire (acte)', montant: null },
  { id: 'mutation_droit_fixe', label: 'Mutation — droit fixe', montant: 35000, note: 'Enregistrement + timbres + conservation' },
  { id: 'plus_value', label: 'Taxe sur la plus-value', montant: null, note: '7 % si bien détenu < 5 ans' },
  { id: 'droits_donation', label: 'Droits de mutation (donation)', montant: null, note: 'Selon lien de parenté' },
  { id: 'autorisation_lotir', label: 'Autorisation de lotir (Ministère)', montant: null }
]

// ───────────────────────── WORKFLOWS (ÉTAPES) ─────────────────────────
// Chaque étape : { id, label, ordre, pieces?, cout?, personnel? }

// Workflow A — Procédure foncière standard & bornage (immatriculation → titre).
export const ETAPES_TITRE = [
  { id: 'leve_topo', label: 'Initialisation — N° de levé topographique', ordre: 1, personnel: 'Géomètre' },
  { id: 'avis_guf', label: 'Avis favorable du Guichet Foncier Unique (vérification charges/litiges)', ordre: 2, cout: 'avis_guf', personnel: 'GUF / OTR' },
  { id: 'depot_dossier', label: 'Dépôt et enregistrement du dossier (GUF / OTR)', ordre: 3, personnel: 'GUF / OTR' },
  { id: 'acte_notarie', label: 'Rédaction et validation de l\'acte notarié', ordre: 4, cout: 'acte_notarie', personnel: 'Notaire' },
  { id: 'publication_jo', label: 'Publication au Journal Officiel (délai d\'opposition 3 mois)', ordre: 5, personnel: 'Conservation foncière' },
  { id: 'bornage', label: 'Bornage contradictoire (génération/saisie du N° de réquisition)', ordre: 6, cout: 'bornage', personnel: 'Géomètre assermenté' },
  { id: 'traitement_otr', label: 'Enregistrement initial et traitement du dossier à l\'OTR', ordre: 7, personnel: 'OTR' },
  { id: 'valeur_venale', label: 'Détermination et paiement des frais de valeur vénale', ordre: 8, cout: 'valeur_venale', personnel: 'OTR' },
  { id: 'titre_obtenu', label: 'Établissement du titre foncier (Conservation) — expédition au notaire', ordre: 9, personnel: 'Conservateur foncier' }
]

// Workflow B — Mutation de nom (transfert de propriété).
export const ETAPES_MUTATION = [
  { id: 'verif_cadastre', label: 'Vérification de la parcelle dans la base cadastrale', ordre: 1, personnel: 'Cadastre' },
  { id: 'infos_achat', label: 'Saisie des informations de l\'achat (acte de vente + expédition + cadastres)', ordre: 2, personnel: 'Notaire' },
  { id: 'demande_mutation', label: 'Demande de mutation adressée au Conservateur (avec pièces justificatives)', ordre: 3, personnel: 'Conservateur foncier' },
  { id: 'depot_calcul', label: 'Dépôt au Cadastre — calcul (taxe sur la plus-value + frais d\'enregistrement)', ordre: 4, cout: 'mutation_droit_fixe', personnel: 'Cadastre / OTR' },
  { id: 'paiement_plus_value', label: 'Paiement effectif de la taxe sur la plus-value', ordre: 5, cout: 'plus_value', personnel: 'OTR' },
  { id: 'creation_titre', label: 'Création du titre muté', ordre: 6, personnel: 'Conservation foncière' },
  { id: 'signature_titre', label: 'Signature du titre', ordre: 7, personnel: 'Conservateur foncier' },
  { id: 'retrait_titre', label: 'Retrait du titre', ordre: 8, personnel: 'Acquéreur / Mandataire' }
]

// Workflow C.1 — Reconstitution dossier héritage (pièces bloquantes).
export const PIECES_HERITAGE = [
  'Actes d\'état civil (héritiers + défunt)',
  'Certificat d\'hérédité',
  'PV du conseil de famille',
  'Jugement d\'homologation',
  'Certificat de non-opposition ni appel',
  'Déclaration de succession',
  'Preuve de propriété (titre / attestation)'
]

export const ETAPES_HERITAGE = [
  { id: 'identification_heritiers', label: 'Identification des héritiers', ordre: 1 },
  { id: 'pieces_successorales', label: 'Collecte des pièces successorales (bloquantes)', ordre: 2, personnel: 'Notaire / Tribunal' },
  { id: 'certificat_heredite', label: 'Certificat d\'hérédité + PV conseil de famille', ordre: 3, personnel: 'Tribunal' },
  { id: 'jugement_homologation', label: 'Jugement d\'homologation + non-opposition ni appel', ordre: 4, personnel: 'Tribunal' },
  { id: 'declaration_succession', label: 'Déclaration de succession (OTR)', ordre: 5, personnel: 'OTR' },
  { id: 'acte_partage', label: 'Acte notarié de partage', ordre: 6, cout: 'acte_notarie', personnel: 'Notaire' },
  { id: 'mutations_titres', label: 'Mutations de titres au nom des héritiers', ordre: 7, personnel: 'Conservation foncière' },
  { id: 'cloture', label: 'Clôture et archivage', ordre: 8 }
]

// Workflow C.2 — Lotissement (autorisation préalable Ministère de l'Urbanisme).
export const ETAPES_LOTISSEMENT = [
  { id: 'verif_droit', label: 'Vérification du droit de propriété (titre foncier ou attestation)', ordre: 1 },
  { id: 'plan_vise', label: 'Obtention du plan visé (1er tampon de l\'OTR)', ordre: 2, personnel: 'OTR / Géomètre' },
  { id: 'demande_lotir', label: 'Dépôt de la demande d\'autorisation de lotir (Mairie / Préfecture)', ordre: 3, cout: 'autorisation_lotir', personnel: 'Mairie / Préfecture' },
  { id: 'transmission_ministere', label: 'Transmission du dossier au Ministère de l\'Urbanisme', ordre: 4, personnel: 'Ministère de l\'Urbanisme' },
  { id: 'enquete_publique', label: 'Enquête publique et validation', ordre: 5, personnel: 'Ministère / Collectivité' },
  { id: 'arrete_lotissement', label: 'Arrêté / Certificat de lotissement délivré par le Ministère', ordre: 6, personnel: 'Ministère de l\'Urbanisme' }
]

// Workflow D — Donation.
export const ETAPES_DONATION = [
  { id: 'collecte_documents', label: 'Collecte des documents (identités certifiées, acte de naissance, titre/attestation, plan parcellaire visé)', ordre: 1 },
  { id: 'certificat_non_litige', label: 'Certificat administratif de non-litige (Maire / Préfet)', ordre: 2, personnel: 'Mairie / Préfecture' },
  { id: 'verif_pieces_legales', label: 'Vérification : contrat de donation, certificat médical d\'aptitude mentale du donateur (obligatoire), PV de famille (si héritage familial)', ordre: 3, personnel: 'Médecin / Notaire' },
  { id: 'acte_authentique', label: 'Signature de l\'acte authentique chez le notaire', ordre: 4, cout: 'acte_notarie', personnel: 'Notaire' },
  { id: 'enregistrement_otr', label: 'Enregistrement à l\'OTR (calcul et paiement des droits de mutation)', ordre: 5, cout: 'droits_donation', personnel: 'OTR' },
  { id: 'depot_guichet_unique', label: 'Notification de dépôt au Guichet Unique pour transfert définitif', ordre: 6, personnel: 'Guichet Foncier Unique' }
]

// Cession/vente — étapes : appréciation base, puis accompagnement jusqu'au titre.
export const ETAPES_VENTE = [
  { id: 'collecte_docs_cedant', label: 'Collecte des documents essentiels du cédant', ordre: 1 },
  { id: 'appreciation_base', label: 'Appréciation des documents — verdict de la base (approuvée / annulée)', ordre: 2, personnel: 'Direction / Base' },
  { id: 'enquete_terrain', label: 'Enquête terrain (réquisition, litige, TF tiers)', ordre: 3, personnel: 'Agent foncier' },
  { id: 'negociation_acte_vente', label: 'Acte de vente / protocole entre cédant et acquéreur', ordre: 4, personnel: 'Notaire' },
  { id: 'leve_bornage', label: 'Levé topographique / bornage', ordre: 5, cout: 'bornage', personnel: 'Géomètre' },
  { id: 'procedure_titre', label: 'Procédure d\'immatriculation / mutation jusqu\'au titre', ordre: 6, personnel: 'GUF / OTR' },
  { id: 'remise_titre', label: 'Remise du titre foncier à l\'acquéreur', ordre: 7, personnel: 'Conservation foncière' }
]

// Étapes morcellement (titre global → titres individuels).
export const ETAPES_MORCELEMENT = [
  { id: 'demande_morcellement', label: 'Demande de morcellement', ordre: 1 },
  { id: 'plan_morcellement', label: 'Plan de morcellement (géomètre)', ordre: 2, personnel: 'Géomètre' },
  { id: 'approbation_admin', label: 'Approbation administrative', ordre: 3, personnel: 'OTR / Cadastre' },
  { id: 'publication', label: 'Publication / enregistrement', ordre: 4 },
  { id: 'titres_individuels', label: 'Titres individuels délivrés', ordre: 5, personnel: 'Conservation foncière' }
]

// Étapes contrat de gestion surface rurale.
export const ETAPES_CONTRAT_GESTION = [
  { id: 'prospection_terrain', label: 'Prospection terrain / localisation', ordre: 1 },
  { id: 'identification_proprietaire', label: 'Identification du propriétaire ou autorité', ordre: 2 },
  { id: 'plan_surface', label: 'Plan de la surface / délimitation parcelles', ordre: 3, personnel: 'Géomètre' },
  { id: 'accord_principe', label: 'Accord de principe signé', ordre: 4 },
  { id: 'redaction_contrat', label: 'Rédaction contrat de gestion', ordre: 5 },
  { id: 'signature_autorites', label: 'Signature autorités compétentes', ordre: 6 },
  { id: 'enregistrement', label: 'Enregistrement / publication', ordre: 7 },
  { id: 'gestion_active', label: 'Gestion active en cours', ordre: 8 }
]

// Étapes morcellement grands domaines — vente en lots.
export const ETAPES_MORCELLEMENT_VENTE = [
  { id: 'identification_domaine', label: 'Identification du grand domaine', ordre: 1 },
  { id: 'prospection_equipe', label: 'Mission prospection équipe terrain', ordre: 2 },
  { id: 'plan_lotissement', label: 'Plan de lotissement (géomètre)', ordre: 3, personnel: 'Géomètre' },
  { id: 'approbation_admin', label: 'Approbation administrative (autorités compétentes)', ordre: 4 },
  { id: 'creation_lots', label: 'Création des lots individuels', ordre: 5 },
  { id: 'commercialisation', label: 'Commercialisation / vente des lots', ordre: 6 },
  { id: 'titres_acheteurs', label: 'Titres délivrés aux acheteurs', ordre: 7, personnel: 'Conservation foncière' }
]

// ───────────────────────── STATUTS ─────────────────────────

export const STATUTS_DOSSIER = {
  ouvert: { label: 'Ouvert', tone: 'info' },
  en_cours: { label: 'En cours', tone: 'warning' },
  titre_obtenu: { label: 'Titre obtenu', tone: 'success' },
  morcellement: { label: 'Morcellement en cours', tone: 'warning' },
  mutation: { label: 'Mutation en cours', tone: 'warning' },
  contrat_actif: { label: 'Contrat actif', tone: 'success' },
  vente_lots: { label: 'Vente lots en cours', tone: 'warning' },
  cloture: { label: 'Clôturé', tone: 'success' },
  rejete: { label: 'Rejeté / Annulé', tone: 'danger' },
  suspendu: { label: 'Suspendu', tone: 'danger' }
}

// Statuts d'étape — vocabulaire demandé : En attente, En cours, Validé, Rejeté.
// (Les clés internes restent stables pour la logique de progression.)
export const STATUTS_ETAPE = {
  a_faire: { label: 'En attente', tone: 'neutral' },
  en_cours: { label: 'En cours', tone: 'warning' },
  termine: { label: 'Validé', tone: 'success' },
  bloque: { label: 'Rejeté', tone: 'danger' }
}

// ───────────────────────── MAPPING TYPE → ÉTAPES ─────────────────────────

export function etapesPourType(typeId) {
  switch (typeId) {
    case 'vente_cession': return ETAPES_VENTE
    case 'titre_en_cours': return ETAPES_TITRE
    case 'achat_titre': return [...ETAPES_TITRE.slice(0, 3), ...ETAPES_MUTATION]
    case 'mutation': return ETAPES_MUTATION
    case 'morcellement': return ETAPES_MORCELEMENT
    case 'donation': return ETAPES_DONATION
    case 'heritage_reconstitution': return ETAPES_HERITAGE
    case 'lotissement': return ETAPES_LOTISSEMENT
    case 'contrat_gestion': return ETAPES_CONTRAT_GESTION
    case 'morcellement_vente': return ETAPES_MORCELLEMENT_VENTE
    default: return ETAPES_TITRE
  }
}

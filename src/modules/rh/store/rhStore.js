// Socle de données du module RESSOURCES HUMAINES.
// Aligné sur la structure du module RH de FEZIRE (7 sous-modules) — relevé 28/08/2026.
// Contexte Togo : CNSS (sécurité sociale), IRPP (impôt sur le revenu des personnes physiques).

// ── Collections Firebase (namespace tp/) ──────────────────────────────────────
export const COL = {
  employes: 'rh_employes',
  departements: 'rh_departements',
  postes: 'rh_postes',
  contrats: 'rh_contrats',
  presences: 'rh_presences',
  conges: 'rh_conges',
  bulletins: 'rh_bulletins',
  dotations: 'rh_dotations',
  primes: 'rh_primes',
  typesPrimes: 'rh_types_primes',
  autorisationsSalaire: 'rh_autorisations_salaire',
  avances: 'rh_avances',
  recrutements: 'rh_recrutements',
  candidatures: 'rh_candidatures',
  formations: 'rh_formations',
  evaluations: 'rh_evaluations',
  competences: 'rh_competences',
  missions: 'rh_missions',
  taches: 'rh_taches',
  reconnaissances: 'rh_reconnaissances',
  onboarding: 'rh_onboarding',
  documents: 'rh_documents',
  config: 'rh_config'
}

// Départements par défaut (surchargés par la collection rh_departements).
// Plus aucun département écrit en dur : chacun est créé par l'utilisateur dans le volet Départements (collection rh_departements).
export const DEPARTEMENTS = []

// ── Statut d'un employé ───────────────────────────────────────────────────────
export const STATUTS_EMPLOYE = {
  actif:     { label: 'Actif', tone: 'success' },
  essai:     { label: "Période d'essai", tone: 'warning' },
  suspendu:  { label: 'Suspendu', tone: 'warning' },
  sorti:     { label: 'Sorti', tone: 'danger' }
}

// ── Types de contrat de travail ───────────────────────────────────────────────
export const TYPES_CONTRAT = {
  cdi:         { label: 'CDI', desc: 'Contrat à durée indéterminée' },
  cdd:         { label: 'CDD', desc: 'Contrat à durée déterminée (avec échéance)' },
  essai:       { label: "Période d'essai", desc: 'Avant confirmation' },
  stage:       { label: 'Stage', desc: 'Convention de stage' },
  prestation:  { label: 'Prestation', desc: 'Prestataire / consultant externe' },
  journalier:  { label: 'Journalier', desc: 'Travailleur payé à la journée' }
}

// ── Présences / pointages ─────────────────────────────────────────────────────
export const TYPES_PRESENCE = {
  present: { label: 'Présent', tone: 'success' },
  retard:  { label: 'Retard', tone: 'warning' },
  absent:  { label: 'Absent', tone: 'danger' },
  conge:   { label: 'Congé', tone: 'info' },
  mission: { label: 'Mission', tone: 'primary' }
}

// ── Types de congé / absence + droits annuels (jours ouvrés) ──────────────────
// Droit légal Togo : 30 jours ouvrables/an (~2,5 j/mois) — 25 jours ouvrés par défaut ici.
export const TYPES_CONGE = {
  annuel:      { label: 'Congé annuel payé', droit: 25, tone: 'info' },
  maladie:     { label: 'Congé maladie', droit: 15, tone: 'warning' },
  maternite:   { label: 'Congé maternité', droit: 98, tone: 'purple' },
  paternite:   { label: 'Congé paternité', droit: 3, tone: 'primary' },
  exceptionnel:{ label: 'Congé exceptionnel (événement familial)', droit: 5, tone: 'neutral' },
  sans_solde:  { label: 'Congé sans solde', droit: 0, tone: 'danger' }
}
export const STATUTS_CONGE = {
  en_attente: { label: 'En attente', tone: 'warning' },
  approuve:   { label: 'Approuvé', tone: 'success' },
  refuse:     { label: 'Refusé', tone: 'danger' }
}
export const DROIT_CONGE_ANNUEL = 25

// ── Paie (Togo) ───────────────────────────────────────────────────────────────
// Taux CNSS salarié 4 %, employeur 17,5 % (pensions, prestations familiales, risques professionnels) + AMU employeur 5 % (Assurance Maladie Universelle) = 22,5 % de charges patronales.
// IRPP = barème progressif simplifié ici.
export const PAIE_CONFIG_DEFAUT = {
  tauxCnssSalarie: 0.04,
  tauxAmuSalarie: 0.05,      // AMU retenue sur le salaire de l'employé (avec la CNSS salarié : 9 % au total)
  tauxCnssEmployeur: 0.175,
  tauxAmuEmployeur: 0.05,
  // Barème IRPP simplifié (tranches mensuelles, XOF) — paramétrable dans Configuration.
  bareme: [
    { plafond: 25000, taux: 0 },
    { plafond: 50000, taux: 0.05 },
    { plafond: 150000, taux: 0.10 },
    { plafond: 300000, taux: 0.15 },
    { plafond: Infinity, taux: 0.20 }
  ],
  devise: 'XOF'
}
// Dotations : matériel remis à un employé (uniforme, téléphone, clés…), à restituer à son départ.
export const STATUTS_DOTATION = {
  en_possession: { label: 'En possession', tone: 'info' },
  restituee:     { label: 'Restituée', tone: 'success' },
  perdue:        { label: 'Perdue ou non rendue', tone: 'danger' }
}
// Primes : un type (transport, rendement…) réglé dans les paramètres, attribué à un employé, un secteur ou toute l'équipe, approuvé par la GE.
export const STATUTS_PRIME = {
  en_attente: { label: 'En circuit', tone: 'warning' },
  autorise: { label: 'Autorisée', tone: 'success' },
  refuse: { label: 'Refusée', tone: 'danger' }
}
export const ARTICLES_DOTATION = ['Uniforme', 'Téléphone', 'Clés', 'Ordinateur', "Badge d'accès", 'Équipement de sécurité', 'Moto ou véhicule', 'Outils']
export const STATUTS_BULLETIN = {
  brouillon: { label: 'Brouillon', tone: 'warning' },
  valide:    { label: 'Validé', tone: 'success' },
  paye:      { label: 'Payé', tone: 'info' }
}
// Comptabilité : le journal de paie (PA) et les comptes SYSCOHADA associés.
export const COMPTA_PAIE = {
  journal: 'PA',
  compteCharge: '641000',      // Rémunérations du personnel (débit)
  comptePersonnel: '421000',   // Personnel, rémunérations dues (crédit)
  compteCnss: '431000'         // Sécurité sociale (crédit)
}

// ── Recrutement ───────────────────────────────────────────────────────────────
export const STATUTS_OFFRE = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  publiee:   { label: 'Publiée', tone: 'success' },
  cloturee:  { label: 'Clôturée', tone: 'danger' }
}
export const ETAPES_PIPELINE = ['Candidature', 'Présélection', 'Entretien', 'Offre', 'Recruté', 'Rejeté']

// ── Formations / Évaluations / Compétences (GPEC) ─────────────────────────────
export const STATUTS_FORMATION = {
  planifiee: { label: 'Planifiée', tone: 'info' },
  en_cours:  { label: 'En cours', tone: 'warning' },
  terminee:  { label: 'Terminée', tone: 'success' }
}
export const NIVEAUX_COMPETENCE = ['Débutant', 'Intermédiaire', 'Confirmé', 'Expert']

// ── Missions & frais ──────────────────────────────────────────────────────────
// Avances sur salaire et prêts : demandée → approuvée (GE) → versée → remboursée (retenues sur les bulletins de paie) ; ou refusée.
export const STATUTS_AVANCE = {
  demandee:  { label: 'Demandée', tone: 'warning' },
  approuvee: { label: 'Approuvée : à décaisser', tone: 'info' },
  versee:    { label: 'Décaissée : retenue sur la paie', tone: 'primary' },
  remboursee:{ label: 'Remboursée', tone: 'success' },
  refusee:   { label: 'Refusée', tone: 'danger' },
  annulee:   { label: 'Non décaissée', tone: 'neutral' }
}
export const STATUTS_MISSION = {
  demandee:  { label: 'Demandée', tone: 'warning' },
  approuvee: { label: 'Approuvée', tone: 'info' },
  refusee:   { label: 'Refusée', tone: 'danger' },
  terminee:  { label: 'Terminée', tone: 'success' },
  remboursee:{ label: 'Remboursée', tone: 'primary' }
}

export const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

// ── Calcul d'un bulletin de paie (à partir du salaire brut) ───────────────────
// `retenues` : total des mensualités d'avances et de prêts retenues ce mois-ci sur le net (cf. avancesCircuit.js).
// `retenuePresence` : retenue pour absences non justifiées et retards (cf. retenuesPresence.js). Ces jours ne sont pas payés : elle réduit le brut,
// donc aussi la CNSS, l'IRPP et les charges patronales.
export function calculerBulletin(brut, primes = 0, config = PAIE_CONFIG_DEFAUT, retenues = 0, retenuePresence = 0) {
  const retenueAbsences = Math.max(0, Math.round(Number(retenuePresence) || 0))
  const brutTotal = Math.max(0, (Number(brut) || 0) + (Number(primes) || 0) - retenueAbsences)
  const cnssSalarie = Math.round(brutTotal * config.tauxCnssSalarie)
  const baseImposable = brutTotal - cnssSalarie
  // AMU salarié : retenue sur le salaire, en plus de la CNSS salarié (et de la part AMU payée par l'employeur).
  const amuSalarie = Math.round(brutTotal * (config.tauxAmuSalarie ?? PAIE_CONFIG_DEFAUT.tauxAmuSalarie))
  const its = calculerITS(baseImposable, config.bareme)
  const retenueAvances = Math.max(0, Math.round(Number(retenues) || 0))
  const net = brutTotal - cnssSalarie - amuSalarie - its - retenueAvances
  const cnssEmployeur = Math.round(brutTotal * config.tauxCnssEmployeur)
  const amuEmployeur = Math.round(brutTotal * (config.tauxAmuEmployeur ?? PAIE_CONFIG_DEFAUT.tauxAmuEmployeur))
  const coutEmployeur = brutTotal + cnssEmployeur + amuEmployeur
  return { brutTotal, cnssSalarie, amuSalarie, baseImposable, its, retenueAvances, retenuePresence: retenueAbsences, net, cnssEmployeur, amuEmployeur, coutEmployeur }
}

function calculerITS(base, bareme = PAIE_CONFIG_DEFAUT.bareme) {
  let reste = base, prec = 0, impot = 0
  for (const t of bareme) {
    const tranche = Math.min(reste, t.plafond - prec)
    if (tranche <= 0) break
    impot += tranche * t.taux
    reste -= tranche
    prec = t.plafond
    if (reste <= 0) break
  }
  return Math.round(impot)
}

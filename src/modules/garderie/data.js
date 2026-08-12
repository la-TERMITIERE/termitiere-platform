// Référentiel statique du module Garderie.

export const GROUPES_AGE = [
  { id: 'nourrisson', label: 'Nourrisson', desc: '0 – 12 mois' },
  { id: 'bambin', label: 'Bambin', desc: '1 – 2 ans' },
  { id: 'petite_section', label: 'Petite section', desc: '3 ans' },
  { id: 'moyenne_section', label: 'Moyenne section', desc: '4 ans' },
  { id: 'grande_section', label: 'Grande section', desc: '5 – 6 ans' }
]

// La Termitière fait tourner deux programmes distincts au sein d'E-GARDERIE : la
// garderie (0-2 ans) et la maternelle (3-6 ans, petite/moyenne/grande section — les
// classes maternelles classiques). Choisi explicitement à l'inscription (cf.
// Enfants.jsx), en plus du groupe d'âge précis, pour que « garderie ou maternelle »
// soit une information de premier niveau (filtre, statistiques…), pas seulement
// déductible du groupe.
export const PROGRAMMES_ENFANT = [
  { id: 'garderie',   label: 'Garderie',   desc: '0 – 2 ans', tone: 'info' },
  { id: 'maternelle', label: 'Maternelle', desc: '3 – 6 ans', tone: 'success' }
]

export const GROUPES_PAR_PROGRAMME = {
  garderie: ['nourrisson', 'bambin'],
  maternelle: ['petite_section', 'moyenne_section', 'grande_section']
}

// Programme auquel appartient un groupe d'âge — sert de repli pour les fiches
// enregistrées avant l'ajout du champ `programme` explicite.
export const programmeDuGroupe = (groupeId) =>
  GROUPES_PAR_PROGRAMME.maternelle.includes(groupeId) ? 'maternelle' : 'garderie'

export const STATUTS_ENFANT = {
  actif:    { label: 'Actif',    tone: 'success' },
  suspendu: { label: 'Suspendu', tone: 'warning' },
  sorti:    { label: 'Sorti',    tone: 'neutral' }
}

export const STATUTS_PRESENCE = {
  present:  { label: 'Présent',  tone: 'success' },
  absent:   { label: 'Absent',   tone: 'danger'  },
  excuse:   { label: 'Excusé',   tone: 'warning' }
}

export const TYPES_PAIEMENT = [
  { id: 'mensuel',       label: 'Mensualité'       },
  { id: 'inscription',  label: 'Frais d\'inscription' },
  { id: 'fourniture',   label: 'Fournitures'       },
  { id: 'sortie',       label: 'Sortie scolaire'   },
  { id: 'autre',        label: 'Autre'             }
]

export const MODES_PAIEMENT = [
  { id: 'espece',   label: 'Espèces'      },
  { id: 'mobile',   label: 'Mobile money' },
  { id: 'virement', label: 'Virement'     },
  { id: 'cheque',   label: 'Chèque'       }
]

export const STATUTS_PAIEMENT = {
  paye:      { label: 'Payé',     tone: 'success' },
  partiel:   { label: 'Partiel',  tone: 'warning' },
  impaye:    { label: 'Impayé',   tone: 'danger'  },
  en_attente:{ label: 'En attente', tone: 'neutral'}
}

export const TYPES_INCIDENT = [
  { id: 'accident',  label: 'Accident / blessure' },
  { id: 'maladie',   label: 'Maladie / fièvre'    },
  { id: 'allergie',  label: 'Réaction allergique'  },
  { id: 'fugue',     label: 'Fugue / disparition'  },
  { id: 'conflit',   label: 'Conflit entre enfants'},
  { id: 'autre',     label: 'Autre'                }
]

export const GRAVITES_INCIDENT = {
  faible:  { label: 'Faible',  tone: 'success' },
  moyen:   { label: 'Moyen',   tone: 'warning' },
  grave:   { label: 'Grave',   tone: 'danger'  }
}

// ── Infirmerie & Soins ──
export const TYPES_SOIN = [
  { id: 'medicament',  label: '💊 Médicament administré' },
  { id: 'temperature', label: '🌡️ Prise de température'   },
  { id: 'bobo',        label: '🩹 Petit soin (bobo, désinfection)' },
  { id: 'vaccination', label: '💉 Vaccination'            },
  { id: 'visite',      label: '🩺 Visite médicale'        },
  { id: 'autre',       label: 'Autre soin'                }
]

export const STATUTS_SOIN = {
  effectue: { label: 'Effectué', tone: 'success' },
  a_suivre: { label: 'À suivre', tone: 'warning' }
}

// Calendrier vaccinal standard (PEV — Programme Élargi de Vaccination, Togo)
export const VACCINS_STANDARD = [
  { id: 'bcg',        label: 'BCG (tuberculose)',              age: 'Naissance'   },
  { id: 'polio0',     label: 'Polio 0',                        age: 'Naissance'   },
  { id: 'penta1',     label: 'Penta 1 (DTC-HepB-Hib)',         age: '6 semaines'  },
  { id: 'polio1',     label: 'Polio 1',                        age: '6 semaines'  },
  { id: 'pneumo1',    label: 'Pneumocoque 1',                  age: '6 semaines'  },
  { id: 'rota1',      label: 'Rotavirus 1',                    age: '6 semaines'  },
  { id: 'penta2',     label: 'Penta 2 (DTC-HepB-Hib)',         age: '10 semaines' },
  { id: 'polio2',     label: 'Polio 2',                        age: '10 semaines' },
  { id: 'pneumo2',    label: 'Pneumocoque 2',                  age: '10 semaines' },
  { id: 'rota2',      label: 'Rotavirus 2',                    age: '10 semaines' },
  { id: 'penta3',     label: 'Penta 3 (DTC-HepB-Hib)',         age: '14 semaines' },
  { id: 'polio3',     label: 'Polio 3',                        age: '14 semaines' },
  { id: 'pneumo3',    label: 'Pneumocoque 3',                  age: '14 semaines' },
  { id: 'fievrejaune',label: 'Fièvre jaune',                   age: '9 mois'      },
  { id: 'rougeole1',  label: 'Rougeole-Rubéole (1ère dose)',   age: '9 mois'      },
  { id: 'meningiteA', label: 'Méningite A',                    age: '9 mois'      },
  { id: 'rougeole2',  label: 'Rougeole-Rubéole (2e dose)',     age: '15 mois'     }
]

export const POSTES_PERSONNEL = [
  { id: 'tata',        label: 'Tata (puéricultrice)' },
  { id: 'responsable', label: 'Responsable de salle'  },
  { id: 'directrice',  label: 'Directrice'            },
  { id: 'cuisinier',   label: 'Cuisinier(ère)'        },
  { id: 'agent',       label: 'Agent d\'entretien'    },
  { id: 'autre',       label: 'Autre'                 }
]

// Grille tarifaire selon l'âge de l'enfant (montant mensuel en FCFA)
export const GRILLE_TARIFAIRE = [
  { label: '6 mois – 1 an',  minMois: 6,  maxMois: 12, tarif: 35000 },
  { label: '1 an – 3 ans',   minMois: 12, maxMois: 36, tarif: 45000 },
  { label: '3 ans – 5 ans',  minMois: 36, maxMois: 60, tarif: 65000 },
]

export const TYPES_REPAS = {
  menu:    { label: 'Menu du jour',  tone: 'success' },
  special: { label: 'Repas spécial', tone: 'neutral' },
  apporte: { label: 'Repas apporté', tone: 'neutral' }
}

export const APPETITS = {
  bien:  { label: 'Bien mangé',  tone: 'success' },
  peu:   { label: 'Peu mangé',   tone: 'warning' },
  refus: { label: 'Refus',       tone: 'danger'  }
}

export const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

export const MOIS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
]

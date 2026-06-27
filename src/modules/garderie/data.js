// Référentiel statique du module Garderie.

export const GROUPES_AGE = [
  { id: 'nourrisson', label: 'Nourrisson', desc: '0 – 12 mois' },
  { id: 'bambin', label: 'Bambin', desc: '1 – 2 ans' },
  { id: 'petite_section', label: 'Petite section', desc: '3 ans' },
  { id: 'moyenne_section', label: 'Moyenne section', desc: '4 ans' },
  { id: 'grande_section', label: 'Grande section', desc: '5 – 6 ans' }
]

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

export const POSTES_PERSONNEL = [
  { id: 'tata',        label: 'Tata (puéricultrice)' },
  { id: 'responsable', label: 'Responsable de salle'  },
  { id: 'directrice',  label: 'Directrice'            },
  { id: 'cuisinier',   label: 'Cuisinier(ère)'        },
  { id: 'agent',       label: 'Agent d\'entretien'    },
  { id: 'autre',       label: 'Autre'                 }
]

export const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

export const MOIS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
]

// Couleurs / logos / noms d'affichage par module — partagés par la barre
// supérieure et les alertes de notification (bandeaux façon WhatsApp).
export const MODULE_THEME = {
  agro:         { color: '#2EAA3F', color2: '#1a6e27', logo: '/maxi-agro-logo.png',        nom: 'MAXI AGRO'              },
  logistique:   { color: '#BC3C31', color2: '#1A1A1A', logo: '/logo_maxi_logistique.png',  nom: 'Maxi Logistique'        },
  garderie:     { color: '#E8390E', color2: '#F5A800', logo: '/garderie-logo.png',          nom: 'Garderie La Termitière' },
  evenementiel: { color: '#7c3aed', color2: '#4c1d95', logo: null,                          nom: 'BRIQUETERIE'            },
  foncier:      { color: '#059669', color2: '#065f46', logo: null,                          nom: 'FONCIER'                },
  rh:           { color: '#ea580c', color2: '#9a3412', logo: null,                          nom: 'COMPTABILITÉ'           },
  projet:       { color: '#0d9488', color2: '#0f5450', logo: null,                          nom: 'E-G.Pro'                },
  depense:      { color: '#B45309', color2: '#78350F', logo: null,                          nom: 'E-DÉPENSES'             },
  default:      { color: '#BC3C31', color2: '#1A1A1A', logo: '/termitiere-logo.png',         nom: 'LA TERMITIÈRE'          }
}

export const themeOf = (moduleId) => MODULE_THEME[moduleId] || MODULE_THEME.default

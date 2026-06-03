// Données de référence MAXI-AGRO — espèces animales et aliments/divers.
// Valeurs reprises fidèlement de l'application existante (index.html).
// Prix en FCFA (entiers).

export const ESPECES = [
  // OVINS
  { id: 'brebis', nom: 'Brebis', cat: 'OVINS', prix: 75000 },
  { id: 'beliers', nom: 'Béliers', cat: 'OVINS', prix: 90000 },
  { id: 'agneaux', nom: 'Agneaux (≤6 mois)', cat: 'OVINS', prix: 35000 },
  // BOVINS
  { id: 'boeufs', nom: 'Bœufs', cat: 'BOVINS', prix: 450000 },
  { id: 'vaches', nom: 'Vaches', cat: 'BOVINS', prix: 350000 },
  { id: 'veaux', nom: 'Veaux (≥8 mois)', cat: 'BOVINS', prix: 180000 },
  // CAPRINS
  { id: 'boucs', nom: 'Boucs', cat: 'CAPRINS', prix: 50000 },
  { id: 'chevres', nom: 'Chèvres', cat: 'CAPRINS', prix: 40000 },
  { id: 'chevreaux', nom: 'Chevreaux (≤8 mois)', cat: 'CAPRINS', prix: 20000 },
  // VOLAILLES
  { id: 'poulets_g', nom: 'Poulets Goliath', cat: 'VOLAILLES', prix: 8000 },
  { id: 'poussins_g', nom: 'Poussins Goliath', cat: 'VOLAILLES', prix: 2500 },
  { id: 'poulets_o', nom: 'Poulets Ordinaires', cat: 'VOLAILLES', prix: 4000 },
  { id: 'poussins_o', nom: 'Poussins Ordinaires', cat: 'VOLAILLES', prix: 1500 },
  { id: 'poulets_c', nom: 'Poulets de Chair', cat: 'VOLAILLES', prix: 5500 },
  { id: 'poussins', nom: 'Poussins', cat: 'VOLAILLES', prix: 1200 },
  { id: 'pintades', nom: 'Pintades', cat: 'VOLAILLES', prix: 7000 },
  { id: 'pintadeaux', nom: 'Pintadeaux', cat: 'VOLAILLES', prix: 3500 },
  { id: 'dindons', nom: 'Dindons', cat: 'VOLAILLES', prix: 15000 },
  { id: 'dindonneaux', nom: 'Dindonneaux', cat: 'VOLAILLES', prix: 5000 },
  { id: 'canards', nom: 'Canards', cat: 'VOLAILLES', prix: 6000 },
  { id: 'cannetons', nom: 'Cannetons', cat: 'VOLAILLES', prix: 2500 }
]

export const ALIMENTS = [
  { id: 'tourteau_mais', nom: 'Tourteau de Maïs', cat: 'ALIMENTS', prix: 350 },
  { id: 'son_poudre', nom: 'Son en poudre', cat: 'ALIMENTS', prix: 250 },
  { id: 'aliments_pontes', nom: 'Aliments pontes', cat: 'ALIMENTS', prix: 22000 },
  { id: 'aliments_pous', nom: 'Aliments poussin', cat: 'ALIMENTS', prix: 24000 },
  { id: 'cartons', nom: 'Cartons', cat: 'ALIMENTS', prix: 500 },
  { id: 'sels', nom: 'Sels', cat: 'ALIMENTS', prix: 1500 },
  { id: 'epluche_manioc', nom: 'Épluché de manioc', cat: 'ALIMENTS', prix: 200 },
  { id: 'tourteau_soja', nom: 'Tourteau de soja', cat: 'ALIMENTS', prix: 600 },
  { id: 'sorgho', nom: 'Sorgho', cat: 'ALIMENTS', prix: 400 },
  { id: 'huile_moteur', nom: 'Huile à moteur', cat: 'DIVERS', prix: 4000 },
  { id: 'gasoil', nom: 'Gasoil', cat: 'DIVERS', prix: 700 },
  { id: 'carburant', nom: 'Carburant', cat: 'DIVERS', prix: 800 },
  { id: 'pierre_lecher', nom: 'Pierre à lécher', cat: 'DIVERS', prix: 5000 }
]

// Catégories de base et couleurs associées (pour graphiques / styles)
export const CAT_ANIMAUX = ['OVINS', 'BOVINS', 'CAPRINS', 'VOLAILLES']
export const CAT_ALIMENTS = ['ALIMENTS', 'DIVERS']
export const CAT_COLORS = {
  OVINS: '#0284c7',
  BOVINS: '#7c3aed',
  CAPRINS: '#16a34a',
  VOLAILLES: '#ea580c',
  ALIMENTS: '#0369a1',
  DIVERS: '#64748b'
}

// Palette de secours pour les catégories personnalisées (créées par l'utilisateur).
const EXTRA_COLORS = ['#0891b2', '#db2777', '#ca8a04', '#4f46e5', '#0d9488', '#be123c', '#7c3aed', '#15803d']

// Couleur stable associée à une catégorie (base connue, sinon dérivée du nom).
export function catColor(cat) {
  if (CAT_COLORS[cat]) return CAT_COLORS[cat]
  let h = 0
  for (let i = 0; i < (cat || '').length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0
  return EXTRA_COLORS[h % EXTRA_COLORS.length]
}

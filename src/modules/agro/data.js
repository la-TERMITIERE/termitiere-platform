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
  // POULETS (poulets ordinaires, Goliath, de chair + poussins)
  { id: 'poulets_g', nom: 'Poulets Goliath', cat: 'POULETS', prix: 8000 },
  { id: 'poussins_g', nom: 'Poussins Goliath', cat: 'POULETS', prix: 2500 },
  { id: 'poulets_o', nom: 'Poulets Ordinaires', cat: 'POULETS', prix: 4000 },
  { id: 'poussins_o', nom: 'Poussins Ordinaires', cat: 'POULETS', prix: 1500 },
  { id: 'poulets_c', nom: 'Poulets de Chair', cat: 'POULETS', prix: 5500 },
  { id: 'poussins', nom: 'Poussins', cat: 'POULETS', prix: 1200 },
  // PINTADES (pintades + pintadeaux)
  { id: 'pintades', nom: 'Pintades', cat: 'PINTADES', prix: 7000 },
  { id: 'pintadeaux', nom: 'Pintadeaux', cat: 'PINTADES', prix: 3500 },
  // DINDONS (dindons + dindonneaux)
  { id: 'dindons', nom: 'Dindons', cat: 'DINDONS', prix: 15000 },
  { id: 'dindonneaux', nom: 'Dindonneaux', cat: 'DINDONS', prix: 5000 },
  // CANARDS (canards + cannetons)
  { id: 'canards', nom: 'Canards', cat: 'CANARDS', prix: 6000 },
  { id: 'cannetons', nom: 'Cannetons', cat: 'CANARDS', prix: 2500 }
]

// Migration : la catégorie globale « VOLAILLES » est éclatée en 4 catégories
// autonomes. Cette table remappe chaque ancienne espèce volaille vers sa nouvelle
// catégorie (utilisée par le store pour migrer le référentiel existant en base).
export const VOLAILLE_MAP = {
  poulets_g: 'POULETS', poussins_g: 'POULETS', poulets_o: 'POULETS',
  poussins_o: 'POULETS', poulets_c: 'POULETS', poussins: 'POULETS',
  pintades: 'PINTADES', pintadeaux: 'PINTADES',
  dindons: 'DINDONS', dindonneaux: 'DINDONS',
  canards: 'CANARDS', cannetons: 'CANARDS'
}

// Déduit la catégorie de volaille à partir du NOM de l'espèce (robuste aux
// identifiants personnalisés : « Poulet Ordinaire », « Poulets de Chairs »…).
// Renvoie null si le nom ne correspond à aucune volaille connue.
export function categorieVolaille(nom) {
  const s = (nom || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (s.includes('canard') || s.includes('caneton') || s.includes('canneton')) return 'CANARDS'
  if (s.includes('dindon')) return 'DINDONS'          // dindon, dindonneau(x)
  if (s.includes('pintad')) return 'PINTADES'         // pintade(s), pintadeau(x)
  if (s.includes('poul') || s.includes('poussin')) return 'POULETS' // poule(t)s, poussin(s)
  return null
}

export const ALIMENTS = [
  { id: 'tourteau_mais', nom: 'Tourteau de Maïs', cat: 'ALIMENTS', prix: 350, unite: 'kg' },
  { id: 'son_poudre', nom: 'Son en poudre', cat: 'ALIMENTS', prix: 250, unite: 'kg' },
  { id: 'aliments_pontes', nom: 'Aliments pontes', cat: 'ALIMENTS', prix: 22000, unite: 'sacs' },
  { id: 'aliments_pous', nom: 'Aliments poussin', cat: 'ALIMENTS', prix: 24000, unite: 'sacs' },
  { id: 'cartons', nom: 'Cartons', cat: 'ALIMENTS', prix: 500, unite: 'unités' },
  { id: 'sels', nom: 'Sels', cat: 'ALIMENTS', prix: 1500, unite: 'kg' },
  { id: 'epluche_manioc', nom: 'Épluché de manioc', cat: 'ALIMENTS', prix: 200, unite: 'kg' },
  { id: 'tourteau_soja', nom: 'Tourteau de soja', cat: 'ALIMENTS', prix: 600, unite: 'kg' },
  { id: 'sorgho', nom: 'Sorgho', cat: 'ALIMENTS', prix: 400, unite: 'kg' },
  { id: 'huile_moteur', nom: 'Huile à moteur', cat: 'DIVERS', prix: 4000, unite: 'litres' },
  { id: 'gasoil', nom: 'Gasoil', cat: 'DIVERS', prix: 700, unite: 'litres' },
  { id: 'carburant', nom: 'Carburant', cat: 'DIVERS', prix: 800, unite: 'litres' },
  { id: 'pierre_lecher', nom: 'Pierre à lécher', cat: 'DIVERS', prix: 5000, unite: 'unités' }
]

export const UNITES_ALIMENT = ['kg', 'sacs', 'litres', 'unités', 'tonnes', 'balles']

// Catégories de base et couleurs associées (pour graphiques / styles).
// « VOLAILLES » est désormais éclatée en CANARDS, DINDONS, PINTADES, POULETS.
export const CAT_ANIMAUX = ['OVINS', 'BOVINS', 'CAPRINS', 'CANARDS', 'DINDONS', 'PINTADES', 'POULETS']
export const CAT_ALIMENTS = ['ALIMENTS', 'DIVERS']
export const CAT_COLORS = {
  OVINS: '#0284c7',
  BOVINS: '#7c3aed',
  CAPRINS: '#16a34a',
  CANARDS: '#0891b2',
  DINDONS: '#be123c',
  PINTADES: '#d97706',
  POULETS: '#ea580c',
  VOLAILLES: '#ea580c', // conservé (compat anciennes données avant migration)
  ALIMENTS: '#0369a1',
  DIVERS: '#64748b'
}

// ─────────── Workflow de FACTURATION (sortie de stock) ───────────
// brouillon → sortie_demandee → sortie_approuvee → certifiee
//                    ↘ refusee            ↘ modif_demandee ↗ (ajustement hiérarchie)
export const FACTURE_STATUTS = {
  brouillon:        { label: 'Brouillon', tone: 'neutral' },
  sortie_demandee:  { label: 'Sortie demandée', tone: 'warning' },
  sortie_approuvee: { label: 'Sortie approuvée', tone: 'info' },
  modif_demandee:   { label: 'Modification demandée', tone: 'warning' },
  certifiee:        { label: 'Certifiée', tone: 'success' },
  refusee:          { label: 'Refusée', tone: 'danger' }
}
// Les factures héritées (sans statut) sont considérées CERTIFIÉES (déjà émises).
export const factureStatut = (f) => (f && f.statut) || 'certifiee'

// Palette de secours pour les catégories personnalisées (créées par l'utilisateur).
const EXTRA_COLORS = ['#0891b2', '#db2777', '#ca8a04', '#4f46e5', '#0d9488', '#be123c', '#7c3aed', '#15803d']

// Couleur stable associée à une catégorie (base connue, sinon dérivée du nom).
export function catColor(cat) {
  if (CAT_COLORS[cat]) return CAT_COLORS[cat]
  let h = 0
  for (let i = 0; i < (cat || '').length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0
  return EXTRA_COLORS[h % EXTRA_COLORS.length]
}

// Référentiel matériel logistique & événementiel — catégories et articles par défaut.
// La liste complète sera complétée par le gérant via Paramètres.

export const CAT_MATERIEL = [
  'TENTES & STRUCTURES',
  'TABLES',
  'CHAISES',
  'SONORISATION',
  'ÉCLAIRAGE',
  'DÉCORATION',
  'VAISSELLE & SERVICE',
  'AUTRES'
]

// Ancienne catégorie fusionnée « TABLES & CHAISES » → éclatée en TABLES / CHAISES.
// Réaffecte un matériel hérité à la bonne catégorie d'après son nom.
export const ANCIENNE_CAT_TABLES_CHAISES = 'TABLES & CHAISES'
export function migrerCatTableChaise(cat, nom) {
  if (cat !== ANCIENNE_CAT_TABLES_CHAISES) return cat
  return /chaise|tabouret|banc/i.test(nom || '') ? 'CHAISES' : 'TABLES'
}

export const MATERIEL = [
  { id: 'tente_5x5', nom: 'Tente 5×5 m', cat: 'TENTES & STRUCTURES', unite: 'unités', coutAchat: 850000, tarifLocation: 75000 },
  { id: 'tente_10x10', nom: 'Tente 10×10 m', cat: 'TENTES & STRUCTURES', unite: 'unités', coutAchat: 1800000, tarifLocation: 150000 },
  { id: 'chaise_pliante', nom: 'Chaise pliante', cat: 'CHAISES', unite: 'unités', coutAchat: 8500, tarifLocation: 500 },
  { id: 'table_ronde', nom: 'Table ronde (8 pers.)', cat: 'TABLES', unite: 'unités', coutAchat: 45000, tarifLocation: 5000 },
  { id: 'table_rect', nom: 'Table rectangulaire', cat: 'TABLES', unite: 'unités', coutAchat: 35000, tarifLocation: 4000 },
  { id: 'enceinte', nom: 'Enceinte active', cat: 'SONORISATION', unite: 'unités', coutAchat: 320000, tarifLocation: 35000 },
  { id: 'console_mix', nom: 'Console de mixage', cat: 'SONORISATION', unite: 'unités', coutAchat: 450000, tarifLocation: 50000 },
  { id: 'projecteur', nom: 'Projecteur LED', cat: 'ÉCLAIRAGE', unite: 'unités', coutAchat: 120000, tarifLocation: 15000 },
  { id: 'guirlande', nom: 'Guirlande lumineuse', cat: 'ÉCLAIRAGE', unite: 'unités', coutAchat: 25000, tarifLocation: 3000 },
  { id: 'nappe', nom: 'Nappe décorative', cat: 'DÉCORATION', unite: 'unités', coutAchat: 8000, tarifLocation: 1000 },
  { id: 'chafing', nom: 'Chafing dish', cat: 'VAISSELLE & SERVICE', unite: 'unités', coutAchat: 55000, tarifLocation: 6000 }
]

export const CAT_COLORS = {
  'TENTES & STRUCTURES': '#0284c7',
  'TABLES': '#7c3aed',
  'CHAISES': '#9333ea',
  'TABLES & CHAISES': '#7c3aed',
  'SONORISATION': '#ea580c',
  'ÉCLAIRAGE': '#ca8a04',
  'DÉCORATION': '#db2777',
  'VAISSELLE & SERVICE': '#16a34a',
  'AUTRES': '#64748b'
}

const EXTRA = ['#0891b2', '#4f46e5', '#0d9488', '#be123c']

export function catColor(cat) {
  if (CAT_COLORS[cat]) return CAT_COLORS[cat]
  let h = 0
  for (let i = 0; i < (cat || '').length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0
  return EXTRA[h % EXTRA.length]
}

// Types d'événements courants (modifiables dans le Référentiel).
export const EVENEMENTS = [
  'Mariage',
  'Funérailles',
  'Baptême',
  'Anniversaire',
  'Conférence / Séminaire',
  'Concert / Spectacle',
  'Cérémonie religieuse',
  'Réunion / Assemblée'
]

// Palette réutilisée pour colorer les éléments/événements dans les analyses.
const PALETTE = ['#0284c7', '#7c3aed', '#ea580c', '#16a34a', '#db2777', '#ca8a04', '#0891b2', '#4f46e5', '#0d9488', '#be123c', '#9333ea', '#f59e0b']

export function labelColor(label) {
  let h = 0
  const s = String(label || '')
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

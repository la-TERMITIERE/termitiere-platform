// Utilitaires couleur — conversion hex → rgba pour teinter des fonds glassmorphism
// avec la couleur d'un secteur (cf. SECTEURS dans modules/depense/data.js).
export function teinterHex(hex, alpha) {
  const n = parseInt((hex || '#0d9488').replace('#', ''), 16)
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`
}

// Assombrit/éclaircit une couleur hex de `percent` (négatif = plus sombre) — sert à
// construire le second point d'un dégradé d'en-tête à partir d'une seule couleur.
export function shadeHex(hex, percent) {
  const n = parseInt((hex || '#000000').replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const r = Math.max(0, Math.min(255, (n >> 16) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// Palette d'avatars — dégradés harmonieux (marque + couleurs des modules), attribués
// de façon stable à partir du nom/identifiant : la même personne garde toujours la
// même couleur partout dans l'appli, tout en distinguant visuellement chaque ligne
// d'une liste (au lieu d'un unique rouge répété qui rend tout le monde identique).
const PALETTE_AVATAR = [
  ['#D9594B', '#8F2A20'], // rouge marque
  ['#4ADE80', '#15803D'], // vert
  ['#38BDF8', '#0369A1'], // bleu
  ['#C084FC', '#7C3AED'], // violet
  ['#FB923C', '#C2410C'], // orange
  ['#F472B6', '#BE185D'], // rose
  ['#2DD4BF', '#0D9488'], // teal
  ['#FBBF24', '#B45309']  // ambre
]

export function avatarGradient(seed) {
  const s = String(seed || '?')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  const [from, to] = PALETTE_AVATAR[h % PALETTE_AVATAR.length]
  return `linear-gradient(135deg, ${from}, ${to})`
}

// Couleur de marque de chaque module (cf. MODULES dans shared/modules.js) — pour
// teinter les petites fenêtres de détail (factures, dossiers, fiches…) à la couleur
// du module plutôt qu'en gris/blanc générique.
export const COULEUR_MODULE = {
  agro: '#2EAA3F', logistique: '#BC3C31', evenementiel: '#7c3aed',
  foncier: '#059669', garderie: '#E8390E', rh: '#ea580c',
  projet: '#0d9488', depense: '#B45309', gym: '#E8850F'
}

// Props prêtes à étaler sur <Modal> pour un rendu glassmorphism teinté d'une couleur
// (module ou secteur) — même recette que DetailProjetModal.jsx / Btp.jsx : overlay
// flouté légèrement teinté, panneau translucide clair avec une pointe de la couleur.
export function glassModalProps(color) {
  return {
    overlayClassName: 'backdrop-blur-md',
    overlayStyle: { background: `linear-gradient(135deg, ${teinterHex('#1A1A1A', 0.65)}, ${teinterHex(color, 0.55)})` },
    panelClassName: 'relative overflow-hidden border border-white/60 backdrop-blur-2xl',
    // Panneau plus opaque (0.85 → 0.96) : le contenu de la page derrière (flouté)
    // transparaissait encore assez pour rendre certains textes difficiles à lire.
    panelStyle: { background: `linear-gradient(160deg, ${teinterHex('#ffffff', 0.96)}, ${teinterHex(color, 0.08)})` }
  }
}

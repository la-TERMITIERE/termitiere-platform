// Utilitaires couleur — conversion hex → rgba pour teinter des fonds glassmorphism
// avec la couleur d'un secteur (cf. SECTEURS dans modules/depense/data.js).
export function teinterHex(hex, alpha) {
  const n = parseInt((hex || '#0d9488').replace('#', ''), 16)
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`
}

// Couleur de marque de chaque module (cf. MODULES dans shared/modules.js) — pour
// teinter les petites fenêtres de détail (factures, dossiers, fiches…) à la couleur
// du module plutôt qu'en gris/blanc générique.
export const COULEUR_MODULE = {
  agro: '#2EAA3F', logistique: '#BC3C31', evenementiel: '#7c3aed',
  foncier: '#059669', garderie: '#E8390E', rh: '#ea580c',
  projet: '#0d9488', depense: '#B45309'
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

// Bouton d'action d'une ligne de tableau (voir, modifier, supprimer, valider…) : tuile de verre à
// icône colorée ; au survol il se remplit en relief 3D et l'icône s'agite légèrement.
// Styles : `.act-ico` dans index.css.
const TONES = {
  voir: '#0EA5E9',
  modifier: '#E8850F',
  supprimer: '#DC2626',
  valider: '#16A34A',
  neutre: '#64748B'
}

export default function ActionIcone({ icone: Icone, tone = 'neutre', title, onClick, disabled, size = 15, className = '' }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick?.(e) }}
      className={`act-ico ${className}`} style={{ '--c': TONES[tone] || tone }}>
      <Icone size={size} className="act-ico-svg" />
    </button>
  )
}

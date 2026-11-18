
// Groupe de formulaire : label + champ + message d'erreur optionnel.
// Dans une fenêtre (.modal-glass), il devient une tuile de verre « bento » (cf. index.css).
// `icone` : icône (lucide) devant le libellé. Dans une fenêtre qui active les icônes automatiques (ModalAgro),
// une icône est choisie d'après le libellé quand `icone` n'est pas donné ; `icone={false}` la retire.
import { useContext } from 'react'
import { IconesAutoContext, iconePourLabel } from './iconesChamps'

export default function FormGroup({ label, required, error, hint, children, className = '', icone }) {
  const auto = useContext(IconesAutoContext)
  const Icone = icone === false ? null : (icone || (auto && label ? iconePourLabel(label) : null))
  return (
    // min-w-0 : sans lui, un FormGroup posé dans une grille/flex (ex. grid-cols-3)
    // refuse de rétrécir sous la largeur "naturelle" de son contenu (ici, un champ
    // avec bouton accolé, cf. ChampBeneficiaire/ChampAutocomplete) — il déborde alors
    // sur la colonne voisine au lieu de se comprimer, donnant un champ décalé/superposé.
    <div className={`fg-tuile mb-3 min-w-0 ${className}`}>
      {label && (
        <label className={`mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300 ${Icone ? 'flex items-center gap-1.5' : 'block'}`}>
          {Icone && <Icone size={14} aria-hidden="true" className="shrink-0" style={{ color: 'var(--fg-icone, currentColor)' }} />}
          <span>{label} {required && <span className="text-red-500">*</span>}</span>
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}

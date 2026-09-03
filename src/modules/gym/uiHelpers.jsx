// MAXI-GYM — petits éléments d'UI partagés entre les volets (Paramètres, Coachs…)
// pour un langage visuel cohérent : titres de section avec badge d'icône coloré,
// champs numériques avec leur unité affichée en clair.
import Input from '../../shared/forms/Input'

const COULEUR = '#E8850F'

// Titre de section avec badge d'icône coloré — même langage visuel que les
// bandeaux héro des modales (Séances/Abonnements/Coachs).
export const titreSection = (Icon, label) => (
  <span className="flex items-center gap-2.5">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: COULEUR + '18', color: COULEUR }}>
      <Icon size={17} />
    </span>
    {label}
  </span>
)

// Classe prête à l'emploi pour une <Card> « premium » (bordure accentuée +
// léger soulèvement au survol) — cohérente sur tout le module.
export const CARD_ACCENT_CLASS = 'border-l-4 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-16px_rgba(26,26,26,0.20)]'
export const cardAccentStyle = (couleur = COULEUR) => ({ borderLeftColor: couleur })

// Champ numérique avec son unité affichée EN CLAIR dans le champ (FCFA, h,
// jours…) — évite l'ambiguïté d'un simple nombre nu.
export const ChampUnite = ({ unite, className = '', ...props }) => (
  <div className="relative">
    <Input type="number" className={`pr-14 ${className}`} {...props} />
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">{unite}</span>
  </div>
)

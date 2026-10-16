// MAXI-GYM — petits éléments d'UI partagés entre les volets (Paramètres, Coachs…)
// pour un langage visuel cohérent : titres de section avec badge d'icône coloré,
// champs numériques avec leur unité affichée en clair.
import { Loader2, Plus } from 'lucide-react'
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

// Bouton du module MAXI-GYM : dégradé rouge brique vers orange, reflet de verre, icône dans une pastille lumineuse et
// léger reflet qui balaie le bouton au survol. Trois styles : principal (enregistrer), secondaire (ajouter), danger.
const STYLES_BOUTON = {
  principal: {
    fond: 'linear-gradient(135deg, #A6342A 0%, #D2582B 55%, #E8850F 100%)',
    classes: 'text-white shadow-[0_14px_26px_-12px_rgba(166,52,42,0.75),inset_0_1px_0_rgba(255,255,255,0.45)] hover:shadow-[0_18px_30px_-12px_rgba(166,52,42,0.85),inset_0_1px_0_rgba(255,255,255,0.5)]',
    pastille: 'bg-white/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]'
  },
  // Action « ajouter » : vert d'eau profond vers turquoise, pour trancher avec le rouge-orange du bandeau du module.
  ajouter: {
    fond: 'linear-gradient(135deg, #0f766e 0%, #0d9488 52%, #2dd4bf 100%)',
    classes: 'border border-white/40 text-white shadow-[0_14px_26px_-12px_rgba(13,148,136,0.8),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-2px_0_rgba(0,0,0,0.12)] hover:shadow-[0_18px_30px_-12px_rgba(13,148,136,0.9),inset_0_1px_0_rgba(255,255,255,0.6)] bg-halo-ajouter',
    pastille: 'bg-white/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)]'
  },
  secondaire: {
    fond: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,243,226,0.9))',
    classes: 'border border-orange-200 text-orange-700 shadow-[0_8px_18px_-10px_rgba(232,133,15,0.55),inset_0_1px_0_rgba(255,255,255,0.9)] hover:border-orange-300 hover:shadow-[0_12px_22px_-10px_rgba(232,133,15,0.65)]',
    pastille: 'bg-orange-100 text-orange-600'
  },
  danger: {
    fond: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 55%, #ef4444 100%)',
    classes: 'text-white shadow-[0_14px_26px_-12px_rgba(185,28,28,0.7),inset_0_1px_0_rgba(255,255,255,0.4)] hover:shadow-[0_18px_30px_-12px_rgba(185,28,28,0.8),inset_0_1px_0_rgba(255,255,255,0.45)]',
    pastille: 'bg-white/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)]'
  }
}

// `animation` : mouvement de l'icône qui dit l'action ('carte' : la carte d'abonnement qu'on passe, 'ticket' : le ticket de séance
// qui s'agite) ; `badgePlus` : petit « + » en coin d'icône (création).
export function BoutonGym({ icone: Icone, children, variante = 'principal', loading = false, disabled = false, animation, badgePlus = false, className = '', ...props }) {
  const st = STYLES_BOUTON[variante] || STYLES_BOUTON.principal
  const inactif = disabled || loading
  return (
    <button type="button" disabled={inactif} {...props}
      className={`group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-2xl py-2 pl-2.5 pr-5 text-sm font-extrabold tracking-wide transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 ${st.classes} ${className}`}
      style={{ background: st.fond }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-white/30 opacity-0 blur-sm transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100" />
      <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${st.pastille}`}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : Icone ? <Icone size={16} strokeWidth={2.4} className={animation ? `bg-anim-${animation}` : 'transition-transform duration-300 group-hover:rotate-90'} /> : null}
        {badgePlus && !loading && <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-teal-700 shadow-sm"><Plus size={9} strokeWidth={4} /></span>}
      </span>
      <span className="relative">{children}</span>
    </button>
  )
}

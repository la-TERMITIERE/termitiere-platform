// Barre de recherche PAR NOM réutilisable (listes, cartes, tableaux maison).
// `correspond(q, ...textes)` : vrai si la recherche `q` figure dans l'un des textes,
// sans tenir compte de la casse ni des accents ; une recherche vide laisse tout passer.
import { Search } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { COULEUR_MODULE } from '../../utils/color'

const norm = (v) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export const correspond = (q, ...textes) => {
  const t = norm((q || '').trim())
  return !t || textes.some((x) => norm(x).includes(t))
}

// Grain fin (bruit fractal) pour l'aspect dépoli : image SVG intégrée, aucun fichier externe.
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

// Barre « verre dépoli » : fond teinté translucide + flou + reflet + icône en pastille 3D, pour
// qu'elle ressorte nettement sur le fond de page (même recette que les bandeaux de filtres).
export default function ChampRecherche({ value, onChange, placeholder = 'Rechercher par nom…', className = '', variant = 'light' }) {
  // Teinte = couleur du module courant (gym orange, logistique rouge…), marque par défaut sinon.
  const accent = COULEUR_MODULE[useLocation().pathname.split('/')[1]] || '#BC3C31'
  // `variant="glass"` : posée directement SUR le bandeau coloré d'un volet (blanc translucide,
  // même recette que le filtre de période et les pastilles de filtre du bandeau).
  if (variant === 'glass') {
    return (
      <div className={`champ-glass relative flex w-full items-center gap-2 rounded-2xl border border-white/30 bg-white/15 px-3 py-2 backdrop-blur-sm sm:w-56 ${className}`}>
        <Search size={14} className="shrink-0 text-white/80" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-xs font-bold text-white placeholder-white/70 focus:outline-none" />
        {value && <button type="button" onClick={() => onChange('')} title="Effacer" className="text-xs font-bold text-white/70 hover:text-white">✕</button>}
      </div>
    )
  }
  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border p-1.5 shadow-[0_10px_24px_-12px_rgba(26,26,26,0.25),inset_0_1px_0_0_rgba(255,255,255,0.8)] backdrop-blur-2xl backdrop-saturate-150 ring-1 ring-inset ring-white/60 sm:max-w-md ${className}`}
      style={{ background: `linear-gradient(135deg, ${accent}59 0%, ${accent}1f 45%, rgba(255,255,255,0.4) 100%)`, borderColor: `${accent}55` }}>
      {/* Verre DÉPOLI : fin grain (bruit) + voile laiteux + reflet en haut. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-soft-light" style={{ backgroundImage: GRAIN }} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/20" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/70 to-transparent" />
      <div className="relative flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, boxShadow: `0 6px 12px -4px ${accent}66, inset 0 2px 2px rgba(255,255,255,0.55), inset 0 -3px 5px rgba(0,0,0,0.25)` }}>
          <Search size={15} />
        </span>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent py-1.5 pr-2 text-sm font-medium text-gray-800 placeholder-gray-500 focus:outline-none" />
        {value && (
          <button type="button" onClick={() => onChange('')} title="Effacer la recherche"
            className="mr-1 rounded-full px-2 py-0.5 text-xs font-bold text-gray-400 transition-colors hover:bg-white/70 hover:text-gray-600">✕</button>
        )}
      </div>
    </div>
  )
}

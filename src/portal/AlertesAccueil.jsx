// Alertes « À traiter » de la page d'accueil : une ligne de verre dépoli par alerte (icône en relief, titre, précision, bouton), teintée de la couleur
// de la demande. Compactes : trois lignes visibles au plus, le reste se déplie. Utilisées pour les autorisations de salaire, les ordres de mission
// à approuver et les paiements à confirmer.
//   items : [{ id, icone, couleur, titre, sous, action: { label, onClick, loading? } }]
import { useState } from 'react'
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import { icone3D } from '../utils/color'

const VISIBLES = 3

export default function AlertesAccueil({ items, titre = 'À traiter' }) {
  const [tout, setTout] = useState(false)
  if (!items.length) return null
  const montres = tout ? items : items.slice(0, VISIBLES)
  return (
    <section aria-label="À traiter" className="mb-5">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <span className="relative flex h-2 w-2" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70 motion-reduce:hidden" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" /></span>
          {titre}
          <span className="rounded-full bg-red-500 px-1.5 py-px text-[10px] font-black tabular-nums text-white shadow-[0_2px_6px_-2px_rgba(220,38,38,0.8)]">{items.length}</span>
        </p>
        {items.length > VISIBLES && (
          <button type="button" onClick={() => setTout((t) => !t)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-gray-500 transition-colors hover:bg-white/70 hover:text-gray-800">
            {tout ? 'Réduire' : `Voir tout (${items.length})`}<ChevronDown size={12} className={tout ? 'rotate-180 transition-transform' : 'transition-transform'} aria-hidden="true" />
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {montres.map((it, i) => {
          const Icone = it.icone
          return (
            <li key={it.id} className="ed-entree" style={{ animationDelay: `${Math.min(i, 5) * 50}ms` }}>
              <div role="button" tabIndex={0} onClick={() => !it.action.loading && (it.onOpen || it.action.onClick)()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (it.onOpen || it.action.onClick)() } }}
                className="group relative flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-2xl border border-white/70 py-1.5 pl-3 pr-1.5 shadow-[0_12px_26px_-18px_rgba(26,26,26,0.5),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl backdrop-saturate-150 transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-16px_rgba(26,26,26,0.55),inset_0_1px_0_rgba(255,255,255,1)] focus-visible:outline-none focus-visible:ring-2 dark:border-white/10"
                style={{ background: `linear-gradient(110deg, ${it.couleur}2e 0%, rgba(255,255,255,0.62) 48%, rgba(255,255,255,0.45) 100%)`, '--tw-ring-color': it.couleur }}>
                <span aria-hidden="true" className="absolute inset-y-2 left-1 w-[3px] rounded-full" style={{ background: it.couleur, boxShadow: `0 0 8px ${it.couleur}99` }} />
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/55 to-transparent dark:from-white/10" />
                <span aria-hidden="true" className="pointer-events-none absolute -left-10 top-0 h-full w-8 -skew-x-12 bg-white/50 opacity-0 blur-sm transition-all duration-700 group-hover:left-[105%] group-hover:opacity-100" />
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(it.couleur)}><Icone size={16} aria-hidden="true" /></span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-extrabold leading-tight text-gray-800 dark:text-gray-100">{it.titre}</span>
                  <span className="block truncate text-[11px] leading-tight text-gray-600 dark:text-gray-400">{it.sous}</span>
                </span>
                {it.action2 && (
                  <button type="button" title={it.action2.title || it.action2.label} onClick={(e) => { e.stopPropagation(); it.action2.onClick() }}
                    className="relative inline-flex shrink-0 items-center gap-1 rounded-full border border-white/80 bg-white/70 px-2.5 py-1.5 text-xs font-bold text-gray-600 shadow-[0_6px_12px_-8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition-all hover:bg-white hover:text-gray-900 active:scale-95">
                    {it.action2.icone && <it.action2.icone size={12} aria-hidden="true" />}{it.action2.label}
                  </button>
                )}
                <button type="button" onClick={(e) => { e.stopPropagation(); if (!it.action.loading) it.action.onClick() }}
                  className="relative inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-[0_6px_12px_-6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.45)] transition-all active:scale-95"
                  style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${it.couleur} 78%, white), ${it.couleur})` }}>
                  {it.action.loading ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : (it.action.icone ? <it.action.icone size={13} aria-hidden="true" /> : null)}{it.action.label}{!it.action.loading && !it.action.icone && <ChevronRight size={13} aria-hidden="true" />}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

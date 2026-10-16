// MAXI-GYM : jours restants avant la fin d'un abonnement, avec le code couleur du module.
//   plus de 10 jours : vert ; 10 jours ou moins : orange ; 5 jours ou moins : rouge avec un voyant qui clignote doucement.
// Le bouton « Renouveler » apparaît à partir de 10 jours restants (et reste après l'expiration), cf. peutRenouveler.
import { RefreshCw, CheckCircle2 } from 'lucide-react'
import Badge from '../../shared/ui/Badge'
import { statutAbonnement, joursRestantsAbonnement, niveauRestant, libelleJoursRestants } from './data'

// Petit voyant rouge qui clignote : l'abonnement est presque expiré.
export function VoyantRouge() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-label="Abonnement presque expiré">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-70" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
    </span>
  )
}

export default function JoursRestants({ dateFin, dateDebut, grand = false }) {
  const st = statutAbonnement(dateDebut, dateFin)
  if (st.key === 'a_venir') return <Badge tone="info">À venir</Badge>
  const jours = joursRestantsAbonnement(dateFin)
  const n = niveauRestant(jours)
  if (!n) return <span className="text-gray-400">—</span>
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-bold ${n.classes} ${grand ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs'}`}>
      {n.cle === 'rouge' && <VoyantRouge />}
      {libelleJoursRestants(jours)}
    </span>
  )
}

// Bouton « Renouveler » : prolonge l'abonnement du client sans le réinscrire. Verre dépoli teinté orange : reflet en haut,
// liseré clair, ombre colorée, et l'icône qui tourne d'un demi-tour au survol.
export function BoutonRenouveler({ onClick, compact = false, className = '' }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick() }} title="Renouveler l'abonnement sans réinscrire le client"
      className={`group relative inline-flex shrink-0 items-center gap-1.5 overflow-hidden rounded-xl border border-white/60 bg-gradient-to-br from-orange-500/90 via-orange-500/80 to-amber-400/80 font-extrabold text-white backdrop-blur-md backdrop-saturate-150 shadow-[0_10px_20px_-8px_rgba(234,88,12,0.75),inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-1px_0_rgba(194,65,12,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-8px_rgba(234,88,12,0.85),inset_0_1px_0_rgba(255,255,255,0.85)] active:translate-y-0 active:scale-95 ${compact ? 'py-1 pl-1 pr-2.5 text-xs' : 'py-1.5 pl-1.5 pr-3.5 text-sm'} ${className}`}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/45 to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/40 opacity-0 blur-sm transition-all duration-700 group-hover:left-[130%] group-hover:opacity-100" />
      <span className={`relative flex shrink-0 items-center justify-center rounded-lg border border-white/50 bg-white/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] backdrop-blur-sm ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}>
        <RefreshCw size={compact ? 13 : 15} strokeWidth={2.6} className="transition-transform duration-500 group-hover:rotate-180" />
      </span>
      <span className="relative drop-shadow-[0_1px_1px_rgba(154,52,18,0.55)]">Renouveler</span>
    </button>
  )
}

// Bouton « Pointer » : même verre dépoli que « Renouveler », teinté vert.
export function BoutonPointer({ onClick, disabled = false }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick() }} disabled={disabled} title="Pointer l'arrivée (aujourd'hui)"
      className="group relative inline-flex shrink-0 items-center gap-1.5 overflow-hidden rounded-xl border border-white/60 bg-gradient-to-br from-green-600/90 via-emerald-500/85 to-green-400/80 py-1 pl-1 pr-2.5 text-xs font-extrabold text-white backdrop-blur-md backdrop-saturate-150 shadow-[0_10px_20px_-8px_rgba(22,163,74,0.75),inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-1px_0_rgba(21,128,61,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-8px_rgba(22,163,74,0.85),inset_0_1px_0_rgba(255,255,255,0.85)] active:translate-y-0 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/45 to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/40 opacity-0 blur-sm transition-all duration-700 group-hover:left-[130%] group-hover:opacity-100 group-disabled:hidden" />
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/50 bg-white/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] backdrop-blur-sm">
        <CheckCircle2 size={13} strokeWidth={2.6} className="transition-transform duration-300 group-hover:scale-125" />
      </span>
      <span className="relative drop-shadow-[0_1px_1px_rgba(21,128,61,0.55)]">Pointer</span>
    </button>
  )
}

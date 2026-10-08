// MAXI-GYM : boutons d'action du pointage des coachs, avec de légères animations qui disent
// à quoi ils servent (horloge qui « tique » pour pointer, halo discret pour signaler
// l'action attendue, icône qui s'agite au survol pour l'absence).
import { Clock3, UserX, Bed } from 'lucide-react'

const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'

const STYLES = `
  @keyframes coach-halo { 0%, 100% { box-shadow: 0 8px 18px -6px rgba(232,133,15,0.6), inset 0 1px 0 rgba(255,255,255,0.55), 0 0 0 0 rgba(232,133,15,0.35); }
                           50% { box-shadow: 0 8px 18px -6px rgba(232,133,15,0.6), inset 0 1px 0 rgba(255,255,255,0.55), 0 0 0 7px rgba(232,133,15,0); } }
  @keyframes coach-balayage { 0% { transform: translateX(-140%) skewX(-18deg); } 55%, 100% { transform: translateX(300%) skewX(-18deg); } }
  @keyframes coach-tic { 0%, 70%, 100% { transform: rotate(0deg); } 78% { transform: rotate(-16deg); } 86% { transform: rotate(14deg); } 94% { transform: rotate(-6deg); } }
  @keyframes coach-agite { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-2px) rotate(-6deg); } 75% { transform: translateX(2px) rotate(6deg); } }
  @keyframes coach-alerte { 0%, 100% { box-shadow: 0 8px 18px -6px rgba(220,38,38,0.55), inset 0 1px 0 rgba(255,255,255,0.45), 0 0 0 0 rgba(220,38,38,0.3); }
                            50% { box-shadow: 0 8px 18px -6px rgba(220,38,38,0.55), inset 0 1px 0 rgba(255,255,255,0.45), 0 0 0 6px rgba(220,38,38,0); } }
  @keyframes coach-respire { 0%, 100% { transform: translateY(0); opacity: 0.9; } 50% { transform: translateY(-1.5px); opacity: 1; } }
  @keyframes coach-zzz { 0% { opacity: 0; transform: translate(0, 4px) scale(0.6); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(6px, -9px) scale(1); } }
  @keyframes coach-halo-vert { 0%, 100% { box-shadow: 0 6px 14px -5px rgba(22,163,74,0.6), inset 0 1px 0 rgba(255,255,255,0.55), 0 0 0 0 rgba(34,197,94,0.35); }
                                50% { box-shadow: 0 6px 14px -5px rgba(22,163,74,0.6), inset 0 1px 0 rgba(255,255,255,0.55), 0 0 0 5px rgba(34,197,94,0); } }
  .coach-btn-absent:hover .coach-icone-absent { animation: coach-agite 0.45s ease-in-out 2; }
  .coach-btn-repos:hover .coach-icone-repos { transform: rotate(360deg); }
`

export const CoachBoutonsStyles = () => <style>{STYLES}</style>

// Pointer l'arrivée : bouton principal, halo discret + reflet qui balaie + horloge qui tique.
export function BoutonPointer({ onClick, loading, label = "Pointer l'arrivée" }) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className="group relative flex items-center gap-2 overflow-hidden rounded-full px-5 py-2 text-sm font-bold text-white transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
      style={{ background: `linear-gradient(135deg, ${COULEUR}, ${COULEUR2})`, animation: loading ? undefined : 'coach-halo 2.6s ease-in-out infinite' }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent"
        style={{ animation: 'coach-balayage 3.6s ease-in-out infinite' }} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
      <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
        <Clock3 size={14} style={{ animation: 'coach-tic 3.2s ease-in-out infinite' }} />
      </span>
      <span className="relative">{loading ? 'Pointage…' : label}</span>
    </button>
  )
}

// Pointer un coach en repos : bouton verre discret, l'horloge fait un tour au survol.
export function BoutonPointerRepos({ onClick, loading }) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className="coach-btn-repos flex items-center gap-2 rounded-full border border-orange-200 bg-white/60 px-4 py-1.5 text-sm font-bold text-orange-700 shadow-[0_8px_18px_-10px_rgba(232,133,15,0.55),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-orange-50/80 disabled:opacity-60">
      <Clock3 size={14} className="coach-icone-repos transition-transform duration-700" />
      {loading ? 'Pointage…' : 'Pointer quand même'}
    </button>
  )
}

// Marquer absent : rouge, halo lent (action sensible), l'icône s'agite au survol.
export function BoutonAbsent({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="coach-btn-absent relative flex items-center gap-2 overflow-hidden rounded-full px-4 py-2 text-sm font-bold text-white transition-all hover:-translate-y-0.5 active:translate-y-0"
      style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)', animation: 'coach-alerte 3.4s ease-in-out infinite' }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
      <UserX size={15} className="coach-icone-absent relative" />
      <span className="relative">Marquer absent</span>
    </button>
  )
}

// Indicateur « Repos » : pastille de verre bleutée, le lit respire doucement et de petits
// « z » s'envolent : le coach n'est pas programmé aujourd'hui.
export function IndicateurRepos() {
  return (
    <span className="relative inline-flex items-center gap-1.5 rounded-full border border-sky-200/80 bg-gradient-to-br from-sky-50/90 to-indigo-50/80 px-3 py-1 text-xs font-bold text-sky-700 shadow-[0_6px_14px_-8px_rgba(14,165,233,0.55),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md"
      title="Pas programmé aujourd'hui">
      <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/90 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_3px_6px_-2px_rgba(14,165,233,0.6)]">
        <Bed size={11} style={{ animation: 'coach-respire 3s ease-in-out infinite' }} />
      </span>
      Repos
      <span aria-hidden="true" className="pointer-events-none absolute -top-2 right-2 text-[10px] font-extrabold text-sky-400" style={{ animation: 'coach-zzz 3s ease-out infinite' }}>z</span>
      <span aria-hidden="true" className="pointer-events-none absolute -top-2 right-5 text-[9px] font-extrabold text-sky-300" style={{ animation: 'coach-zzz 3s ease-out 1.1s infinite' }}>z</span>
    </span>
  )
}

// Versions COMPACTES (bandeau « Coach du jour » et liste des abonnés du Dashboard).
export function BoutonPointerMini({ onClick, loading, title = "Pointer l'arrivée" }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} title={title}
      className="group relative flex items-center gap-1.5 overflow-hidden rounded-full px-3 py-1 text-xs font-bold text-white transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
      style={{ background: 'linear-gradient(135deg, #4ade80, #16a34a)', animation: loading ? undefined : 'coach-halo-vert 2.8s ease-in-out infinite' }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
        style={{ animation: 'coach-balayage 3.8s ease-in-out infinite' }} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
      <Clock3 size={12} className="relative" style={{ animation: 'coach-tic 3.2s ease-in-out infinite' }} />
      <span className="relative">{loading ? '…' : 'Pointer'}</span>
    </button>
  )
}

export function BoutonAbsentMini({ onClick }) {
  return (
    <button type="button" onClick={onClick} title="Marquer absent"
      className="coach-btn-absent relative flex items-center gap-1.5 overflow-hidden rounded-full px-3 py-1 text-xs font-bold text-white transition-all hover:-translate-y-0.5 active:translate-y-0"
      style={{ background: 'linear-gradient(135deg, #f87171, #dc2626)', animation: 'coach-alerte 3.4s ease-in-out infinite' }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
      <UserX size={12} className="coach-icone-absent relative" />
      <span className="relative">Absent</span>
    </button>
  )
}

// Carte d'un secteur (volet Recettes) : verre dépoli teinté à la couleur du secteur, icône 3D, barre de chiffre
// d'affaires qui se remplit, et indicateurs de croissance par rapport à la période précédente (flèche animée :
// qui monte en cas de hausse, qui descend en cas de baisse). Toucher la carte ouvre le détail du secteur.
import { ArrowUpRight, ArrowDownRight, Minus, Sparkles, TrendingUp, ShoppingBag, ChevronRight } from 'lucide-react'
import { icone3D } from '../../utils/color'
import { iconeDomaine } from './SecteurDetail'
import { vocabulaire } from './journalCalculs'

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR')
const signe = (n) => `${n >= 0 ? '+' : '-'}${fmt(Math.abs(n))}`

// Variation entre la valeur actuelle et celle de la période précédente.
export function variation(actuel, precedent) {
  const a = Number(actuel) || 0
  const p = Number(precedent) || 0
  if (p === 0 && a === 0) return { sens: 'stable', pct: 0 }
  if (p === 0) return { sens: 'nouveau', pct: null }
  const pct = Math.round(((a - p) / Math.abs(p)) * 100)
  return { sens: pct > 0 ? 'hausse' : pct < 0 ? 'baisse' : 'stable', pct }
}

export const STYLES_TENDANCE = `
  @keyframes sj-hausse { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(2px, -3px); } }
  @keyframes sj-baisse { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(2px, 3px); } }
  @keyframes sj-barre { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes sj-pouls { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
`

// Pastille de tendance. `inverse` : pour les dépenses, une hausse est une mauvaise nouvelle (rouge).
export function Tendance({ actuel, precedent, inverse = false, petit = false }) {
  const v = variation(actuel, precedent)
  const bon = v.sens === 'stable' ? null : inverse ? v.sens === 'baisse' : (v.sens === 'hausse' || v.sens === 'nouveau')
  const couleur = bon === null ? 'bg-gray-100 text-gray-500' : bon ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
  const Icone = v.sens === 'nouveau' ? Sparkles : v.sens === 'hausse' ? ArrowUpRight : v.sens === 'baisse' ? ArrowDownRight : Minus
  const anim = v.sens === 'hausse' || v.sens === 'nouveau' ? 'sj-hausse 1.6s ease-in-out infinite' : v.sens === 'baisse' ? 'sj-baisse 1.6s ease-in-out infinite' : undefined
  const texte = v.sens === 'nouveau' ? 'Nouveau' : v.sens === 'stable' ? '0 %' : `${v.pct > 0 ? '+' : ''}${v.pct} %`
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full font-extrabold ${couleur} ${petit ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'}`}>
      <Icone size={petit ? 11 : 13} strokeWidth={3} style={{ animation: anim }} />{texte}
    </span>
  )
}

export default function CarteSecteur({ x, prec, maxCA, libellePrec, onClick }) {
  const Ic = iconeDomaine(x.secteurId)
  const c = x.couleur
  const vocab = vocabulaire(x.secteurId)
  return (
    <button type="button" onClick={onClick}
      className="group relative block w-full overflow-hidden rounded-2xl border border-white/70 p-3 text-left backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-lg"
      style={{ background: `linear-gradient(135deg, ${c}2e 0%, rgba(255,255,255,0.6) 62%)`, boxShadow: `0 12px 26px -16px ${c}99, inset 0 1px 0 rgba(255,255,255,0.85)` }}>
      <span aria-hidden="true" className="pointer-events-none absolute -inset-x-6 -top-8 h-14 -rotate-6 bg-gradient-to-b from-white/70 via-white/20 to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-25 blur-2xl" style={{ background: c }} />
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={icone3D(c)}><Ic size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
            <span className="text-sm font-extrabold uppercase" style={{ color: c }}>{x.domaine}</span>
            <span className="flex items-center gap-1.5 text-sm font-black text-gray-900">
              CA {fmt(x.chiffreAffaires)} <span className="text-xs font-semibold text-gray-400">FCFA</span>
              <Tendance actuel={x.chiffreAffaires} precedent={prec?.chiffreAffaires} />
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/70 shadow-inner">
            <div className="h-full origin-left rounded-full" style={{ width: `${Math.round((x.chiffreAffaires / maxCA) * 100)}%`, background: `linear-gradient(90deg, ${c}, ${c}aa)`, animation: 'sj-barre 0.9s ease-out' }} />
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="relative mt-2.5 grid grid-cols-2 gap-2 text-xs">
        {[
          ['Recettes', TrendingUp, '#16a34a', `+${fmt(x.recettes)}`, 'text-green-700', x.recettes, prec?.recettes],
          [vocab.pluriel, ShoppingBag, '#ea580c', fmt(x.ventes), 'text-orange-700', x.ventes, prec?.ventes]
        ].map(([titre, Ico, coul, val, cls, cur, prev]) => (
          <div key={titre} className="flex items-start gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D(coul)}><Ico size={12} /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase text-gray-400">{titre}</p>
              <p className={`truncate font-extrabold ${cls}`}>{val}</p>
              <Tendance actuel={cur} precedent={prev} petit />
            </div>
          </div>
        ))}
      </div>
      {libellePrec && <p className="relative mt-2 text-[10px] font-semibold text-gray-400">Évolution comparée à {libellePrec}</p>}
    </button>
  )
}

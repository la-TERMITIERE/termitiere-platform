// Briqueterie : éléments visuels des ventes : bandeau à briques animées (elles se posent une à une
// en tas), bouton à bascule « tout de suite », et pastilles. Couleur du module : violet.
import { CheckCircle2, Send } from 'lucide-react'
import Compteur from '../../shared/ui/Compteur'
import { formatMoney } from '../../utils/formatters'
import { icone3D } from '../../utils/color'

const VIOLET = '#475569'
const POINT = { success: '#4ade80', warning: '#fbbf24', info: '#38bdf8', danger: '#f87171', neutral: '#e5e7eb' }

const STYLES = `
  @keyframes br-pose { 0% { opacity: 0; transform: translateY(-34px) rotate(-6deg); } 16%, 80% { opacity: 1; transform: translateY(0) rotate(0deg); } 100% { opacity: 0; transform: translateY(0) rotate(0deg); } }
  @keyframes br-orbite { to { transform: rotate(360deg); } }
  @keyframes br-lueur { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.7; } }
  @keyframes br-saute { 0%, 100% { transform: translateY(0) rotate(0deg); } 30% { transform: translateY(-5px) rotate(-8deg); } 60% { transform: translateY(0) rotate(6deg); } }
`

// Bandeau centré : tas de briques animé + titre + pastilles + montant qui monte.
export function VenteHero({ titre, sous, pastilles = [], total, voitMontants, formatTotal = formatMoney, children }) {
  return (
    <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl p-5 text-center text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
      style={{ background: 'linear-gradient(135deg, #8a9bb3 0%, #475569 50%, #0f172a 130%)' }}>
      <style>{STYLES}</style>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-white/20 blur-3xl" style={{ animation: 'br-lueur 4s ease-in-out infinite' }} />
      <div className="relative flex h-[92px] w-[92px] items-center justify-center">
        <span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-dashed border-white/55" style={{ animation: 'br-orbite 16s linear infinite' }} />
        <span aria-hidden="true" className="absolute inset-0" style={{ animation: 'br-orbite 4.5s linear infinite' }}>
          <span className="absolute left-1/2 -top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_3px_rgba(255,255,255,0.8)]" />
        </span>
        <div className="flex flex-col-reverse items-center gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block h-[16px] w-[52px] rounded-md"
              style={{
                background: 'linear-gradient(90deg, transparent 49%, rgba(0,0,0,0.2) 50%, transparent 52%), linear-gradient(180deg, #fb923c, #c2410c)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), 0 4px 8px -3px rgba(0,0,0,0.5)',
                marginLeft: i === 1 ? 14 : 0,
                animation: `br-pose 4.2s ease-in-out ${i * 0.35}s infinite`
              }} />
          ))}
        </div>
      </div>
      <div className="relative">
        {sous && <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">{sous}</p>}
        <p className="text-lg font-extrabold leading-tight">{titre}</p>
      </div>
      {pastilles.length > 0 && (
        <div className="relative flex flex-wrap justify-center gap-2">
          {pastilles.map((x, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-md">
              <span className="h-2 w-2 rounded-full" style={{ background: POINT[x.tone] || POINT.neutral }} />{x.label}
            </span>
          ))}
        </div>
      )}
      {voitMontants && total > 0 && (
        <p className="relative text-3xl font-extrabold leading-none"><Compteur valeur={total} format={formatTotal} /></p>
      )}
      {children}
    </div>
  )
}

// Bouton à bascule bien visible : désactivé = verre à bordure violette, activé = vert avec ✓.
export function BoutonBascule({ actif, onClick, titre, titreActif, texte, texteActif }) {
  return (
    <button type="button" aria-pressed={!!actif} onClick={onClick}
      className={`btn-balaye group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 ${actif ? 'border-transparent text-white' : 'border-slate-200 bg-white/70 text-gray-700 backdrop-blur-sm hover:bg-white/90'}`}
      style={actif
        ? { background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)', boxShadow: '0 14px 26px -12px rgba(5,150,105,0.75), inset 0 1px 0 rgba(255,255,255,0.45)' }
        : { boxShadow: '0 10px 20px -14px rgba(71,85,105,0.55), inset 0 1px 0 rgba(255,255,255,0.95)' }}>
      <style>{STYLES}</style>
      <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${actif ? 'bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]' : ''}`}
        style={actif ? undefined : icone3D(VIOLET)}>
        <Send size={20} style={{ animation: 'br-saute 2.4s ease-in-out infinite' }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold">{actif ? titreActif : titre}</span>
        <span className={`block text-[11px] leading-snug ${actif ? 'text-white/90' : 'text-gray-500'}`}>{actif ? texteActif : texte}</span>
      </span>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${actif ? 'bg-white text-green-600' : 'border-2 border-slate-300 text-transparent'}`}>
        <CheckCircle2 size={16} />
      </span>
    </button>
  )
}

// Bandeau d'une demande d'autorisation de sortie : avion en orbite, tampon qui tombe, et les trois
// étapes du circuit (soumise, approbation, certification) reliées par des points qui avancent.
import { Send, ShieldCheck } from 'lucide-react'
import { icone3D } from '../../utils/color'

export default function AutorisationHero({ accent = '#475569', titre = 'Autorisation de sortie', sous = "Le matériel ne sort qu'après approbation puis certification." }) {
  return (
    <div className="relative overflow-hidden rounded-3xl p-4 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
      style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 62%, #ffffff) 0%, ${accent} 55%, #1e293b 130%)` }}>
      <style>{`
        @keyframes ah-orbite { to { transform: rotate(360deg); } }
        @keyframes ah-envol { 0%, 100% { transform: translate(0, 0) rotate(0deg); } 50% { transform: translate(4px, -4px) rotate(-8deg); } }
        @keyframes ah-tampon { 0%, 50% { opacity: 0; transform: scale(2.2) rotate(-25deg); } 64% { opacity: 1; transform: scale(0.9) rotate(-10deg); } 70%, 88% { opacity: 1; transform: scale(1) rotate(-10deg); } 100% { opacity: 0; transform: scale(1) rotate(-10deg); } }
        @keyframes ah-point { 0%, 100% { opacity: 0.2; transform: translateX(0); } 50% { opacity: 1; transform: translateX(4px); } }
      `}</style>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
      <div className="relative flex items-center gap-4">
        <div className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center">
          <span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-dashed border-white/55" style={{ animation: 'ah-orbite 14s linear infinite' }} />
          <span aria-hidden="true" className="absolute inset-0" style={{ animation: 'ah-orbite 4.5s linear infinite' }}>
            <span className="absolute left-1/2 -top-1 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_3px_rgba(255,255,255,0.8)]" />
          </span>
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
            <Send size={24} style={{ animation: 'ah-envol 2.4s ease-in-out infinite' }} />
            <span className="absolute -bottom-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-white" style={{ ...icone3D('#16A34A'), animation: 'ah-tampon 4s ease-in-out infinite' }}>
              <ShieldCheck size={13} strokeWidth={3} />
            </span>
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-extrabold leading-tight">{titre}</p>
          <p className="mt-0.5 text-xs leading-snug text-white/85">{sous}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
            {['Soumise', 'Approbation', 'Certification'].map((e, i) => (
              <span key={e} className="flex items-center gap-1.5">
                <span className="rounded-full border border-white/40 bg-white/20 px-2 py-0.5 backdrop-blur-md">{e}</span>
                {i < 2 && <span aria-hidden="true" className="flex gap-0.5">{[0, 1].map((k) => <i key={k} className="block h-1 w-1 rounded-full bg-white" style={{ animation: `ah-point 1.4s ease-in-out ${k * 0.25}s infinite` }} />)}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

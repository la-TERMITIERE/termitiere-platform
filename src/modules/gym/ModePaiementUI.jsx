// MAXI-GYM : choix du mode de paiement (Espèces, Mobile Money, Banque), en commutateur compact de verre avec voyant et coche.
import { Banknote, Smartphone, Landmark, Check } from 'lucide-react'
import { MODES_PAIEMENT_GYM } from './data'

const ICONES = { especes: Banknote, mobile: Smartphone, banque: Landmark }

export default function ModesPaiement({ value = 'especes', onChange }) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-xl border border-white/70 bg-white/50 p-0.5 shadow-inner backdrop-blur-md">
      {MODES_PAIEMENT_GYM.map((m) => {
        const actif = (value || 'especes') === m.id
        const Ic = ICONES[m.id]
        return (
          <button key={m.id} type="button" aria-pressed={actif} onClick={() => onChange(m.id)}
            className={`group relative inline-flex items-center gap-1 overflow-hidden rounded-[10px] px-2.5 py-1 text-xs font-extrabold transition-all duration-200 active:scale-95 ${actif ? 'text-white shadow-[0_6px_12px_-6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.45)]' : 'text-gray-500 hover:bg-white/80'}`}
            style={actif ? { background: `linear-gradient(135deg, ${m.couleur}, ${m.couleur}cc)` } : undefined}>
            {actif && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />}
            <span aria-hidden="true" className={`relative h-1.5 w-1.5 shrink-0 rounded-full ${actif ? 'animate-pulse bg-white shadow-[0_0_6px_2px_rgba(255,255,255,0.95)]' : 'bg-gray-300'}`} />
            <Ic size={12} className="relative transition-transform duration-300 group-hover:scale-110" />
            <span className="relative">{m.label}</span>
            {actif && <Check size={12} strokeWidth={3} className="relative" />}
          </button>
        )
      })}
    </div>
  )
}

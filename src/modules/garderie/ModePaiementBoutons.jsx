// Sélecteur « Mode de paiement » — pastilles avec effet lumineux (dégradé +
// halo) une fois active, plutôt qu'un simple <select> : cohérent avec les
// boutons Oui/Non et tranche/totalité du module. Choix unique (jamais
// désélectionnable) — pas de logique d'annulation contrairement aux pastilles
// Oui/Non, un mode de paiement doit toujours rester choisi.
import { MODES_PAIEMENT } from './data'

const ICONES = { espece: '💵', mobile: '📱', virement: '🏦', cheque: '📝' }

export default function ModePaiementBoutons({ value, onChange, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {MODES_PAIEMENT.map((m) => {
        const active = value === m.id
        return (
          <button key={m.id} type="button" onClick={() => onChange(m.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ${active
              ? 'scale-105 bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-[0_6px_18px_-4px_rgba(232,57,14,0.6),inset_0_1px_0_0_rgba(255,255,255,0.5)]'
              : 'border border-gray-200 bg-white text-gray-500 hover:scale-105 hover:border-orange-300 hover:text-orange-600 hover:shadow-sm'}`}>
            <span>{ICONES[m.id] || '💳'}</span> {m.label}
          </button>
        )
      })}
    </div>
  )
}

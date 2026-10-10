// Bandeau d'une fiche facture : une facture animée, centrée en haut. Les lignes s'écrivent une à
// une, des pièces montent, puis le tampon tombe (vert « approuvée » ou stylo ambre « brouillon »).
// Animations `.fa-*` : index.css.
import { Check, PenLine, Coins } from 'lucide-react'
import { icone3D } from '../../utils/color'
import Compteur from '../../shared/ui/Compteur'
import { formatMoney } from '../../utils/formatters'

export default function FactureHero({ num, client, approuvee, total, voitMontants, accent = '#BC3C31', libelleOk = 'Approuvée', libelleKo = 'Brouillon' }) {
  const tampon = approuvee ? '#16A34A' : '#D97706'
  return (
    <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl p-5 text-center text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
      style={{ background: `linear-gradient(135deg, ${accent}e6 0%, ${accent} 50%, #24100e 135%)` }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
      <span aria-hidden="true" className="fa-lueur pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-white/20 blur-3xl" />

      {/* Facture animée */}
      <div className="relative h-[104px] w-[104px]">
        <span aria-hidden="true" className="fa-piece absolute left-1 top-0 text-amber-200" style={{ '--d': '0s' }}><Coins size={16} /></span>
        <span aria-hidden="true" className="fa-piece absolute right-0 top-2 text-amber-100" style={{ '--d': '1.3s' }}><Coins size={13} /></span>
        <div className="fa-feuille absolute left-[17px] top-[8px] h-[88px] w-[70px] rounded-xl bg-white shadow-[0_16px_26px_-10px_rgba(0,0,0,0.65)]">
          <span aria-hidden="true" className="absolute right-0 top-0 h-4 w-4 rounded-bl-lg rounded-tr-xl bg-red-100" />
          <div className="absolute inset-x-3 top-5 space-y-1.5">
            <i className="fa-ligne block h-1.5 w-8 rounded bg-red-300" style={{ '--d': '0s' }} />
            <i className="fa-ligne block h-1.5 w-full rounded bg-gray-300" style={{ '--d': '0.35s' }} />
            <i className="fa-ligne block h-1.5 w-10 rounded bg-gray-300" style={{ '--d': '0.7s' }} />
            <i className="fa-ligne block h-1.5 w-7 rounded bg-gray-300" style={{ '--d': '1.05s' }} />
          </div>
          <i className="fa-ligne absolute inset-x-3 bottom-3 block h-2.5 rounded" style={{ '--d': '1.4s', background: accent }} />
          <span className="fa-tampon absolute -bottom-3 -right-4 flex h-11 w-11 items-center justify-center rounded-full text-white" style={icone3D(tampon)}>
            {approuvee ? <Check size={22} strokeWidth={3.5} /> : <PenLine size={18} />}
          </span>
        </div>
      </div>

      <div className="relative">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Facture</p>
        <p className="text-lg font-extrabold leading-tight">{num}</p>
        {client && <p className="text-sm text-white/85">{client}</p>}
      </div>

      <span className="relative inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-md">
        <span className="h-2 w-2 rounded-full" style={{ background: approuvee ? '#4ade80' : '#fbbf24' }} />
        {approuvee ? libelleOk : libelleKo}
      </span>

      {voitMontants && total > 0 && (
        <p className="relative text-3xl font-extrabold leading-none">
          <Compteur valeur={total} format={formatMoney} />
        </p>
      )}
    </div>
  )
}

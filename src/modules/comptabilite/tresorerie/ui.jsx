// TRÉSORERIE : petits éléments partagés par les écrans (champ étiqueté, choix de compte,
// période, montant signé, pastilles de type de compte).
import { Landmark, Wallet, Smartphone, Store } from 'lucide-react'
import { formatMoney } from '../../../utils/formatters'
import { TYPES_COMPTE_TRESO } from './logic'

export const ICONES_TYPE = { CAISSE_CENTRALE: Wallet, CAISSE_SECTEUR: Store, BANQUE: Landmark, MOBILE_MONEY: Smartphone }

export function Champ({ label, aide, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
      {aide && <p className="mt-1 text-[11px] text-gray-400">{aide}</p>}
    </div>
  )
}

export function ChoixCompte({ comptes, value, onChange, exclure, actifsSeulement = true }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} className="input-base">
      <option value="">— Choisir un compte —</option>
      {comptes.filter((c) => c.id !== exclure && (!actifsSeulement || c.actif !== false)).map((c) => (
        <option key={c.id} value={c.id}>{c.nom} · {TYPES_COMPTE_TRESO[c.type]?.label || c.type}</option>
      ))}
    </select>
  )
}

export function PastilleType({ type }) {
  const t = TYPES_COMPTE_TRESO[type] || { label: type, couleur: '#64748b' }
  const Icone = ICONES_TYPE[type] || Wallet
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${t.couleur}1a`, color: t.couleur }}>
      <Icone size={11} /> {t.label}
    </span>
  )
}

export function MontantSigne({ sens, montant }) {
  const entree = sens === 'IN'
  return <span className={`whitespace-nowrap font-semibold ${entree ? 'text-green-700' : 'text-red-600'}`}>{entree ? '+' : '−'} {formatMoney(montant)}</span>
}

// Périodes rapides : ce mois-ci, mois dernier, cette année, tout.
export function periodeRapide(id, ref = new Date()) {
  const y = ref.getFullYear(); const m = ref.getMonth()
  const iso = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10)
  if (id === 'mois') return { debut: iso(new Date(y, m, 1)), fin: iso(new Date(y, m + 1, 0)) }
  if (id === 'mois_prec') return { debut: iso(new Date(y, m - 1, 1)), fin: iso(new Date(y, m, 0)) }
  if (id === 'annee') return { debut: `${y}-01-01`, fin: `${y}-12-31` }
  return { debut: '', fin: '' }
}
export const PERIODES = [
  { id: 'mois', label: 'Ce mois-ci' }, { id: 'mois_prec', label: 'Mois dernier' },
  { id: 'annee', label: 'Cette année' }, { id: 'tout', label: 'Tout' }
]

export const pourcent = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 1000) / 10} %`)

// MAXI LOGISTIQUE : éléments visuels du formulaire « Nouvelle prestation / location » :
// bandeau d'en-tête à icône animée (fête pour une prestation, orbite pour une location),
// boutons de choix du type, pastilles d'événement et titres de section en tuiles de verre.
import {
  PartyPopper, Package, Check, Plus, Sparkles, Heart, Flower2, Baby, Cake, Presentation,
  Music, Church, Users, UtensilsCrossed
} from 'lucide-react'
import { icone3D } from '../../utils/color'
import Compteur from '../../shared/ui/Compteur'
import { formatMoney } from '../../utils/formatters'

const ROUGE = '#BC3C31'

export const FX_STYLES = `
  @keyframes fx-saute { 0%, 100% { transform: translateY(0) rotate(0deg); } 30% { transform: translateY(-6px) rotate(-9deg); } 60% { transform: translateY(0) rotate(7deg); } }
  @keyframes fx-confetti { 0% { opacity: 0; transform: translate(0, 0) scale(0.4) rotate(0deg); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(1) rotate(200deg); } }
  @keyframes fx-orbite { to { transform: rotate(360deg); } }
  @keyframes fx-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  @keyframes fx-entree { from { opacity: 0; transform: scale(0.6) rotate(-12deg); } to { opacity: 1; transform: none; } }
  @keyframes fx-pop { 0% { transform: scale(0.92); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }
  @keyframes fx-lueur { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.7; } }
`

// Pastille d'icône d'un titre de section (3D, couleur du module).
export function TitreSection({ icone: Icone, titre, droite, accent = ROUGE }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-gray-600">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D(accent)}><Icone size={14} /></span>
        {titre}
      </p>
      {droite}
    </div>
  )
}

// Bouton d'ajout d'une ligne (pointillés, verre).
export function BoutonAjout({ onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-2xl border border-dashed border-red-300/80 bg-white/55 px-3 py-1.5 text-xs font-bold text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/85">
      <Plus size={13} /> {children}
    </button>
  )
}

// Icône animée du type (fête pour une prestation, orbite pour une location), réutilisée par le
// formulaire et par la fiche de détail.
export function IconeType({ type }) {
  const presta = type === 'prestation'
  return (
      <div className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center" style={{ animation: 'fx-entree 0.5s ease-out' }}>
        {presta ? (
          <>
            {[['-44px', '-34px', '#fde68a', '0s'], ['40px', '-38px', '#ffffff', '0.5s'], ['-40px', '30px', '#fbcfe8', '1s'], ['44px', '26px', '#fed7aa', '1.5s'], ['0px', '-50px', '#ffffff', '0.8s']].map(([dx, dy, c, d], i) => (
              <span key={i} aria-hidden="true" className="absolute left-1/2 top-1/2 h-2 w-2 rounded-sm"
                style={{ background: c, '--dx': dx, '--dy': dy, animation: `fx-confetti 2.4s ease-out ${d} infinite` }} />
            ))}
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
              <PartyPopper size={34} style={{ animation: 'fx-saute 2.4s ease-in-out infinite' }} />
            </span>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-dashed border-white/55" style={{ animation: 'fx-orbite 16s linear infinite' }} />
            <span aria-hidden="true" className="absolute inset-2.5 rounded-full border border-white/30" style={{ animation: 'fx-orbite 10s linear infinite reverse' }} />
            <span aria-hidden="true" className="absolute inset-0" style={{ animation: 'fx-orbite 4.5s linear infinite' }}>
              <span className="absolute left-1/2 -top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow-[0_0_10px_3px_rgba(255,255,255,0.8)]" />
            </span>
            <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
              <Package size={30} style={{ animation: 'fx-flotte 2.6s ease-in-out infinite' }} />
            </span>
          </>
        )}
    </div>
  )
}

// En-tête : l'icône du type choisi, grande, avec son animation.
//  - Prestation : la fête (confettis qui jaillissent, icône qui saute).
//  - Location   : le colis en orbite (anneau en rotation + point lumineux qui tourne autour).
export function TypeHero({ type }) {
  const presta = type === 'prestation'
  return (
    <div key={type} className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
      style={{ background: presta ? 'linear-gradient(135deg, #d9594b 0%, #BC3C31 55%, #8f2a22 100%)' : 'linear-gradient(135deg, #BC3C31 0%, #6b2520 55%, #1A1A1A 100%)' }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/20 blur-2xl" style={{ animation: 'fx-lueur 4s ease-in-out infinite' }} />

      <IconeType type={type} />

      <div className="relative min-w-0">
        <p className="text-lg font-extrabold">{presta ? 'Prestation' : 'Location simple'}</p>
        <p className="mt-0.5 text-xs leading-snug text-white/85">
          {presta
            ? "Permet de renseigner les dépenses internes (frais de mission, transport de l'équipe…), même plus tard. Elles n'entrent pas dans le montant facturé mais servent à calculer le bénéfice."
            : 'Simple location de matériel : aucune dépense interne à renseigner. Le montant facturé = matériel × jours × tarif, plus les frais éventuels.'}
        </p>
      </div>
    </div>
  )
}

// Choix du type : deux grands boutons cliquables.
export function TypeBoutons({ type, onChange }) {
  const options = [
    ['prestation', 'Prestation', 'Avec dépenses internes', PartyPopper],
    ['location', 'Location simple', 'Matériel uniquement', Package]
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map(([v, titre, sous, Icone]) => {
        const actif = type === v
        return (
          <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={actif}
            className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 ${actif ? 'border-transparent text-white' : 'border-white/80 bg-white/55 text-gray-700 backdrop-blur-sm hover:bg-white/80'}`}
            style={actif
              ? { background: 'linear-gradient(135deg, #d9594b 0%, #BC3C31 100%)', boxShadow: '0 14px 26px -12px rgba(188,60,49,0.75), inset 0 1px 0 rgba(255,255,255,0.45)', animation: 'fx-pop 0.35s ease-out' }
              : { boxShadow: '0 8px 18px -14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.9)' }}>
            {actif && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />}
            <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${actif ? 'bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]' : ''}`}
              style={actif ? undefined : icone3D(ROUGE)}>
              <Icone size={20} />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block text-sm font-extrabold">{titre}</span>
              <span className={`block text-[11px] ${actif ? 'text-white/85' : 'text-gray-500'}`}>{sous}</span>
            </span>
            {actif && (
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[#BC3C31]"><Check size={13} strokeWidth={3.5} /></span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Icône d'un événement selon son nom (sans accent ni casse), étoile par défaut.
const norm = (v) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const ICONES_EVT = [
  [/mariage|noce|fianc/, Heart],
  [/funerail|deuil|obseque|veillee/, Flower2],
  [/bapt|naissance/, Baby],
  [/anniv/, Cake],
  [/conf|semin|forum|atelier|formation/, Presentation],
  [/concert|spectacle|musique|soiree|dj/, Music],
  [/religi|messe|culte|eglise|priere/, Church],
  [/reunion|assembl|congres/, Users],
  [/restaur|repas|cocktail|banquet|traiteur/, UtensilsCrossed]
]
export const iconeEvenement = (nom) => ICONES_EVT.find(([re]) => re.test(norm(nom)))?.[1] || Sparkles

// Choix de l'événement : pastilles de verre avec icône, la pastille choisie se remplit.
// Un second clic sur la pastille choisie l'annule (aucun événement).
const rien = (actif, ev) => (actif ? '' : ev)
export function ChipsEvenement({ evenements, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {evenements.map((ev) => {
        const Icone = iconeEvenement(ev)
        const actif = value === ev
        return (
          <button key={ev} type="button" onClick={() => onChange(rien(actif, ev))} aria-pressed={actif}
            className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold transition-all hover:-translate-y-0.5 ${actif ? 'border-transparent text-white' : 'border-white/80 bg-white/60 text-gray-700 backdrop-blur-sm hover:bg-white/90'}`}
            style={actif
              ? { background: 'linear-gradient(135deg, #d9594b 0%, #BC3C31 100%)', boxShadow: '0 10px 20px -10px rgba(188,60,49,0.8), inset 0 1px 0 rgba(255,255,255,0.45)', animation: 'fx-pop 0.3s ease-out' }
              : { boxShadow: '0 6px 14px -10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.9)' }}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${actif ? 'bg-white/25' : 'bg-red-50 text-red-600'}`}><Icone size={13} /></span>
            {ev}
          </button>
        )
      })}
      <button type="button" onClick={() => onChange(value === '__autre__' ? '' : '__autre__')} aria-pressed={value === '__autre__'}
        className={`flex items-center gap-2 rounded-2xl border border-dashed px-3 py-2 text-xs font-bold transition-all hover:-translate-y-0.5 ${value === '__autre__' ? 'border-transparent text-white' : 'border-red-300/80 bg-white/50 text-red-700 hover:bg-white/85'}`}
        style={value === '__autre__' ? { background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', boxShadow: '0 10px 20px -10px rgba(109,40,217,0.8)', animation: 'fx-pop 0.3s ease-out' } : undefined}>
        <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${value === '__autre__' ? 'bg-white/25' : 'bg-red-50 text-red-600'}`}><Plus size={13} strokeWidth={3} /></span>
        Autre événement
      </button>
    </div>
  )
}

// Fiche de détail d'une prestation : l'icône du type, animée, centrée en haut, puis le numéro,
// le client, l'état et le montant.
const POINT = { success: '#4ade80', warning: '#fbbf24', info: '#38bdf8', danger: '#f87171', neutral: '#e5e7eb' }
export function PrestationHero({ type, num, client, evenement, pastilles = [], total, voitMontants }) {
  const presta = type === 'prestation'
  return (
    <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl p-5 text-center text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
      style={{ background: presta ? 'linear-gradient(135deg, #d9594b 0%, #BC3C31 55%, #8f2a22 100%)' : 'linear-gradient(135deg, #BC3C31 0%, #6b2520 55%, #1A1A1A 100%)' }}>
      <style>{FX_STYLES}</style>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-white/20 blur-3xl" style={{ animation: 'fx-lueur 4s ease-in-out infinite' }} />
      <IconeType type={type} />
      <div className="relative">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">{presta ? 'Prestation' : 'Location simple'}</p>
        <p className="text-lg font-extrabold leading-tight">{num}</p>
        {(client || evenement) && <p className="text-sm text-white/85">{[client, evenement].filter(Boolean).join(' · ')}</p>}
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
        <p className="relative text-3xl font-extrabold leading-none"><Compteur valeur={total} format={formatMoney} /></p>
      )}
    </div>
  )
}

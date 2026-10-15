// Bandeau de tête commun aux volets d'un module (Comptabilité, Ressources humaines…) : pastille ronde
// avec l'icône du volet, titre, description, et à droite TOUS les boutons de tri, filtres et actions
// (onglets, période, recherche, export, création). Teinté de la couleur du module (`couleur`).
// Même recette « verre » que les bandeaux des autres modules (Briqueterie, Logistique…).
const ombre = (c) => `0 14px 24px -12px rgba(0,0,0,0.45), 0 28px 56px -18px ${c}66, 0 8px 20px -8px ${c}40, inset 0 1px 0 0 rgba(255,255,255,0.35)`

export default function BandeauVolet({ couleur = '#475569', icone: Icone, surtitre, titre, sous, children, pied }) {
  return (
    <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white backdrop-blur-xl backdrop-saturate-150"
      style={{
        '--bv': couleur,
        boxShadow: ombre(couleur),
        background: `linear-gradient(135deg, color-mix(in srgb, ${couleur} 45%, #ffffff) 0%, ${couleur} 45%, color-mix(in srgb, ${couleur} 50%, #000000) 100%)`
      }}>
      <style>{`
        @keyframes bv-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes bv-ondes { 0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.6); } 70% { box-shadow: 0 0 0 11px rgba(255,255,255,0); } 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); } }
        @keyframes bv-plus { 0%, 70%, 100% { transform: rotate(0deg) scale(1); } 85% { transform: rotate(90deg) scale(1.25); } }
        @keyframes bv-brille { 0% { transform: translateX(-130%) skewX(-20deg); } 55%, 100% { transform: translateX(260%) skewX(-20deg); } }
      `}</style>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
      <div className="relative flex min-w-0 flex-1 basis-72 items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
          style={{ background: couleur, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px rgba(255,255,255,0.33)' }}>
          {Icone && <Icone size={28} color="white" style={{ animation: 'bv-flotte 3s ease-in-out infinite' }} />}
        </div>
        <div className="min-w-0">
          {surtitre && <p className="text-[11px] font-bold uppercase tracking-wider text-white/75">{surtitre}</p>}
          <h1 className="text-lg font-extrabold leading-tight">{titre}</h1>
          {sous && <p className="text-sm text-white/85">{sous}</p>}
        </div>
      </div>
      {children && <div className="relative flex flex-wrap items-end gap-2">{children}</div>}
      {pied && <div className="relative flex w-full flex-wrap items-center gap-2">{pied}</div>}
    </div>
  )
}

// Onglets / pastilles de tri posés sur le bandeau. options : [{ id, label }].
export function OngletsBande({ options, valeur, onChange, taille = 'md' }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const actif = valeur === o.id
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={actif}
            className={`rounded-full border font-bold transition-all ${taille === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'} ${actif ? 'border-white bg-white text-[color:var(--bv)] shadow-sm' : 'border-white/30 bg-white/15 text-white hover:bg-white/25'}`}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// Bouton d'action posé sur le bandeau (création, export, actualisation…).
// `anime` : légère animation (ondes autour du bouton, reflet qui passe, icône qui pivote) pour l'action principale.
export function BoutonBande({ icone: Icone, children, onClick, disabled, title, plein = true, anime = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-2xl border px-3.5 py-2 text-xs font-extrabold transition-all enabled:hover:-translate-y-0.5 disabled:opacity-50 ${plein ? 'border-white bg-white text-[color:var(--bv)] shadow-md' : 'border-white/40 bg-white/15 text-white hover:bg-white/25'}`}
      style={anime ? { animation: 'bv-ondes 2.4s ease-out infinite' } : undefined}>
      {anime && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" style={{ animation: 'bv-brille 3.6s ease-in-out infinite' }} />}
      {Icone && <Icone size={15} className="relative" style={anime ? { animation: 'bv-plus 3.6s ease-in-out infinite' } : undefined} />}
      <span className="relative">{children}</span>
    </button>
  )
}

// Champ (date, mois, nombre) posé sur le bandeau, avec son étiquette.
export function ChampBande({ label, children }) {
  return (
    <label className="block">
      {label && <span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-white/80">{label}</span>}
      {children}
    </label>
  )
}

export const CLASSE_CHAMP_BANDE = 'rounded-xl border border-white/40 bg-white/20 px-2.5 py-1.5 text-xs font-bold text-white outline-none [color-scheme:dark] placeholder:text-white/70 focus:bg-white/30 [&>option]:bg-white [&>option]:text-gray-900'

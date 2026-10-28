// Mise en page commune des volets « Paramètres » des modules : grille bento, cartes en verre dépoli, icônes 3D, entrée en douceur.
//   <ParamsGrille>
//     <ParamsCarte icone={Ticket} couleur="#E8850F" titre="Tarifs" sous="…" large>…</ParamsCarte>
//   </ParamsGrille>
// `large` : la carte occupe toute la largeur de la grille ; sans lui, deux cartes se partagent une ligne sur grand écran.
// `danger` : teinte rouge (réinitialisation, suppression). Les animations respectent « réduire les animations » (cf. index.css).
import { Children, cloneElement, isValidElement } from 'react'
import { icone3D } from '../../utils/color'

// Champ arrondi, en verre : à poser sur un <input> ou un <select>.
export const CHAMP_VERRE = 'rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-sm font-semibold text-gray-800 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-md outline-none transition-shadow placeholder:font-normal placeholder:text-gray-400 focus:ring-2 focus:ring-orange-300 dark:border-white/10 dark:bg-white/5 dark:text-gray-100'

export function ParamsGrille({ children, className = '' }) {
  // Chaque carte (ParamsCarte, ou un composant qui porte `accepteRang`) reçoit son rang pour s'animer l'une après l'autre.
  let rang = 0
  const enfants = Children.map(children, (c) => (isValidElement(c) && c.type?.accepteRang ? cloneElement(c, { index: rang++ }) : c))
  return <div className={`grid items-start gap-4 lg:grid-cols-2 ${className}`}>{enfants}</div>
}

export function ParamsCarte({ icone: Icone, couleur = '#64748b', titre, sous, droite, large = false, danger = false, index = 0, children, className = '' }) {
  const c = danger ? '#dc2626' : couleur
  return (
    <section className={`ed-entree params-verre relative overflow-hidden rounded-[1.9rem] border p-5 shadow-[0_14px_34px_-18px_rgba(26,26,26,0.35),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-18px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-white/10 dark:bg-white/5 ${large ? 'lg:col-span-2' : ''} ${danger ? 'border-red-200/80 bg-red-50/60' : 'border-white/70 bg-white/55'} ${className}`}
      style={{ animationDelay: `${index * 70}ms`, '--p-accent': c }}>
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-3xl" style={{ background: c }} />
      {(titre || droite) && (
        <div className="relative mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            {Icone && <span className="ed-flotte flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={icone3D(c)}><Icone size={19} /></span>}
            <div className="min-w-0">
              <h2 className="text-base font-extrabold leading-tight text-gray-800 dark:text-gray-100">{titre}</h2>
              {sous && <p className="text-xs text-gray-500">{sous}</p>}
            </div>
          </div>
          {droite}
        </div>
      )}
      <div className="relative">{children}</div>
    </section>
  )
}

ParamsCarte.accepteRang = true

// Petite tuile en verre (chiffre clé, réglage) à poser dans une carte : pastille de couleur à gauche, valeur à droite.
export function TuileVerre({ icone: Icone, couleur = '#64748b', titre, valeur, sous, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-3xl border border-white/80 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-md ${className}`}
      style={{ background: `linear-gradient(135deg, ${couleur}1f 0%, rgba(255,255,255,0.65) 70%)` }}>
      {Icone && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Icone size={16} /></span>}
      <div className="min-w-0">
        <p className="truncate text-[10px] font-extrabold uppercase tracking-wide text-gray-500">{titre}</p>
        <p className="text-sm font-black leading-tight text-gray-800">{valeur}</p>
        {sous && <p className="text-[11px] text-gray-500">{sous}</p>}
      </div>
    </div>
  )
}

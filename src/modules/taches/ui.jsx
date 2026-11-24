// E-TACHES : petits éléments d'interface partagés (pastilles, barres, tuiles « bento » en verre).
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import Badge from '../../shared/ui/Badge'
import AvatarNom from '../../shared/ui/AvatarNom'
import { icone3D } from '../../utils/color'
import { COULEUR, COULEUR_STATUT, COULEUR_PRIORITE, TON_STATUT, TON_PRIORITE, statutAffiche } from './data'

export const PastilleStatut = ({ tache, jour }) => {
  const s = statutAffiche(tache, jour)
  return <Badge tone={TON_STATUT[s]}>{s}</Badge>
}
export const PastillePriorite = ({ priorite }) => <Badge tone={TON_PRIORITE[priorite] || 'neutral'}>{priorite || 'Moyenne'}</Badge>

// Barre de progression fine, teintée.
export function Barre({ valeur = 0, couleur = COULEUR, hauteur = 'h-2' }) {
  const v = Math.max(0, Math.min(100, Number(valeur) || 0))
  return (
    <div className={`${hauteur} w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10`} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${v}%`, background: `linear-gradient(90deg, ${couleur}, ${couleur}cc)` }} />
    </div>
  )
}

// Anneau d'avancement (pourcentage au centre).
export function Anneau({ valeur = 0, couleur = COULEUR, taille = 96, epaisseur = 10, texte }) {
  const v = Math.max(0, Math.min(100, Number(valeur) || 0))
  const r = (taille - epaisseur) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} role="img" aria-label={`${Math.round(v)} %`}>
      <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="rgba(100,116,139,0.18)" strokeWidth={epaisseur} />
      <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${taille / 2} ${taille / 2})`} style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-gray-800 dark:fill-gray-100" style={{ fontSize: taille * 0.22, fontWeight: 900 }}>{texte ?? `${Math.round(v)}%`}</text>
    </svg>
  )
}

// Tuile « bento » : bloc de verre arrondi avec titre et icône 3D. `span` règle la place dans la grille (voir `Bento`).
export function Tuile({ titre, icone: Icone, accent = COULEUR, action, children, className = '', span = '', pad = 'p-4' }) {
  return (
    <section className={`card group relative overflow-hidden border-white/60 backdrop-blur-xl ${pad} ${span} ${className}`}
      style={{ background: `linear-gradient(160deg, rgba(255,255,255,0.78), ${accent}0f)` }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/50 to-transparent" />
      {(titre || action) && (
        <header className="relative mb-3 flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-gray-800 dark:text-gray-100">
            {Icone && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl" style={icone3D(accent)}><Icone size={14} /></span>}
            <span className="truncate">{titre}</span>
          </h2>
          {action}
        </header>
      )}
      <div className="relative">{children}</div>
    </section>
  )
}

// Grille bento : 4 colonnes sur grand écran, 2 sur tablette, 1 sur téléphone.
export const Bento = ({ children, className = '' }) => <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>{children}</div>

export const Pers = ({ nom, taille = 26 }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5"><AvatarNom nom={nom} accent={COULEUR} size={taille} /><span className="truncate text-sm font-semibold text-gray-700 dark:text-gray-200">{nom || 'Non attribuée'}</span></span>
)

// Pile d'avatars (équipe).
export function PileAvatars({ noms = [], max = 4 }) {
  const vus = noms.slice(0, max)
  return (
    <span className="inline-flex items-center">
      {vus.map((n, i) => <span key={n + i} className={i ? '-ml-2' : ''}><AvatarNom nom={n} accent={COULEUR} size={24} className="ring-2 ring-white" /></span>)}
      {noms.length > max && <span className="-ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1 text-[10px] font-extrabold text-gray-600 ring-2 ring-white">+{noms.length - max}</span>}
    </span>
  )
}

export const PointStatut = ({ statut }) => <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: COULEUR_STATUT[statut] || '#94a3b8' }} />
export const PointPriorite = ({ priorite }) => <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: COULEUR_PRIORITE[priorite] || '#94a3b8' }} />

// ── Comparaison d'une période à la précédente ─────────────────────────────────────────────────────────────────
// `inverse` : une BAISSE est une bonne nouvelle (retards, délai). `points` : écart en points de pourcentage.
export function Delta({ cur, prev, inverse = false, unite = '', points = false }) {
  const a = Number(cur) || 0, b = Number(prev) || 0
  if (!a && !b) return <span className="text-[11px] font-bold text-gray-400">·</span>
  if (!b) return <span className={`text-[11px] font-extrabold ${inverse ? 'text-red-600' : 'text-green-600'}`}>▲ +{a}{unite}</span>
  const d = a - b
  if (d === 0) return <span className="text-[11px] font-bold text-gray-400">= stable</span>
  const bon = inverse ? d < 0 : d > 0
  const pct = points ? '' : ` (${Math.round((Math.abs(d) * 100) / Math.abs(b))}%)`
  return <span className={`text-[11px] font-extrabold ${bon ? 'text-green-600' : 'text-red-600'}`}>{d > 0 ? '▲ +' : '▼ -'}{Math.abs(d)}{unite}{pct}</span>
}
// Un taux sans dénominateur n'est pas comparable : pas d'écart affiché sans base des deux côtés.
export const DeltaTaux = ({ cur, prev, baseCur, basePrev, inverse }) => (baseCur && basePrev ? <Delta cur={cur} prev={prev} unite=" pts" points inverse={inverse} /> : null)

// Mini-courbe.
export function Spark({ valeurs = [], couleur = COULEUR }) {
  const v = valeurs.map((x) => Number(x) || 0)
  if (!v.length) return null
  const W = 96, H = 26, p = 3, max = Math.max(1, ...v)
  const pas = v.length > 1 ? (W - p * 2) / (v.length - 1) : 0
  const x = (i) => p + i * pas, y = (n) => H - p - (n / max) * (H - p * 2)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width={W} height={H} aria-hidden="true">
      <polyline points={v.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ')} fill="none" stroke={couleur} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity=".85" />
      <circle cx={x(v.length - 1).toFixed(1)} cy={y(v[v.length - 1]).toFixed(1)} r="2.8" fill={couleur} />
    </svg>
  )
}

// Courbes sur des fenêtres successives ; la dernière (en cours) est grisée car incomplète.
export function GraphiquePeriodes({ fenetres, series }) {
  if (!fenetres.length) return <p className="py-4 text-sm text-gray-400">Aucune donnée.</p>
  const brut = Math.max(1, ...series.flatMap((s) => s.valeurs))
  const max = brut <= 5 ? 5 : brut <= 10 ? 10 : brut <= 20 ? 20 : brut <= 50 ? 50 : brut <= 100 ? 100 : Math.ceil(brut / Math.pow(10, Math.floor(Math.log10(brut)))) * Math.pow(10, Math.floor(Math.log10(brut)))
  const W = Math.max(520, fenetres.length * 95), H = 220, g = 38, d = 14, h = 18, b = 34
  const largeur = W - g - d, hauteur = H - h - b
  const pas = fenetres.length > 1 ? largeur / (fenetres.length - 1) : largeur
  const x = (i) => g + i * pas, y = (v) => h + hauteur - (v / max) * hauteur
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => <span key={s.label} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.couleur }} />{s.label}</span>)}
        <span className="text-xs text-gray-400">▨ période en cours (incomplète)</span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', minHeight: 220, maxWidth: W }} role="img" aria-label="Évolution par période">
          {[0, 1, 2, 3, 4].map((i) => { const yy = h + (hauteur * i) / 4; return <g key={i}><line x1={g} y1={yy} x2={W - d} y2={yy} stroke="rgba(148,163,184,0.3)" /><text x={g - 6} y={yy + 4} textAnchor="end" fontSize="10" fill="#9aa0a6">{Math.round(max * (1 - i / 4))}</text></g> })}
          <rect x={x(fenetres.length - 1) - pas / 2} y={h} width={pas / 2} height={hauteur} fill="rgba(148,163,184,0.12)" />
          {fenetres.map((w, i) => <text key={w.from} x={x(i)} y={H - b + 15} textAnchor="middle" fontSize="10" fill="#5f6368">{w.label}</text>)}
          {series.map((s) => (
            <g key={s.label}>
              <polyline points={s.valeurs.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.couleur} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {s.valeurs.map((v, i) => <g key={i}><circle cx={x(i)} cy={y(v)} r="3.2" fill={s.couleur} stroke="#fff" strokeWidth="1.5" />{v > 0 && <text x={x(i)} y={y(v) - 8} textAnchor="middle" fontSize="9" fontWeight="600" fill={s.couleur}>{v}</text>}</g>)}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

// Choix de plusieurs personnes : une recherche avec suggestions (nom ou département), puis les personnes choisies en pastilles à retirer.
// `personnes` : [{ uid, nom, secteur }] ; `value` : liste d'uid.
export function SelecteurPersonnes({ personnes, value = [], onChange, placeholder }) {
  const [q, setQ] = useState('')
  const choisies = value.map((uid) => personnes.find((p) => p.uid === uid)).filter(Boolean)
  const restantes = personnes.filter((p) => !value.includes(p.uid)).map((p) => ({ ...p, detail: p.secteur || p.poste || '' }))
  return (
    <div>
      <ChampAutocomplete accent="violet" className="input-base" value={q} onChange={setQ} suggestions={restantes} maxSuggestions={30}
        getLabel={(p) => p.nom} getDetail={(p) => p.detail} onSelect={(p) => { onChange([...value, p.uid]); setQ('') }}
        placeholder={placeholder || `Tapez un nom (${personnes.length} personnes)…`} emptyLabel="Aucune personne correspondante." />
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Personnes choisies">
        {choisies.length ? choisies.map((p) => (
          <button key={p.uid} type="button" onClick={() => onChange(value.filter((x) => x !== p.uid))} data-actif="true" title="Retirer" className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ '--puce': COULEUR }}>
            <Check size={13} strokeWidth={3} aria-hidden="true" />{p.nom}<X size={12} strokeWidth={3} aria-hidden="true" className="opacity-80" />
          </button>
        )) : <span className="text-xs text-gray-500">Aucune personne choisie pour le moment.</span>}
        {choisies.length > 1 && <button type="button" onClick={() => onChange([])} className="ml-1 text-xs font-bold text-gray-500 underline-offset-2 hover:text-red-600 hover:underline">Tout retirer</button>}
      </div>
      {choisies.length > 0 && <p className="mt-1.5 text-xs font-semibold text-gray-500">{choisies.length} personne{choisies.length > 1 ? 's' : ''} choisie{choisies.length > 1 ? 's' : ''}</p>}
    </div>
  )
}

// Fiche de consultation d'un document : vente, facture, prestation, autorisation.
// Lecture seule : en-tête en tuiles « bento » de verre à icônes 3D, tableau de lignes, totaux,
// encarts libres. `hero` : bandeau animé optionnel affiché tout en haut (ex. facture).
// Responsive : cartes empilées sur téléphone, tableau sur écran large.
import { useLocation } from 'react-router-dom'
import {
  UserRound, BadgeCheck, ClipboardList, Sparkles, CalendarDays, CalendarRange, MapPin, PenLine,
  ShieldCheck, Wallet, FileText, Info
} from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { COULEUR_MODULE, icone3D } from '../../utils/color'

const norm = (v) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Icône de la tuile selon son libellé (premier motif qui correspond).
const ICONES = [
  [/client|beneficiaire|acheteur|fournisseur/, UserRound],
  [/approb|valid|certif/, ShieldCheck],
  [/statut|etat|facturation/, BadgeCheck],
  [/montant|total|prix|tarif|recette/, Wallet],
  [/facture|numero|n°/, FileText],
  [/prestation|vente|autorisation|demande/, ClipboardList],
  [/evenement/, Sparkles],
  [/periode/, CalendarRange],
  [/date|sortie|echeance/, CalendarDays],
  [/site|lieu|adresse|depart|arrivee/, MapPin],
  [/emis|saisi|cree|agent|vendeur|par/, PenLine]
]
const iconeDe = (label) => ICONES.find(([re]) => re.test(norm(label)))?.[1] || Info

export default function FicheDetail({
  entetes = [], colonnes = [], lignes = [], pied = [],
  vide = 'Aucune ligne.', children, hero
}) {
  const accent = COULEUR_MODULE[useLocation().pathname.split('/')[1]] || '#BC3C31'
  const align = (a) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left')
  const tuiles = entetes.filter((e) => e.value !== undefined && e.value !== null && e.value !== '')
  const normaux = pied.filter((p) => !p.fort && p.value !== undefined && p.value !== null && p.value !== '')
  const forts = pied.filter((p) => p.fort && p.value !== undefined && p.value !== null && p.value !== '')
  const fmt = (v) => (typeof v === 'number' ? formatMoney(v) : v)

  return (
    <div className="space-y-3">
      {hero}

      {tuiles.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {tuiles.map((e, i) => {
            const Icone = iconeDe(e.label)
            // Bento : la tuile « Client » prend toute la largeur.
            const large = /client/.test(norm(e.label))
            return (
              <div key={i} className={`tuile-verre flex items-center gap-3 !p-2.5 ${large ? 'sm:col-span-2' : ''}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(accent)}><Icone size={16} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{e.label}</p>
                  <p className="break-words text-sm font-semibold text-gray-800 dark:text-gray-100">{e.value}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {colonnes.length > 0 && (
        <>
          {/* Téléphone : une carte par ligne, un tableau à 5 colonnes y est illisible. */}
          <div className="space-y-1.5 sm:hidden">
            {lignes.map((l, i) => (
              <div key={i} className="tuile-verre !p-2.5">
                {colonnes.map((c, j) => {
                  const v = c.render(l, i)
                  if (v === null || v === undefined || v === '') return null
                  return (
                    <div key={j} className={`flex items-baseline justify-between gap-2 ${j === 0 ? 'mb-1' : ''}`}>
                      {j === 0
                        ? <span className="font-semibold text-gray-800 dark:text-gray-100">{v}</span>
                        : <><span className="text-[11px] text-gray-400">{c.label}</span><span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{v}</span></>}
                    </div>
                  )
                })}
              </div>
            ))}
            {!lignes.length && <p className="py-4 text-center text-sm text-gray-400">{vide}</p>}
          </div>

          {/* Écran large : tableau en verre. */}
          <div className="table-verre hidden overflow-x-auto sm:block" style={{ '--tv-accent': accent }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase">{colonnes.map((c, i) => <th key={i} className={`px-3 py-2 ${align(c.align)}`}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i}>
                    {colonnes.map((c, j) => (
                      <td key={j} className={`px-3 py-2 ${align(c.align)} ${j === 0 ? 'font-semibold text-gray-800 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-200'}`}>
                        {c.render(l, i)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!lignes.length && <tr className="tv-vide"><td colSpan={colonnes.length} className="py-6 text-center text-gray-400">{vide}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {children}

      {(normaux.length > 0 || forts.length > 0) && (
        <div className="grid gap-2.5 sm:grid-cols-5">
          {normaux.length > 0 && (
            <div className={`tuile-verre space-y-1 ${forts.length ? 'sm:col-span-3' : 'sm:col-span-5'}`}>
              {normaux.map((p, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-gray-500">{p.label}</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{fmt(p.value)}</span>
                </div>
              ))}
            </div>
          )}
          {forts.map((p, i) => (
            <div key={i} className={`relative flex flex-col justify-center overflow-hidden rounded-[1.1rem] p-4 text-white shadow-[0_16px_28px_-14px_rgba(188,60,49,0.8),inset_0_1px_0_rgba(255,255,255,0.45)] ${normaux.length ? 'sm:col-span-2' : 'sm:col-span-5'}`}
              style={{ background: `linear-gradient(135deg, ${accent}ee 0%, ${accent} 55%, #1a1a1a 140%)` }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              <p className="relative text-[11px] font-bold uppercase tracking-wide text-white/80">{p.label}</p>
              <p className="relative text-2xl font-extrabold leading-tight">{fmt(p.value)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

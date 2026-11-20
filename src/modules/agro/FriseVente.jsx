// MAXI-AGRO : frise des étapes d'une vente (facture). Quatre étapes en chaîne, chacune avec qui agit, ce qui se passe
// et combien de factures s'y trouvent ; dessous, les trois sorties du circuit normal (refus, écart, correctif).
// Chaque case filtre la liste : un second clic sur la case active revient à « Toutes ».
import { Receipt, Send, PackageCheck, BadgeCheck, ChevronRight, XCircle, AlertTriangle, RotateCcw } from 'lucide-react'
import { icone3D } from '../../utils/color'

const ETAPES = [
  { id: 'brouillon', n: 1, icone: Receipt, couleur: '#64748b', titre: 'Brouillon', qui: 'Agent', effet: 'Création de la facture' },
  { id: 'sortie_demandee', n: 2, icone: Send, couleur: '#d97706', titre: 'À approuver', qui: 'Agent', effet: 'Demande de sortie' },
  { id: 'sortie_approuvee', n: 3, icone: PackageCheck, couleur: '#0284c7', titre: 'Sortie approuvée', qui: 'Hiérarchie ou auto 10 min', effet: 'Stock décompté' },
  { id: 'certifiee', n: 4, icone: BadgeCheck, couleur: '#16a34a', titre: 'Certifiée', qui: 'Agent', effet: 'Chiffre d\'affaires enregistré' }
]
const HORS_CIRCUIT = [
  { id: 'refusee', icone: XCircle, couleur: '#dc2626', titre: 'Refusées', aide: 'Sortie refusée : retour en brouillon' },
  { id: 'modif_demandee', icone: AlertTriangle, couleur: '#ea580c', titre: 'Écarts', aide: 'Quantités à ajuster avant certification' },
  { id: 'correctif', icone: RotateCcw, couleur: '#7c3aed', titre: 'Correctifs', aide: 'Facture certifiée à corriger' }
]

// compte : { brouillon, sortie_demandee, sortie_approuvee, certifiee, refusee, modif_demandee, correctif }
export default function FriseVente({ compte = {}, filtre, onFiltre }) {
  const basculer = (id) => onFiltre(filtre === id ? 'tous' : id)
  return (
    <section aria-label="Étapes d'une vente" className="ed-entree rounded-3xl border border-white/80 bg-white/60 p-3 shadow-[0_14px_28px_-18px_rgba(22,101,52,0.5),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl sm:p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-green-800">
        Étapes d'une vente <span className="font-semibold normal-case tracking-normal text-gray-400">: touchez une étape pour filtrer</span>
      </p>

      <ol className="grid grid-cols-2 gap-2 pb-1 md:flex md:items-stretch md:gap-1">
        {ETAPES.map((e, i) => {
          const actif = filtre === e.id
          const Ic = e.icone
          const nb = compte[e.id] || 0
          return (
            <li key={e.id} className="flex min-w-0 items-center gap-1 md:flex-1">
              <button type="button" onClick={() => basculer(e.id)} aria-pressed={actif}
                className="bv-clic ed-entree group relative flex w-full flex-col gap-1.5 overflow-hidden rounded-2xl border p-2.5 text-left"
                style={{
                  animationDelay: `${i * 70}ms`,
                  borderColor: actif ? e.couleur : 'rgba(255,255,255,0.85)',
                  background: actif ? `linear-gradient(160deg, ${e.couleur}26, rgba(255,255,255,0.85))` : 'rgba(255,255,255,0.7)',
                  boxShadow: actif ? `0 12px 22px -14px ${e.couleur}, inset 0 1px 0 rgba(255,255,255,0.95)` : 'inset 0 1px 0 rgba(255,255,255,0.95)'
                }}>
                <span className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D(e.couleur)}><Ic size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-extrabold uppercase tracking-wide" style={{ color: e.couleur }}>Étape {e.n}</span>
                    <span className="block text-[13px] font-extrabold leading-tight text-gray-900">{e.titre}</span>
                  </span>
                  <span className="text-xl font-black tabular-nums" style={{ color: nb ? e.couleur : '#cbd5e1' }}>{nb}</span>
                </span>
                <span className="text-[11px] leading-tight text-gray-600">{e.effet}</span>
                <span className="w-fit rounded-full border border-white/80 bg-white/80 px-1.5 py-px text-[10px] font-bold text-gray-500">{e.qui}</span>
              </button>
              {i < ETAPES.length - 1 && <ChevronRight size={18} aria-hidden="true" className="hidden shrink-0 text-gray-300 md:block" />}
            </li>
          )
        })}
      </ol>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Hors circuit normal</span>
        {HORS_CIRCUIT.map((h) => {
          const actif = filtre === h.id
          const Ic = h.icone
          const nb = compte[h.id] || 0
          return (
            <button key={h.id} type="button" onClick={() => basculer(h.id)} aria-pressed={actif} title={h.aide}
              className="puce-verre inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
              data-actif={actif} style={{ '--puce': h.couleur }}>
              <Ic size={13} aria-hidden="true" />{h.titre}
              <span className="rounded-full bg-black/10 px-1.5 text-[11px] tabular-nums">{nb}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

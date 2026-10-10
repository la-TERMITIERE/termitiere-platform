// Alerte du Dashboard pour les rôles qui ne sont PAS agents : matériel pas rendu alors que la
// période est terminée. Pas de notification, juste ce bandeau, fermable avec la croix (il revient
// seulement si la liste des retards change).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PackageX, X, ChevronRight } from 'lucide-react'
import { icone3D } from '../../utils/color'
import { retoursEnRetard } from './retoursEnRetard'
import { matchSite } from './site/useSite'

const cleStockage = (site) => `retards-retours-fermes:${site}`

export default function RetardsRetoursAlerte({ prestations, retours, demandes = [], site }) {
  // Uniquement le site courant : aucun mélange entre Lomé et Kara.
  const retards = useMemo(() => retoursEnRetard(prestations.filter((p) => matchSite(p, site)), retours.filter((r) => matchSite(r, site)), undefined, demandes.filter((d) => matchSite(d, site))), [prestations, retours, demandes, site])
  const signature = retards.map((x) => x.p.id).sort().join(',')
  const [fermeSur, setFermeSur] = useState(() => { try { return localStorage.getItem(cleStockage(site)) } catch { return null } })

  if (!retards.length || fermeSur === signature) return null

  function fermer() {
    try { localStorage.setItem(cleStockage(site), signature) } catch { /* ignore */ }
    setFermeSur(signature)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-red-200/70 bg-gradient-to-br from-red-50/90 to-white/70 p-3 pr-10 shadow-[0_10px_22px_-16px_rgba(220,38,38,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md">
      <style>{`
        @keyframes retard-secoue { 0%, 70%, 100% { transform: rotate(0deg); } 76% { transform: rotate(-10deg); } 84% { transform: rotate(8deg); } 92% { transform: rotate(-4deg); } }
        @keyframes retard-halo { 0%, 100% { transform: scale(0.9); opacity: 0.2; } 50% { transform: scale(1.3); opacity: 0.4; } }
      `}</style>
      <button type="button" onClick={fermer} title="Fermer l'alerte" aria-label="Fermer l'alerte"
        className="absolute right-2 top-2 rounded-xl p-1.5 text-red-400 transition-colors hover:bg-white/80 hover:text-red-700"><X size={16} /></button>
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 shrink-0">
          <span aria-hidden="true" className="absolute inset-0 rounded-xl bg-red-500 blur-md" style={{ animation: 'retard-halo 2.6s ease-in-out infinite' }} />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-xl" style={icone3D('#DC2626')}>
            <PackageX size={20} style={{ animation: 'retard-secoue 3s ease-in-out infinite' }} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-red-800">{retards.length} retour{retards.length > 1 ? 's' : ''} de matériel en retard</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {retards.slice(0, 4).map(({ p, restant, jours }) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                {p.clientNom} <span className="text-red-600">{restant} pièce(s) · {jours} j</span>
              </span>
            ))}
            {retards.length > 4 && <span className="text-[11px] font-semibold text-gray-500">+ {retards.length - 4} autre(s)</span>}
          </div>
          <Link to={`/logistique/${site}/retours`} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-700 hover:underline">
            Voir les retours <ChevronRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  )
}

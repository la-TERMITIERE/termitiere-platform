// Filtre posé par le lien d'une alerte : l'adresse porte `?ids=a,b,c` et la liste n'affiche alors que
// ces dossiers, sans tenir compte des autres filtres (période, statut, client). Un bandeau permet de
// revenir à la liste complète.
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filter, X } from 'lucide-react'

export const lienAvecIds = (route, ids) => (ids.length ? `${route}?ids=${ids.map(encodeURIComponent).join(',')}` : route)

export function useFiltreIds() {
  const [params, setParams] = useSearchParams()
  const brut = params.get('ids')
  const ids = useMemo(() => (brut ? new Set(brut.split(',').map(decodeURIComponent).filter(Boolean)) : null), [brut])
  const effacer = () => {
    const p = new URLSearchParams(params)
    p.delete('ids')
    setParams(p, { replace: true })
  }
  return { ids, effacer }
}

export default function BandeauFiltreIds({ filtre, total, accent = '#BC3C31', libelle = 'dossier' }) {
  if (!filtre.ids) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/80 bg-white/70 px-3 py-2 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md">
      <span className="flex h-6 w-6 items-center justify-center rounded-lg text-white" style={{ background: accent }}><Filter size={13} /></span>
      <span className="font-semibold text-gray-700">
        Affichage limité à l'alerte : <strong>{total}</strong> {libelle}{total > 1 ? 's' : ''}
      </span>
      <button type="button" onClick={filtre.effacer}
        className="ml-auto inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1 font-bold text-gray-600 transition-colors hover:bg-gray-50">
        <X size={12} /> Tout afficher
      </button>
    </div>
  )
}

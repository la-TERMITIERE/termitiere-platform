// Bandeau d'alerte du Dashboard, fermable avec la croix. Il ne disparaît pas tout seul comme une
// notification : il reste tant que la liste n'est pas réglée, et ne revient après fermeture que si
// la liste change. Sert aux agents (leurs propres dossiers) et aux autres rôles.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, ChevronRight } from 'lucide-react'
import { icone3D } from '../../utils/color'
import { lienAvecIds } from './FiltreIds'

const TONS = {
  red: { couleur: '#DC2626', bordure: 'border-red-200/70 from-red-50/90', titre: 'text-red-800', croix: 'text-red-400 hover:text-red-700', halo: 'bg-red-500', accent: 'text-red-600', lien: 'text-red-700', ombre: 'rgba(220,38,38,0.55)' },
  amber: { couleur: '#D97706', bordure: 'border-amber-200/70 from-amber-50/90', titre: 'text-amber-900', croix: 'text-amber-400 hover:text-amber-700', halo: 'bg-amber-500', accent: 'text-amber-700', lien: 'text-amber-800', ombre: 'rgba(217,119,6,0.5)' },
  slate: { couleur: '#475569', bordure: 'border-slate-200/70 from-slate-50/90', titre: 'text-slate-900', croix: 'text-slate-400 hover:text-slate-700', halo: 'bg-slate-500', accent: 'text-slate-700', lien: 'text-slate-700', ombre: 'rgba(71,85,105,0.55)' }
}

// Rafraîchit le composant à intervalle régulier (pour les alertes qui dépendent de l'heure).
export function useTick(ms = 30000) {
  const [, setN] = useState(0)
  useEffect(() => { const t = setInterval(() => setN((n) => n + 1), ms); return () => clearInterval(t) }, [ms])
}

// items : [{ id, texte, detail }] ; cle : clé de mémorisation de la fermeture (inclure le site).
export default function AlerteDashboard({ cle, tone = 'amber', icone: Icone, titre, items, to, lienLabel }) {
  const t = TONS[tone] || TONS.amber
  const signature = items.map((x) => x.id).sort().join(',')
  const [fermeSur, setFermeSur] = useState(() => { try { return localStorage.getItem(cle) } catch { return null } })
  if (!items.length || fermeSur === signature) return null
  function fermer() {
    try { localStorage.setItem(cle, signature) } catch { /* ignore */ }
    setFermeSur(signature)
  }
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${t.bordure} to-white/70 p-3 pr-10 backdrop-blur-md`}
      style={{ boxShadow: `0 10px 22px -16px ${t.ombre}, inset 0 1px 0 rgba(255,255,255,0.95)` }}>
      <style>{`
        @keyframes alerte-secoue { 0%, 70%, 100% { transform: rotate(0deg); } 76% { transform: rotate(-10deg); } 84% { transform: rotate(8deg); } 92% { transform: rotate(-4deg); } }
        @keyframes alerte-halo { 0%, 100% { transform: scale(0.9); opacity: 0.2; } 50% { transform: scale(1.3); opacity: 0.4; } }
      `}</style>
      <button type="button" onClick={fermer} title="Fermer l'alerte" aria-label="Fermer l'alerte"
        className={`absolute right-2 top-2 rounded-xl p-1.5 transition-colors hover:bg-white/80 ${t.croix}`}><X size={16} /></button>
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 shrink-0">
          <span aria-hidden="true" className={`absolute inset-0 rounded-xl blur-md ${t.halo}`} style={{ animation: 'alerte-halo 2.6s ease-in-out infinite' }} />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-xl" style={icone3D(t.couleur)}>
            <Icone size={20} style={{ animation: 'alerte-secoue 3s ease-in-out infinite' }} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-extrabold ${t.titre}`}>{titre}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {items.slice(0, 4).map((x) => (
              <span key={x.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                {x.texte} {x.detail && <span className={t.accent}>{x.detail}</span>}
              </span>
            ))}
            {items.length > 4 && <span className="text-[11px] font-semibold text-gray-500">+ {items.length - 4} autre(s)</span>}
          </div>
          <Link to={lienAvecIds(to, items.map((x) => x.id))} className={`mt-2 inline-flex items-center gap-1 text-xs font-bold hover:underline ${t.lien}`}>{lienLabel} <ChevronRight size={13} /></Link>
        </div>
      </div>
    </div>
  )
}

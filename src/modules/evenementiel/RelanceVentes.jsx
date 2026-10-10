// Ventes AUTORISÉES mais pas encore facturées alors que la date de chargement est passée.
//  - Agents : une vraie notification (cloche + alerte système) par vente et par jour, envoyée à
//    l'agent qui a saisi la vente. Composant « headless » (RelanceVentesAFacturer), monté dans AppShell.
//  - Autres rôles : aucune notification, seulement une alerte fermable sur le Dashboard
//    (AlerteVentesAFacturer), qui ne revient que si la liste change.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt, X, ChevronRight } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { claimOnce } from '../../core/db'
import { notify } from '../../core/notify'
import { icone3D } from '../../utils/color'
import { lienAvecIds } from '../../shared/ui/FiltreIds'
import { todayStr, formatMoney } from '../../utils/formatters'

export function ventesAFacturer(ventes, factures, aujourdhui = todayStr()) {
  const facturees = new Set(factures.map((f) => f.venteId).filter(Boolean))
  return ventes
    .filter((v) => v.statut === 'autorisee' && !facturees.has(v.id) && (v.dateChargement || v.date) && (v.dateChargement || v.date) < aujourdhui)
    .map((v) => ({ v, jours: Math.max(1, Math.round((new Date(aujourdhui) - new Date(v.dateChargement || v.date)) / 86400000)) }))
    .sort((a, b) => b.jours - a.jours)
}

export default function RelanceVentesAFacturer() {
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: factures } = useCollection('evenementiel_factures')
  const traitees = useRef(new Set())

  useEffect(() => {
    let annule = false
    async function relancer({ v, jours }, cle) {
      try {
        const gagne = await claimOnce('evenementiel_relance_ventes', cle, { venteId: v.id }).catch(() => false)
        if (!gagne) return
        await notify({
          type: 'warning',
          title: 'Vente autorisée à facturer ⏳',
          body: `${v.clientNom || ''} : vente ${v.num} autorisée, chargement prévu il y a ${jours} jour(s), pas encore facturée.`,
          module: 'evenementiel',
          forUsers: v.agentId ? [v.agentId] : [],
          forRoles: v.agentId ? [] : ['agent'],
          link: `/evenementiel/ventes?ids=${v.id}`
        })
      } catch { /* best effort */ }
    }
    function verifier() {
      const jour = todayStr()
      for (const x of ventesAFacturer(ventes, factures, jour)) {
        const cle = `${x.v.id}_${jour}`
        if (traitees.current.has(cle)) continue
        traitees.current.add(cle)
        if (!annule) relancer(x, cle)
      }
    }
    verifier()
    const timer = setInterval(verifier, 10 * 60 * 1000)
    return () => { annule = true; clearInterval(timer) }
  }, [ventes, factures])

  return null
}

const CLE = 'ventes-a-facturer-fermees'

export function AlerteVentesAFacturer({ ventes, factures }) {
  const liste = useMemo(() => ventesAFacturer(ventes, factures), [ventes, factures])
  const signature = liste.map((x) => x.v.id).sort().join(',')
  const [fermeSur, setFermeSur] = useState(() => { try { return localStorage.getItem(CLE) } catch { return null } })
  if (!liste.length || fermeSur === signature) return null
  function fermer() {
    try { localStorage.setItem(CLE, signature) } catch { /* ignore */ }
    setFermeSur(signature)
  }
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50/90 to-white/70 p-3 pr-10 shadow-[0_10px_22px_-16px_rgba(71,85,105,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md">
      <style>{`
        @keyframes avf-secoue { 0%, 70%, 100% { transform: rotate(0deg); } 76% { transform: rotate(-10deg); } 84% { transform: rotate(8deg); } 92% { transform: rotate(-4deg); } }
        @keyframes avf-halo { 0%, 100% { transform: scale(0.9); opacity: 0.2; } 50% { transform: scale(1.3); opacity: 0.4; } }
      `}</style>
      <button type="button" onClick={fermer} title="Fermer l'alerte" aria-label="Fermer l'alerte"
        className="absolute right-2 top-2 rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-white/80 hover:text-slate-700"><X size={16} /></button>
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 shrink-0">
          <span aria-hidden="true" className="absolute inset-0 rounded-xl bg-slate-500 blur-md" style={{ animation: 'avf-halo 2.6s ease-in-out infinite' }} />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-xl" style={icone3D('#475569')}>
            <Receipt size={20} style={{ animation: 'avf-secoue 3s ease-in-out infinite' }} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-slate-900">{liste.length} vente{liste.length > 1 ? 's' : ''} autorisée{liste.length > 1 ? 's' : ''} à facturer</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {liste.slice(0, 4).map(({ v, jours }) => (
              <span key={v.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">
                {v.clientNom} <span className="text-slate-700">{formatMoney(v.total || 0)} · {jours} j</span>
              </span>
            ))}
            {liste.length > 4 && <span className="text-[11px] font-semibold text-gray-500">+ {liste.length - 4} autre(s)</span>}
          </div>
          <Link to={lienAvecIds('/evenementiel/ventes', liste.map((x) => x.v.id))} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-700 hover:underline">
            Voir les ventes <ChevronRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  )
}

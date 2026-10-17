// Bouton d'action « verre » à pastille d'icône 3D : dégradé de la couleur du module, reflet brillant, pastille d'icône en
// relief (avec un petit « + » en coin pour une création), reflet qui balaie au survol et halo qui respire doucement.
// `animation` : mouvement de l'icône qui dit l'action ('recu' : le reçu qu'on imprime). Voir index.css pour les animations.
// Au clic : une onde de lumière part du point touché et la pastille d'icône fait un petit rebond (puis l'action s'exécute).
import { useRef, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'

const VARIANTES = {
  ambre: {
    fond: 'linear-gradient(135deg, #E08A1E 0%, #B45309 55%, #8a3d09 100%)',
    classes: 'border border-white/40 text-white shadow-[0_14px_26px_-12px_rgba(180,83,9,0.8),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-2px_0_rgba(0,0,0,0.14)] hover:shadow-[0_18px_30px_-12px_rgba(180,83,9,0.9),inset_0_1px_0_rgba(255,255,255,0.6)] bv-halo-ambre',
    pastille: 'bg-white/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)]',
    badge: 'text-amber-700'
  },
  // Vert « argent » : apport ou dotation d'argent (caisse).
  vert: {
    fond: 'linear-gradient(135deg, #22a45d 0%, #16a34a 50%, #0f7a3a 100%)',
    classes: 'border border-white/40 text-white shadow-[0_14px_26px_-12px_rgba(22,163,74,0.8),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-2px_0_rgba(0,0,0,0.14)] hover:shadow-[0_18px_30px_-12px_rgba(22,163,74,0.9),inset_0_1px_0_rgba(255,255,255,0.6)] bv-halo-vert',
    pastille: 'bg-white/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)]',
    badge: 'text-green-700'
  }
}

export default function BoutonVerre({ variante = 'ambre', icone: Icone, animation, badgePlus = false, loading = false, disabled = false, className = '', children, onClick, ...props }) {
  const st = VARIANTES[variante] || VARIANTES.ambre
  const [ondes, setOndes] = useState([]) // ondes de lumière en cours : { id, x, y }
  const [rebond, setRebond] = useState(0) // compteur de clics : la pastille est recréée (clé) et rejoue son rebond
  const compteur = useRef(0)

  function clic(e) {
    const r = e.currentTarget.getBoundingClientRect()
    const id = (compteur.current += 1)
    setOndes((o) => [...o, { id, x: e.clientX ? e.clientX - r.left : r.width / 2, y: e.clientY ? e.clientY - r.top : r.height / 2 }])
    setTimeout(() => setOndes((o) => o.filter((x) => x.id !== id)), 650)
    setRebond((n) => n + 1)
    onClick?.(e)
  }

  return (
    <button type="button" disabled={disabled || loading} onClick={clic} {...props}
      className={`group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-2xl py-2 pl-2.5 pr-5 text-sm font-extrabold tracking-wide transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 ${st.classes} ${className}`}
      style={{ background: st.fond }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-white/30 opacity-0 blur-sm transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 group-disabled:hidden" />
      {ondes.map((o) => <span key={o.id} aria-hidden="true" className="bv-onde" style={{ left: o.x, top: o.y }} />)}
      <span key={rebond} className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${st.pastille} ${rebond ? 'bv-clic-icone' : ''}`}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : Icone ? <Icone size={16} strokeWidth={2.4} className={animation ? `bg-anim-${animation}` : 'transition-transform duration-300 group-hover:scale-110'} /> : null}
        {badgePlus && !loading && <span className={`absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white shadow-sm ${st.badge}`}><Plus size={9} strokeWidth={4} /></span>}
      </span>
      <span className="relative">{children}</span>
    </button>
  )
}

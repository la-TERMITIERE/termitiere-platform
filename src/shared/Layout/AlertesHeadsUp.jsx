// Bandeaux d'alerte façon WhatsApp : chaque nouvelle notification glisse depuis
// le haut de l'écran (téléphone comme PC), aux couleurs du module concerné.
// - clic → marque lu + ouvre la page concernée ;
// - glisser vers le haut / le côté → masque ;
// - disparition automatique (barre de progression), la notification reste dans
//   la cloche.
// Monté une seule fois dans AppShell ; alimenté par useNotifications.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, X } from 'lucide-react'
import { useAlertesStore } from '../../core/alertes'
import { useAuth } from '../../hooks/useAuth'
import { updateItem } from '../../core/db'
import { themeOf } from './moduleTheme'
import { getModule } from '../modules'

const EMOJI = {
  demande: '📤', approuve: '✅', refus: '⛔', success: '✅', warning: '⚠️',
  rappel: '⏰', user: '👤', info: '🔔'
}

const DUREE_MS = 9000
const DUREE_URGENTE_MS = 20000

function Alerte({ a, index }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const fermer = useAlertesStore((s) => s.fermer)
  const theme = themeOf(a.module)
  const mod = getModule(a.module)
  const [drag, setDrag] = useState(0)      // décalage horizontal pendant le glissé
  const [sortie, setSortie] = useState(false)
  const depart = useRef(null)

  // Fermeture animée (laisse jouer la transition avant de retirer du store)
  const masquer = () => {
    setSortie(true)
    setTimeout(() => fermer(a.id), 200)
  }

  function onPointerDown(e) {
    depart.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e) {
    if (!depart.current) return
    const dx = e.clientX - depart.current.x
    const dy = e.clientY - depart.current.y
    if (dy < -50) { depart.current = null; masquer(); return } // glissé vers le haut
    setDrag(dx)
  }
  function onPointerUp() {
    if (!depart.current) return
    const d = drag
    depart.current = null
    if (Math.abs(d) > 90) masquer()
    else setDrag(0)
  }

  function ouvrir() {
    if (Math.abs(drag) > 6) return // c'était un glissé, pas un clic
    // Ouvrir l'alerte vaut lecture (comme ouvrir la conversation).
    if (user) updateItem('notifications', a.id, { [`readBy/${user.uid}`]: true }).catch(() => {})
    setSortie(true)
    setTimeout(() => fermer(a.id), 150)
    if (a.link) navigate(a.link, a.state ? { state: a.state } : undefined)
  }

  const duree = a.urgent ? DUREE_URGENTE_MS : DUREE_MS
  const opacite = Math.max(0, 1 - Math.abs(drag) / 180)

  return (
    <div
      role="alert"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        transform: sortie
          ? 'translateY(-120%) scale(0.96)'
          : `translateX(${drag}px) scale(${1 - index * 0.02})`,
        opacity: sortie ? 0 : opacite,
        transition: depart.current ? 'none' : 'transform .2s ease, opacity .2s ease',
        borderLeft: `5px solid ${theme.color}`,
        boxShadow: `0 18px 40px -12px ${theme.color}66, 0 6px 16px -8px rgba(0,0,0,.35)`,
        touchAction: 'pan-y'
      }}
      className="alerte-enter pointer-events-auto relative cursor-pointer select-none overflow-hidden rounded-2xl bg-white ring-1 ring-black/5"
    >
      <div onClick={ouvrir} className="flex items-start gap-3 p-3 pr-9">
        {/* Pastille du module (logo ou icône) + emoji du type */}
        <div className="relative shrink-0">
          {theme.logo ? (
            <img src={theme.logo} alt="" className="h-11 w-11 rounded-full bg-white object-cover p-1 ring-1 ring-black/5" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: theme.color }}>
              {mod?.icon
                ? <mod.icon size={20} color="white" strokeWidth={2.25} />
                : <span className="text-sm font-extrabold text-white">{theme.nom.slice(0, 2).toUpperCase()}</span>}
            </div>
          )}
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] shadow ring-1 ring-black/5">
            {EMOJI[a.type] || '🔔'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[11px] font-bold uppercase tracking-wide" style={{ color: theme.color }}>
              {theme.nom}
            </span>
            <span className="text-[11px] text-gray-400">• maintenant</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[15px] font-bold leading-snug text-gray-900">{a.title}</p>
          {a.body && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-gray-600">{a.body}</p>}
          {a.link && (
            <span className="mt-1 inline-flex items-center gap-0.5 text-[12px] font-semibold" style={{ color: theme.color }}>
              Voir <ChevronRight size={13} />
            </span>
          )}
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); masquer() }}
        aria-label="Masquer"
        className="absolute right-1.5 top-1.5 rounded-full p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600"
      >
        <X size={14} />
      </button>

      {/* Barre de progression avant disparition automatique */}
      <span
        className="absolute bottom-0 left-0 h-[3px]"
        style={{ background: theme.color, animation: `alerte-progress ${duree}ms linear forwards` }}
      />
    </div>
  )
}

export default function AlertesHeadsUp() {
  const alertes = useAlertesStore((s) => s.alertes)

  // Styles d'animation injectés une fois (pas de dépendance CSS externe).
  useEffect(() => {
    if (document.getElementById('alertes-css')) return
    const el = document.createElement('style')
    el.id = 'alertes-css'
    el.textContent = `
      @keyframes alerte-in {
        from { opacity: 0; transform: translateY(-130%) scale(.94); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .alerte-enter { animation: alerte-in .32s cubic-bezier(.16,1,.3,1); }
      @keyframes alerte-progress { from { width: 100%; } to { width: 0%; } }
      @media (prefers-reduced-motion: reduce) {
        .alerte-enter { animation: none; }
      }
    `
    document.head.appendChild(el)
  }, [])

  if (!alertes.length) return null

  return (
    <div className="pointer-events-none fixed inset-x-2 top-2 z-[80] flex flex-col gap-2 sm:left-auto sm:right-4 sm:top-4 sm:w-[390px]">
      {alertes.map((a, i) => (
        <Alerte key={a.id} a={a} index={alertes.length - 1 - i} />
      ))}
    </div>
  )
}

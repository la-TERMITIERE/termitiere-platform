// Barre de défilement horizontal FIXE, sur mobile, tablette ET ordinateur.
// Un tableau large se fait défiler de gauche à droite, mais sa barre native se trouve tout en bas du tableau : sur une
// longue liste on ne la voit jamais. Tant qu'un tableau déborde en largeur ET que sa fin est plus bas que l'écran,
// cette barre reste posée en bas de l'écran (au-dessus de la barre de navigation sur mobile et tablette) et défile le tableau
// en direct.
// Elle repère toute seule les tableaux de la page (aucun écran à modifier).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const ZONE_NAV = 92 // px réservés en bas par la barre de navigation mobile (marge + hauteur)
const ZONE_PC = 14  // ordinateur : pas de barre de navigation en bas, la barre se pose près du bord

export default function BarreDefilementFixe() {
  const [cible, setCible] = useState(null) // { el, left, width, contenu, accent }
  const barRef = useRef(null)
  const verrou = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    let raf = 0
    const calculer = () => {
      raf = 0
      const main = document.querySelector('main')
      if (!main) { setCible((c) => (c ? null : c)); return }
      const zone = mq.matches ? ZONE_NAV : ZONE_PC
      const ligne = window.innerHeight - zone
      let trouve = null
      for (const el of main.querySelectorAll('.overflow-auto, .overflow-x-auto, .table-verre')) {
        if (!el.querySelector('table') || el.scrollWidth <= el.clientWidth + 2) continue
        const ox = getComputedStyle(el).overflowX
        if (ox !== 'auto' && ox !== 'scroll') continue
        const r = el.getBoundingClientRect()
        if (r.width < 40) continue
        // Le tableau est à l'écran, mais sa fin (donc sa barre native) est cachée plus bas.
        if (r.top < ligne - 40 && r.bottom > ligne + 2) { trouve = { el, r }; break }
      }
      if (!trouve) { setCible((c) => (c ? null : c)); return }
      const accent = getComputedStyle(main).getPropertyValue('--tv-accent').trim() || '#BC3C31'
      const n = { el: trouve.el, left: Math.round(trouve.r.left), width: Math.round(trouve.r.width), contenu: trouve.el.scrollWidth, accent, zone }
      setCible((c) => (c && c.el === n.el && c.left === n.left && c.width === n.width && c.contenu === n.contenu && c.accent === n.accent && c.zone === n.zone ? c : n))
    }
    const planifier = () => { if (!raf) raf = requestAnimationFrame(calculer) }
    window.addEventListener('scroll', planifier, true) // la page défile dans <main> : capture pour l'attraper
    window.addEventListener('resize', planifier)
    mq.addEventListener?.('change', planifier)
    const mo = new MutationObserver(planifier)
    mo.observe(document.body, { childList: true, subtree: true })
    const minuteur = setInterval(planifier, 1000)
    planifier()
    return () => {
      window.removeEventListener('scroll', planifier, true)
      window.removeEventListener('resize', planifier)
      mq.removeEventListener?.('change', planifier)
      mo.disconnect()
      clearInterval(minuteur)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // La barre et le tableau se suivent dans les deux sens.
  useEffect(() => {
    const el = cible?.el
    const bar = barRef.current
    if (!el || !bar) return undefined
    bar.scrollLeft = el.scrollLeft
    const liberer = () => requestAnimationFrame(() => { verrou.current = false })
    const duTableau = () => { if (verrou.current) return; verrou.current = true; bar.scrollLeft = el.scrollLeft; liberer() }
    const deLaBarre = () => { if (verrou.current) return; verrou.current = true; el.scrollLeft = bar.scrollLeft; liberer() }
    el.addEventListener('scroll', duTableau, { passive: true })
    bar.addEventListener('scroll', deLaBarre, { passive: true })
    return () => { el.removeEventListener('scroll', duTableau); bar.removeEventListener('scroll', deLaBarre) }
  }, [cible?.el, cible?.contenu])

  if (!cible) return null
  return createPortal(
    <div ref={barRef} className="barre-defilement-fixe" aria-hidden="true"
      style={{ left: cible.left, width: cible.width, bottom: cible.zone, '--tv-accent': cible.accent }}>
      <div style={{ width: cible.contenu, height: 1 }} />
    </div>,
    document.body
  )
}

// Nombre qui « monte » de 0 à sa valeur (légère animation d'ouverture d'une fiche).
import { useEffect, useState } from 'react'

export default function Compteur({ valeur = 0, format = (v) => String(v), duree = 900 }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const cible = Number(valeur) || 0
    if (!cible) { setV(0); return undefined }
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / duree)
      setV(Math.round(cible * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [valeur, duree])
  return <>{format(v)}</>
}

// Pastille ronde 3D avec les initiales d'un nom (client, fournisseur…), couleur du module.
import { icone3D } from '../../utils/color'

const initiales = (nom) => {
  const mots = String(nom || '').trim().split(/ +/).filter(Boolean)
  if (!mots.length) return '?'
  return ((mots[0][0] || '') + (mots.length > 1 ? (mots[mots.length - 1][0] || '') : '')).toUpperCase()
}

export default function AvatarNom({ nom, accent = '#BC3C31', size = 32, className = '' }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full font-extrabold ${className}`}
      style={{ ...icone3D(accent), width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {initiales(nom)}
    </span>
  )
}

// Écran de chargement d'un module (pendant le lazy-load du code-splitting) —
// affiche le logo/icône DU SECTEUR EN COURS plutôt qu'un spinner générique, au
// milieu de la page qui serait sinon blanche le temps que le module se charge.
import { getModule } from '../modules'

export default function ModuleLoadingSpinner({ moduleId }) {
  const m = getModule(moduleId)
  const color = m?.color || '#BC3C31'
  const Icon = m?.icon

  return (
    <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
      <style>{`
        @keyframes module-loader-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 rounded-full"
          style={{
            border: '4px solid transparent',
            borderTopColor: color, borderRightColor: color + '80',
            animation: 'module-loader-spin 0.85s linear infinite'
          }} />
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_8px_20px_-6px_rgba(0,0,0,0.3)]">
          {m?.logo
            ? <img src={m.logo} alt="" className="h-full w-full object-contain p-1.5" />
            : Icon ? <Icon size={28} color={color} /> : null}
        </div>
      </div>
      <p className="text-sm font-semibold" style={{ color }}>{m?.nom || 'Chargement…'}</p>
    </div>
  )
}

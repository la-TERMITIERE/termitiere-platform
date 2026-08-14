// Écran de chargement — affiche le logo/icône DU SECTEUR EN COURS (pendant le
// lazy-load d'un module) ou, sans moduleId, le logo LA TERMITIÈRE (au démarrage
// de l'app / juste après la connexion), plutôt qu'un spinner générique sur une
// page qui serait sinon blanche.
import { getModule } from '../modules'

const BRAND = { nom: 'LA TERMITIÈRE', color: '#BC3C31', logo: '/termitiere-logo.png' }

export default function ModuleLoadingSpinner({ moduleId, label, fullScreen = false }) {
  const m = moduleId ? getModule(moduleId) : null
  const cible = m || BRAND
  const color = cible.color
  const Icon = cible.icon

  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${fullScreen ? 'h-screen' : 'h-[70vh]'}`}>
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
          {cible.logo
            ? <img src={cible.logo} alt=""
                onError={m ? undefined : (e) => { e.target.src = '/logo-mark.png' }}
                className="h-full w-full object-contain p-1.5" />
            : Icon ? <Icon size={28} color={color} /> : null}
        </div>
      </div>
      <p className="text-sm font-semibold" style={{ color }}>{label || cible.nom}</p>
    </div>
  )
}

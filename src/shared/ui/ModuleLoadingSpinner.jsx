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
        @keyframes gym-loader-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        /* Enchaînement de 3 exercices (squats → curls → développé épaules), le
           silhouette se renforçant visiblement à chaque étape avant de revenir à
           son point de départ pour reboucler proprement. */
        @keyframes gym-legs-squat {
          0%, 8% { transform: scaleY(1); }
          13% { transform: scaleY(0.8); }
          18% { transform: scaleY(1); }
          23% { transform: scaleY(0.8); }
          28% { transform: scaleY(1); }
          33%, 100% { transform: scaleY(1); }
        }
        @keyframes gym-arm-curl {
          0%, 36% { transform: rotate(0deg); }
          41% { transform: rotate(-95deg); }
          46% { transform: rotate(-10deg); }
          51% { transform: rotate(-95deg); }
          56% { transform: rotate(-10deg); }
          61%, 100% { transform: rotate(0deg); }
        }
        @keyframes gym-arm-press {
          0%, 64% { transform: rotate(0deg); }
          69% { transform: rotate(-150deg); }
          74% { transform: rotate(-10deg); }
          79% { transform: rotate(-150deg); }
          84% { transform: rotate(-10deg); }
          89%, 100% { transform: rotate(0deg); }
        }
        @keyframes gym-muscle-width {
          0%, 8% { stroke-width: 3; }
          33% { stroke-width: 4; }
          61% { stroke-width: 5.5; }
          89%, 94% { stroke-width: 7.5; }
          100% { stroke-width: 3; }
        }
        @keyframes gym-muscle-bulk {
          0%, 8% { transform: scaleX(0.82); }
          33% { transform: scaleX(0.92); }
          61% { transform: scaleX(1.05); }
          89%, 94% { transform: scaleX(1.3); }
          100% { transform: scaleX(0.82); }
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

      {/* Petit scénario animé — un personnage mince qui s'entraîne (squats, curls,
          développé épaules) et se renforce visiblement au fil des répétitions,
          pour faire patienter sur MAXI-GYM spécifiquement (demande explicite).
          Silhouette noire façon pictogramme sport, volontairement sobre. */}
      {moduleId === 'gym' && (
        <svg viewBox="0 0 140 96" width="140" height="92" style={{ animation: 'gym-loader-bob 1.4s ease-in-out infinite' }}>
          {/* Sol */}
          <line x1="18" y1="84" x2="122" y2="84" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" opacity="0.15" />
          {/* Jambes — rebond de squat, groupe pivoté à la hanche */}
          <g style={{ transformOrigin: '70px 58px', animation: 'gym-legs-squat 8s ease-in-out infinite' }}>
            <line x1="70" y1="58" x2="60" y2="84" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
            <line x1="70" y1="58" x2="82" y2="84" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" />
          </g>
          {/* Bras arrière, statique et discret */}
          <line x1="71" y1="39" x2="61" y2="48" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" />
          {/* Torse — s'élargit (stroke + échelle) à mesure que les séries s'enchaînent */}
          <g style={{ transformOrigin: '73px 58px', animation: 'gym-muscle-bulk 8s ease-in-out infinite' }}>
            <line x1="73" y1="38" x2="70" y2="58" stroke="#0f172a" strokeWidth="4.5" strokeLinecap="round"
              style={{ animation: 'gym-muscle-width 8s ease-in-out infinite' }} />
          </g>
          {/* Tête */}
          <circle cx="73" cy="27" r="7" fill="#0f172a" />
          {/* Bras avant : développé épaules (pivot épaule) + curl imbriqué (pivot coude) */}
          <g style={{ transformOrigin: '73px 38px', animation: 'gym-arm-press 8s ease-in-out infinite' }}>
            <line x1="73" y1="38" x2="84" y2="46" stroke="#0f172a" strokeWidth="4" strokeLinecap="round"
              style={{ animation: 'gym-muscle-width 8s ease-in-out infinite' }} />
            <g style={{ transformOrigin: '84px 46px', animation: 'gym-arm-curl 8s ease-in-out infinite' }}>
              <line x1="84" y1="46" x2="92" y2="58" stroke="#0f172a" strokeWidth="4" strokeLinecap="round"
                style={{ animation: 'gym-muscle-width 8s ease-in-out infinite' }} />
              {/* Haltère tenue en main */}
              <line x1="87" y1="58" x2="97" y2="58" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="86" cy="58" r="3" fill="#0f172a" />
              <circle cx="98" cy="58" r="3" fill="#0f172a" />
            </g>
          </g>
        </svg>
      )}
    </div>
  )
}

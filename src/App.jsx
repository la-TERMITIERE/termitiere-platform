// Routeur principal + gardes d'accès.
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AppShell from './shared/Layout/AppShell'
import ModuleLoadingSpinner from './shared/ui/ModuleLoadingSpinner'
import ToastContainer from './shared/ui/Toast'
import UpdateManager from './shared/UpdateManager'
import Login from './portal/Login'
import PortalHome from './portal/PortalHome'
import GlobalDashboard from './portal/GlobalDashboard'
import Utilisateurs from './portal/Utilisateurs'
import MonCompte from './portal/MonCompte'
import Parametres from './portal/Parametres'
import { getModule } from './shared/modules'

// Chargement paresseux des modules (code-splitting)
const AgroModule = lazy(() => import('./modules/agro/index.jsx'))
const LogistiqueModule = lazy(() => import('./modules/logistique/index.jsx'))
const EvenementielModule = lazy(() => import('./modules/evenementiel/index.jsx'))
const FoncierModule = lazy(() => import('./modules/foncier/index.jsx'))
const RhModule       = lazy(() => import('./modules/rh/index.jsx'))
const GarderieModule = lazy(() => import('./modules/garderie/index.jsx'))
const ProjetModule   = lazy(() => import('./modules/projet/index.jsx'))
const DepenseModule  = lazy(() => import('./modules/depense/index.jsx'))
const GymModule      = lazy(() => import('./modules/gym/index.jsx'))
const CarnetPresence = lazy(() => import('./modules/gym/carnet/CarnetPresence.jsx'))

// Route protégée : exige une session active.
function Protected({ children }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <ModuleLoadingSpinner label="Initialisation…" fullScreen />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

// Garde d'accès module : redirige vers le portail si non autorisé.
//
// Un module « bientot »/« en_developpement » (ex. MAXI-GYM en ce moment) n'est
// PAS ouvert à tout le monde qui « voit tout » (super_admin, pau, ge, directeur,
// admin, superviseur) : seul le rôle `info` (qui construit le module) peut y
// entrer, même en tapant l'URL directement — sans ce garde-fou, la carte non
// cliquable du portail (cf. PortalHome.jsx) ne serait qu'une façade, hasModule()
// laissant en fait passer toute la hiérarchie via isViewAllRole().
function ModuleGuard({ moduleId, children }) {
  const { hasModule, role } = useAuth()
  const mod = getModule(moduleId)
  const enPreparation = mod && mod.statut !== 'actif'
  if (enPreparation) {
    if (role !== 'info') return <Navigate to="/" replace />
  } else if (!hasModule(moduleId)) {
    return <Navigate to="/" replace />
  }
  return children
}

// Garde admin : réservé aux rôles à accès total (super-admin, PDG, GE).
function AdminGuard({ children }) {
  const isAdmin = useAuth((s) => s.isAdmin)
  if (!isAdmin()) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const init = useAuth((s) => s.init)
  const user = useAuth((s) => s.user)

  useEffect(() => {
    const unsub = init()
    return () => unsub && unsub()
  }, [init])

  return (
    <BrowserRouter>
      <UpdateManager />
      <ToastContainer />
      <Routes>
        {/* Connexion : si déjà connecté, on renvoie au portail */}
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

        {/* Carnet de présence MAXI-GYM — page PUBLIQUE, sans connexion (accès via
            QR personnel du client, cf. modules/gym/QrCarnetModal.jsx). */}
        <Route
          path="/gym/carnet/:token?"
          element={
            <Suspense fallback={<ModuleLoadingSpinner label="Chargement…" fullScreen />}>
              <CarnetPresence />
            </Suspense>
          }
        />

        {/* Espace authentifié */}
        <Route
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<PortalHome />} />
          <Route path="dashboard" element={<GlobalDashboard />} />
          <Route path="utilisateurs" element={<AdminGuard><Utilisateurs /></AdminGuard>} />
          <Route path="mon-compte" element={<MonCompte />} />
          <Route path="parametres" element={<Parametres />} />

          <Route
            path="agro/*"
            element={
              <ModuleGuard moduleId="agro">
                <Suspense fallback={<ModuleLoadingSpinner moduleId="agro" />}>
                  <AgroModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="logistique/*"
            element={
              <ModuleGuard moduleId="logistique">
                <Suspense fallback={<ModuleLoadingSpinner moduleId="logistique" />}>
                  <LogistiqueModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="evenementiel/*"
            element={
              <ModuleGuard moduleId="evenementiel">
                <Suspense fallback={<ModuleLoadingSpinner moduleId="evenementiel" />}>
                  <EvenementielModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="foncier/*"
            element={
              <ModuleGuard moduleId="foncier">
                <Suspense fallback={<ModuleLoadingSpinner moduleId="foncier" />}>
                  <FoncierModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="rh/*"
            element={
              <ModuleGuard moduleId="rh">
                <Suspense fallback={<ModuleLoadingSpinner moduleId="rh" />}>
                  <RhModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="gym/*"
            element={
              <ModuleGuard moduleId="gym">
                <Suspense fallback={<ModuleLoadingSpinner moduleId="gym" />}>
                  <GymModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="garderie/*"
            element={
              <ModuleGuard moduleId="garderie">
                <Suspense fallback={<ModuleLoadingSpinner moduleId="garderie" />}>
                  <GarderieModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="projet/*"
            element={
              <ModuleGuard moduleId="projet">
                <Suspense fallback={<ModuleLoadingSpinner moduleId="projet" />}>
                  <ProjetModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="depense/*"
            element={
              <ModuleGuard moduleId="depense">
                <Suspense fallback={<ModuleLoadingSpinner moduleId="depense" />}>
                  <DepenseModule />
                </Suspense>
              </ModuleGuard>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

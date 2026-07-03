// Routeur principal + gardes d'accès.
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AppShell from './shared/Layout/AppShell'
import LoadingSpinner from './shared/ui/LoadingSpinner'
import ToastContainer from './shared/ui/Toast'
import UpdateManager from './shared/UpdateManager'
import Login from './portal/Login'
import PortalHome from './portal/PortalHome'
import GlobalDashboard from './portal/GlobalDashboard'
import Utilisateurs from './portal/Utilisateurs'
import MonCompte from './portal/MonCompte'

// Chargement paresseux des modules (code-splitting)
const AgroModule = lazy(() => import('./modules/agro/index.jsx'))
const LogistiqueModule = lazy(() => import('./modules/logistique/index.jsx'))
const EvenementielModule = lazy(() => import('./modules/evenementiel/index.jsx'))
const FoncierModule = lazy(() => import('./modules/foncier/index.jsx'))
const RhModule       = lazy(() => import('./modules/rh/index.jsx'))
const GarderieModule = lazy(() => import('./modules/garderie/index.jsx'))
const ProjetModule   = lazy(() => import('./modules/projet/index.jsx'))
const DepenseModule  = lazy(() => import('./modules/depense/index.jsx'))

// Route protégée : exige une session active.
function Protected({ children }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <LoadingSpinner label="Initialisation…" className="h-screen" />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

// Garde d'accès module : redirige vers le portail si non autorisé.
function ModuleGuard({ moduleId, children }) {
  const { hasModule } = useAuth()
  if (!hasModule(moduleId)) return <Navigate to="/" replace />
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

          <Route
            path="agro/*"
            element={
              <ModuleGuard moduleId="agro">
                <Suspense fallback={<LoadingSpinner />}>
                  <AgroModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="logistique/*"
            element={
              <ModuleGuard moduleId="logistique">
                <Suspense fallback={<LoadingSpinner />}>
                  <LogistiqueModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="evenementiel/*"
            element={
              <ModuleGuard moduleId="evenementiel">
                <Suspense fallback={<LoadingSpinner />}>
                  <EvenementielModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="foncier/*"
            element={
              <ModuleGuard moduleId="foncier">
                <Suspense fallback={<LoadingSpinner />}>
                  <FoncierModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="rh/*"
            element={
              <ModuleGuard moduleId="rh">
                <Suspense fallback={<LoadingSpinner />}>
                  <RhModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="garderie/*"
            element={
              <ModuleGuard moduleId="garderie">
                <Suspense fallback={<LoadingSpinner />}>
                  <GarderieModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="projet/*"
            element={
              <ModuleGuard moduleId="projet">
                <Suspense fallback={<LoadingSpinner />}>
                  <ProjetModule />
                </Suspense>
              </ModuleGuard>
            }
          />
          <Route
            path="depense/*"
            element={
              <ModuleGuard moduleId="depense">
                <Suspense fallback={<LoadingSpinner />}>
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

import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './Dashboard'
import Analyses from './Analyses'
import Enfants from './Enfants'
import Personnel from './Personnel'
import PresencesEnfants from './PresencesEnfants'
import Paiements from './Paiements'
import Incidents from './Incidents'
import Cantine from './Cantine'
import Journal from './Journal'
import Params from './Params'
import { useGarderieStore } from './store/garderieStore'
import { useAuth } from '../../hooks/useAuth'

// Guard : redirige vers le dashboard si le rôle n'est pas autorisé
function GarderieGuard({ roles, children }) {
  const { role } = useAuth()
  if (roles && !roles.includes(role)) return <Navigate to="/garderie" replace />
  return children
}

const ROLES_GESTION   = ['super_admin', 'pau', 'ge', 'gerant', 'gerante_garderie', 'superviseur']
const ROLES_DIRECTION = ['super_admin', 'pau', 'ge', 'gerant', 'superviseur']
const ROLES_ADMIN     = ['super_admin', 'pau', 'ge']

export default function GarderieModule() {
  const init = useGarderieStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="presences" element={<PresencesEnfants />} />
      <Route path="cantine"   element={<Cantine />} />
      <Route path="incidents" element={<Incidents />} />

      <Route path="enfants" element={
        <GarderieGuard roles={[...ROLES_GESTION, 'tata']}><Enfants /></GarderieGuard>
      } />
      <Route path="personnel" element={
        <GarderieGuard roles={[...ROLES_DIRECTION, 'gerante_garderie']}><Personnel /></GarderieGuard>
      } />
      <Route path="paiements" element={
        <GarderieGuard roles={ROLES_GESTION}><Paiements /></GarderieGuard>
      } />
      <Route path="analyses" element={
        <GarderieGuard roles={ROLES_DIRECTION}><Analyses /></GarderieGuard>
      } />
      <Route path="journal" element={
        <GarderieGuard roles={ROLES_DIRECTION}><Journal /></GarderieGuard>
      } />
      <Route path="params" element={
        <GarderieGuard roles={ROLES_ADMIN}><Params /></GarderieGuard>
      } />
    </Routes>
  )
}

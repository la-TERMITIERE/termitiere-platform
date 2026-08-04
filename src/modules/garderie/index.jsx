import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './Dashboard'
import Analyses from './Analyses'
import Enfants from './Enfants'
import Personnel from './Personnel'
import PresencesEnfants from './PresencesEnfants'
import Paiements from './Paiements'
import Incidents from './Incidents'
import Taches from './Taches'
import TachesRoutinieres from './TachesRoutinieres'
import Cantine from './Cantine'
import Journal from './Journal'
import Params from './Params'
import RecettesDepenses from '../depense/RecettesDepenses'
import Partenaires from '../../shared/partenaires/Partenaires'
import { useGarderieStore } from './store/garderieStore'
import { useAuth } from '../../hooks/useAuth'
import { FULL_ACCESS_ROLES } from '../../core/roles'

// Guard : redirige vers le dashboard si le rôle n'est pas autorisé
function GarderieGuard({ roles, children }) {
  const { role } = useAuth()
  if (roles && !roles.includes(role)) return <Navigate to="/garderie" replace />
  return children
}

// Les rôles à accès total (super_admin, pau, ge, directeur, admin) voient toujours tout.
// Le partenaire (externe, lecture seule) consulte comme le superviseur — s'il a le module.
const ROLES_GESTION   = [...FULL_ACCESS_ROLES, 'gerant', 'gerante_garderie', 'superviseur', 'partenaire']
const ROLES_DIRECTION = [...FULL_ACCESS_ROLES, 'gerant', 'superviseur', 'partenaire']
const ROLES_ADMIN     = [...FULL_ACCESS_ROLES]

export default function GarderieModule() {
  const init = useGarderieStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="routine" element={<TachesRoutinieres />} />
      <Route path="presences" element={<PresencesEnfants />} />
      <Route path="cantine"   element={<Cantine />} />
      <Route path="incidents" element={<Incidents />} />
      {/* Ancienne URL du volet "Infirmerie & Soins", fusionné dans Incidents — conservée pour les liens existants */}
      <Route path="soins"     element={<Navigate to="/garderie/incidents" replace />} />
      <Route path="taches"    element={<Taches />} />

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
      <Route path="finances" element={
        <GarderieGuard roles={ROLES_GESTION}><RecettesDepenses secteurId="garderie" masquerRevenu /></GarderieGuard>
      } />
      <Route path="partenaires" element={<Partenaires module="garderie" />} />
      <Route path="journal" element={
        <GarderieGuard roles={ROLES_ADMIN}><Journal /></GarderieGuard>
      } />
      <Route path="params" element={
        <GarderieGuard roles={ROLES_ADMIN}><Params /></GarderieGuard>
      } />
    </Routes>
  )
}

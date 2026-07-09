import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './Dashboard'
import Projets from './Projets'
import Taches from './Taches'
import Planning from './Planning'
import Documents from './Documents'
import Galerie from './Galerie'
import Rapports from './Rapports'
import Commentaires from './Commentaires'
import Depenses from './Depenses'
import Prestataires from './Prestataires'
import Pilotage from './Pilotage'
import Alertes from './Alertes'
import Journal from './Journal'
import Params from './Params'
import Partenaires from '../../shared/partenaires/Partenaires'
import { useProjetStore } from './store/projetStore'
import { useAuth } from '../../hooks/useAuth'
import { PROJET_VOLETS_RESTREINTS_ROLES, PROJET_ALERTES_ROLES, PROJET_DEPENSES_ROLES } from '../../core/roles'

// Garde : redirige vers le dashboard si le rôle n'est pas autorisé (ex. secrétaire → Pilotage/Journal/Paramètres)
function ProjetGuard({ roles, children }) {
  const { role } = useAuth()
  if (roles && !roles.includes(role)) return <Navigate to="/projet" replace />
  return children
}

export default function ProjetModule() {
  const init = useProjetStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="projets" element={<Projets />} />
      <Route path="taches" element={<Taches />} />
      <Route path="planning"   element={<Planning />} />
      <Route path="documents"  element={<Documents />} />
      <Route path="galerie"    element={<Galerie />} />
      <Route path="rapports"     element={<Rapports />} />
      <Route path="commentaires" element={<Commentaires />} />
      <Route path="depenses"     element={<ProjetGuard roles={PROJET_DEPENSES_ROLES}><Depenses /></ProjetGuard>} />
      <Route path="prestataires" element={<Prestataires />} />
      <Route path="partenaires"  element={<Partenaires module="projet" />} />
      <Route path="pilotage"     element={<ProjetGuard roles={PROJET_VOLETS_RESTREINTS_ROLES}><Pilotage /></ProjetGuard>} />
      <Route path="alertes"      element={<ProjetGuard roles={PROJET_ALERTES_ROLES}><Alertes /></ProjetGuard>} />
      <Route path="journal" element={<ProjetGuard roles={PROJET_VOLETS_RESTREINTS_ROLES}><Journal /></ProjetGuard>} />
      <Route path="params" element={<ProjetGuard roles={PROJET_VOLETS_RESTREINTS_ROLES}><Params /></ProjetGuard>} />
    </Routes>
  )
}

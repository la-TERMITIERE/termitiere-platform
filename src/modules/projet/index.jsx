import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './Dashboard'
import Projets from './Projets'
import ProjetsExplorer from './ProjetsExplorer'
import Taches from './Taches'
import TachesExplorer from './TachesExplorer'
import Btp from './Btp'
import Planning from './Planning'
import Documents from './Documents'
import Galerie from './Galerie'
import Rapports from './Rapports'
import Besoins from './Besoins'
import Propositions from './Propositions'
import Materiel from './Materiel'
import Depenses from './Depenses'
import Prestataires from './Prestataires'
import Partenaires from '../../shared/partenaires/Partenaires'
import Pilotage from './Pilotage'
import ChargeTravail from './ChargeTravail'
import Journal from './Journal'
import Params from './Params'
import { useProjetStore } from './store/projetStore'
import { useAuth } from '../../hooks/useAuth'
import { ADMIN_VOLETS_ROLES, PROJET_PILOTAGE_ROLES, PROJET_DEPENSES_ROLES, PROJET_ROLES_CLOISONNES } from '../../core/roles'

// Garde : redirige vers le dashboard si le rôle n'est pas autorisé (ex. secrétaire → Pilotage/Journal/Paramètres)
function ProjetGuard({ roles, children }) {
  const { role } = useAuth()
  if (roles && !roles.includes(role)) return <Navigate to="/projet" replace />
  return children
}

// Les dépenses des chantiers BTP sont réunies dans le volet BTP (réservé à
// l'administration) et exclues de l'onglet « Dépenses » général — SAUF pour le
// chef de projet, dont tous les projets sont en BTP et qui n'a pas accès au volet
// BTP : sans cette exception, il perdrait tout accès à ses propres dépenses.
function DepensesRoute() {
  const { role } = useAuth()
  return <Depenses secteurExclu={PROJET_ROLES_CLOISONNES.includes(role) ? null : 'bat'} />
}

export default function ProjetModule() {
  const init = useProjetStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="projets" element={<ProjetsExplorer />} />
      <Route path="projets/liste" element={<Projets />} />
      <Route path="projets/:secteurId" element={<ProjetsExplorer />} />
      <Route path="projets/:secteurId/:projetId" element={<ProjetsExplorer />} />
      <Route path="projets/:secteurId/:projetId/:phase" element={<ProjetsExplorer />} />
      <Route path="taches" element={<TachesExplorer />} />
      <Route path="taches/liste" element={<Taches />} />
      <Route path="taches/:secteurId" element={<TachesExplorer />} />
      <Route path="taches/:secteurId/:phase" element={<TachesExplorer />} />
      <Route path="btp" element={<ProjetGuard roles={ADMIN_VOLETS_ROLES}><Btp /></ProjetGuard>} />
      <Route path="planning"   element={<Planning />} />
      <Route path="documents"  element={<Documents />} />
      <Route path="galerie"    element={<Galerie />} />
      <Route path="rapports"     element={<Rapports />} />
      <Route path="besoins" element={<Besoins />} />
      <Route path="propositions" element={<Propositions />} />
      <Route path="materiel" element={<Materiel />} />
      <Route path="depenses"     element={<ProjetGuard roles={PROJET_DEPENSES_ROLES}><DepensesRoute /></ProjetGuard>} />
      <Route path="prestataires" element={<Prestataires />} />
      <Route path="partenaires"  element={<Partenaires module="projet" />} />
      <Route path="pilotage"     element={<ProjetGuard roles={PROJET_PILOTAGE_ROLES}><Pilotage /></ProjetGuard>} />
      <Route path="charge-travail" element={<ProjetGuard roles={PROJET_PILOTAGE_ROLES}><ChargeTravail /></ProjetGuard>} />
      <Route path="journal" element={<ProjetGuard roles={ADMIN_VOLETS_ROLES}><Journal /></ProjetGuard>} />
      <Route path="params" element={<ProjetGuard roles={ADMIN_VOLETS_ROLES}><Params /></ProjetGuard>} />
    </Routes>
  )
}

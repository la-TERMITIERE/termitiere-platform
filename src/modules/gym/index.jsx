// Module MAXI-GYM — deux salles indépendantes (Lomé & Kara), même workflow.
//   /gym            → choix de la salle
//   /gym/:site/...  → application de la salle (séances, abonnements, facturation…)
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import GymSiteChooser from './site/GymSiteChooser'
import Dashboard from './Dashboard'
import Forfaits from './Forfaits'
import Seances from './Seances'
import Abonnements from './Abonnements'
import Clients from './Clients'
import Coachs from './Coachs'
import Comparatif from './Comparatif'
import Pilotage from './Pilotage'
import Facturation from './Facturation'
import Journal from './Journal'
import Params from './Params'
import Partenaires from '../../shared/partenaires/Partenaires'
import SectorBesoins from '../../shared/besoins/SectorBesoins'
import RecettesDepenses from '../depense/RecettesDepenses'
import Banque from './Banque'
import { SiteProvider, isSite, allowedSitesFor } from './site/useSite'
import { useAuth } from '../../hooks/useAuth'
import { canViewPilotage, isFullAccessRole, peutVoirBanque } from '../../core/roles'

function AccesRefuse() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto mb-3 text-amber-600" size={32} />
      <p className="font-bold text-amber-900">Accès réservé à la hiérarchie</p>
      <p className="mt-1 text-sm text-amber-700">Le pilotage et les analyses ne sont pas accessibles avec votre profil.</p>
    </div>
  )
}

function AccesRefuseAdmin() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto mb-3 text-amber-600" size={32} />
      <p className="font-bold text-amber-900">Accès réservé à l'administration</p>
      <p className="mt-1 text-sm text-amber-700">Ce volet n'est accessible qu'aux membres de l'administration.</p>
    </div>
  )
}

export default function GymModule() {
  const role = useAuth((s) => s.role)
  return (
    <div className="relative">
      {/* Filigrane — logo MAXI-GYM en fond, très discret, sur toutes les pages du module. */}
      <img src="/Maxi_Gym.png" alt="" aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-1/2 w-[70vw] max-w-[560px] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.05]" />
      <Routes>
        <Route index element={<GymSiteChooser />} />
        {/* Hors contexte d'une salle (lit Lomé ET Kara) — la route DOIT être déclarée
            avant `:site/*`, sinon React Router la confondrait avec un id de salle. */}
        <Route path="comparatif" element={isFullAccessRole(role) ? <Comparatif /> : <AccesRefuseAdmin />} />
        {/* Compte bancaire : compte UNIQUE du secteur, hors contexte d'une salle —
            même raison que Comparatif ci-dessus, déclarée avant `:site/*`. */}
        <Route path="banque" element={peutVoirBanque(role) ? <Banque /> : <AccesRefuseAdmin />} />
        <Route path=":site/*" element={<SiteApp />} />
        <Route path="*" element={<Navigate to="/gym" replace />} />
      </Routes>
    </div>
  )
}

// Application d'une salle : valide le paramètre + le droit d'accès, puis expose
// le site via le contexte.
function SiteApp() {
  const { site } = useParams()
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  if (!isSite(site)) return <Navigate to="/gym" replace />
  if (!allowedSitesFor(user, role).includes(site)) return <Navigate to="/gym" replace />
  return (
    <SiteProvider site={site}>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="forfaits" element={<Forfaits />} />
        <Route path="seances" element={<Seances />} />
        <Route path="abonnements" element={<Abonnements />} />
        <Route path="pilotage" element={canViewPilotage(role) ? <Pilotage /> : <AccesRefuse />} />
        <Route path="finances" element={canViewPilotage(role) ? <RecettesDepenses secteurId="gym" masquerRevenu /> : <AccesRefuse />} />
        <Route path="besoins" element={<SectorBesoins secteurId="gym" />} />
        <Route path="facturation" element={<Facturation />} />
        <Route path="clients" element={<Clients />} />
        <Route path="coachs" element={<Coachs />} />
        <Route path="partenaires" element={<Partenaires module="gym" />} />
        <Route path="journal" element={isFullAccessRole(role) ? <Journal /> : <AccesRefuseAdmin />} />
        <Route path="params" element={isFullAccessRole(role) ? <Params /> : <AccesRefuseAdmin />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </SiteProvider>
  )
}

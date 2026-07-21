// Module Maxi Logistique — deux sous-applications (Lomé & Kara), même workflow.
//   /logistique            → choix du site
//   /logistique/:site/...  → application du site (stock, prestations, factures…)
import { useEffect } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import SiteChooser from './SiteChooser'
import Dashboard from './Dashboard'
import SaisieMagasin from './SaisieMagasin'
import Prestations from './Prestations'
import Factures from './Factures'
import Demandes from './Demandes'
import Retours from './Retours'
import Referentiel from './Referentiel'
import Clients from './Clients'
import Fournisseurs from './Fournisseurs'
import Pilotage from './Pilotage'
import Journal from './Journal'
import Params from './Params'
import RecettesDepenses from '../depense/RecettesDepenses'
import Partenaires from '../../shared/partenaires/Partenaires'
import AutoCarryForwardLogistique from './AutoCarryForwardLogistique'
import { Lock } from 'lucide-react'
import { SiteProvider, isSite, allowedSitesFor } from './site/useSite'
import { useAuth } from '../../hooks/useAuth'
import { canViewPilotage } from '../../core/roles'
import { useLogistiqueStore } from './store/referentielStore'

function AccesRefuse() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto mb-3 text-amber-600" size={32} />
      <p className="font-bold text-amber-900">Accès réservé à la hiérarchie</p>
      <p className="mt-1 text-sm text-amber-700">Le pilotage et les analyses ne sont pas accessibles avec votre profil.</p>
    </div>
  )
}

export default function LogistiqueModule() {
  const init = useLogistiqueStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <>
    <AutoCarryForwardLogistique />
    <Routes>
      <Route index element={<SiteChooser />} />
      <Route path=":site/*" element={<SiteApp />} />
      <Route path="*" element={<Navigate to="/logistique" replace />} />
    </Routes>
    </>
  )
}

// Application d'un site : valide le paramètre + le droit d'accès, puis expose le
// site via le contexte.
function SiteApp() {
  const { site } = useParams()
  const user = useAuth((s) => s.user)
  const role = useAuth((s) => s.role)
  if (!isSite(site)) return <Navigate to="/logistique" replace />
  if (!allowedSitesFor(user, role).includes(site)) return <Navigate to="/logistique" replace />
  return (
    <SiteProvider site={site}>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="saisie" element={<SaisieMagasin />} />
        <Route path="prestations" element={<Prestations />} />
        <Route path="pilotage" element={canViewPilotage(role) ? <Pilotage /> : <AccesRefuse />} />
        <Route path="finances" element={canViewPilotage(role) ? <RecettesDepenses secteurId="logistique" /> : <AccesRefuse />} />
        <Route path="factures" element={<Factures />} />
        <Route path="demandes" element={<Demandes />} />
        <Route path="retours" element={<Retours />} />
        <Route path="referentiel" element={<Referentiel />} />
        <Route path="clients" element={<Clients />} />
        <Route path="fournisseurs" element={<Fournisseurs />} />
        <Route path="partenaires" element={<Partenaires module="logistique" />} />
        <Route path="journal" element={<Journal />} />
        <Route path="params" element={<Params />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </SiteProvider>
  )
}

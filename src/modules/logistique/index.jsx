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
import Journal from './Journal'
import Params from './Params'
import { SiteProvider, isSite, allowedSitesFor } from './site/useSite'
import { useAuth } from '../../hooks/useAuth'
import { useLogistiqueStore } from './store/referentielStore'

export default function LogistiqueModule() {
  const init = useLogistiqueStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<SiteChooser />} />
      <Route path=":site/*" element={<SiteApp />} />
      <Route path="*" element={<Navigate to="/logistique" replace />} />
    </Routes>
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
        <Route path="factures" element={<Factures />} />
        <Route path="demandes" element={<Demandes />} />
        <Route path="retours" element={<Retours />} />
        <Route path="referentiel" element={<Referentiel />} />
        <Route path="clients" element={<Clients />} />
        <Route path="fournisseurs" element={<Fournisseurs />} />
        <Route path="journal" element={<Journal />} />
        <Route path="params" element={<Params />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </SiteProvider>
  )
}

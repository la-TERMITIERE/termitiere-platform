// Module Logistique & Événementiel — routes internes.
import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import SaisieMagasin from './SaisieMagasin'
import Prestations from './Prestations'
import Factures from './Factures'
import Demandes from './Demandes'
import Retours from './Retours'
import Referentiel from './Referentiel'
import Clients from './Clients'
import Fournisseurs from './Fournisseurs'
import { useLogistiqueStore } from './store/referentielStore'

export default function LogistiqueModule() {
  const init = useLogistiqueStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
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
    </Routes>
  )
}

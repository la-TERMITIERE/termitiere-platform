// Module Événementiel — routes internes.
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Evenements from './Evenements'
import Devis from './Devis'
import Materiel from './Materiel'
import Clients from './Clients'

export default function EvenementielModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="evenements" element={<Evenements />} />
      <Route path="devis" element={<Devis />} />
      <Route path="materiel" element={<Materiel />} />
      <Route path="clients" element={<Clients />} />
    </Routes>
  )
}

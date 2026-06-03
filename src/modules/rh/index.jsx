// Module RH — routes internes.
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Employes from './Employes'
import Presences from './Presences'

export default function RhModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="employes" element={<Employes />} />
      <Route path="presences" element={<Presences />} />
    </Routes>
  )
}

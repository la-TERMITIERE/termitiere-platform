// Module Foncier — routes internes.
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Dossiers from './Dossiers'

export default function FoncierModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="dossiers" element={<Dossiers />} />
    </Routes>
  )
}

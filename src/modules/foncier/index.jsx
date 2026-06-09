// Module Foncier — routes internes.
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Dossiers from './Dossiers'
import Journal from './Journal'
import Params from './Params'

export default function FoncierModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="dossiers" element={<Dossiers />} />
      <Route path="journal" element={<Journal />} />
      <Route path="params" element={<Params />} />
    </Routes>
  )
}

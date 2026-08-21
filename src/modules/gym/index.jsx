// Module MAXI-GYM — routes internes.
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Seances from './Seances'
import Abonnements from './Abonnements'

export default function GymModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="seances" element={<Seances />} />
      <Route path="abonnements" element={<Abonnements />} />
    </Routes>
  )
}

import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Enfants from './Enfants'
import Personnel from './Personnel'
import PresencesEnfants from './PresencesEnfants'
import Paiements from './Paiements'
import Incidents from './Incidents'
import Journal from './Journal'
import Params from './Params'
import { useGarderieStore } from './store/garderieStore'

export default function GarderieModule() {
  const init = useGarderieStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="enfants"   element={<Enfants />} />
      <Route path="personnel" element={<Personnel />} />
      <Route path="presences" element={<PresencesEnfants />} />
      <Route path="paiements" element={<Paiements />} />
      <Route path="incidents" element={<Incidents />} />
      <Route path="journal"   element={<Journal />} />
      <Route path="params"    element={<Params />} />
    </Routes>
  )
}

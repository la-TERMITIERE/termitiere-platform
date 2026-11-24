// Module VOYAGES & ACHATS — routes internes.
import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Voyages from './Voyages'
import VoyageDetail from './VoyageDetail'
import Devises from './Devises'
import { useVoyageStore } from './store/voyageStore'

export default function VoyageModule() {
  const init = useVoyageStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="voyages" element={<Voyages />} />
      <Route path="voyages/:id" element={<VoyageDetail />} />
      <Route path="devises" element={<Devises />} />
    </Routes>
  )
}

// Module Foncier — routes internes.
import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Dossiers from './Dossiers'
import Journal from './Journal'
import Params from './Params'
import { useFoncierStore } from './store/referentielStore'

export default function FoncierModule() {
  const init = useFoncierStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="dossiers" element={<Dossiers />} />
      <Route path="journal" element={<Journal />} />
      <Route path="params" element={<Params />} />
    </Routes>
  )
}

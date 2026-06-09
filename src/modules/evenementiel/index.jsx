// Module Briqueterie — routes internes.
import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import SaisieMatiere from './SaisieMatiere'
import Production from './Production'
import StockBriques from './StockBriques'
import Ventes from './Ventes'
import Demandes from './Demandes'
import Params from './Params'
import Clients from './Clients'
import { useBriqueterieStore } from './store/referentielStore'

export default function EvenementielModule() {
  const init = useBriqueterieStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="saisie" element={<SaisieMatiere />} />
      <Route path="production" element={<Production />} />
      <Route path="stock" element={<StockBriques />} />
      <Route path="ventes" element={<Ventes />} />
      <Route path="demandes" element={<Demandes />} />
      <Route path="params" element={<Params />} />
      <Route path="clients" element={<Clients />} />
    </Routes>
  )
}

// Module Logistique — routes internes.
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Vehicules from './Vehicules'
import Livraisons from './Livraisons'
import Fournisseurs from './Fournisseurs'
import StockMateriel from './StockMateriel'

export default function LogistiqueModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="vehicules" element={<Vehicules />} />
      <Route path="livraisons" element={<Livraisons />} />
      <Route path="fournisseurs" element={<Fournisseurs />} />
      <Route path="stock" element={<StockMateriel />} />
    </Routes>
  )
}

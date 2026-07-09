// Module Dépenses — routes internes.
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Budgets from './Budgets'
import Depenses from './Depenses'
import Autorisations from './Autorisations'
import Analyses from './Analyses'
import Rentabilite from './Rentabilite'
import Flux from './Flux'
import Historique from './Historique'
import Journal from './Journal'
import Params from './Params'
import Partenaires from '../../shared/partenaires/Partenaires'

export default function DepenseModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="budgets" element={<Budgets />} />
      <Route path="liste" element={<Depenses />} />
      <Route path="autorisations" element={<Autorisations />} />
      <Route path="analyses" element={<Analyses />} />
      <Route path="rentabilite" element={<Rentabilite />} />
      <Route path="flux" element={<Flux />} />
      <Route path="historique" element={<Historique />} />
      <Route path="partenaires" element={<Partenaires module="depense" />} />
      <Route path="journal" element={<Journal />} />
      <Route path="params" element={<Params />} />
    </Routes>
  )
}

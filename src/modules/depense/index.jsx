// Module Dépenses — routes internes.
import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './Dashboard'
import Depenses from './Depenses'
import RecettesDepenses from './RecettesDepenses'
import Autorisations from './Autorisations'
import Analyses from './Analyses'
import Rentabilite from './Rentabilite'
import Flux from './Flux'
import Journal from './Journal'
import Params from './Params'
import Partenaires from '../../shared/partenaires/Partenaires'

export default function DepenseModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="liste" element={<Depenses />} />
      <Route path="recettes-depenses" element={<RecettesDepenses />} />
      {/* Ancien écran « Budgets » fusionné dans « Bilan par secteur » — redirige les liens existants. */}
      <Route path="budgets" element={<Navigate to="/depense/recettes-depenses" replace />} />
      <Route path="autorisations" element={<Autorisations />} />
      <Route path="analyses" element={<Analyses />} />
      <Route path="rentabilite" element={<Rentabilite />} />
      <Route path="flux" element={<Flux />} />
      <Route path="partenaires" element={<Partenaires module="depense" />} />
      <Route path="journal" element={<Journal />} />
      <Route path="params" element={<Params />} />
    </Routes>
  )
}

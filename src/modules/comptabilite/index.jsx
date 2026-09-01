// Module COMPTABILITÉ — routes internes (reproduction fidèle de la Comptabilité FEZIRE,
// socle SYSCOHADA Révisé). Sections alignées sur /accounting/* de FEZIRE.
import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './Dashboard'
import Ecritures from './Ecritures'
import Faits from './Faits'
import Automatisation from './Automatisation'
import Supervision from './Supervision'
import Tiers from './Tiers'
import GrandLivre from './GrandLivre'
import Analytique from './Analytique'
import Etats from './Etats'
import Tva from './Tva'
import Immobilisations from './Immobilisations'
import Patrimoine from './Patrimoine'
import PlanComptable from './PlanComptable'
import ModelesPlans from './ModelesPlans'
import Params from './Params'

export default function ComptabiliteModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="ecritures" element={<Ecritures />} />
      <Route path="faits" element={<Faits />} />
      <Route path="automatisation" element={<Automatisation />} />
      <Route path="supervision" element={<Supervision />} />
      <Route path="tiers" element={<Tiers />} />
      <Route path="grand-livre" element={<GrandLivre />} />
      {/* Ancienne route Balance fusionnée dans « Balance & Grand Livre ». */}
      <Route path="balance" element={<Navigate to="/comptabilite/grand-livre" replace />} />
      <Route path="analytique" element={<Analytique />} />
      <Route path="etats" element={<Etats />} />
      <Route path="tva" element={<Tva />} />
      <Route path="immobilisations" element={<Immobilisations />} />
      <Route path="patrimoine" element={<Patrimoine />} />
      <Route path="plan" element={<PlanComptable />} />
      <Route path="modeles-plans" element={<ModelesPlans />} />
      <Route path="params" element={<Params />} />
    </Routes>
  )
}

// Module COMPTABILITÉ — routes internes (reproduction fidèle de la Comptabilité FEZIRE,
// socle SYSCOHADA Révisé). Sections alignées sur /accounting/* de FEZIRE.
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import Dashboard from './Dashboard'
import Ecritures from './Ecritures'
import Faits from './Faits'
import Automatisation from './Automatisation'
import Supervision from './Supervision'
import Tiers from './Tiers'
import MouvementsBancaires from './MouvementsBancaires'
import ComptesBancaires from './ComptesBancaires'
import SuiviJournalier from './SuiviJournalier'
import GrandLivre from './GrandLivre'
import Analytique from './Analytique'
import Etats from './Etats'
import Tva from './Tva'
import Immobilisations from './Immobilisations'
import Patrimoine from './Patrimoine'
import PlanComptable from './PlanComptable'
import ModelesPlans from './ModelesPlans'
import Params from './Params'
import { useAuth } from '../../hooks/useAuth'
import { peutVoirVoletsAdmin, peutVoirBanque, isFullAccessRole } from '../../core/roles'

// Mouvements d'un compte bancaire : la clé force un état neuf quand on passe d'un compte à l'autre.
function MouvementsDuCompte() {
  const { banqueId } = useParams()
  return <MouvementsBancaires key={banqueId} />
}

export default function ComptabiliteModule() {
  const role = useAuth((s) => s.role)
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      {/* Suivi journalier : recettes, dépenses, bénéfice et CA de tous les secteurs, réservé à la direction. */}
      <Route path="suivi-journalier" element={<Navigate to="/comptabilite/suivi-journalier/caisse" replace />} />
      <Route path="suivi-journalier/caisse" element={isFullAccessRole(role) ? <SuiviJournalier key="caisse" page="caisse" /> : <Navigate to="/comptabilite" replace />} />
      <Route path="suivi-journalier/recettes" element={isFullAccessRole(role) ? <SuiviJournalier key="recettes" page="recettes" /> : <Navigate to="/comptabilite" replace />} />
      <Route path="ecritures" element={<Ecritures />} />
      <Route path="faits" element={<Faits />} />
      <Route path="automatisation" element={<Automatisation />} />
      <Route path="supervision" element={<Supervision />} />
      <Route path="tiers" element={<Tiers />} />
      {/* Mouvements bancaires : réservé à PAU / Assistant PAU / GE / Info (BANQUE_ROLES), comme les comptes bancaires des secteurs. */}
      <Route path="mouvements-bancaires" element={peutVoirBanque(role) ? <ComptesBancaires /> : <Navigate to="/comptabilite" replace />} />
      <Route path="mouvements-bancaires/:banqueId" element={peutVoirBanque(role) ? <MouvementsDuCompte /> : <Navigate to="/comptabilite" replace />} />
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
      <Route path="params" element={peutVoirVoletsAdmin(role) ? <Params /> : <Navigate to="/comptabilite" replace />} />
    </Routes>
  )
}

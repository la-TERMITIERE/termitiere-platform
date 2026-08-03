// Module Dépenses — routes internes.
import { Routes, Route, Navigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import Dashboard from './Dashboard'
import Depenses from './Depenses'
import RecettesDepenses from './RecettesDepenses'
import SourcesRevenus from './SourcesRevenus'
import Autorisations from './Autorisations'
import Analyses from './Analyses'
import Rentabilite from './Rentabilite'
import Flux from './Flux'
import Banque from './Banque'
import Journal from './Journal'
import Params from './Params'
import Partenaires from '../../shared/partenaires/Partenaires'
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole, canViewFinance, depenseRoleEffectif } from '../../core/roles'

function AccesRefuseAdmin() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto mb-3 text-amber-600" size={32} />
      <p className="font-bold text-amber-900">Accès réservé à l'administration</p>
      <p className="mt-1 text-sm text-amber-700">Ce volet n'est accessible qu'aux membres de l'administration.</p>
    </div>
  )
}

function AccesRefuse() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto mb-3 text-amber-600" size={32} />
      <p className="font-bold text-amber-900">Accès réservé à la hiérarchie</p>
      <p className="mt-1 text-sm text-amber-700">Ce volet financier n'est pas accessible avec votre profil.</p>
    </div>
  )
}

export default function DepenseModule() {
  // super_admin/admin/directeur sont traités comme un agent DANS CE MODULE
  // uniquement (cf. depenseRoleEffectif) — seuls pau, ge et info gardent l'accès
  // complet à E-DÉPENSES. Le reste des rôles n'est pas affecté par la substitution.
  const { role: roleReel } = useAuth()
  const role = depenseRoleEffectif(roleReel)
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="liste" element={<Depenses />} />
      <Route path="recettes-depenses" element={canViewFinance(role) ? <RecettesDepenses /> : <AccesRefuse />} />
      <Route path="revenus" element={isFullAccessRole(role) ? <SourcesRevenus /> : <AccesRefuseAdmin />} />
      {/* Ancien écran « Budgets » fusionné dans « Bilan par secteur » — redirige les liens existants. */}
      <Route path="budgets" element={<Navigate to="/depense/recettes-depenses" replace />} />
      <Route path="autorisations" element={<Autorisations />} />
      <Route path="analyses" element={<Analyses />} />
      <Route path="rentabilite" element={canViewFinance(role) ? <Rentabilite /> : <AccesRefuse />} />
      <Route path="flux" element={canViewFinance(role) ? <Flux /> : <AccesRefuse />} />
      <Route path="banque" element={canViewFinance(role) ? <Banque /> : <AccesRefuse />} />
      <Route path="partenaires" element={<Partenaires module="depense" />} />
      <Route path="journal" element={isFullAccessRole(role) ? <Journal /> : <AccesRefuseAdmin />} />
      <Route path="params" element={isFullAccessRole(role) ? <Params /> : <AccesRefuseAdmin />} />
    </Routes>
  )
}

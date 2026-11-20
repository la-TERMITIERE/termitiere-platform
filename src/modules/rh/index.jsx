// Module RESSOURCES HUMAINES — routes internes.
// Reproduction de la structure du module RH de FEZIRE : 7 sous-modules, ~22 écrans.
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import RhOnglets from './RhOnglets'
import { Lock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole } from '../../core/roles'
// Structure RH
import Departements from './Departements'
import Postes from './Postes'
import Organigramme from './Organigramme'
// Collaborateurs & Contrats
import Employes from './Employes'
import Contrats from './Contrats'
import Onboarding from './Onboarding'
import Rattachements from './Rattachements'
import TitresBadges from './TitresBadges'
// Temps & Paie
import Conges from './Conges'
import Presences from './Presences'
import PresencesConfiguration from './PresencesConfiguration'
import CongesConfiguration from './CongesConfiguration'
import Paie from './Paie'
import PaieConfiguration from './PaieConfiguration'
import EtatSalaires from './EtatSalaires'
import AutorisationsSalaire from './AutorisationsSalaire'
import Avances from './Avances'
// Talent & Développement
import Recrutement from './Recrutement'
import Formulaires from './Formulaires'
import Formations from './Formations'
import Evaluations from './Evaluations'
import Competences from './Competences'
// Pilotage & Conformité
import Conformite from './Conformite'
// Vie d'Équipe
import Taches from './Taches'
import Impacts from './Impacts'
import Anniversaires from './Anniversaires.jsx'
import Dotations from './Dotations.jsx'
import Primes from './Primes.jsx'
import PrimesConfiguration from './PrimesConfiguration.jsx'
// Missions & Frais
import Missions from './Missions'
import MissionsConfiguration from './MissionsConfiguration'

// Réglages RH (paie, missions, rattachement des comptes) : réservés à l'administration.
function GardeAdmin({ children }) {
  const role = useAuth((s) => s.role)
  if (isFullAccessRole(role)) return children
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto mb-3 text-amber-600" size={32} />
      <p className="font-bold text-amber-900">Accès réservé à l'administration</p>
      <p className="mt-1 text-sm text-amber-700">Les paramètres RH ne sont accessibles qu'aux membres de l'administration.</p>
    </div>
  )
}

export default function RhModule() {
  return (
    <>
    <RhOnglets />
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="departements" element={<Departements />} />
      <Route path="postes" element={<Postes />} />
      <Route path="organigramme" element={<Organigramme />} />
      <Route path="employes" element={<Employes />} />
      <Route path="contrats" element={<Contrats />} />
      <Route path="onboarding" element={<Onboarding />} />
      <Route path="rattachements" element={<GardeAdmin><Rattachements /></GardeAdmin>} />
      <Route path="titres-badges" element={<TitresBadges />} />
      <Route path="conges" element={<Conges />} />
      <Route path="conges-configuration" element={<GardeAdmin><CongesConfiguration /></GardeAdmin>} />
      <Route path="presences" element={<Presences />} />
      <Route path="presences-configuration" element={<GardeAdmin><PresencesConfiguration /></GardeAdmin>} />
      <Route path="paie" element={<Paie />} />
      <Route path="paie-configuration" element={<GardeAdmin><PaieConfiguration /></GardeAdmin>} />
      <Route path="etat-salaires" element={<EtatSalaires />} />
      <Route path="autorisations-salaire" element={<AutorisationsSalaire />} />
      <Route path="avances" element={<Avances />} />
      <Route path="recrutement" element={<Recrutement />} />
      <Route path="formulaires" element={<Formulaires />} />
      <Route path="formations" element={<Formations />} />
      <Route path="evaluations" element={<Evaluations />} />
      <Route path="competences" element={<Competences />} />
      <Route path="conformite" element={<Conformite />} />
      <Route path="taches" element={<Taches />} />
      <Route path="anniversaires" element={<Anniversaires />} />
      <Route path="dotations" element={<Dotations />} />
      <Route path="primes" element={<Primes />} />
      <Route path="primes-configuration" element={<GardeAdmin><PrimesConfiguration /></GardeAdmin>} />
      <Route path="impacts" element={<Impacts />} />
      <Route path="missions" element={<Missions />} />
      <Route path="missions-configuration" element={<GardeAdmin><MissionsConfiguration /></GardeAdmin>} />
    </Routes>
    </>
  )
}

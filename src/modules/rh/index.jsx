// Module RESSOURCES HUMAINES — routes internes.
// Reproduction de la structure du module RH de FEZIRE : 7 sous-modules, ~22 écrans.
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
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
import Paie from './Paie'
import PaieConfiguration from './PaieConfiguration'
import EtatSalaires from './EtatSalaires'
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
// Missions & Frais
import Missions from './Missions'
import MissionsConfiguration from './MissionsConfiguration'

export default function RhModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="departements" element={<Departements />} />
      <Route path="postes" element={<Postes />} />
      <Route path="organigramme" element={<Organigramme />} />
      <Route path="employes" element={<Employes />} />
      <Route path="contrats" element={<Contrats />} />
      <Route path="onboarding" element={<Onboarding />} />
      <Route path="rattachements" element={<Rattachements />} />
      <Route path="titres-badges" element={<TitresBadges />} />
      <Route path="conges" element={<Conges />} />
      <Route path="presences" element={<Presences />} />
      <Route path="paie" element={<Paie />} />
      <Route path="paie-configuration" element={<PaieConfiguration />} />
      <Route path="etat-salaires" element={<EtatSalaires />} />
      <Route path="recrutement" element={<Recrutement />} />
      <Route path="formulaires" element={<Formulaires />} />
      <Route path="formations" element={<Formations />} />
      <Route path="evaluations" element={<Evaluations />} />
      <Route path="competences" element={<Competences />} />
      <Route path="conformite" element={<Conformite />} />
      <Route path="taches" element={<Taches />} />
      <Route path="impacts" element={<Impacts />} />
      <Route path="missions" element={<Missions />} />
      <Route path="missions-configuration" element={<MissionsConfiguration />} />
    </Routes>
  )
}

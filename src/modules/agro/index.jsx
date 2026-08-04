// Module MAXI-AGRO — routes internes (module natif intégré au portail).
// S'affiche dans le shell du portail (sidebar + topbar + retour à l'accueil),
// sans second écran de connexion : l'authentification est celle du portail.
import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Lock } from 'lucide-react'
import Dashboard from './Dashboard'
import Saisie from './Saisie'
import TachesRoutinieres from './TachesRoutinieres'
import Factures from './Factures'
import Analyses from './Analyses'
import Sante from './Sante'
import Demandes from './Demandes'
import Journal from './Journal'
import Params from './Params'
import AutoCarryForward from './AutoCarryForward'
import RecettesDepenses from '../depense/RecettesDepenses'
import Partenaires from '../../shared/partenaires/Partenaires'
import { useAgroStore } from './store/agroStore'
import { useAuth } from '../../hooks/useAuth'
import { canViewPilotage, isFullAccessRole } from '../../core/roles'

// Garde d'accès : Pilotage & Analyses réservé à la hiérarchie (pas les agents).
function AccesRefuse() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto mb-3 text-amber-600" size={32} />
      <p className="font-bold text-amber-900">Accès réservé à la hiérarchie</p>
      <p className="mt-1 text-sm text-amber-700">Le pilotage et les analyses ne sont pas accessibles avec votre profil.</p>
    </div>
  )
}

// Garde d'accès : Journal et Paramètres réservés à l'administration.
function AccesRefuseAdmin() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto mb-3 text-amber-600" size={32} />
      <p className="font-bold text-amber-900">Accès réservé à l'administration</p>
      <p className="mt-1 text-sm text-amber-700">Ce volet n'est accessible qu'aux membres de l'administration.</p>
    </div>
  )
}

export default function AgroModule() {
  // Démarre la synchronisation temps réel du référentiel (espèces / aliments).
  const init = useAgroStore((s) => s.init)
  const { role } = useAuth()
  useEffect(() => { init() }, [init])

  return (
    <>
    <AutoCarryForward />
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="routine" element={<TachesRoutinieres />} />
      <Route path="saisie" element={<Saisie />} />
      <Route path="factures" element={<Factures />} />
      <Route path="finances" element={canViewPilotage(role) ? <RecettesDepenses secteurId="agro" masquerRevenu /> : <AccesRefuse />} />
      <Route path="analyses" element={canViewPilotage(role) ? <Analyses /> : <AccesRefuse />} />
      <Route path="sante" element={<Sante />} />
      <Route path="demandes" element={<Demandes />} />
      <Route path="partenaires" element={<Partenaires module="agro" />} />
      <Route path="journal" element={isFullAccessRole(role) ? <Journal /> : <AccesRefuseAdmin />} />
      <Route path="params" element={isFullAccessRole(role) ? <Params /> : <AccesRefuseAdmin />} />
    </Routes>
    </>
  )
}

// Module Briqueterie — routes internes.
import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Lock } from 'lucide-react'
import Dashboard from './Dashboard'
import Production from './Production'
import StockBriques from './StockBriques'
import Ventes from './Ventes'
import Factures from './Factures'
import Demandes from './Demandes'
import Pilotage from './Pilotage'
import Params from './Params'
import Clients from './Clients'
import Journal from './Journal'
import RecettesDepenses from '../depense/RecettesDepenses'
import Partenaires from '../../shared/partenaires/Partenaires'
import { useBriqueterieStore } from './store/referentielStore'
import { useAuth } from '../../hooks/useAuth'
import { canViewPilotage } from '../../core/roles'

function AccesRefuse() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto mb-3 text-amber-600" size={32} />
      <p className="font-bold text-amber-900">Accès réservé à la hiérarchie</p>
      <p className="mt-1 text-sm text-amber-700">Le pilotage et les analyses ne sont pas accessibles avec votre profil.</p>
    </div>
  )
}

export default function EvenementielModule() {
  const init = useBriqueterieStore((s) => s.init)
  const { role } = useAuth()
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="production" element={<Production />} />
      <Route path="stock" element={<StockBriques />} />
      <Route path="ventes" element={<Ventes />} />
      <Route path="factures" element={<Factures />} />
      <Route path="pilotage" element={canViewPilotage(role) ? <Pilotage /> : <AccesRefuse />} />
      <Route path="finances" element={canViewPilotage(role) ? <RecettesDepenses secteurId="evenementiel" /> : <AccesRefuse />} />
      <Route path="demandes" element={<Demandes />} />
      <Route path="params" element={<Params />} />
      <Route path="clients" element={<Clients />} />
      <Route path="partenaires" element={<Partenaires module="evenementiel" />} />
      <Route path="journal" element={<Journal />} />
    </Routes>
  )
}

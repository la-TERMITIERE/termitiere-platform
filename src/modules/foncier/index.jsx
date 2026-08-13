// Module Foncier — routes internes.
import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Lock } from 'lucide-react'
import Dashboard from './Dashboard'
import Dossiers from './Dossiers'
import SectorBesoins from '../../shared/besoins/SectorBesoins'
import Journal from './Journal'
import Params from './Params'
import Partenaires from '../../shared/partenaires/Partenaires'
import { useFoncierStore } from './store/referentielStore'
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole } from '../../core/roles'

function AccesRefuseAdmin() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto mb-3 text-amber-600" size={32} />
      <p className="font-bold text-amber-900">Accès réservé à l'administration</p>
      <p className="mt-1 text-sm text-amber-700">Ce volet n'est accessible qu'aux membres de l'administration.</p>
    </div>
  )
}

export default function FoncierModule() {
  const init = useFoncierStore((s) => s.init)
  const { role } = useAuth()
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="dossiers" element={<Dossiers />} />
      <Route path="besoins" element={<SectorBesoins secteurId="foncier" />} />
      <Route path="partenaires" element={<Partenaires module="foncier" />} />
      <Route path="journal" element={isFullAccessRole(role) ? <Journal /> : <AccesRefuseAdmin />} />
      <Route path="params" element={isFullAccessRole(role) ? <Params /> : <AccesRefuseAdmin />} />
    </Routes>
  )
}

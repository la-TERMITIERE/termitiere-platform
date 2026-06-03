// Module MAXI-AGRO — routes internes (module natif intégré au portail).
// S'affiche dans le shell du portail (sidebar + topbar + retour à l'accueil),
// sans second écran de connexion : l'authentification est celle du portail.
import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Saisie from './Saisie'
import Factures from './Factures'
import Analyses from './Analyses'
import Sante from './Sante'
import Demandes from './Demandes'
import Journal from './Journal'
import Params from './Params'
import { useAgroStore } from './store/agroStore'

export default function AgroModule() {
  // Démarre la synchronisation temps réel du référentiel (espèces / aliments).
  const init = useAgroStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="saisie" element={<Saisie />} />
      <Route path="factures" element={<Factures />} />
      <Route path="analyses" element={<Analyses />} />
      <Route path="sante" element={<Sante />} />
      <Route path="demandes" element={<Demandes />} />
      <Route path="journal" element={<Journal />} />
      <Route path="params" element={<Params />} />
    </Routes>
  )
}

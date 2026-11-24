// Module E-TACHES : routes internes. Chaque vue d'analyse se garde elle-même selon le rôle (cf. data.js).
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Taches from './Taches'
import Routine from './Routine'
import Annuaire from './Annuaire'
import Pilotage from './Pilotage'
import ParEmploye from './ParEmploye'
import ParDirecteur from './ParDirecteur'
import ParNiveau from './ParNiveau'
import Objectifs from './Objectifs'
import Rapports from './Rapports'
import Innovation from './Innovation'
import Archives from './Archives'

export default function TachesModule() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="taches" element={<Taches />} />
      <Route path="routine" element={<Routine />} />
      <Route path="annuaire" element={<Annuaire />} />
      <Route path="pilotage" element={<Pilotage />} />
      <Route path="par-employe" element={<ParEmploye />} />
      <Route path="par-directeur" element={<ParDirecteur />} />
      <Route path="par-niveau" element={<ParNiveau />} />
      <Route path="objectifs" element={<Objectifs />} />
      <Route path="rapports" element={<Rapports />} />
      <Route path="innovation" element={<Innovation />} />
      <Route path="archives" element={<Archives />} />
    </Routes>
  )
}

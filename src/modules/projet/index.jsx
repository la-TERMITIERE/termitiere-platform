import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import Projets from './Projets'
import Taches from './Taches'
import Planning from './Planning'
import Documents from './Documents'
import Galerie from './Galerie'
import Rapports from './Rapports'
import Commentaires from './Commentaires'
import Depenses from './Depenses'
import Checklists from './Checklists'
import Pilotage from './Pilotage'
import Alertes from './Alertes'
import RapportPDF from './RapportPDF'
import Journal from './Journal'
import Params from './Params'
import { useProjetStore } from './store/projetStore'

export default function ProjetModule() {
  const init = useProjetStore((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="projets" element={<Projets />} />
      <Route path="taches" element={<Taches />} />
      <Route path="planning"   element={<Planning />} />
      <Route path="documents"  element={<Documents />} />
      <Route path="galerie"    element={<Galerie />} />
      <Route path="rapports"     element={<Rapports />} />
      <Route path="commentaires" element={<Commentaires />} />
      <Route path="depenses"     element={<Depenses />} />
      <Route path="checklists"   element={<Checklists />} />
      <Route path="pilotage"     element={<Pilotage />} />
      <Route path="alertes"      element={<Alertes />} />
      <Route path="rapport-pdf"  element={<RapportPDF />} />
      <Route path="journal" element={<Journal />} />
      <Route path="params" element={<Params />} />
    </Routes>
  )
}

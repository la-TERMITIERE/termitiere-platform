// Layout principal après connexion : sidebar + topbar + contenu (Outlet).
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileBottomNav from './MobileBottomNav'
import BarreDefilementFixe from './BarreDefilementFixe'
import OfflineBanner from './OfflineBanner'
import AlertesHeadsUp from './AlertesHeadsUp'
import ActiverAlertes from './ActiverAlertes'
import AutoApproveDemandes from '../AutoApproveDemandes'
import AutoApproveSortiesFacture from '../AutoApproveSortiesFacture'
import AutoApproveWorkflow from '../AutoApproveWorkflow'
import RelanceFacturesBrouillon from '../../modules/logistique/RelanceFacturesBrouillon'
import RelancePrestationsBrouillon from '../../modules/logistique/RelancePrestationsBrouillon'
import RelanceRetoursEnRetard from '../../modules/logistique/RelanceRetoursEnRetard'
import RelanceVentesAFacturer from '../../modules/evenementiel/RelanceVentes'
import RelanceVentesBrouillon from '../../modules/evenementiel/RelanceVentesBrouillon'
import SurveillanceFinSejour from '../../modules/garderie/SurveillanceFinSejour'
import ProjetAlerteWatcher from '../ProjetAlerteWatcher'
import ProjetPurgeWatcher from '../ProjetPurgeWatcher'
import DepensePurgeWatcher from '../DepensePurgeWatcher'
import ProjetAutoDemarrage from '../ProjetAutoDemarrage'
import { useAuth } from '../../hooks/useAuth'
import { COULEUR_MODULE } from '../../utils/color'
import MotifSuppressionHost from '../MotifSuppressionHost'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, hasModule, role } = useAuth()
  // Couleur du module courant : teinte des tableaux, en-têtes et survols en verre (cf. index.css).
  const accent = COULEUR_MODULE[useLocation().pathname.split('/')[1]] || '#BC3C31'
  // Rôle posé sur la page : sert à masquer les corbeilles des tableaux pour les agents (index.css).
  useEffect(() => { document.documentElement.dataset.role = role || ''; return () => { delete document.documentElement.dataset.role } }, [role])

  return (
    <div className="flex h-dvh overflow-hidden bg-[#faf6f5] dark:bg-[#15191c]">
      {/* Alertes façon WhatsApp (bandeau + son) et demande d'autorisation système */}
      <AlertesHeadsUp />
      <ActiverAlertes />
      {hasModule('agro') && <AutoApproveDemandes />}
      {hasModule('agro') && <AutoApproveSortiesFacture />}
      {hasModule('logistique') && <AutoApproveWorkflow collection="logistique_demandes" module="logistique" />}
      {hasModule('logistique') && <RelanceFacturesBrouillon />}
      {hasModule('logistique') && <RelancePrestationsBrouillon />}
      {hasModule('logistique') && role === 'agent' && <RelanceRetoursEnRetard />}
      {hasModule('evenementiel') && role === 'agent' && <RelanceVentesAFacturer />}
      {hasModule('evenementiel') && <RelanceVentesBrouillon />}
      {hasModule('garderie') && <SurveillanceFinSejour />}
      {hasModule('evenementiel') && <AutoApproveWorkflow collection="evenementiel_demandes" module="evenementiel" />}
      {hasModule('projet') && <ProjetAlerteWatcher />}
      {hasModule('projet') && <ProjetPurgeWatcher />}
      {hasModule('projet') && <ProjetAutoDemarrage />}
      {hasModule('depense') && <DepensePurgeWatcher />}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar user={user} onMenuToggle={() => setSidebarOpen((o) => !o)} />
        <OfflineBanner />
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:px-6 md:pt-6 lg:pb-6" style={{ '--tv-accent': accent }}>
          <div className="relative -mt-2 md:-mt-3">
            <Outlet />
          </div>
        </main>
      </div>
      <BarreDefilementFixe />
      <MobileBottomNav onOpenMenu={() => setSidebarOpen(true)} />
      {/* Motif obligatoire de toute suppression (cf. core/db.js) */}
      <MotifSuppressionHost />
    </div>
  )
}

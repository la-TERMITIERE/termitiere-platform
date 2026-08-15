// Layout principal après connexion : sidebar + topbar + contenu (Outlet).
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileBottomNav from './MobileBottomNav'
import OfflineBanner from './OfflineBanner'
import AlertesHeadsUp from './AlertesHeadsUp'
import ActiverAlertes from './ActiverAlertes'
import AutoApproveDemandes from '../AutoApproveDemandes'
import AutoApproveSortiesFacture from '../AutoApproveSortiesFacture'
import AutoApproveWorkflow from '../AutoApproveWorkflow'
import ProjetAlerteWatcher from '../ProjetAlerteWatcher'
import ProjetPurgeWatcher from '../ProjetPurgeWatcher'
import DepensePurgeWatcher from '../DepensePurgeWatcher'
import ProjetAutoDemarrage from '../ProjetAutoDemarrage'
import { useAuth } from '../../hooks/useAuth'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, hasModule } = useAuth()

  return (
    <div className="flex h-dvh overflow-hidden bg-[#faf6f5] dark:bg-[#15191c]">
      {/* Alertes façon WhatsApp (bandeau + son) et demande d'autorisation système */}
      <AlertesHeadsUp />
      <ActiverAlertes />
      {hasModule('agro') && <AutoApproveDemandes />}
      {hasModule('agro') && <AutoApproveSortiesFacture />}
      {hasModule('logistique') && <AutoApproveWorkflow collection="logistique_demandes" module="logistique" />}
      {hasModule('evenementiel') && <AutoApproveWorkflow collection="evenementiel_demandes" module="evenementiel" />}
      {hasModule('projet') && <ProjetAlerteWatcher />}
      {hasModule('projet') && <ProjetPurgeWatcher />}
      {hasModule('projet') && <ProjetAutoDemarrage />}
      {hasModule('depense') && <DepensePurgeWatcher />}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar user={user} onMenuToggle={() => setSidebarOpen((o) => !o)} />
        <OfflineBanner />
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6">
          <div className="relative -mt-2 md:-mt-3">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileBottomNav onOpenMenu={() => setSidebarOpen(true)} />
    </div>
  )
}

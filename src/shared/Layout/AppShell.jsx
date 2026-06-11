// Layout principal après connexion : sidebar + topbar + contenu (Outlet).
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import OfflineBanner from './OfflineBanner'
import AutoApproveDemandes from '../AutoApproveDemandes'
import { useAuth } from '../../hooks/useAuth'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, hasModule } = useAuth()

  return (
    <div className="flex h-screen overflow-hidden bg-[#faf6f5]">
      {hasModule('agro') && <AutoApproveDemandes />}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar user={user} onMenuToggle={() => setSidebarOpen((o) => !o)} />
        <OfflineBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

// Layout principal après connexion : sidebar + topbar + contenu (Outlet).
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
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
import { MODULES, MODULE_NAV } from '../modules'
import { moduleEnLecture } from '../../core/roles'
import { Eye } from 'lucide-react'
import MotifSuppressionHost from '../MotifSuppressionHost'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, hasModule, role } = useAuth()
  // Couleur du module courant : teinte des tableaux, en-têtes et survols en verre (cf. index.css).
  const segment = useLocation().pathname.split('/')[1]
  const accent = COULEUR_MODULE[segment] || '#BC3C31'
  // Compte limité à la lecture sur ce module (Paramètres, Utilisateurs) : bandeau d'information, les écritures sont refusées par db.js.
  const moduleCourant = MODULES.find((m) => m.path === `/${segment}`)
  // Volet retiré à ce compte par Info : même en tapant l'adresse à la main, on revient à l'accueil du module.
  const pathname = useLocation().pathname
  const voletInterdit = (() => {
    const retires = moduleCourant ? user?.voletsRetires?.[moduleCourant.id] : null
    if (!retires?.length) return false
    const morceaux = pathname.split('/').filter(Boolean).slice(1, 3) // après le module : [site?, volet]
    return (MODULE_NAV[moduleCourant.id] || []).some((v) => {
      if (!v.to || v.to === moduleCourant.path || !retires.includes(v.to)) return false
      const volet = v.to.split('/').filter(Boolean)[1]
      return !!volet && morceaux.includes(volet)
    })
  })()
  const enLecture = moduleCourant && moduleEnLecture(user?.droitsModules, moduleCourant.id)
  // Rôle posé sur la page : sert à masquer les corbeilles des tableaux pour les agents (index.css).
  useEffect(() => { document.documentElement.dataset.role = role || ''; return () => { delete document.documentElement.dataset.role } }, [role])

  if (voletInterdit) return <Navigate to={moduleCourant.path} replace />

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
            {enLecture && (
              <div className="mb-3 flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-2.5 text-sm font-semibold text-sky-800 backdrop-blur-md">
                <Eye size={16} className="shrink-0" /> Lecture seule sur {moduleCourant.nom} : vous pouvez tout consulter, mais rien modifier.
              </div>
            )}
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

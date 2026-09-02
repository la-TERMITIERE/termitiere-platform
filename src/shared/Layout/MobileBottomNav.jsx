// Barre de navigation flottante (mobile uniquement — le sidebar redevient fixe
// dès la largeur tablette, cf. AppShell/Sidebar) façon "verre liquide" iOS : le
// fond est un verre dépoli très translucide, et un second verre (la pastille
// active) glisse en douceur derrière l'onglet sélectionné au lieu de sauter
// d'un état à l'autre. Son contenu s'adapte au contexte : hors module →
// raccourcis du portail ; dans un module → ses volets jugés essentiels au
// suivi/gestion quotidien (Dashboard + 2 volets clés), plus un accès "Plus" qui
// ouvre le menu complet pour tout le reste.
import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Home, LayoutDashboard, UserCircle, Settings, Grid2x2 } from 'lucide-react'
import { getModule, MODULE_NAV } from '../modules'
import { useAuth } from '../../hooks/useAuth'
import { canManagePartenaires, depenseRoleEffectif } from '../../core/roles'
import { teinterHex } from '../../utils/color'

const LOG_SITES = { lome: 'Lomé', kara: 'Kara' }
// Modules multi-sites (Maxi Logistique, MAXI-GYM) : sous-application (site)
// déduite du 2e segment de l'URL.
const MULTISITE_MODULES = { logistique: LOG_SITES, gym: LOG_SITES }

// Volet jugé le plus essentiel au suivi/gestion quotidien de chaque module — en
// plus du Dashboard (toujours inclus). LIMITÉ À 1 PAR MODULE (5 onglets max avec
// Accueil/Dashboard/Plus) : au-delà, la barre déborde et se coupe sur les écrans
// étroits sans que le défilement horizontal soit visible/évident pour l'usager
// (constaté avec 2 essentiels sur E-VOYAGE, puis avec 3 sur MAXI-GYM — Dashboard
// et/ou Plus disparaissaient purement et simplement de l'écran). Les volets non
// listés ici restent bien sûr accessibles via « Plus ».
const ESSENTIELS = {
  agro: ['/agro/saisie'],
  logistique: ['/logistique/saisie'],
  evenementiel: ['/evenementiel/production'],
  foncier: ['/foncier/dossiers'],
  rh: [],
  projet: ['/projet/projets'],
  garderie: ['/garderie/presences'],
  depense: ['/depense/liste'],
  // Le check-in des séances est l'action la plus répétée dans une journée de
  // salle — abonnements et facturation restent accessibles via Plus.
  gym: ['/gym/seances'],
  voyage: ['/voyage/voyages']
}

export default function MobileBottomNav({ onOpenMenu }) {
  const location = useLocation()
  const { user, role } = useAuth()
  const itemRefs = useRef(new Map())
  const [pill, setPill] = useState({ left: 0, width: 0, visible: false })

  const parts = location.pathname.split('/')
  const seg = parts[1]
  const activeModule = getModule(seg)
  const siteNames = MULTISITE_MODULES[activeModule?.id]
  const logSite = siteNames && siteNames[parts[2]] ? parts[2] : null

  const navRole = activeModule?.id === 'depense' ? depenseRoleEffectif(role) : role
  const canSee = (item) => {
    if (item.roles && item.roles.includes(navRole)) return true
    if (item.perm === 'partenaires' && canManagePartenaires(navRole, user)) return true
    return !item.roles && !item.perm
  }

  let items
  let showMenuButton = false

  if (!activeModule) {
    items = [
      { label: 'Accueil', to: '/', icon: Home, end: true },
      { label: 'Bilan global', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Mon compte', to: '/mon-compte', icon: UserCircle },
      { label: 'Paramètres', to: '/parametres', icon: Settings }
    ]
  } else {
    let nav = (MODULE_NAV[activeModule.id] || []).filter((it) => it.to).filter(canSee)
    if (siteNames) {
      const base = `/${activeModule.id}`
      nav = logSite
        ? nav.map((it) => ({ ...it, to: it.to === base ? `${base}/${logSite}` : it.to.replace(`${base}/`, `${base}/${logSite}/`) }))
        : []
    }
    const dashboard = nav.find((it) => it.end) || nav[0]
    const essentielsPaths = ESSENTIELS[activeModule.id] || []
    // Comparaison sur le DERNIER segment du chemin (ex. "seances"), pas le chemin
    // complet : pour un module multi-site (gym, logistique), `nav` est déjà remappé
    // avec le site inséré (`/gym/lome/seances`), qui ne se termine plus par le chemin
    // configuré ici (`/gym/seances`) — un simple `endsWith` sur le chemin complet ne
    // matchait donc plus jamais rien une fois un site choisi (barre réduite à Accueil/
    // Dashboard/Plus, sans aucun essentiel).
    const essentiels = essentielsPaths
      .map((p) => nav.find((it) => it.to.endsWith(`/${p.split('/').pop()}`)))
      .filter(Boolean)
      .slice(0, 1)
    const accueil = { label: 'Accueil', to: '/', icon: Home, end: true }
    items = [accueil, dashboard, ...essentiels].filter(Boolean)
    items = items.filter((it, i) => items.findIndex((x) => x.to === it.to) === i)
    showMenuButton = true
  }

  const activeTo = (items.find((it) => (it.end ? location.pathname === it.to : location.pathname.startsWith(it.to))) || {}).to
  // Le verre de la pastille active se teinte légèrement de la couleur du module en
  // cours — un reflet coloré, comme un vrai verre qui capte l'ambiance autour de lui.
  const accentColor = activeModule?.color || '#BC3C31'

  // Fait glisser la pastille de verre jusqu'à l'onglet actif — mesurée après
  // chaque changement de page (et au redimensionnement, ex. rotation d'écran).
  useEffect(() => {
    const mesurer = () => {
      const el = activeTo && itemRefs.current.get(activeTo)
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth, visible: true })
      else setPill((p) => ({ ...p, visible: false }))
    }
    mesurer()
    window.addEventListener('resize', mesurer)
    return () => window.removeEventListener('resize', mesurer)
  }, [activeTo, items.length])

  return (
    <nav
      className="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="relative flex max-w-full items-center gap-0.5 overflow-hidden overflow-x-auto rounded-full border border-white/15 bg-neutral-900/30 px-2 py-2 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.3),inset_0_-10px_16px_-12px_rgba(0,0,0,0.5),0_20px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-[32px] backdrop-saturate-[2.2]">
        {/* Reflet diagonal — lumière qui balaie la vitre, comme un vrai verre incliné */}
        <span aria-hidden="true" className="pointer-events-none absolute -inset-x-4 -top-6 h-14 rotate-[-6deg] bg-gradient-to-b from-white/25 via-white/5 to-transparent" />
        {/* Reflet — fine lueur en haut */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/10 to-transparent" />
        {/* Pastille de verre — glisse derrière l'onglet actif, teintée de la couleur du module */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),inset_0_-6px_10px_-6px_rgba(255,255,255,0.2),0_2px_10px_rgba(0,0,0,0.25)] backdrop-blur-lg transition-all duration-300 ease-out"
          style={{
            left: pill.left, width: pill.width, opacity: pill.visible ? 1 : 0,
            background: `linear-gradient(160deg, ${teinterHex('#ffffff', 0.3)}, ${teinterHex(accentColor, 0.35)})`,
            border: `1px solid ${teinterHex('#ffffff', 0.4)}`
          }}
        />
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            ref={(el) => { if (el) itemRefs.current.set(item.to, el); else itemRefs.current.delete(item.to) }}
            className={({ isActive }) =>
              `relative z-10 flex shrink-0 flex-col items-center gap-0.5 rounded-full px-3.5 py-1.5 text-[10px] font-semibold transition-all active:scale-90 ${
                isActive ? 'text-white' : 'text-white/55 hover:text-white/85'
              }`
            }
          >
            <span className="flex h-8 w-8 items-center justify-center">
              <item.icon size={19} />
            </span>
            <span className="max-w-[64px] truncate">{item.label}</span>
          </NavLink>
        ))}
        {showMenuButton && (
          <button
            onClick={onOpenMenu}
            className="relative z-10 flex shrink-0 flex-col items-center gap-0.5 rounded-full px-3.5 py-1.5 text-[10px] font-semibold text-white/55 transition-all active:scale-90 hover:text-white/85"
          >
            <span className="flex h-8 w-8 items-center justify-center">
              <Grid2x2 size={19} />
            </span>
            Plus
          </button>
        )}
      </div>
    </nav>
  )
}

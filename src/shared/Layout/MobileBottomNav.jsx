// Barre de navigation mobile uniquement — le sidebar redevient fixe dès la
// largeur tablette, cf. AppShell/Sidebar. Design PLAT, ancré au bord bas de
// l'écran (pas de pilule flottante ni d'effet verre épais) : fond clair quasi
// opaque, léger liseré en haut, pastille active pleine (sans flou) qui glisse
// derrière l'onglet sélectionné. Son contenu s'adapte au contexte : hors
// module → raccourcis du portail ; dans un module → ses volets jugés
// essentiels au suivi/gestion quotidien (Dashboard + volets clés), plus un
// accès "Plus" qui ouvre le menu complet pour tout le reste. Si le nombre
// d'onglets dépasse la largeur de l'écran, la barre défile horizontalement —
// un dégradé de fondu sur le bord droit signale qu'il y a plus à voir (cf.
// `debordement` plus bas), pour ne plus jamais couper un onglet en silence.
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

// Volets jugés essentiels au suivi/gestion quotidien de chaque module — en plus
// du Dashboard (toujours inclus). La plupart des modules restent à 1 seul (le
// geste le plus répété au quotidien) pour ne pas surcharger un petit écran ;
// E-DÉPENSES en a explicitement 3 (Dépenses, Budget, Autorisations — décision
// du 21/09/2026, à la demande de l'administration). Le défilement horizontal
// (cf. `debordement`) et son dégradé de fondu absorbent le surplus sur les
// téléphones étroits, plutôt que de couper silencieusement un onglet.
const ESSENTIELS = {
  agro: ['/agro/saisie'],
  logistique: ['/logistique/saisie'],
  evenementiel: ['/evenementiel/production'],
  foncier: ['/foncier/dossiers'],
  rh: [],
  projet: ['/projet/projets'],
  garderie: ['/garderie/presences'],
  depense: ['/depense/liste', '/depense/recettes-depenses', '/depense/autorisations'],
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
  const scrollRef = useRef(null)
  // Barre plus large que l'écran (beaucoup d'onglets, ex. E-DÉPENSES) → défilement
  // horizontal + dégradé de fondu sur le bord droit pour SIGNALER qu'il y a plus à
  // voir, plutôt que de couper un onglet en silence (cf. commentaire ESSENTIELS).
  const [debordement, setDebordement] = useState(false)

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
      .slice(0, 3)
    const accueil = { label: 'Accueil', to: '/', icon: Home, end: true }
    items = [accueil, dashboard, ...essentiels].filter(Boolean)
    items = items.filter((it, i) => items.findIndex((x) => x.to === it.to) === i)
    showMenuButton = true
  }

  const activeTo = (items.find((it) => (it.end ? location.pathname === it.to : location.pathname.startsWith(it.to))) || {}).to
  // La pastille active se teinte légèrement de la couleur du module en cours.
  const accentColor = activeModule?.color || '#BC3C31'

  // Fait glisser la pastille jusqu'à l'onglet actif — mesurée après chaque
  // changement de page (et au redimensionnement, ex. rotation d'écran).
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

  // Détecte si la barre déborde (plus d'onglets que de place) pour afficher le
  // dégradé de fondu — revérifié aux mêmes moments que la pastille ci-dessus.
  useEffect(() => {
    const verifier = () => {
      const el = scrollRef.current
      if (el) setDebordement(el.scrollWidth > el.clientWidth + 1)
    }
    verifier()
    window.addEventListener('resize', verifier)
    return () => window.removeEventListener('resize', verifier)
  }, [items.length, showMenuButton])

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/98 shadow-[0_-6px_18px_-12px_rgba(26,26,26,0.18)] md:hidden dark:border-white/10 dark:bg-neutral-900/98"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="relative">
        <div ref={scrollRef} className="relative flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {/* Pastille active — plate, sans flou ni bordure lumineuse, teintée de la
              couleur du module en cours, glisse derrière l'onglet sélectionné. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1.5 rounded-xl transition-all duration-300 ease-out"
            style={{ left: pill.left, width: pill.width, opacity: pill.visible ? 1 : 0, background: teinterHex(accentColor, 0.12) }}
          />
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              ref={(el) => { if (el) itemRefs.current.set(item.to, el); else itemRefs.current.delete(item.to) }}
              className={({ isActive }) =>
                `relative z-10 flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-semibold transition-all active:scale-90 ${
                  isActive ? '' : 'text-gray-400 hover:text-gray-600 dark:text-white/45 dark:hover:text-white/75'
                }`
              }
              style={({ isActive }) => (isActive ? { color: accentColor } : undefined)}
            >
              <span className="flex h-7 w-7 items-center justify-center">
                <item.icon size={18} />
              </span>
              <span className="max-w-[62px] truncate">{item.label}</span>
            </NavLink>
          ))}
          {showMenuButton && (
            <button
              onClick={onOpenMenu}
              className="relative z-10 flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-semibold text-gray-400 transition-all active:scale-90 hover:text-gray-600 dark:text-white/45 dark:hover:text-white/75"
            >
              <span className="flex h-7 w-7 items-center justify-center">
                <Grid2x2 size={18} />
              </span>
              Plus
            </button>
          )}
        </div>
        {/* Dégradé de fondu — signale qu'il reste des onglets hors champ à droite
            (cf. commentaire ESSENTIELS) au lieu de les couper en silence. */}
        {debordement && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent dark:from-neutral-900" />
        )}
      </div>
    </nav>
  )
}

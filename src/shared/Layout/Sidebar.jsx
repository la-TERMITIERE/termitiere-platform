// Navigation latérale : en-tête marque + nav portail + nav intra-module + footer utilisateur.
// Mobile : panneau coulissant avec overlay. Desktop : fixe 260px.
import { useMemo, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { Home, LayoutDashboard, LogOut, Users, UserCircle, Settings, X, ChevronRight, ChevronDown, ArrowLeft } from 'lucide-react'
import { MODULES, MODULE_NAV, getModule } from '../modules'
import { useAuth } from '../../hooks/useAuth'
import { useCollection } from '../../hooks/useFirestore'
import { roleLabel, canManagePartenaires, depenseRoleEffectif, PROJET_ROLES_CLOISONNES } from '../../core/roles'
import { estActif } from '../workflow'
import { calculerBadges } from '../nouveautes'
import { projetsVisibles, scopeParProjets, secteurEffectif } from '../../modules/projet/logic'
import { SECTEURS as SECTEURS_PROJET } from '../../modules/depense/data'

// Secteur unique auquel un rôle cloisonné (chef de projet) travaille — mêmes chantiers
// que le volet BTP réservé à l'administration. Le menu latéral ne doit lui proposer que
// celui-ci, pas les 6 secteurs (les autres seraient de toute façon vides pour lui).
const SECTEUR_CLOISONNE = 'bat'

// Menu « Projets » imbriqué — un seul niveau dans la barre latérale (secteurs,
// texte lisible) : cliquer sur un secteur NAVIGUE vers le grand écran, qui affiche
// ses projets, catégories et tâches (bien plus de place que la barre latérale).
function ProjetsNavMenu({ item, secteursMenu, badgeCount, isActive, onNavigate }) {
  const [ouvert, setOuvert] = useState(isActive)

  const itemClass = `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
    isActive ? 'bg-white/20 text-white shadow-[0_16px_32px_-12px_rgba(0,0,0,0.45),0_4px_10px_-4px_rgba(0,0,0,0.3)]'
      : 'text-white/80 hover:bg-white/10 hover:text-white'
  }`

  return (
    <div>
      <button type="button" onClick={() => setOuvert((o) => !o)} className={itemClass}>
        <item.icon size={18} /> {item.label}
        {badgeCount > 0 && (
          <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold">{badgeCount}</span>
        )}
        {ouvert ? <ChevronDown size={15} className={badgeCount > 0 ? '' : 'ml-auto'} /> : <ChevronRight size={15} className={badgeCount > 0 ? '' : 'ml-auto'} />}
      </button>

      {ouvert && (
        <div className="ml-3 mt-1 space-y-0.5 border-l border-white/15 pl-2">
          {secteursMenu.map((s) => (
            <Link key={s.id} to={`/projet/projets/${s.id}`} onClick={onNavigate}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-white/75 transition-all hover:bg-white/10 hover:text-white">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 truncate">{s.label}</span>
              <span className="text-xs font-normal text-white/40">{s.nbProjets}</span>
              <ChevronRight size={13} className="text-white/40" />
            </Link>
          ))}
          <Link to="/projet/projets/liste" onClick={onNavigate}
            className="mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white/60 transition-all hover:bg-white/10 hover:text-white">
            📁 Liste complète des projets
          </Link>
        </div>
      )}
    </div>
  )
}

// Menu « Enfants inscrits » imbriqué — regroupe garderie, maternelle et
// journaliers dans un seul menu déroulant plutôt que 3 liens séparés. Chaque
// entrée navigue vers /garderie/enfants avec un paramètre d'URL que
// Enfants.jsx lit pour préfiltrer sa liste.
const ENFANTS_CATEGORIES = [
  { key: 'tous',        label: 'Tous les enfants inscrits', emoji: '👶', query: '' },
  { key: 'garderie',    label: 'Garderie',                  emoji: '🍼', query: '?programme=garderie' },
  { key: 'maternelle',  label: 'Maternelle',                emoji: '🎓', query: '?programme=maternelle' },
  { key: 'journaliers', label: 'Enfants journaliers',       emoji: '🚪', query: '?vue=journaliers' }
]

function EnfantsNavMenu({ item, isActive, currentSearch, onNavigate }) {
  const [ouvert, setOuvert] = useState(isActive)

  const itemClass = `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
    isActive ? 'bg-white/20 text-white shadow-[0_16px_32px_-12px_rgba(0,0,0,0.45),0_4px_10px_-4px_rgba(0,0,0,0.3)]'
      : 'text-white/80 hover:bg-white/10 hover:text-white'
  }`

  const activeKey = (() => {
    const p = new URLSearchParams(currentSearch)
    if (p.get('vue') === 'journaliers') return 'journaliers'
    if (p.get('programme') === 'garderie') return 'garderie'
    if (p.get('programme') === 'maternelle') return 'maternelle'
    return 'tous'
  })()

  return (
    <div>
      <button type="button" onClick={() => setOuvert((o) => !o)} className={itemClass}>
        <item.icon size={18} /> {item.label}
        <span className="ml-auto">{ouvert ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
      </button>

      {ouvert && (
        <div className="ml-3 mt-1 space-y-0.5 border-l border-white/15 pl-2">
          {ENFANTS_CATEGORIES.map((c) => (
            <Link key={c.key} to={`/garderie/enfants${c.query}`} onClick={onNavigate}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold transition-all ${
                isActive && activeKey === c.key ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}>
              <span>{c.emoji}</span>
              <span className="flex-1 truncate">{c.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ open, onClose }) {
  const location = useLocation()
  const { user, role, hasModule, isAdmin, logout } = useAuth()

  // Module actif déduit du premier segment de l'URL
  const parts = location.pathname.split('/')
  const seg = parts[1]
  const activeModule = getModule(seg)
  // Modules multi-sites (Maxi Logistique, MAXI-GYM) : sous-application (site)
  // déduite du 2e segment de l'URL.
  const LOG_SITES = { lome: 'Lomé', kara: 'Kara' }
  const MULTISITE_MODULES = { logistique: LOG_SITES, gym: LOG_SITES }
  const siteNames = MULTISITE_MODULES[activeModule?.id]
  const logSite = siteNames && siteNames[parts[2]] ? parts[2] : null

  // Badge demandes AGRO : factures en attente d'approbation ou d'ajustement d'écart.
  const { data: facturesAgro } = useCollection('agro_factures')
  const { data: demandesLog } = useCollection('logistique_demandes')
  const { data: demandesBriq } = useCollection('evenementiel_demandes')

  // Badges "nouveauté" (E-G.Pro + E-DÉPENSES) : ce que d'autres ont ajouté depuis ma
  // dernière visite de chaque volet — basé sur l'état réel des collections, donc un
  // badge disparaît automatiquement dès que l'élément correspondant est supprimé.
  const { data: derniereVues }   = useCollection('vues_volets')
  const { data: projetsDoc }     = useCollection('projets')
  const { data: tachesDoc }      = useCollection('projet_taches')
  const { data: projetDepenses } = useCollection('projet_depenses')
  const { data: projetBesoins }  = useCollection('projet_besoins')
  const { data: projetMateriel } = useCollection('projet_materiels')
  const { data: depenseDepenses }= useCollection('depense_depenses')
  const { data: projetPropositions } = useCollection('projet_propositions')
  const { data: sectorBesoins }  = useCollection('sector_besoins')
  const { data: evenementielMateriels } = useCollection('evenementiel_materiels')
  const nouveautesBadges = useMemo(() => calculerBadges({
    projets: projetsDoc, projet_taches: tachesDoc, projet_depenses: projetDepenses,
    projet_besoins: projetBesoins, projet_materiels: projetMateriel, depense_depenses: depenseDepenses,
    projet_propositions: projetPropositions, sector_besoins: sectorBesoins, evenementiel_materiels: evenementielMateriels
  }, derniereVues, user?.uid), [projetsDoc, tachesDoc, projetDepenses, projetBesoins, projetMateriel, depenseDepenses, projetPropositions, sectorBesoins, evenementielMateriels, derniereVues, user?.uid])

  const badges = {
    agroDemandes: facturesAgro.filter((f) => f.statut === 'sortie_demandee' || f.statut === 'modif_demandee').length,
    logistiqueDemandes: demandesLog.filter((d) => estActif(d.statut) && (!logSite || (d.site || 'lome') === logSite)).length,
    briqueterieDemandes: demandesBriq.filter((d) => estActif(d.statut)).length,
    ...nouveautesBadges
  }

  // Menu imbriqué « Projets » — un seul niveau (secteurs) dans la barre latérale ;
  // projets/catégories/tâches s'affichent sur le grand écran (cf. ProjetsExplorer.jsx).
  const secteursMenu = useMemo(() => {
    const projetsVisiblesList = projetsVisibles(projetsDoc, user, role)
    const secteurs = PROJET_ROLES_CLOISONNES.includes(role)
      ? SECTEURS_PROJET.filter((s) => s.id === SECTEUR_CLOISONNE)
      : SECTEURS_PROJET
    return secteurs.map((s) => {
      const projetsSecteur = projetsVisiblesList.filter((p) => secteurEffectif(p)?.id === s.id)
      const tachesSecteur = scopeParProjets(tachesDoc, projetsSecteur)
      return { ...s, nbProjets: projetsSecteur.length, nbTaches: tachesSecteur.length }
    })
  }, [projetsDoc, tachesDoc, user, role])

  const accentColor = activeModule?.color || '#BC3C31'

  const linkBase =
    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all'
  const navClass = ({ isActive }) =>
    `${linkBase} ${isActive
      ? 'bg-white/20 text-white shadow-[0_16px_32px_-12px_rgba(0,0,0,0.45),0_4px_10px_-4px_rgba(0,0,0,0.3)]'
      : 'text-white/80 hover:bg-white/10 hover:text-white hover:shadow-[0_12px_24px_-12px_rgba(0,0,0,0.35)]'
    }`

  // Filtre les liens de navigation selon le rôle (`roles`) et les permissions
  // par utilisateur (`perm`, ex. « partenaires » = accès donné par la direction).
  // Quand un item porte À LA FOIS `roles` ET `perm`, c'est une alternative (OU) : le
  // rôle explicite donne accès même sans la permission individuelle — sert par exemple
  // à donner l'onglet Partenaires (lecture seule) à un rôle précis dans un seul module,
  // sans changer son accès dans les autres modules ni toucher au reste des permissions.
  // E-DÉPENSES : super_admin/admin/directeur y sont traités comme un agent (décision
  // explicite, cf. depenseRoleEffectif) — seuls pau, ge et info gardent l'accès
  // complet à ce module. N'affecte que la nav de CE module, pas les autres.
  const navRole = activeModule?.id === 'depense' ? depenseRoleEffectif(role) : role
  const canSeeNav = (item) => {
    if (item.roles && item.roles.includes(navRole)) return true
    if (item.perm === 'partenaires' && canManagePartenaires(navRole, user)) return true
    return !item.roles && !item.perm
  }
  let moduleNav = (activeModule ? MODULE_NAV[activeModule.id] || [] : []).filter(canSeeNav)

  // Modules multi-sites : la nav intra-module n'a de sens qu'à l'intérieur d'un site.
  // On préfixe alors chaque destination par /<module>/<site>/…
  if (siteNames) {
    const base = `/${activeModule.id}`
    moduleNav = logSite
      ? moduleNav.map((item) => ({
          ...item,
          to: item.to === base ? `${base}/${logSite}` : item.to.replace(`${base}/`, `${base}/${logSite}/`)
        }))
      : []
  }

  const moduleTitle = activeModule ? (logSite ? `${activeModule.nom} · ${siteNames[logSite]}` : activeModule.nom) : "Toujours dans l'action"

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col text-white transition-transform duration-200
          md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: activeModule?.sidebarGradient || `linear-gradient(180deg, ${shade(accentColor, -18)}, ${accentColor})` }}
      >
        {/* En-tête marque */}
        <div
          className="mx-3 mt-3 rounded-2xl px-4 pt-5 pb-3"
          style={{
            position: 'relative', zIndex: 1,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 14px 24px -12px rgba(0,0,0,0.45)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>

            {/* Logo rond avec bordure qui clignote légèrement */}
            <style>{`
              @keyframes sb-glow {
                0%   { box-shadow: 0 0 0 2px #ffffffaa, 0 0 6px 1px ${accentColor}44; }
                50%  { box-shadow: 0 0 0 3px #ffffff,   0 0 12px 4px ${accentColor}88; }
                100% { box-shadow: 0 0 0 2px #ffffffaa, 0 0 6px 1px ${accentColor}44; }
              }
            `}</style>
            <div style={{ position: 'relative', flexShrink: 0, width: 48, height: 48 }}>
              <span style={{
                position: 'absolute', inset: -4, borderRadius: '50%',
                animation: 'sb-glow 2.5s ease-in-out infinite'
              }} />
              <img src="/termitiere-logo.png" alt="La Termitière"
                onError={(e) => { e.target.src = '/logo-mark.png' }}
                style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', background: 'white', padding: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', display: 'block' }} />
            </div>

            {/* Nom + module — sans truncate ni min-w-0 */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, lineHeight: 1.2, letterSpacing: 0.5, color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                LA TERMITIÈRE
              </p>
              <p style={{ margin: 0, marginTop: 2, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.65)' }}>
                {moduleTitle}
              </p>
            </div>

            <button onClick={onClose} className="md:hidden" aria-label="Fermer" style={{ flexShrink: 0 }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {/* Nav portail */}
          <NavLink to="/" end className={navClass} onClick={onClose}>
            <Home size={18} /> Accueil
          </NavLink>
          <NavLink to="/dashboard" className={navClass} onClick={onClose}>
            <LayoutDashboard size={18} /> Tableau de bord global
          </NavLink>
          {/* Gestion des utilisateurs : portail uniquement, admin seulement */}
          {isAdmin() && !activeModule && (
            <NavLink to="/utilisateurs" className={navClass} onClick={onClose}>
              <Users size={18} /> Utilisateurs
            </NavLink>
          )}
          {!activeModule && (
            <NavLink to="/mon-compte" className={navClass} onClick={onClose}>
              <UserCircle size={18} /> Mon compte
            </NavLink>
          )}
          {!activeModule && (
            <NavLink to="/parametres" className={navClass} onClick={onClose}>
              <Settings size={18} /> Paramètres
            </NavLink>
          )}

          {/* Liste des modules : visible uniquement sur le portail (pas dans une appli) */}
          {!activeModule && (
            <>
              <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-white/50">
                Modules
              </p>
              {MODULES.filter((m) => hasModule(m.id)).map((m) => (
                <NavLink key={m.id} to={m.path} className={navClass} onClick={onClose}>
                  <m.icon size={18} /> {m.nom}
                  {badges.agroDemandes > 0 && m.id === 'agro' && (
                    <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold">
                      {badges.agroDemandes}
                    </span>
                  )}
                </NavLink>
              ))}
            </>
          )}

          {/* Nav intra-module : seuls les onglets de l'appli active */}
          {activeModule && moduleNav.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                {moduleTitle}
              </p>
              {logSite && (
                <Link to={`/${activeModule.id}`} onClick={onClose}
                  className="mb-1 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/65 transition-all hover:bg-white/10 hover:text-white">
                  <ArrowLeft size={14} /> Changer de {activeModule.id === 'gym' ? 'salle' : 'site'}
                </Link>
              )}
              {moduleNav.map((item) => (
                item.heading ? (
                  <p key={`h-${item.heading}`} className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-white/45">
                    {item.heading}
                  </p>
                ) : item.to === '/projet/projets' ? (
                  <ProjetsNavMenu key={item.to} item={item} secteursMenu={secteursMenu}
                    badgeCount={item.badgeKey && badges[item.badgeKey] > 0 ? badges[item.badgeKey] : 0}
                    isActive={location.pathname.startsWith('/projet/projets') && !location.pathname.startsWith('/projet/projets/liste')}
                    onNavigate={onClose} />
                ) : item.to === '/garderie/enfants' ? (
                  <EnfantsNavMenu key={item.to} item={item}
                    isActive={location.pathname.startsWith('/garderie/enfants')}
                    currentSearch={location.search}
                    onNavigate={onClose} />
                ) : (
                  <NavLink key={item.to} to={item.to} end={item.end} className={navClass} onClick={onClose}>
                    <item.icon size={18} /> {item.label}
                    {item.badgeKey && badges[item.badgeKey] > 0 && (
                      <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold">
                        {badges[item.badgeKey]}
                      </span>
                    )}
                  </NavLink>
                )
              ))}
            </>
          )}
        </nav>

        {/* Footer utilisateur */}
        <div className="border-t border-white/15 p-3">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 font-bold">
              {(user?.nom || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.nom}</p>
              <p className="truncate text-xs text-white/70">{roleLabel(role)}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/15 px-3 py-2 text-sm font-semibold shadow-[0_10px_20px_-10px_rgba(0,0,0,0.4)] transition-all hover:bg-white/25"
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>
    </>
  )
}

// Assombrit/éclaircit une couleur hex de `percent` (négatif = plus sombre).
function shade(hex, percent) {
  const n = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const r = Math.max(0, Math.min(255, (n >> 16) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

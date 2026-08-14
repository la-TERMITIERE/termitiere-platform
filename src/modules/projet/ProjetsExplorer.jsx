// Parcours en entonnoir du volet « Projets » : secteur → projet → catégorie de
// tâches (la « phase » de la tâche, propre à CE projet) → tâches — plutôt qu'une
// liste plate de tous les projets mélangés. La fiche projet complète (création,
// budget, client…) reste accessible via « Voir la liste complète des projets ».
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, FolderKanban, ListChecks, LayoutList, Plus, Pencil, Trash2, Info } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { useAuthStore } from '../../core/auth'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import DetailProjetModal from './DetailProjetModal'
import ProjetFormModal from './ProjetFormModal'
import { removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { projetsVisibles, scopeParProjets, secteurEffectif } from './logic'
import { SECTEURS } from '../depense/data'
import { STATUTS_PROJET } from './data'
import { OngletTaches } from './Taches'
import { iconeCategorie, emojiCategorie, NON_CLASSEES, PALETTE_CATEGORIES } from './categoriesTaches'
import { marquerVoletVu } from './vues'
import { isReadOnlyRole, PROJET_ROLES_CLOISONNES } from '../../core/roles'

// Les rôles cloisonnés (chef de projet) ne travaillent que sur des chantiers BTP —
// pas d'écran de choix de secteur pour eux : accès direct à MAXI BAT.
const SECTEUR_CLOISONNE = 'bat'

function EnTete({ icon: Icon, accent, titre, sousTitre }) {
  return (
    <div className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
      style={{ background: `linear-gradient(135deg, ${accent}e6 0%, rgba(26,26,26,0.88) 100%)` }}>
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
        <Icon size={26} />
      </div>
      <div>
        <h2 className="text-lg font-extrabold">{titre}</h2>
        <p className="text-sm text-white/80">{sousTitre}</p>
      </div>
    </div>
  )
}

function FilDAriane({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={14} className="text-gray-300" />}
          {it.to
            ? <Link to={it.to} className="font-semibold text-primary hover:underline">{it.label}</Link>
            : <span className="font-bold text-gray-800">{it.label}</span>}
        </span>
      ))}
    </div>
  )
}

function CarteChoix({ to, color, icon: Icon, titre, sousTitre, badge, actions }) {
  return (
    <Link to={to}
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: color }}>
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        {/* Le nom occupe seule toute la largeur de la ligne (le badge est descendu à
            côté du sous-titre) — sans ce partage, il se tronquait bien trop vite dans
            la grille à 3 colonnes, malgré la même hauteur/largeur de carte. Police
            réduite (+ icône plus petite) pour laisser encore plus de place au nom. */}
        <p className="truncate text-sm font-bold text-gray-900" title={titre}>{titre}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <span>{sousTitre}</span>
          {badge}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
          {actions}
        </div>
      )}
      <ChevronRight size={22} className="text-gray-300 transition-transform group-hover:translate-x-1" />
    </Link>
  )
}

export default function ProjetsExplorer() {
  const { secteurId, projetId, phase: phaseParam } = useParams()
  const navigate = useNavigate()
  const { user, role } = useAuthStore()
  const { data: projetsTous }  = useCollection('projets')
  const { data: tachesTous }   = useCollection('projet_taches')
  const { data: depensesTous } = useCollection('projet_depenses')
  const { data: depenseDepensesTous } = useCollection('depense_depenses')
  const { data: users }        = useCollection('users')
  const { data: notificationsTous } = useCollection('notifications')
  const [detailProjet, setDetailProjet] = useState(null)
  // Édition d'un projet SANS quitter cet écran (cf. bouton ✏️ sur sa carte) — même
  // formulaire que Projets.jsx, partagé via ProjetFormModal.
  const [editProjet, setEditProjet] = useState(null)
  // Création d'un projet SANS quitter cet écran non plus — avant, le bouton
  // « Nouveau projet » naviguait vers /projet/projets/liste (la liste TOUS
  // secteurs confondus), ce qui affichait cette page bien plus lourde en fond
  // derrière la fenêtre de création. On reste maintenant sur la vue du secteur.
  const [creationOuverte, setCreationOuverte] = useState(false)

  useEffect(() => { marquerVoletVu(user?.uid, 'projetProjets') }, [user?.uid])

  const peutSupprimer = !isReadOnlyRole(role) && !['secretaire', 'agent', 'chef_projet'].includes(role)

  async function supprimerProjet(p) {
    if (!window.confirm(`Supprimer le projet "${p.nom}" ?`)) return
    await removeItem('projets', p.id)
    const notifsLiees = notificationsTous.filter((n) => n.projetId === p.id)
    await Promise.all(notifsLiees.map((n) => removeItem('notifications', n.id)))
    await audit('projet', 'projet_supprime', `${p.nom} (${p.id})`)
    toast.success(`« ${p.nom} » supprimé ✓`)
  }

  // Cloisonnement (chef de projet) déjà géré ici — identique à Projets.jsx/Taches.jsx.
  const projets = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])

  // Étape 1 : compteurs par secteur.
  const secteursAvecCompte = useMemo(() => SECTEURS.map((s) => {
    const projetsSecteur = projets.filter((p) => secteurEffectif(p)?.id === s.id)
    const tachesSecteur = scopeParProjets(tachesTous, projetsSecteur)
    return { ...s, nbProjets: projetsSecteur.length, nbTaches: tachesSecteur.length }
  }), [projets, tachesTous])

  // Étape 2 : projets du secteur sélectionné.
  const projetsDuSecteur = useMemo(
    () => (secteurId ? projets.filter((p) => secteurEffectif(p)?.id === secteurId) : []),
    [projets, secteurId]
  )
  const tachesDuSecteur = useMemo(
    () => scopeParProjets(tachesTous, projetsDuSecteur),
    [tachesTous, projetsDuSecteur]
  )
  const projetsDuSecteurAvecCompte = useMemo(
    () => projetsDuSecteur.map((p) => ({ ...p, nbTaches: tachesDuSecteur.filter((t) => t.projetId === p.id).length }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [projetsDuSecteur, tachesDuSecteur]
  )

  // Étape 3 & 4 : le projet choisi + ses tâches uniquement (pas tout le secteur).
  const projetActuel = useMemo(() => projetsDuSecteur.find((p) => p.id === projetId) || null, [projetsDuSecteur, projetId])
  const tachesDuProjet = useMemo(
    () => (projetId ? tachesDuSecteur.filter((t) => t.projetId === projetId) : []),
    [tachesDuSecteur, projetId]
  )
  const depensesDuProjet = useMemo(
    () => (projetId ? depensesTous.filter((d) => d.projetId === projetId) : []),
    [depensesTous, projetId]
  )

  // Étape 3 : catégories = valeurs distinctes de `tache.phase` PARMI LES TÂCHES DE CE
  // PROJET UNIQUEMENT (ex. « Préparation du sol », « Semis »… selon le type de projet).
  const categories = useMemo(() => {
    const map = new Map()
    tachesDuProjet.forEach((t) => {
      const cle = t.phase || NON_CLASSEES
      map.set(cle, (map.get(cle) || 0) + 1)
    })
    return [...map.entries()]
      .map(([phase, count], i) => ({ phase, count, color: PALETTE_CATEGORIES[i % PALETTE_CATEGORIES.length] }))
      .sort((a, b) => {
        if (a.phase === NON_CLASSEES) return 1
        if (b.phase === NON_CLASSEES) return -1
        return a.phase.localeCompare(b.phase)
      })
  }, [tachesDuProjet])

  // Étape 4 : tâches de la catégorie choisie, pour ce projet (passées telles quelles à
  // OngletTaches, qui garde tous ses propres filtres/actions/modales).
  const tachesDeLaCategorie = useMemo(() => {
    if (!phaseParam) return []
    if (phaseParam === NON_CLASSEES) return tachesDuProjet.filter((t) => !t.phase)
    return tachesDuProjet.filter((t) => t.phase === phaseParam)
  }, [tachesDuProjet, phaseParam])

  const secteurActuel = SECTEURS.find((s) => s.id === secteurId)

  // Chef de projet : pas de choix de secteur, direction MAXI BAT — le cloisonnement
  // (projetsVisibles) filtre déjà à ses seuls projets, cette redirection lui évite
  // de voir/choisir des secteurs où il n'a de toute façon jamais rien. Placée après
  // tous les hooks pour ne jamais changer leur nombre d'un rendu à l'autre.
  if (PROJET_ROLES_CLOISONNES.includes(role) && secteurId !== SECTEUR_CLOISONNE) {
    return <Navigate to="/projet/projets/bat" replace />
  }

  // ── Étape 4 : tâches de la catégorie, pour le projet ──
  if (secteurId && projetId && phaseParam) {
    return (
      <div className="space-y-5">
        <FilDAriane items={[
          { label: 'Projets', to: '/projet/projets' },
          { label: secteurActuel?.label || secteurId, to: `/projet/projets/${secteurId}` },
          { label: projetActuel?.nom || 'Projet', to: `/projet/projets/${secteurId}/${projetId}` },
          { label: phaseParam === NON_CLASSEES ? 'Non classées' : phaseParam }
        ]} />
        {/* On passe TOUTES les tâches du projet (pas seulement celles de la catégorie) :
            le sélecteur « Phase » d'OngletTaches sert alors à basculer vers les autres
            catégories du même projet sans revenir en arrière. Exception : catégorie
            « Non classées », qu'on ne peut pas représenter dans ce sélecteur (il ne liste
            que les phases non vides) — on y reste donc limité aux tâches sans catégorie. */}
        <OngletTaches
          taches={phaseParam === NON_CLASSEES ? tachesDeLaCategorie : tachesDuProjet}
          projets={projetActuel ? [projetActuel] : []}
          users={users}
          depenses={depensesDuProjet}
          initialFiltrePhase={phaseParam === NON_CLASSEES ? '' : phaseParam}
          initialProjetId={projetActuel?.id || ''}
        />
      </div>
    )
  }

  // ── Étape 3 : catégories de tâches du projet ──
  if (secteurId && projetId) {
    // Ouvre directement le formulaire de création de tâche (même mécanisme que
    // TachesExplorer → « Nouvelle tâche »), sur la catégorie « Non classées » —
    // le formulaire permet de choisir la vraie phase à la volée.
    const nouvelleTache = () => navigate(
      `/projet/projets/${secteurId}/${projetId}/${NON_CLASSEES}`,
      { state: { openCreate: true } }
    )
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilDAriane items={[
            { label: 'Projets', to: '/projet/projets' },
            { label: secteurActuel?.label || secteurId, to: `/projet/projets/${secteurId}` },
            { label: projetActuel?.nom || 'Projet' }
          ]} />
          {!isReadOnlyRole(role) && (
            <Button onClick={nouvelleTache}><Plus size={16} /> Nouvelle tâche</Button>
          )}
        </div>
        <EnTete icon={ListChecks} accent={secteurActuel?.color || '#0d9488'}
          titre={`${projetActuel?.nom || 'Projet'} — Catégories de tâches`}
          sousTitre="Choisissez une catégorie pour voir les tâches correspondantes" />
        {categories.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            <p>Aucune tâche enregistrée pour ce projet pour l'instant.</p>
            {!isReadOnlyRole(role) && (
              <Button onClick={nouvelleTache} size="sm"><Plus size={14} className="mr-1" />Ajouter la première tâche</Button>
            )}
          </div>
        ) : (
          <>
            {/* Menu déroulant — accès direct à une catégorie */}
            <div className="relative max-w-md">
              <select
                defaultValue=""
                onChange={(e) => { if (e.target.value) navigate(`/projet/projets/${secteurId}/${projetId}/${encodeURIComponent(e.target.value)}`) }}
                className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 pr-10 text-sm font-semibold text-gray-700 shadow-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': secteurActuel?.color || '#0d9488' }}
              >
                <option value="" disabled>▾ Choisir une catégorie de tâches…</option>
                {categories.map((c) => (
                  <option key={c.phase} value={c.phase}>
                    {emojiCategorie(c.phase)} {c.phase === NON_CLASSEES ? 'Non classées' : c.phase} — {c.count} tâche{c.count > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((c) => (
                <CarteChoix key={c.phase} to={`/projet/projets/${secteurId}/${projetId}/${encodeURIComponent(c.phase)}`}
                  color={c.color} icon={iconeCategorie(c.phase)}
                  titre={c.phase === NON_CLASSEES ? 'Non classées' : c.phase}
                  sousTitre={`${c.count} tâche${c.count > 1 ? 's' : ''}`} />
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Étape 2 : projets du secteur ──
  if (secteurId) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilDAriane items={[{ label: 'Projets', to: '/projet/projets' }, { label: secteurActuel?.label || secteurId }]} />
          {!isReadOnlyRole(role) && (
            <Button onClick={() => setCreationOuverte(true)}>
              <Plus size={16} /> Nouveau projet
            </Button>
          )}
        </div>
        <EnTete icon={FolderKanban} accent={secteurActuel?.color || '#0d9488'}
          titre={`${secteurActuel?.label || secteurId} — Projets`}
          sousTitre="Choisissez un projet pour voir ses catégories de tâches" />
        {projetsDuSecteurAvecCompte.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            Aucun projet enregistré pour ce secteur pour l'instant.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projetsDuSecteurAvecCompte.map((p) => {
              const statut = STATUTS_PROJET[p.statut] || STATUTS_PROJET.planification
              return (
                <CarteChoix key={p.id} to={`/projet/projets/${secteurId}/${p.id}`}
                  color={secteurActuel?.color || '#0d9488'} icon={FolderKanban}
                  titre={p.nom} sousTitre={`${p.nbTaches} tâche${p.nbTaches > 1 ? 's' : ''}`}
                  badge={<Badge tone={statut.tone}>{statut.label}</Badge>}
                  actions={(
                    <>
                      <button onClick={() => setDetailProjet(p)}
                        title="Voir les détails (budget / dépenses)" className="rounded-lg border border-gray-200 bg-gray-50 p-1.5 text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-100">
                        <Info size={15} />
                      </button>
                      {!isReadOnlyRole(role) && (
                        <>
                          <button onClick={() => setEditProjet(p)}
                            title="Modifier" className="rounded-lg border border-teal-200 bg-teal-50 p-1.5 text-teal-600 transition-colors hover:border-teal-300 hover:bg-teal-100">
                            <Pencil size={15} />
                          </button>
                          {peutSupprimer && (
                            <button onClick={() => supprimerProjet(p)}
                              title="Supprimer" className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )} />
              )
            })}
          </div>
        )}
        {detailProjet && (
          <DetailProjetModal projet={detailProjet} depensesProjetTous={depensesTous} taches={tachesTous}
            depenseDepensesTous={depenseDepensesTous} onClose={() => setDetailProjet(null)} icon={FolderKanban} />
        )}
        <ProjetFormModal
          open={!!editProjet || creationOuverte}
          onClose={() => { setEditProjet(null); setCreationOuverte(false) }}
          editingProjet={editProjet} secteurIdDefaut={secteurId}
          projets={projetsDuSecteur} users={users}
        />
      </div>
    )
  }

  // ── Étape 1 : choix du secteur ──
  return (
    <div className="space-y-5">
      <EnTete icon={FolderKanban} accent="#0d9488" titre="Projets"
        sousTitre="Choisissez un secteur pour explorer ses projets et leurs tâches" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {secteursAvecCompte.map((s) => (
          <CarteChoix key={s.id} to={`/projet/projets/${s.id}`} color={s.color} icon={FolderKanban}
            titre={s.label} sousTitre={`${s.nbProjets} projet${s.nbProjets > 1 ? 's' : ''} · ${s.nbTaches} tâche${s.nbTaches > 1 ? 's' : ''}`} />
        ))}
      </div>
      <Link to="/projet/projets/liste" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <LayoutList size={15} /> Voir la liste complète des fiches projet (création, budget, client…)
      </Link>
    </div>
  )
}

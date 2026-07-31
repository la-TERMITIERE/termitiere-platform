// Parcours en entonnoir du volet « Projets » : secteur → projet → catégorie de
// tâches (la « phase » de la tâche, propre à CE projet) → tâches — plutôt qu'une
// liste plate de tous les projets mélangés. La fiche projet complète (création,
// budget, client…) reste accessible via « Voir la liste complète des projets ».
import { useEffect, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, FolderKanban, ListChecks, LayoutList } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { useAuthStore } from '../../core/auth'
import Badge from '../../shared/ui/Badge'
import { projetsVisibles, scopeParProjets, secteurEffectif } from './logic'
import { SECTEURS } from '../depense/data'
import { STATUTS_PROJET } from './data'
import { OngletTaches } from './Taches'
import { iconeCategorie, emojiCategorie, NON_CLASSEES, PALETTE_CATEGORIES } from './categoriesTaches'
import { marquerVoletVu } from './vues'

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

function CarteChoix({ to, color, icon: Icon, titre, sousTitre, badge }) {
  return (
    <Link to={to}
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: color }}>
        <Icon size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-extrabold text-gray-900">{titre}</p>
        <p className="text-sm text-gray-500">{sousTitre}</p>
      </div>
      {badge}
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
  const { data: users }        = useCollection('users')

  useEffect(() => { marquerVoletVu(user?.uid, 'projetProjets') }, [user?.uid])

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
        />
      </div>
    )
  }

  // ── Étape 3 : catégories de tâches du projet ──
  if (secteurId && projetId) {
    return (
      <div className="space-y-5">
        <FilDAriane items={[
          { label: 'Projets', to: '/projet/projets' },
          { label: secteurActuel?.label || secteurId, to: `/projet/projets/${secteurId}` },
          { label: projetActuel?.nom || 'Projet' }
        ]} />
        <EnTete icon={ListChecks} accent={secteurActuel?.color || '#0d9488'}
          titre={`${projetActuel?.nom || 'Projet'} — Catégories de tâches`}
          sousTitre="Choisissez une catégorie pour voir les tâches correspondantes" />
        {categories.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            Aucune tâche enregistrée pour ce projet pour l'instant.
          </p>
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
        <FilDAriane items={[{ label: 'Projets', to: '/projet/projets' }, { label: secteurActuel?.label || secteurId }]} />
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
                  badge={<Badge tone={statut.tone}>{statut.label}</Badge>} />
              )
            })}
          </div>
        )}
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

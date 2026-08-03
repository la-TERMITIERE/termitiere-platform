// Parcours en entonnoir du volet « Tâches » : secteur → catégorie de tâches
// (tous projets du secteur confondus) → tâches — plutôt qu'une liste plate de
// toutes les tâches de tous les projets mélangées. Complémentaire du volet
// « Projets » : celui-ci part d'UN projet, celui-ci parcourt TOUT un secteur.
// La liste complète (recherche libre, tous filtres) reste accessible via
// « Voir toutes les tâches ».
import { useEffect, useMemo } from 'react'
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronDown, ListChecks, LayoutList, Plus } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { useAuthStore } from '../../core/auth'
import Button from '../../shared/ui/Button'
import { projetsVisibles, scopeParProjets, secteurEffectif } from './logic'
import { SECTEURS } from '../depense/data'
import { OngletTaches } from './Taches'
import { iconeCategorie, emojiCategorie, NON_CLASSEES, PALETTE_CATEGORIES } from './categoriesTaches'
import { marquerVoletVu } from './vues'
import { isReadOnlyRole, PROJET_ROLES_CLOISONNES } from '../../core/roles'

// Les rôles cloisonnés (chef de projet) ne travaillent que sur des chantiers BTP.
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

function CarteChoix({ to, color, icon: Icon, titre, sousTitre }) {
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
      <ChevronRight size={22} className="text-gray-300 transition-transform group-hover:translate-x-1" />
    </Link>
  )
}

export default function TachesExplorer() {
  const { secteurId, phase: phaseParam } = useParams()
  const navigate = useNavigate()
  const { user, role } = useAuthStore()
  const { data: projetsTous }  = useCollection('projets')
  const { data: tachesTous }   = useCollection('projet_taches')
  const { data: depensesTous } = useCollection('projet_depenses')
  const { data: users }        = useCollection('users')

  useEffect(() => { marquerVoletVu(user?.uid, 'projetTaches') }, [user?.uid])

  const projets = useMemo(() => projetsVisibles(projetsTous, user, role), [projetsTous, user, role])

  // Étape 1 : compteurs par secteur.
  const secteursAvecCompte = useMemo(() => SECTEURS.map((s) => {
    const projetsSecteur = projets.filter((p) => secteurEffectif(p)?.id === s.id)
    const tachesSecteur = scopeParProjets(tachesTous, projetsSecteur)
    return { ...s, nbProjets: projetsSecteur.length, nbTaches: tachesSecteur.length }
  }), [projets, tachesTous])

  // Étape 2 : tâches de TOUS les projets du secteur, groupées par catégorie.
  const projetsDuSecteur = useMemo(
    () => (secteurId ? projets.filter((p) => secteurEffectif(p)?.id === secteurId) : []),
    [projets, secteurId]
  )
  const tachesDuSecteur = useMemo(
    () => scopeParProjets(tachesTous, projetsDuSecteur),
    [tachesTous, projetsDuSecteur]
  )
  const depensesDuSecteur = useMemo(
    () => scopeParProjets(depensesTous, projetsDuSecteur),
    [depensesTous, projetsDuSecteur]
  )

  const categories = useMemo(() => {
    const map = new Map()
    tachesDuSecteur.forEach((t) => {
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
  }, [tachesDuSecteur])

  // Étape 3 : tâches de la catégorie choisie (tous projets du secteur confondus).
  const tachesDeLaCategorie = useMemo(() => {
    if (!phaseParam) return []
    if (phaseParam === NON_CLASSEES) return tachesDuSecteur.filter((t) => !t.phase)
    return tachesDuSecteur.filter((t) => t.phase === phaseParam)
  }, [tachesDuSecteur, phaseParam])

  const secteurActuel = SECTEURS.find((s) => s.id === secteurId)

  // Chef de projet : pas de choix de secteur, direction MAXI BAT directement. Placée
  // après tous les hooks pour ne jamais changer leur nombre d'un rendu à l'autre.
  if (PROJET_ROLES_CLOISONNES.includes(role) && secteurId !== SECTEUR_CLOISONNE) {
    return <Navigate to="/projet/taches/bat" replace />
  }

  // ── Étape 3 : tâches de la catégorie, tous projets du secteur ──
  if (secteurId && phaseParam) {
    return (
      <div className="space-y-5">
        <FilDAriane items={[
          { label: 'Tâches', to: '/projet/taches' },
          { label: secteurActuel?.label || secteurId, to: `/projet/taches/${secteurId}` },
          { label: phaseParam === NON_CLASSEES ? 'Non classées' : phaseParam }
        ]} />
        {/* Toutes les tâches du secteur (pas seulement la catégorie) : le sélecteur
            « Phase » d'OngletTaches sert à basculer vers une autre catégorie, et son
            sélecteur « Projet » à isoler un seul projet si besoin. */}
        <OngletTaches
          taches={phaseParam === NON_CLASSEES ? tachesDeLaCategorie : tachesDuSecteur}
          projets={projetsDuSecteur}
          users={users}
          depenses={depensesDuSecteur}
          initialFiltrePhase={phaseParam === NON_CLASSEES ? '' : phaseParam}
        />
      </div>
    )
  }

  // ── Étape 2 : catégories de tâches du secteur ──
  if (secteurId) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilDAriane items={[{ label: 'Tâches', to: '/projet/taches' }, { label: secteurActuel?.label || secteurId }]} />
          {!isReadOnlyRole(role) && (
            <Button onClick={() => navigate('/projet/taches/liste', { state: { openCreate: true } })}>
              <Plus size={16} /> Nouvelle tâche
            </Button>
          )}
        </div>
        <EnTete icon={ListChecks} accent={secteurActuel?.color || '#0d9488'}
          titre={`${secteurActuel?.label || secteurId} — Catégories de tâches`}
          sousTitre="Toutes les tâches de ce secteur, groupées par catégorie (tous projets confondus)" />
        {categories.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            Aucune tâche enregistrée pour ce secteur pour l'instant.
          </p>
        ) : (
          <>
            <div className="relative max-w-md">
              <select
                defaultValue=""
                onChange={(e) => { if (e.target.value) navigate(`/projet/taches/${secteurId}/${encodeURIComponent(e.target.value)}`) }}
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
                <CarteChoix key={c.phase} to={`/projet/taches/${secteurId}/${encodeURIComponent(c.phase)}`}
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

  // ── Étape 1 : choix du secteur ──
  return (
    <div className="space-y-5">
      {!isReadOnlyRole(role) && (
        <div className="flex justify-end">
          <Button onClick={() => navigate('/projet/taches/liste', { state: { openCreate: true } })}>
            <Plus size={16} /> Nouvelle tâche
          </Button>
        </div>
      )}
      <EnTete icon={ListChecks} accent="#0d9488" titre="Tâches"
        sousTitre="Choisissez un secteur pour parcourir ses tâches par catégorie" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {secteursAvecCompte.map((s) => (
          <CarteChoix key={s.id} to={`/projet/taches/${s.id}`} color={s.color} icon={ListChecks}
            titre={s.label} sousTitre={`${s.nbProjets} projet${s.nbProjets > 1 ? 's' : ''} · ${s.nbTaches} tâche${s.nbTaches > 1 ? 's' : ''}`} />
        ))}
      </div>
      <Link to="/projet/taches/liste" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <LayoutList size={15} /> Voir toutes les tâches (recherche libre, tous filtres)
      </Link>
    </div>
  )
}

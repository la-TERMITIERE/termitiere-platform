// Composant partagé « Tâches Routinières » — checklist quotidienne par catégorie,
// réutilisé par les modules GARDERIE, MAXI-AGRO et MAXI LOGISTIQUE (collections
// distinctes par module/site via `collectionPrefix`). Contrairement aux tâches
// ponctuelles (assignées, avec échéance), la liste d'items ne se vide jamais :
// c'est le POINTAGE (collection à part, clé = jour + item) qui est daté, donc la
// checklist se réinitialise automatiquement chaque jour sans rien recréer, tout
// en gardant l'historique consultable via le navigateur de dates.
//
// Traçabilité : un AGENT ne voit qu'une tâche barrée quand elle est faite — rien
// de plus (ni heure, ni nom), quel que soit qui l'a cochée. Un membre de
// l'ADMINISTRATION ou un DIRECTEUR (isFullAccessRole) a en plus le droit de voir
// l'historique complet des coches du jour : heure puis nom de chaque personne
// ayant coché la tâche (plusieurs entrées si plusieurs personnes ont cliqué).
// Ce droit dépend du rôle de la personne qui REGARDE la liste, pas de qui a coché.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, CheckCircle2, Circle, FilePen, Trash2, ChevronLeft, ChevronRight, CalendarClock, Repeat, User, AlarmClock, BarChart3 } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import FormGroup from '../forms/FormGroup'
import Input from '../forms/Input'
import Select from '../forms/Select'
import RoutineStatistiques from './RoutineStatistiques'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { isFullAccessRole, isReadOnlyRole } from '../../core/roles'
import { todayStr, addDays, formatDate, genId, nowHM } from '../../utils/formatters'
import { glassModalProps, teinterHex, shadeHex } from '../../utils/color'

const PALETTE_CATEGORIES = ['#0d9488', '#B45309', '#7c3aed', '#0369a1', '#dc2626', '#16a34a', '#d97706', '#64748b']
const CATEGORIE_DEFAUT = 'Autres tâches'

// ── Traçabilité par personne ──
// Chaque coche/décoche est empilée dans `evenements`. Pour connaître l'état ACTUEL
// d'une personne, on ne garde que son DERNIER événement (une personne qui coche
// puis décoche n'est plus « effectué »).
function derniersParUtilisateur(evenements) {
  const m = new Map()
  ;(evenements || []).forEach((ev) => {
    const cle = ev.uid || ev.par || 'inconnu'
    const prec = m.get(cle)
    if (!prec || ev.le > prec.le) m.set(cle, ev)
  })
  return [...m.values()]
}
// Personnes actuellement en état « effectué » (dernier événement = coche), triées
// par heure de coche croissante.
function effectuesActuels(evenements) {
  return derniersParUtilisateur(evenements)
    .filter((ev) => ev.action === 'check')
    .sort((a, b) => a.le - b.le)
}
// Vrai dès qu'au moins une personne est en état « effectué » (compteurs).
function auMoinsUnEffectue(evenements) {
  return derniersParUtilisateur(evenements).some((ev) => ev.action === 'check')
}

// Indication sous un champ, en remplacement du `hint` de FormGroup (`text-gray-400`,
// bien trop pâle et quasi invisible sur le panneau glassmorphism teinté d'une
// couleur de module — cf. glassModalProps) : plus contrasté, lisible en clair
// comme en sombre.
function Hint({ children }) {
  return <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-300">{children}</p>
}

// Une ligne de tâche — factorisée pour être partagée entre les groupes par
// catégorie (partagés) et par employé (planning personnel), qui ne diffèrent que
// par le regroupement au-dessus, pas par la ligne elle-même. `showHeure` affiche
// l'heure prévue et un badge « en retard » si elle est dépassée sans être cochée.
// `peutModifier`/`peutSupprimer` sont calculés PAR TÂCHE par l'appelant (une tâche
// du planning personnel a ses propres règles — assigné/assignant — distinctes de
// la checklist partagée, cf. `RoutineTaches`) ; `peutAgir` ne gouverne QUE la coche
// (cocher/décocher reste ouvert à tout agent, quel que soit le propriétaire de la tâche).
function LigneTache({ it, color, perUser, showHeure, checksDate, peutAgir, estAujourdhui, peutModifier, peutSupprimer, peutVoirTracabilite, user, toggle, setModal, setToDelete }) {
  const check = checksDate[it.id]
  const evenements = check?.evenements || []
  const cliquable = peutAgir && estAujourdhui
  // Personnes actuellement en état « effectué » (dernier événement = coche).
  const effectues = effectuesActuels(evenements)
  const jeLaiFaite = effectues.some((ev) => (ev.uid ? ev.uid === user.uid : ev.par === user.nom))
  // État affiché de la ligne :
  //  - PAR PERSONNE → MON état (la tâche est « faite » pour moi si je l'ai cochée) ;
  //  - PARTAGÉ      → état global de la tâche.
  const fait = perUser ? jeLaiFaite : !!check?.fait
  // Liste « effectué par » à afficher :
  //  - PAR PERSONNE → visible par TOUT LE MONDE (chacun voit qui a fait) ;
  //  - PARTAGÉ      → réservé à l'administration / direction (traçabilité).
  const listeEffectues = perUser
    ? effectues
    : (peutVoirTracabilite ? evenements.filter((ev) => ev.action === 'check').sort((a, b) => a.le - b.le) : [])
  const enRetard = showHeure && it.heure && !fait && estAujourdhui && nowHM() > it.heure
  return (
    <div className={`flex items-start gap-3 px-4 py-3 transition-colors ${fait ? 'bg-green-50/40' : cliquable ? 'hover:bg-gray-50' : ''}`}>
      <button onClick={() => toggle(it, perUser)} disabled={!cliquable}
        className="mt-0.5 shrink-0 disabled:cursor-default" title={fait ? 'Décocher' : 'Marquer comme effectuée'}>
        {fait
          ? <CheckCircle2 size={22} className="text-green-500" />
          : <Circle size={22} className={cliquable ? 'text-gray-300 hover:text-gray-400' : 'text-gray-200'} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${fait ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {showHeure && it.heure && (
            <span className={`mr-1.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-bold ${enRetard ? 'bg-red-100 text-red-600' : 'text-gray-400'}`} style={enRetard ? undefined : { background: color + '14', color }}>
              <AlarmClock size={11} /> {it.heure}
            </span>
          )}
          {it.titre}
        </p>
        {enRetard && <p className="mt-0.5 text-[11px] font-semibold text-red-500">En retard — prévue à {it.heure}</p>}
        {perUser && !jeLaiFaite && cliquable && (
          <p className="mt-0.5 text-[11px] font-medium text-amber-600">À effectuer par chaque agent — cochez lorsque vous l'avez faite.</p>
        )}
        {it.personnalisee && it.createdBy && peutVoirTracabilite && (
          <p className="mt-0.5 text-xs text-gray-400">Ajouté par {it.createdBy}</p>
        )}
        {showHeure && it.assigneParNom && (
          <p className="mt-0.5 text-xs text-gray-400">Assignée par {it.assigneParNom}</p>
        )}
        {listeEffectues.length > 0 && (
          <div className="mt-0.5 space-y-0.5">
            {perUser && <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Effectué par</p>}
            {listeEffectues.map((ev, i) => (
              <p key={i} className="text-xs font-semibold text-green-600">
                ✓ {new Date(ev.le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — {ev.par || 'Inconnu'}
              </p>
            ))}
          </div>
        )}
      </div>
      {(peutModifier || peutSupprimer) && (
        <div className="flex shrink-0 gap-1">
          {peutModifier && (
            <button onClick={() => setModal({ data: {
              titre: it.titre, categorie: it.categorie || '',
              assigneUid: it.assigneUid || '', assigneNom: it.assigneNom || '', heure: it.heure || ''
            }, isNew: false, id: it.id })}
              className="rounded p-1.5 hover:bg-gray-100" style={{ color }} title="Modifier">
              <FilePen size={15} />
            </button>
          )}
          {peutSupprimer && (
            <button onClick={() => setToDelete(it)} className="rounded p-1.5 text-red-500 hover:bg-red-100" title="Supprimer">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// `perUserCategories` : noms de catégories où la complétion est PAR PERSONNE
// (chacun coche pour soi, aucune coche ne vaut pour les autres) — ex. l'entretien
// des infrastructures MAXI-AGRO, que chaque agent doit réaliser individuellement.
// Les autres catégories restent en complétion PARTAGÉE (un clic = fait pour tous).
//
// `planningPersonnel` : active, en plus des catégories, un « planning personnel » —
// une tâche peut être assignée à UN agent précis (`assigneUid`/`assigneNom`, un
// VRAI compte du logiciel — cf. `employesDisponibles`) avec une heure prévue
// (`heure`) : ex. les tâches de la ferme MAXI-AGRO, différentes et horodatées pour
// chaque agent (du réveil au soir), plutôt qu'une liste unique partagée par tous.
// Ces tâches sont regroupées PAR AGENT (triées par heure) au lieu d'être mêlées aux
// catégories partagées. Droits spécifiques à ces tâches (cf. `LigneTache`) :
// l'AGENT ASSIGNÉ peut modifier (pas supprimer) ; celui qui l'a ASSIGNÉE (créateur)
// peut supprimer ; l'administration garde la main sur les deux dans tous les cas.
// `assignationObligatoire` impose un agent + une heure pour toute NOUVELLE tâche
// (agro : plus de tâche « orpheline » créée sans destinataire ni horaire).
export default function RoutineTaches({ moduleId, collectionPrefix, seedTaches = [], color = '#0d9488', titre = 'Tâches Routinières', description, perUserCategories = [], planningPersonnel = false, assignationObligatoire = false, employesDisponibles = [], icon: Icon = Repeat }) {
  const { user, role } = useAuth()
  const itemsCol = `${collectionPrefix}_items`
  const checksCol = `${collectionPrefix}_checks`
  const { data: items, loading: itemsLoading } = useCollection(itemsCol)
  const { data: checks } = useCollection(checksCol)

  const today = todayStr()
  const [date, setDate] = useState(today)
  const [modal, setModal] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [saving, setSaving] = useState(false)
  const [vue, setVue] = useState('jour') // 'jour' | 'stats' — onglet Statistiques (cf. plus bas)

  const peutAgir = !isReadOnlyRole(role)
  const estAdmin = isFullAccessRole(role)
  const peutSupprimer = estAdmin // tâches partagées (catégories) — inchangé
  const peutVoirTracabilite = estAdmin
  const estAujourdhui = date === today

  // Droits sur une tâche du PLANNING PERSONNEL : cf. bandeau de commentaire ci-dessus.
  const peutModifierPersonnel = (it) => estAdmin || it.assigneUid === user.uid || it.assigneParUid === user.uid
  const peutSupprimerPersonnel = (it) => estAdmin || it.assigneParUid === user.uid

  const itemsTries = useMemo(() =>
    [...items].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || (a.createdAt || 0) - (b.createdAt || 0)),
  [items])

  // Tâches du planning personnel (assignées à un agent précis) à part — elles ne
  // doivent pas apparaître une seconde fois dans les catégories partagées ci-dessous.
  const itemsPartages = useMemo(() => itemsTries.filter((it) => !it.assigneUid), [itemsTries])
  const itemsPersonnels = useMemo(() => itemsTries.filter((it) => it.assigneUid), [itemsTries])

  const categories = useMemo(() => {
    const map = new Map()
    itemsPartages.forEach((it) => {
      const cat = it.categorie || CATEGORIE_DEFAUT
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(it)
    })
    return [...map.entries()]
  }, [itemsPartages])

  // Planning personnel : regroupé par agent (uid), chaque liste triée par heure
  // prévue (les tâches sans heure passent en dernier) — reproduit un emploi du
  // temps du réveil au soir, propre à chaque agent.
  const planningParEmploye = useMemo(() => {
    if (!planningPersonnel) return []
    const map = new Map()
    itemsPersonnels.forEach((it) => {
      const uid = it.assigneUid
      if (!map.has(uid)) map.set(uid, { nom: it.assigneNom || uid, taches: [] })
      map.get(uid).taches.push(it)
    })
    return [...map.entries()]
      .map(([uid, { nom, taches }]) => [uid, nom, [...taches].sort((a, b) => (a.heure || '99:99').localeCompare(b.heure || '99:99'))])
      .sort((a, b) => a[1].localeCompare(b[1]))
  }, [itemsPersonnels, planningPersonnel])

  const checksDate = useMemo(() => {
    const map = {}
    checks.filter((c) => c.date === date).forEach((c) => { map[c.itemId] = c })
    return map
  }, [checks, date])

  const nbFaits = itemsTries.filter((it) => checksDate[it.id]?.fait).length

  // Chaque clic ajoute un événement à l'historique du jour (au lieu d'écraser le
  // précédent) — si plusieurs personnes cochent/décochent tour à tour la même
  // tâche dans la journée, la trace de chacune reste consultable (administration
  // et directeurs uniquement, cf. `peutVoirTracabilite`).
  async function toggle(item, perUser = false) {
    if (!peutAgir || !estAujourdhui) return
    const id = `${date}_${item.id}`
    const existant = checksDate[item.id]
    const evenementsActuels = existant?.evenements || []
    // État de référence : en mode PAR PERSONNE, l'état de CET utilisateur (son
    // dernier événement) ; en mode partagé, l'état GLOBAL de la tâche.
    let estFait
    if (perUser) {
      const mien = evenementsActuels
        .filter((e) => (e.uid ? e.uid === user.uid : e.par === user.nom))
        .sort((a, b) => a.le - b.le).pop()
      estFait = mien?.action === 'check'
    } else {
      estFait = !!existant?.fait
    }
    const evenement = { par: user.nom || '', uid: user.uid || '', role, le: Date.now(), action: estFait ? 'uncheck' : 'check' }
    const evenements = [...evenementsActuels, evenement]
    // `fait` global : en mode partagé il reflète le nouvel état ; en mode par
    // personne il vaut « au moins une personne a effectué » (pour les compteurs).
    const faitGlobal = perUser ? auMoinsUnEffectue(evenements) : !estFait
    await setItem(checksCol, id, {
      id, itemId: item.id, date, fait: faitGlobal,
      ...(perUser ? { perUser: true } : {}),
      evenements
    })
    audit(moduleId, estFait ? 'TACHE_ROUTINE_DECOCHEE' : 'TACHE_ROUTINE_COCHEE', item.titre)
    toast.success(estFait ? 'Décoché' : 'Tâche marquée comme effectuée ✓')
    // Planning personnel : celui qui a ASSIGNÉ la tâche est notifié dès qu'elle est
    // effectuée (pas à la décoche) — pour qu'il sache que « sa » tâche a été faite
    // sans avoir à revenir vérifier lui-même. N'existe que pour les tâches assignées
    // (assigneParUid absent sur les tâches partagées par catégorie → rien n'est envoyé).
    if (!estFait && item.assigneParUid && item.assigneParUid !== user.uid) {
      notify({
        type: 'info',
        title: `✅ Tâche effectuée — ${item.assigneNom || user.nom}`,
        body: `${item.titre}${item.heure ? ` (prévue à ${item.heure})` : ''}`,
        module: moduleId, forUsers: [item.assigneParUid], link: `/${moduleId}/routine`
      })
    }
  }

  // Création en LOT — plusieurs intitulés × plusieurs agents à la fois : donner UNE
  // tâche à TOUS les agents, ou UNE SÉRIE de tâches à une ou plusieurs personnes en
  // même temps. Chaque combinaison (intitulé, agent) devient sa propre tâche
  // indépendante — cochée, modifiée et supprimée séparément par la suite, comme
  // n'importe quelle tâche du planning personnel.
  async function handleSaveLot() {
    const titres = (modal.data.titres || '').split('\n').map((s) => s.trim()).filter(Boolean)
    if (!titres.length) return toast.error('Au moins un intitulé requis')
    const agents = employesDisponibles.filter((e) => (modal.data.assigneUids || []).includes(e.uid))
    if (assignationObligatoire && !agents.length) return toast.error('Choisissez au moins un agent')
    const heure = modal.data.heure || ''
    if (agents.length && assignationObligatoire && !heure) return toast.error('Heure prévue requise')
    setSaving(true)
    try {
      let ordre = itemsTries.length
      const ecritures = []
      if (agents.length) {
        for (const t of titres) {
          for (const agent of agents) {
            const id = genId()
            ecritures.push(setItem(itemsCol, id, {
              id, titre: t, categorie: CATEGORIE_DEFAUT,
              assigneUid: agent.uid, assigneNom: agent.nom, heure,
              assigneParUid: user.uid, assigneParNom: user.nom,
              ordre: ordre++, createdBy: user.nom, createdAt: Date.now(), personnalisee: true
            }))
          }
        }
      } else {
        // Aucun agent choisi (uniquement possible hors agro, assignationObligatoire=false) :
        // les intitulés rejoignent la liste partagée classique.
        for (const t of titres) {
          const id = genId()
          ecritures.push(setItem(itemsCol, id, { id, titre: t, categorie: CATEGORIE_DEFAUT, ordre: ordre++, createdBy: user.nom, createdAt: Date.now(), personnalisee: true }))
        }
      }
      await Promise.all(ecritures)
      const nb = titres.length * (agents.length || 1)
      audit(moduleId, 'TACHE_ROUTINE_CREATE', `${titres.length} intitulé(s) × ${agents.length || 1} agent(s) = ${nb} tâche(s)${heure ? ` (${heure})` : ''}`)
      toast.success(`${nb} tâche(s) créée(s) ✓`)
      setModal(null)
    } finally { setSaving(false) }
  }

  async function handleSave() {
    if (saving) return
    // Création en lot (planning personnel) : formulaire et logique dédiés, cf. ci-dessus.
    if (modal.isNew && planningPersonnel) return handleSaveLot()
    const nomTache = modal.data.titre.trim()
    if (!nomTache) return toast.error('Titre requis')
    const categorie = modal.data.categorie.trim() || CATEGORIE_DEFAUT
    setSaving(true)
    try {
      if (modal.isNew) {
        // Création SIMPLE — uniquement hors planning personnel (Garderie/Logistique) :
        // pas d'agent/heure ici, cf. handleSaveLot pour MAXI-AGRO.
        const id = genId()
        // `personnalisee` distingue une tâche ajoutée manuellement (par un agent ou
        // l'administration) d'une tâche de la liste initiale — seule la première
        // affiche « Ajouté par » sous son intitulé (la liste initiale vient de la
        // réunion de direction, pas d'un ajout personnel de qui a chargé la page).
        await setItem(itemsCol, id, { id, titre: nomTache, categorie, ordre: itemsTries.length, createdBy: user.nom, createdAt: Date.now(), personnalisee: true })
        audit(moduleId, 'TACHE_ROUTINE_CREATE', nomTache)
        toast.success('Tâche routinière ajoutée ✓')
      } else {
        // Édition d'une tâche du planning personnel : peut réassigner à un autre
        // agent, ou désassigner (retour en liste partagée) — jamais soumis à
        // assignationObligatoire. `assigneParUid`/`assigneParNom` volontairement
        // absents ici : l'assignant (créateur) ne change jamais lors d'une
        // modification, cf. peutSupprimerPersonnel.
        const agentChoisi = planningPersonnel ? employesDisponibles.find((e) => e.uid === modal.data.assigneUid) : null
        const heure = agentChoisi ? (modal.data.heure || '') : ''
        await setItem(itemsCol, modal.id, {
          id: modal.id, titre: nomTache, categorie,
          assigneUid: agentChoisi?.uid || '', assigneNom: agentChoisi?.nom || '', heure
        })
        audit(moduleId, 'TACHE_ROUTINE_EDIT', nomTache)
        toast.success('Tâche routinière modifiée ✓')
      }
      setModal(null)
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!toDelete) return
    const target = toDelete
    setToDelete(null)
    await removeItem(itemsCol, target.id)
    audit(moduleId, 'TACHE_ROUTINE_DELETE', target.titre)
    toast.success('Tâche routinière supprimée ✓')
  }

  // Vide en une fois toute la liste PARTAGÉE (catégories) — sert par exemple à
  // repartir d'une liste vierge après avoir décidé d'abandonner une liste imposée
  // au profit d'un planning personnel saisi à la main. Le planning personnel
  // (tâches assignées) n'est jamais touché par cette action.
  const [viderConfirm, setViderConfirm] = useState(false)
  async function handleViderPartage() {
    setViderConfirm(false)
    await Promise.all(itemsPartages.map((it) => removeItem(itemsCol, it.id)))
    audit(moduleId, 'TACHES_ROUTINE_VIDEES', `${itemsPartages.length} tâche(s) partagée(s) supprimée(s)`)
    toast.success('Liste partagée vidée ✓')
  }

  // Auto-initialisation : ces tâches doivent être présentes dès le premier jour,
  // sans action manuelle — on les crée une seule fois si la liste est vide.
  // Migration : si la collection ne contient QUE d'anciennes tâches sans catégorie
  // (ancienne liste générique d'avant ce volet dédié), on les remplace par la
  // nouvelle liste détaillée et catégorisée — sans quoi elles restent coincées
  // sous un unique bandeau « Autres tâches ». Une liste déjà catégorisée (donc
  // déjà migrée, ou personnalisée depuis) n'est jamais touchée.
  const seededRef = useRef(false)
  useEffect(() => {
    if (itemsLoading || seededRef.current || !seedTaches.length) return
    const legacySansCategorie = items.length > 0 && items.every((it) => !it.categorie)
    if (items.length > 0 && !legacySansCategorie) return
    seededRef.current = true
    ;(async () => {
      if (legacySansCategorie) await Promise.all(items.map((it) => removeItem(itemsCol, it.id)))
      const now = Date.now()
      // setItem (et non addItem) : la clé du document EST l'id — indispensable pour
      // que Modifier/Supprimer visent le bon document (cf. snapToRows).
      await Promise.all(seedTaches.map((t, i) => {
        const id = genId()
        return setItem(itemsCol, id, { id, titre: t.titre, categorie: t.categorie, ordre: i, createdBy: user.nom, createdAt: now + i })
      }))
      audit(moduleId, 'TACHES_ROUTINE_SEED', `${seedTaches.length} tâches routinières initialisées`)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsLoading, items])

  return (
    <div className="space-y-5">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_8px_20px_-8px_rgba(0,0,0,0.25),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: `linear-gradient(135deg, ${teinterHex(color, 0.85)} 0%, ${teinterHex(shadeHex(color, -35), 0.85)} 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: color, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Icon size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">{titre}</h2>
          <p className="text-sm text-white/80">
            {description || 'Checklist quotidienne, organisée par catégorie. Cochez chaque tâche une fois effectuée — la liste se réinitialise automatiquement le lendemain.'}
          </p>
        </div>
      </div>

      {/* Onglet Statistiques — réservé à l'administration/la direction (PAS le
          superviseur, cf. isFullAccessRole) et uniquement quand le planning
          personnel est actif (sinon rien à mesurer par agent). */}
      {planningPersonnel && estAdmin && (
        <div className="flex gap-2">
          <button onClick={() => setVue('jour')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${vue === 'jour' ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            style={vue === 'jour' ? { background: color } : undefined}>
            <CalendarClock size={13} /> Aujourd'hui
          </button>
          <button onClick={() => setVue('stats')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${vue === 'stats' ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            style={vue === 'stats' ? { background: color } : undefined}>
            <BarChart3 size={13} /> Statistiques
          </button>
        </div>
      )}

      {vue === 'stats' && planningPersonnel && estAdmin ? (
        <RoutineStatistiques itemsPersonnels={itemsPersonnels} checks={checks} color={color} user={user} />
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 shadow-sm">
          <button onClick={() => setDate((d) => addDays(d, -1))} className="rounded p-1 text-gray-500 hover:bg-gray-100" title="Jour précédent">
            <ChevronLeft size={16} />
          </button>
          <span className="flex items-center gap-1.5 px-1 text-sm font-semibold text-gray-700 whitespace-nowrap">
            <CalendarClock size={15} className="text-gray-400" /> {formatDate(date)}
            {estAujourdhui && <span className="text-xs font-normal text-gray-400">(aujourd'hui)</span>}
          </span>
          <button onClick={() => !estAujourdhui && setDate((d) => addDays(d, 1))} disabled={estAujourdhui}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent" title="Jour suivant">
            <ChevronRight size={16} />
          </button>
          {!estAujourdhui && (
            <button onClick={() => setDate(today)} className="ml-1 text-xs font-semibold hover:underline" style={{ color }}>
              Aujourd'hui
            </button>
          )}
        </div>
        <span className="text-sm font-semibold text-gray-500">
          {nbFaits}/{itemsTries.length} effectuée{itemsTries.length > 1 ? 's' : ''}
        </span>
        {peutAgir && (
          <div className="ml-auto">
            <Button style={{ backgroundColor: color }} onClick={() => setModal({
              // Planning personnel : formulaire en LOT (plusieurs intitulés × plusieurs
              // agents, cf. handleSaveLot) — pré-coché sur SOI-MÊME par défaut si on fait
              // partie des agents assignables (auto-assignation facile). Hors planning
              // personnel (Garderie/Logistique) : formulaire simple inchangé.
              data: planningPersonnel
                ? { titres: '', assigneUids: employesDisponibles.some((e) => e.uid === user.uid) ? [user.uid] : [], heure: '' }
                : { titre: '', categorie: categories[0]?.[0] || '' },
              isNew: true
            })}>
              <Plus size={16} /> Ajouter une tâche routinière
            </Button>
          </div>
        )}
      </div>

      {!estAujourdhui && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          Consultation d'une journée passée — lecture seule, les cases ne peuvent plus être modifiées ici.
        </div>
      )}

      {planningPersonnel && planningParEmploye.length > 0 && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
            <AlarmClock size={15} style={{ color }} /> Planning personnel — par employé
          </h3>
          {planningParEmploye.map(([uid, nom, taches]) => {
            const faites = taches.filter((t) => checksDate[t.id]?.fait).length
            return (
              <div key={uid}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
                    <User size={12} />
                  </span>
                  <h4 className="text-sm font-bold text-gray-700">{nom}{uid === user.uid ? ' (moi)' : ''}</h4>
                  <span className="text-xs font-semibold text-gray-400">{faites}/{taches.length}</span>
                </div>
                <Card className="p-0 divide-y divide-gray-100">
                  {taches.map((it) => (
                    <LigneTache key={it.id} it={it} color={color} perUser={false} showHeure
                      checksDate={checksDate} peutAgir={peutAgir} estAujourdhui={estAujourdhui}
                      peutModifier={peutModifierPersonnel(it)} peutSupprimer={peutSupprimerPersonnel(it)}
                      peutVoirTracabilite={peutVoirTracabilite}
                      user={user} toggle={toggle} setModal={setModal} setToDelete={setToDelete} />
                  ))}
                </Card>
              </div>
            )
          })}
        </div>
      )}

      {categories.length === 0 && planningParEmploye.length === 0 && (
        <Card className="py-10 text-center text-sm text-gray-400">Aucune tâche routinière définie pour l'instant.</Card>
      )}

      {categories.length > 0 && estAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-red-700">
            {itemsPartages.length} tâche{itemsPartages.length > 1 ? 's' : ''} partagée{itemsPartages.length > 1 ? 's' : ''} (ancienne liste par catégorie, ci-dessous)
          </p>
          <Button variant="danger" size="sm" onClick={() => setViderConfirm(true)}>
            <Trash2 size={14} /> Tout supprimer
          </Button>
        </div>
      )}

      {categories.map(([cat, taches], ci) => {
        const faitesCat = taches.filter((t) => checksDate[t.id]?.fait).length
        const c = PALETTE_CATEGORIES[ci % PALETTE_CATEGORIES.length]
        // Catégorie à complétion PAR PERSONNE : chacun coche pour soi et voit la
        // liste de tous ceux qui l'ont effectuée (nom + heure).
        const perUser = perUserCategories.includes(cat)
        return (
          <div key={cat}>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-4 w-1.5 rounded-full" style={{ background: c }} />
              <h3 className="text-sm font-bold text-gray-700">{cat}</h3>
              <span className="text-xs font-semibold text-gray-400">{faitesCat}/{taches.length}</span>
            </div>
            <Card className="p-0 divide-y divide-gray-100">
              {taches.map((it) => (
                <LigneTache key={it.id} it={it} color={color} perUser={perUser} showHeure={false}
                  checksDate={checksDate} peutAgir={peutAgir} estAujourdhui={estAujourdhui}
                  peutModifier={peutAgir} peutSupprimer={peutSupprimer} peutVoirTracabilite={peutVoirTracabilite}
                  user={user} toggle={toggle} setModal={setModal} setToDelete={setToDelete} />
              ))}
            </Card>
          </div>
        )
      })}
      </>
      )}

      {/* Modal ajout / édition d'une tâche routinière — le formulaire de CRÉATION en
          planning personnel diffère de l'ÉDITION (lot multi-agents vs tâche unique). */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        title={modal?.isNew ? 'Ajouter des tâches routinières' : 'Modifier la tâche routinière'}
        {...glassModalProps(color)}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button style={{ backgroundColor: color }} onClick={handleSave} loading={saving}>Enregistrer</Button></>}>
        {modal && modal.isNew && planningPersonnel ? (
          <div className="space-y-3">
            <FormGroup label="Intitulés des tâches" required>
              <textarea className="input-base min-h-[110px]" value={modal.data.titres || ''}
                onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, titres: e.target.value } }))}
                placeholder={'ex :\nNourrir les poules\nNettoyer les enclos'} />
              <Hint>Une tâche par ligne — chaque ligne devient une tâche indépendante pour chaque agent sélectionné ci-dessous.</Hint>
            </FormGroup>
            <FormGroup label="Assigner à" required={assignationObligatoire}>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="checkbox"
                  checked={employesDisponibles.length > 0 && (modal.data.assigneUids || []).length === employesDisponibles.length}
                  onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, assigneUids: e.target.checked ? employesDisponibles.map((x) => x.uid) : [] } }))} />
                Tous les agents ({employesDisponibles.length})
              </label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-white/70 p-2">
                {employesDisponibles.map((emp) => {
                  const checked = (modal.data.assigneUids || []).includes(emp.uid)
                  return (
                    <label key={emp.uid} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={checked}
                        onChange={(e) => setModal((m) => {
                          const cur = new Set(m.data.assigneUids || [])
                          if (e.target.checked) cur.add(emp.uid); else cur.delete(emp.uid)
                          return { ...m, data: { ...m.data, assigneUids: [...cur] } }
                        })} />
                      {emp.nom}{emp.uid === user.uid ? ' (moi)' : ''}
                    </label>
                  )
                })}
                {!employesDisponibles.length && <p className="text-xs text-gray-600">Aucun agent disponible.</p>}
              </div>
              <Hint>Sélectionnez un ou plusieurs agents — chacun reçoit sa propre copie de ces tâches (donnez la même tâche à tous d'un coup, ou une série à une ou plusieurs personnes).</Hint>
            </FormGroup>
            <FormGroup label="Heure prévue" required={assignationObligatoire}>
              <Input type="time" value={modal.data.heure || ''}
                onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, heure: e.target.value } }))} />
              <Hint>S'applique à toutes les tâches de cette liste — une alerte apparaîtra sur le tableau de bord de chaque agent à partir de cette heure.</Hint>
            </FormGroup>
          </div>
        ) : (
          <div className="space-y-3">
            <FormGroup label="Intitulé" required>
              <Input value={modal?.data.titre} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, titre: e.target.value } }))}
                placeholder="ex : Jouets désinfectés" />
            </FormGroup>
            <FormGroup label="Catégorie" hint="Regroupe la tâche avec les autres tâches de la même catégorie">
              <Input list="categories-routine" value={modal?.data.categorie}
                onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, categorie: e.target.value } }))}
                placeholder="ex : Ouverture et accueil" />
              <datalist id="categories-routine">
                {categories.map(([cat]) => <option key={cat} value={cat} />)}
              </datalist>
            </FormGroup>
            {planningPersonnel && modal && (
              <>
                <FormGroup label="Assigné à">
                  <Select value={modal.data.assigneUid || ''}
                    onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, assigneUid: e.target.value } }))}
                    options={[
                      { value: '', label: '— Non assigné (tâche partagée) —' },
                      ...employesDisponibles.map((emp) => ({ value: emp.uid, label: emp.uid === user.uid ? `${emp.nom} (moi)` : emp.nom }))
                    ]} />
                  <Hint>Optionnel — videz pour renvoyer cette tâche vers la liste partagée classée par catégorie.</Hint>
                </FormGroup>
                {modal.data.assigneUid && (
                  <FormGroup label="Heure prévue">
                    <Input type="time" value={modal.data.heure || ''}
                      onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, heure: e.target.value } }))} />
                    <Hint>Une alerte apparaîtra sur le tableau de bord de l'agent à partir de cette heure, tant que la tâche n'est pas cochée.</Hint>
                  </FormGroup>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Confirmation suppression */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer cette tâche routinière ?"
        {...glassModalProps(color)}
        footer={<><Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" onClick={handleDelete}>Supprimer</Button></>}>
        {toDelete && <p className="text-sm text-gray-600">Voulez-vous vraiment supprimer « {toDelete.titre} » ? L'historique des jours passés reste inchangé.</p>}
      </Modal>

      {/* Confirmation vidage de la liste partagée */}
      <Modal open={viderConfirm} onClose={() => setViderConfirm(false)} size="sm" title="Vider la liste partagée ?"
        {...glassModalProps(color)}
        footer={<><Button variant="outline" onClick={() => setViderConfirm(false)}>Annuler</Button><Button variant="danger" onClick={handleViderPartage}>Tout supprimer</Button></>}>
        <p className="text-sm text-gray-600">
          Supprime les {itemsPartages.length} tâche(s) partagée(s) classées par catégorie. Le planning personnel (tâches assignées à un agent) n'est pas concerné. L'historique des jours passés reste inchangé.
        </p>
      </Modal>
    </div>
  )
}

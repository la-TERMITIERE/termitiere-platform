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
import { Plus, CheckCircle2, Circle, FilePen, Trash2, ChevronLeft, ChevronRight, CalendarClock } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import FormGroup from '../forms/FormGroup'
import Input from '../forms/Input'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isFullAccessRole, isReadOnlyRole } from '../../core/roles'
import { todayStr, addDays, formatDate, genId } from '../../utils/formatters'
import { glassModalProps } from '../../utils/color'

const PALETTE_CATEGORIES = ['#0d9488', '#B45309', '#7c3aed', '#0369a1', '#dc2626', '#16a34a', '#d97706', '#64748b']
const CATEGORIE_DEFAUT = 'Autres tâches'

export default function RoutineTaches({ moduleId, collectionPrefix, seedTaches = [], color = '#0d9488', titre = 'Tâches Routinières', description }) {
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

  const peutAgir = !isReadOnlyRole(role)
  const peutSupprimer = isFullAccessRole(role)
  const peutVoirTracabilite = isFullAccessRole(role)
  const estAujourdhui = date === today

  const itemsTries = useMemo(() =>
    [...items].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || (a.createdAt || 0) - (b.createdAt || 0)),
  [items])

  const categories = useMemo(() => {
    const map = new Map()
    itemsTries.forEach((it) => {
      const cat = it.categorie || CATEGORIE_DEFAUT
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(it)
    })
    return [...map.entries()]
  }, [itemsTries])

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
  async function toggle(item) {
    if (!peutAgir || !estAujourdhui) return
    const id = `${date}_${item.id}`
    const existant = checksDate[item.id]
    const estFait = !!existant?.fait
    const evenement = { par: user.nom || '', role, le: Date.now(), action: estFait ? 'uncheck' : 'check' }
    await setItem(checksCol, id, {
      id, itemId: item.id, date, fait: !estFait,
      evenements: [...(existant?.evenements || []), evenement]
    })
    audit(moduleId, estFait ? 'TACHE_ROUTINE_DECOCHEE' : 'TACHE_ROUTINE_COCHEE', item.titre)
    toast.success(estFait ? 'Décoché' : 'Tâche marquée comme effectuée ✓')
  }

  async function handleSave() {
    if (saving) return
    const nomTache = modal.data.titre.trim()
    if (!nomTache) return toast.error('Titre requis')
    const categorie = modal.data.categorie.trim() || CATEGORIE_DEFAUT
    setSaving(true)
    try {
      if (modal.isNew) {
        const id = genId()
        // `personnalisee` distingue une tâche ajoutée manuellement (par un agent ou
        // l'administration) d'une tâche de la liste initiale — seule la première
        // affiche « Ajouté par » sous son intitulé (la liste initiale vient de la
        // réunion de direction, pas d'un ajout personnel de qui a chargé la page).
        await setItem(itemsCol, id, { id, titre: nomTache, categorie, ordre: itemsTries.length, createdBy: user.nom, createdAt: Date.now(), personnalisee: true })
        audit(moduleId, 'TACHE_ROUTINE_CREATE', nomTache)
        toast.success('Tâche routinière ajoutée ✓')
      } else {
        await setItem(itemsCol, modal.id, { ...modal.data, id: modal.id, titre: nomTache, categorie })
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
      <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: color + '33', background: color + '0d' }}>
        <p className="font-bold mb-0.5" style={{ color }}>🔁 {titre}</p>
        <p style={{ color: color + 'cc' }}>
          {description || 'Checklist quotidienne, organisée par catégorie. Cochez chaque tâche une fois effectuée — la liste se réinitialise automatiquement le lendemain.'}
        </p>
      </div>

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
            <Button style={{ backgroundColor: color }} onClick={() => setModal({ data: { titre: '', categorie: categories[0]?.[0] || '' }, isNew: true })}>
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

      {categories.length === 0 && (
        <Card className="py-10 text-center text-sm text-gray-400">Aucune tâche routinière définie pour l'instant.</Card>
      )}

      {categories.map(([cat, taches], ci) => {
        const faitesCat = taches.filter((t) => checksDate[t.id]?.fait).length
        const c = PALETTE_CATEGORIES[ci % PALETTE_CATEGORIES.length]
        return (
          <div key={cat}>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-4 w-1.5 rounded-full" style={{ background: c }} />
              <h3 className="text-sm font-bold text-gray-700">{cat}</h3>
              <span className="text-xs font-semibold text-gray-400">{faitesCat}/{taches.length}</span>
            </div>
            <Card className="p-0 divide-y divide-gray-100">
              {taches.map((it) => {
                const check = checksDate[it.id]
                const fait = !!check?.fait
                const cliquable = peutAgir && estAujourdhui
                // Historique de traçabilité : toutes les coches (pas les décoches) du
                // jour, dans l'ordre chronologique — réservé à l'administration/direction.
                const historiqueCoches = peutVoirTracabilite
                  ? (check?.evenements || []).filter((ev) => ev.action === 'check').sort((a, b) => a.le - b.le)
                  : []
                return (
                  <div key={it.id} className={`flex items-start gap-3 px-4 py-3 transition-colors ${fait ? 'bg-green-50/40' : cliquable ? 'hover:bg-gray-50' : ''}`}>
                    <button onClick={() => toggle(it)} disabled={!cliquable}
                      className="mt-0.5 shrink-0 disabled:cursor-default" title={fait ? 'Décocher' : 'Marquer comme effectuée'}>
                      {fait
                        ? <CheckCircle2 size={22} className="text-green-500" />
                        : <Circle size={22} className={cliquable ? 'text-gray-300 hover:text-gray-400' : 'text-gray-200'} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold ${fait ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{it.titre}</p>
                      {it.personnalisee && it.createdBy && peutVoirTracabilite && (
                        <p className="mt-0.5 text-xs text-gray-400">Ajouté par {it.createdBy}</p>
                      )}
                      {fait && peutVoirTracabilite && (
                        <div className="mt-0.5 space-y-0.5">
                          {historiqueCoches.map((ev, i) => (
                            <p key={i} className="text-xs font-semibold text-green-600">
                              ✓ {new Date(ev.le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — {ev.par || 'Inconnu'}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    {peutAgir && (
                      <div className="flex shrink-0 gap-1">
                        <button onClick={() => setModal({ data: { titre: it.titre, categorie: it.categorie || '' }, isNew: false, id: it.id })}
                          className="rounded p-1.5 hover:bg-gray-100" style={{ color }} title="Modifier">
                          <FilePen size={15} />
                        </button>
                        {peutSupprimer && (
                          <button onClick={() => setToDelete(it)} className="rounded p-1.5 text-red-500 hover:bg-red-100" title="Supprimer">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </Card>
          </div>
        )
      })}

      {/* Modal ajout / édition d'une tâche routinière */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        title={modal?.isNew ? 'Ajouter une tâche routinière' : 'Modifier la tâche routinière'}
        {...glassModalProps(color)}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button style={{ backgroundColor: color }} onClick={handleSave} loading={saving}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <FormGroup label="Intitulé" required>
              <Input value={modal.data.titre} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, titre: e.target.value } }))}
                placeholder="ex : Jouets désinfectés" />
            </FormGroup>
            <FormGroup label="Catégorie" hint="Regroupe la tâche avec les autres tâches de la même catégorie">
              <Input list="categories-routine" value={modal.data.categorie}
                onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, categorie: e.target.value } }))}
                placeholder="ex : Ouverture et accueil" />
              <datalist id="categories-routine">
                {categories.map(([cat]) => <option key={cat} value={cat} />)}
              </datalist>
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Confirmation suppression */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer cette tâche routinière ?"
        {...glassModalProps(color)}
        footer={<><Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" onClick={handleDelete}>Supprimer</Button></>}>
        {toDelete && <p className="text-sm text-gray-600">Voulez-vous vraiment supprimer « {toDelete.titre} » ? L'historique des jours passés reste inchangé.</p>}
      </Modal>
    </div>
  )
}

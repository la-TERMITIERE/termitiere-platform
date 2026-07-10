import { useMemo, useState } from 'react'
import { Plus, ListChecks, CheckCircle2, Circle, FilePen, Trash2, Lock, ChevronDown, ChevronRight } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { FULL_ACCESS_ROLES } from '../../core/roles'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'

// Rôles habilités à programmer / modifier / supprimer des tâches (la direction + la gérante garderie).
const ROLES_CREATION = [...FULL_ACCESS_ROLES, 'gerant', 'gerante_garderie']

const ASSIGNATIONS = [
  { id: 'tous',             label: 'Tatas + Gérante garderie' },
  { id: 'tata',             label: 'Tatas uniquement'         },
  { id: 'gerante_garderie', label: 'Gérante garderie'         }
]

const empty = () => ({
  titre: '', description: '',
  assigneRole: 'tous', dateEcheance: '',
  fait: false, faitPar: '', faitLe: ''
})

function TacheRow({ t, canGerer, toggleFait, setModal, setToDelete }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 transition-colors ${t.fait ? 'bg-green-50/40' : 'hover:bg-orange-50'}`}>
      <button onClick={() => toggleFait(t)} className="mt-0.5 shrink-0" title={t.fait ? 'Remettre à faire' : 'Marquer comme effectuée'}>
        {t.fait
          ? <CheckCircle2 size={22} className="text-green-500" />
          : <Circle size={22} className="text-gray-300 hover:text-orange-400" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${t.fait ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.titre}</p>
        {t.description && <p className="text-sm text-gray-500 mt-0.5">{t.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="neutral">{ASSIGNATIONS.find((a) => a.id === t.assigneRole)?.label || t.assigneRole}</Badge>
          {t.dateEcheance && <span className="text-gray-400">Échéance : {formatDateShort(t.dateEcheance)}</span>}
          {t.fait && t.faitPar && (
            <span className="text-green-600 font-semibold">✓ Effectuée par {t.faitPar}{t.faitLe ? ` le ${formatDateShort(new Date(t.faitLe).toISOString().slice(0,10))}` : ''}</span>
          )}
        </div>
      </div>
      {canGerer ? (
        <div className="flex shrink-0 gap-1">
          <button onClick={() => setModal({ data: { ...empty(), ...t }, isNew: false, id: t.id })}
            className="rounded p-1.5 text-orange-600 hover:bg-orange-100"><FilePen size={15} /></button>
          <button onClick={() => setToDelete(t)}
            className="rounded p-1.5 text-red-500 hover:bg-red-100"><Trash2 size={15} /></button>
        </div>
      ) : (
        <span className="shrink-0 text-gray-300" title="Lecture seule"><Lock size={14} /></span>
      )}
    </div>
  )
}

export default function Taches() {
  const { user, role } = useAuth()
  const { data: taches } = useCollection('garderie_taches')

  const canGerer = ROLES_CREATION.includes(role)
  // La gérante garderie gère désormais les tâches (comme la direction) : elle voit tout, pas seulement les siennes.
  const visibleParRole = role === 'tata' ? 'tata' : null

  const [modal, setModal]           = useState(null)
  const [toDelete, setToDelete]     = useState(null)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [filtreAssigne, setFiltreAssigne] = useState('')
  const [showFaites, setShowFaites] = useState(false)

  // Un exécutant (tata / gérante garderie) ne voit que les tâches qui le concernent.
  const tachesVisibles = useMemo(() => {
    if (!visibleParRole) return taches
    return taches.filter((t) => t.assigneRole === 'tous' || t.assigneRole === visibleParRole)
  }, [taches, visibleParRole])

  const tachesFiltrees = useMemo(() => {
    if (!filtreAssigne) return tachesVisibles
    return tachesVisibles.filter((t) => t.assigneRole === filtreAssigne)
  }, [tachesVisibles, filtreAssigne])

  // Une tâche cochée quitte immédiatement la liste "à faire" pour rejoindre l'historique.
  const listeAFaire = useMemo(
    () => tachesFiltrees.filter((t) => !t.fait)
      .sort((a, b) => (a.dateEcheance || '9999') > (b.dateEcheance || '9999') ? 1 : -1),
    [tachesFiltrees]
  )
  const listeFaites = useMemo(
    () => tachesFiltrees.filter((t) => t.fait).sort((a, b) => (b.faitLe || 0) - (a.faitLe || 0)),
    [tachesFiltrees]
  )

  const restantes = useMemo(() => tachesVisibles.filter((t) => !t.fait).length, [tachesVisibles])

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  async function handleSave() {
    if (saving) return
    const d = modal.data
    if (!d.titre.trim()) return toast.error('Titre de la tâche requis')
    setSaving(true)
    try {
      if (modal.isNew) {
        const id = genId()
        await setItem('garderie_taches', id, { ...d, id, createdBy: user.nom, createdAt: Date.now() })
        audit('garderie', 'TACHE_CREATE', d.titre, { assigneRole: d.assigneRole })
        notify({
          type: 'info',
          title: '📋 Nouvelle tâche à faire',
          body: d.titre,
          module: 'garderie',
          forRoles: d.assigneRole === 'tous' ? ['tata', 'gerante_garderie'] : [d.assigneRole],
          excludeUid: user.uid,
          link: '/garderie/taches'
        })
        toast.success('Tâche programmée ✓')
      } else {
        await setItem('garderie_taches', modal.id, { ...d, id: modal.id })
        audit('garderie', 'TACHE_EDIT', d.titre)
        toast.success('Tâche mise à jour ✓')
      }
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!toDelete || deleting) return
    const target = toDelete
    setDeleting(true)
    setToDelete(null)
    try {
      await removeItem('garderie_taches', target.id)
      audit('garderie', 'TACHE_DELETE', target.titre)
      toast.success('Tâche supprimée ✓')
    } finally {
      setDeleting(false)
    }
  }

  // Coche / décoche une tâche — autorisé pour tout le monde ayant accès au module
  // (c'est la seule action permise aux profils en lecture seule : tata, gérante garderie).
  async function toggleFait(t) {
    const fait = !t.fait
    await setItem('garderie_taches', t.id, {
      ...t,
      fait,
      faitPar: fait ? (user.nom || '') : '',
      faitLe: fait ? Date.now() : ''
    })
    audit('garderie', 'TACHE_TOGGLE', t.titre, { fait })
    if (fait) {
      notify({
        type: 'info',
        title: `✅ Tâche effectuée — ${t.titre}`,
        body: `Cochée par ${user.nom}`,
        module: 'garderie',
        forRoles: [...FULL_ACCESS_ROLES,'gerant'],
        excludeUid: user.uid,
        link: '/garderie/taches'
      })
      toast.success('Tâche marquée comme effectuée ✓')
    } else {
      toast.success('Tâche remise à faire')
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <p className="font-semibold mb-0.5">📋 Tâches — Checklist de la direction</p>
        <p>
          {canGerer
            ? 'Programmez des tâches pour les tatas et/ou la gérante de la garderie. Ils pourront cocher chaque tâche une fois effectuée.'
            : 'Cochez une tâche une fois qu\'elle est effectuée. Seule la direction peut créer, modifier ou supprimer une tâche.'}
        </p>
      </div>

      {restantes > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <p className="font-bold text-amber-700 flex items-center gap-2">
            <ListChecks size={18} /> {restantes} tâche(s) à faire
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {canGerer && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Assignées à</label>
            <Select value={filtreAssigne} onChange={(e) => setFiltreAssigne(e.target.value)}>
              <option value="">Toutes</option>
              {ASSIGNATIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </div>
        )}
        {canGerer && (
          <div className="ml-auto">
            <Button onClick={() => setModal({ data: empty(), isNew: true })}>
              <Plus size={16} /> Programmer une tâche
            </Button>
          </div>
        )}
      </div>

      <Card className="p-0 divide-y divide-gray-100">
        {listeAFaire.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">✅ Aucune tâche à faire — tout est à jour !</p>
        )}
        {listeAFaire.map((t) => (
          <TacheRow key={t.id} t={t} canGerer={canGerer} toggleFait={toggleFait} setModal={setModal} setToDelete={setToDelete} />
        ))}
      </Card>

      {/* Historique des tâches effectuées — repliable, séparé de la liste active */}
      <div>
        <button onClick={() => setShowFaites((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700">
          {showFaites ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          ✓ Tâches effectuées ({listeFaites.length})
        </button>
        {showFaites && (
          <Card className="mt-2 p-0 divide-y divide-gray-100">
            {listeFaites.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">Aucune tâche effectuée pour le moment.</p>
            )}
            {listeFaites.map((t) => (
              <TacheRow key={t.id} t={t} canGerer={canGerer} toggleFait={toggleFait} setModal={setModal} setToDelete={setToDelete} />
            ))}
          </Card>
        )}
      </div>

      {/* Modal création / édition — direction uniquement */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        title={modal?.isNew ? '📋 Programmer une tâche' : 'Modifier la tâche'}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button onClick={handleSave} loading={saving}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <FormGroup label="Titre de la tâche *">
              <Input value={modal.data.titre} onChange={(e) => set('titre', e.target.value)} placeholder="ex: Désinfecter les jouets de la petite section" />
            </FormGroup>
            <FormGroup label="Description">
              <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={modal.data.description} onChange={(e) => set('description', e.target.value)}
                placeholder="Détails, consignes particulières…" />
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Assignée à">
                <Select value={modal.data.assigneRole} onChange={(e) => set('assigneRole', e.target.value)}>
                  {ASSIGNATIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Échéance (optionnel)">
                <Input type="date" value={modal.data.dateEcheance} onChange={(e) => set('dateEcheance', e.target.value)} min={todayStr()} />
              </FormGroup>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmation suppression */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} size="sm" title="Supprimer cette tâche ?"
        footer={<><Button variant="outline" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" onClick={handleDelete} loading={deleting}>Supprimer</Button></>}>
        {toDelete && <p className="text-sm text-gray-600">Voulez-vous vraiment supprimer la tâche « {toDelete.titre} » ?</p>}
      </Modal>
    </div>
  )
}

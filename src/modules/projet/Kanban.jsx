// Vue Kanban — tâches en colonnes par statut, drag-and-drop natif HTML5.
import { useState, useMemo, useRef } from 'react'
import { Plus, Pencil } from 'lucide-react'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { setItem, updateItem } from '../../core/db'
import { STATUTS_TACHE, PRIORITES } from './data'
import { formatDateShort } from '../../utils/formatters'
import { audit } from '../../core/audit'

const COLONNES = [
  { id: 'a_faire',  label: 'À faire',  color: '#94a3b8' },
  { id: 'en_cours', label: 'En cours', color: '#0d9488' },
  { id: 'bloquee',  label: 'Bloquée',  color: '#ef4444' },
  { id: 'terminee', label: 'Terminée', color: '#16a34a' }
]

const PRIORITE_DOT = { basse: '#94a3b8', normale: '#0d9488', haute: '#f59e0b', urgente: '#ef4444' }

const VIDE = { titre: '', projetId: '', assignee: '', priorite: 'normale', statut: 'a_faire', echeance: '', note: '' }

export default function Kanban() {
  const { data: taches }  = useCollection('projet_taches')
  const { data: projets } = useCollection('projets')

  const [filtreProjet, setFiltreProjet] = useState('')
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState(VIDE)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving]   = useState(false)

  // drag state
  const dragId  = useRef(null)
  const [dragOver, setDragOver] = useState(null) // colonne survolée

  // ── Filtrage ───────────────────────────────────────────────────────────────

  const tachesFiltrees = useMemo(() =>
    taches.filter((t) => !filtreProjet || t.projetId === filtreProjet),
  [taches, filtreProjet])

  const parColonne = useMemo(() => {
    const map = {}
    COLONNES.forEach((c) => { map[c.id] = [] })
    tachesFiltrees.forEach((t) => {
      const col = map[t.statut] ? t.statut : 'a_faire'
      map[col].push(t)
    })
    return map
  }, [tachesFiltrees])

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const onDragStart = (e, id) => {
    dragId.current = id
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (e, colId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(colId)
  }

  const onDrop = async (e, colId) => {
    e.preventDefault()
    setDragOver(null)
    const id = dragId.current
    if (!id) return
    const tache = taches.find((t) => t.id === id)
    if (!tache || tache.statut === colId) return
    await updateItem('projet_taches', id, { statut: colId, updatedAt: Date.now() })
    await audit('projet', 'tache_statut', `${tache.titre} → ${STATUTS_TACHE[colId]?.label}`)
    dragId.current = null
  }

  const onDragEnd = () => { dragId.current = null; setDragOver(null) }

  // ── CRUD tâche ─────────────────────────────────────────────────────────────

  const openCreate = (statut = 'a_faire') => {
    setForm({ ...VIDE, statut, projetId: filtreProjet })
    setEditing(null); setModal(true)
  }
  const openEdit = (t) => {
    setForm({
      titre: t.titre || '', projetId: t.projetId || '', assignee: t.assignee || '',
      priorite: t.priorite || 'normale', statut: t.statut || 'a_faire',
      echeance: t.echeance ? new Date(t.echeance).toISOString().slice(0, 10) : '',
      note: t.note || ''
    })
    setEditing(t); setModal(true)
  }

  const handleSave = async () => {
    if (!form.titre.trim()) return
    setSaving(true)
    try {
      const now = Date.now()
      const payload = { ...form, echeance: form.echeance ? new Date(form.echeance).getTime() : null, updatedAt: now }
      if (editing) {
        await setItem('projet_taches', editing.id, { ...editing, ...payload })
      } else {
        const id = `tache_${now}`
        await setItem('projet_taches', id, { id, ...payload, createdAt: now, createdBy: null })
        await audit('projet', 'tache_creee', form.titre)
      }
      setModal(false)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      {/* Filtre projet */}
      <div className="flex items-center gap-2">
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <span className="text-xs text-gray-400">{tachesFiltrees.length} tâche{tachesFiltrees.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Plateau Kanban */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLONNES.map((col) => {
          const items = parColonne[col.id] || []
          const isOver = dragOver === col.id
          return (
            <div
              key={col.id}
              className={`flex w-64 shrink-0 flex-col rounded-xl border-2 transition-colors ${isOver ? 'border-teal-400 bg-teal-50' : 'border-transparent bg-gray-100'}`}
              onDragOver={(e) => onDragOver(e, col.id)}
              onDrop={(e) => onDrop(e, col.id)}
              onDragLeave={() => setDragOver(null)}
            >
              {/* En-tête colonne */}
              <div className="flex items-center justify-between rounded-t-xl px-3 py-2.5"
                style={{ background: col.color + '18', borderBottom: `2px solid ${col.color}40` }}>
                <div className="flex items-center gap-2">
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color, display: 'inline-block' }} />
                  <span className="text-sm font-bold" style={{ color: col.color }}>{col.label}</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: col.color + '25', color: col.color }}>
                    {items.length}
                  </span>
                </div>
                <button onClick={() => openCreate(col.id)}
                  className="rounded p-0.5 text-gray-400 hover:bg-white hover:text-teal-600 transition-colors">
                  <Plus size={15} />
                </button>
              </div>

              {/* Cartes */}
              <div className="flex flex-1 flex-col gap-2 p-2 min-h-32">
                {items.map((t) => {
                  const projet  = projets.find((p) => p.id === t.projetId)
                  const enRetard = t.echeance && t.statut !== 'terminee' && t.echeance < Date.now()
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, t.id)}
                      onDragEnd={onDragEnd}
                      className="group cursor-grab rounded-lg bg-white p-3 shadow-sm ring-1 ring-gray-200 transition-shadow hover:shadow-md active:cursor-grabbing active:opacity-70"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-semibold leading-tight text-gray-800">{t.titre}</p>
                        <button onClick={() => openEdit(t)}
                          className="shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-teal-600">
                          <Pencil size={12} />
                        </button>
                      </div>

                      {projet && (
                        <p className="mt-1 truncate text-[11px] text-teal-600">{projet.nom}</p>
                      )}

                      {t.note && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-gray-400">{t.note}</p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {/* Priorité */}
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITE_DOT[t.priorite] || '#94a3b8', display: 'inline-block', flexShrink: 0 }}
                          title={PRIORITES[t.priorite]?.label} />

                        {/* Assigné */}
                        {t.assignee && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{t.assignee}</span>
                        )}

                        {/* Échéance */}
                        {t.echeance && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${enRetard ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                            {formatDateShort(t.echeance)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Zone drop vide */}
                {items.length === 0 && (
                  <div className={`flex flex-1 items-center justify-center rounded-lg border-2 border-dashed py-6 text-xs text-gray-300 transition-colors ${isOver ? 'border-teal-400 text-teal-400' : 'border-gray-200'}`}>
                    Glisser ici
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal tâche */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifier la tâche' : 'Nouvelle tâche'}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Titre *</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Projet</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              value={form.projetId} onChange={(e) => setForm((f) => ({ ...f, projetId: e.target.value }))}>
              <option value="">— Aucun —</option>
              {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Statut</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.statut} onChange={(e) => setForm((f) => ({ ...f, statut: e.target.value }))}>
                {Object.entries(STATUTS_TACHE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Priorité</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.priorite} onChange={(e) => setForm((f) => ({ ...f, priorite: e.target.value }))}>
                {Object.entries(PRIORITES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Assigné à</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.assignee} onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Échéance</label>
              <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                value={form.echeance} onChange={(e) => setForm((f) => ({ ...f, echeance: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Note</label>
            <textarea rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.titre.trim()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

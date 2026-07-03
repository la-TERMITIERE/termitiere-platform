// Checklist de contrôle qualité par projet.
import { useState, useMemo } from 'react'
import { Plus, Trash2, CheckSquare, Square, ClipboardCheck } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'

const TEMPLATES = [
  { label: 'Démarrage chantier', items: ['Plan validé', 'Permis obtenu', 'Équipe affectée', 'Matériaux commandés', 'Site sécurisé'] },
  { label: 'Réception travaux',   items: ['Travaux terminés', 'Nettoyage site', 'Contrôle qualité', 'Procès-verbal signé', 'Réserves levées'] },
  { label: 'Livrables projet',    items: ['Documentation complète', 'Tests effectués', 'Validation client', 'Archivage dossier'] }
]

const VIDE = { projetId: '', titre: '', items: [] }

export default function Checklists() {
  const { data: projets }    = useCollection('projets')
  const { data: checklists } = useCollection('projet_checklists')

  const [filtreProjet, setFiltreProjet] = useState('')
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(VIDE)
  const [newItem, setNewItem] = useState('')
  const [saving, setSaving]   = useState(false)

  const liste = useMemo(() =>
    checklists
      .filter((c) => !filtreProjet || c.projetId === filtreProjet)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
  [checklists, filtreProjet])

  const openCreate = () => { setForm({ ...VIDE, projetId: filtreProjet }); setNewItem(''); setModal(true) }

  const applyTemplate = (tpl) => {
    setForm((f) => ({ ...f, titre: tpl.label, items: tpl.items.map((t) => ({ texte: t, fait: false })) }))
  }

  const addItemForm = () => {
    if (!newItem.trim()) return
    setForm((f) => ({ ...f, items: [...f.items, { texte: newItem.trim(), fait: false }] }))
    setNewItem('')
  }

  const removeItemForm = (idx) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  const handleSave = async () => {
    if (!form.projetId || !form.titre || !form.items.length) return
    setSaving(true)
    try {
      await addItem('projet_checklists', { ...form, createdAt: Date.now() })
      const p = projets.find((x) => x.id === form.projetId)
      await audit('projet', 'checklist_cree', `${form.titre} — ${p?.nom || form.projetId}`)
      setModal(false)
    } finally { setSaving(false) }
  }

  const toggleItem = async (checklist, idx) => {
    const items = checklist.items.map((it, i) => i === idx ? { ...it, fait: !it.fait } : it)
    await setItem('projet_checklists', checklist.id, { ...checklist, items, updatedAt: Date.now() })
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette checklist ?')) return
    await removeItem('projet_checklists', id)
  }

  return (
    <div className="space-y-4">
      {/* Barre outils */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
          value={filtreProjet} onChange={(e) => setFiltreProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <Button onClick={openCreate} size="sm"><Plus size={14} className="mr-1" />Nouvelle checklist</Button>
      </div>

      {/* Liste */}
      {!liste.length ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <ClipboardCheck size={32} className="opacity-30" />
            <p className="text-sm">Aucune checklist.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {liste.map((cl) => {
            const total = cl.items?.length || 0
            const faits = cl.items?.filter((i) => i.fait).length || 0
            const pct = total > 0 ? Math.round((faits / total) * 100) : 0
            const projet = projets.find((p) => p.id === cl.projetId)
            return (
              <Card key={cl.id}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{cl.titre}</p>
                    {projet && <p className="text-xs text-teal-600">{projet.nom}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-gray-500">{faits}/{total}</span>
                    <button onClick={() => handleDelete(cl.id)} className="rounded p-1 text-gray-300 hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {/* Barre progression */}
                <div className="mb-3 rounded-full bg-gray-100 h-1.5">
                  <div className="h-1.5 rounded-full transition-all"
                    style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#0d9488' }} />
                </div>
                {/* Items */}
                <ul className="space-y-1.5">
                  {(cl.items || []).map((it, idx) => (
                    <li key={idx} className="flex items-center gap-2 cursor-pointer" onClick={() => toggleItem(cl, idx)}>
                      {it.fait
                        ? <CheckSquare size={16} className="shrink-0 text-teal-500" />
                        : <Square size={16} className="shrink-0 text-gray-300" />}
                      <span className={`text-sm ${it.fait ? 'line-through text-gray-400' : 'text-gray-700'}`}>{it.texte}</span>
                    </li>
                  ))}
                </ul>
                {pct === 100 && (
                  <p className="mt-2 text-center text-xs font-bold text-green-600">✓ Checklist complétée</p>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal création */}
      <Modal open={modal} onClose={() => setModal(false)} title="Nouvelle checklist">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Projet *</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={form.projetId} onChange={(e) => setForm((f) => ({ ...f, projetId: e.target.value }))}>
              <option value="">— Sélectionner —</option>
              {projets.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Titre *</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))} />
          </div>

          {/* Templates */}
          <div>
            <p className="mb-1 text-xs font-medium text-gray-600">Templates rapides</p>
            <div className="flex flex-wrap gap-1">
              {TEMPLATES.map((tpl) => (
                <button key={tpl.label} onClick={() => applyTemplate(tpl)}
                  className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs text-teal-700 hover:bg-teal-100">
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Items existants */}
          {form.items.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-gray-100 bg-gray-50 p-2">
              {form.items.map((it, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  <Square size={14} className="text-gray-300" />
                  <span className="flex-1 text-gray-700">{it.texte}</span>
                  <button onClick={() => removeItemForm(idx)} className="text-gray-300 hover:text-red-400"><Trash2 size={12} /></button>
                </li>
              ))}
            </ul>
          )}

          {/* Ajouter un item */}
          <div className="flex gap-2">
            <input className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              placeholder="Ajouter un point de contrôle…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItemForm() } }} />
            <Button variant="ghost" size="sm" onClick={addItemForm}><Plus size={14} /></Button>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModal(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !form.projetId || !form.titre || !form.items.length}>
              {saving ? 'Enregistrement…' : 'Créer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

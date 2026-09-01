// RH — Composant générique de liste CRUD (en-tête + table + formulaire modal).
// Configure colonnes et champs ; branche une collection Firebase. Sert aux écrans
// RH à structure « liste » (formations, évaluations, tâches, missions…).
import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { PageHeader, Champ } from './rhui'

export default function CrudList({
  collection, icon, sousModule, titre, sousTitre, boutonLabel = 'Ajouter',
  colonnes = [], champs = [], vide, emptyText = 'Aucun élément.', extraHeader = null, stats = null
}) {
  const { data } = useCollection(collection)
  const { data: employes } = useCollection('rh_employes')
  const [modal, setModal] = useState(null)

  async function save() {
    const out = {}
    for (const c of champs) {
      let v = modal[c.key]
      if (c.type === 'number') v = Number(v) || 0
      out[c.key] = v ?? ''
      if (c.type === 'employe' && v) out.employeNom = employes.find((e) => e.id === v)?.nom || ''
    }
    const req = champs.find((c) => c.required && !String(modal[c.key] || '').trim())
    if (req) return toast.error(`${req.label} requis`)
    if (modal.id) await updateItem(collection, modal.id, out)
    else await addItem(collection, out)
    toast.success('Enregistré ✓'); setModal(null)
  }
  async function supprimer(row) { if (confirm('Supprimer cet élément ?')) { await removeItem(collection, row.id); toast.success('Supprimé') } }

  const renderCell = (col, row) => {
    if (col.render) return col.render(row, { employes })
    const v = row[col.key]
    if (col.badge) return <Badge tone={col.badge(v)?.tone || 'neutral'}>{col.badge(v)?.label || v}</Badge>
    return v ?? '—'
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={icon} sousModule={sousModule} titre={titre} sousTitre={sousTitre}
        action={<Button style={{ background: '#0284c7' }} onClick={() => setModal(vide())}><Plus size={16} /> {boutonLabel}</Button>} />

      {stats && stats(data)}
      {extraHeader}

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                {colonnes.map((c) => <th key={c.key} className={`px-3 py-2.5 ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {data.length === 0 && <tr><td colSpan={colonnes.length + 1} className="px-3 py-8 text-center text-gray-400">{emptyText}</td></tr>}
              {data.map((row) => (
                <tr key={row.id} className="group hover:bg-gray-50 dark:hover:bg-white/5">
                  {colonnes.map((c) => <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : ''} ${c.strong ? 'font-medium text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>{renderCell(c, row)}</td>)}
                  <td className="px-2 py-2"><div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={() => setModal({ ...row })} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
                    <button onClick={() => supprimer(row)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier' : titre}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            {champs.map((c) => (
              <Champ key={c.key} label={c.label}>
                {c.type === 'select' ? (
                  <select value={modal[c.key] ?? ''} onChange={(e) => setModal({ ...modal, [c.key]: e.target.value })} className="input-base">
                    {(c.options || []).map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
                  </select>
                ) : c.type === 'employe' ? (
                  <select value={modal[c.key] ?? ''} onChange={(e) => setModal({ ...modal, [c.key]: e.target.value })} className="input-base">
                    <option value="">Sélectionner…</option>
                    {employes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                  </select>
                ) : c.type === 'textarea' ? (
                  <textarea rows={2} value={modal[c.key] ?? ''} onChange={(e) => setModal({ ...modal, [c.key]: e.target.value })} className="input-base" />
                ) : (
                  <input type={c.type || 'text'} value={modal[c.key] ?? ''} onChange={(e) => setModal({ ...modal, [c.key]: e.target.value })} className="input-base" />
                )}
              </Champ>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

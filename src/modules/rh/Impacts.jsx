// RH — Impact Collègue (Vie d'Équipe). Reconnaissances / feedbacks positifs.
import { useState } from 'react'
import { Lightbulb, Plus, Heart, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatDateShort, todayStr } from '../../utils/formatters'
import { COL } from './store/rhStore'
import { PageHeader, Champ } from './rhui'

export default function Impacts() {
  const { data: recos } = useCollection(COL.reconnaissances)
  const { data: employes } = useCollection('rh_employes')
  const [modal, setModal] = useState(null)
  const nom = (id) => employes.find((e) => e.id === id)?.nom || '—'

  async function save() {
    if (!modal.message.trim()) return toast.error('Message requis')
    await addItem(COL.reconnaissances, { deId: modal.deId, aId: modal.aId, message: modal.message.trim(), date: todayStr() })
    toast.success('Reconnaissance publiée ✓'); setModal(null)
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={Lightbulb} sousModule="Vie d'Équipe" titre="Impact Collègue"
        sousTitre="Valorisez les réussites et le travail d'équipe au quotidien."
        action={<Button style={{ background: '#0284c7' }} onClick={() => setModal({ deId: '', aId: '', message: '' })}><Plus size={16} /> Publier une reconnaissance</Button>} />

      {recos.length === 0
        ? <Card><p className="py-8 text-center text-sm text-gray-400">Aucune reconnaissance publiée. Envoyez un feedback positif à un collègue.</p></Card>
        : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recos.slice().reverse().map((r) => (
              <Card key={r.id} className="group">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-600 dark:bg-pink-500/20"><Heart size={16} /></div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-200">« {r.message} »</p>
                    <p className="mt-1 text-xs text-gray-400"><strong>{nom(r.deId)}</strong> → <strong>{nom(r.aId)}</strong> · {r.date ? formatDateShort(r.date) : ''}</p>
                  </div>
                  <button onClick={() => removeItem(COL.reconnaissances, r.id)} className="rounded p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
              </Card>
            ))}
          </div>
        )}

      <Modal open={!!modal} onClose={() => setModal(null)} title="Publier une reconnaissance"
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Publier</Button></>}>
        {modal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Champ label="De"><select value={modal.deId} onChange={(e) => setModal({ ...modal, deId: e.target.value })} className="input-base"><option value="">—</option>{employes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select></Champ>
              <Champ label="Pour"><select value={modal.aId} onChange={(e) => setModal({ ...modal, aId: e.target.value })} className="input-base"><option value="">—</option>{employes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}</select></Champ>
            </div>
            <Champ label="Message"><textarea rows={3} value={modal.message} onChange={(e) => setModal({ ...modal, message: e.target.value })} placeholder="Merci pour ton aide sur…" className="input-base" /></Champ>
          </div>
        )}
      </Modal>
    </div>
  )
}

// RH — Contrats de travail (Collaborateurs & Contrats).
import { useMemo, useState } from 'react'
import { FileText, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { TYPES_CONTRAT, COL } from './store/rhStore'

const vide = () => ({ employeId: '', type: 'cdi', dateDebut: todayStr(), dateFin: '', salaire: 0, poste: '' })

export default function Contrats() {
  const { data: contrats } = useCollection(COL.contrats)
  const { data: employes } = useCollection(COL.employes)
  const [modal, setModal] = useState(null)
  const today = todayStr()
  const dans30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)

  const empNom = (id) => employes.find((e) => e.id === id)?.nom || '—'
  const enrichis = useMemo(() => contrats.map((c) => ({
    ...c,
    echeanceProche: c.type === 'cdd' && c.dateFin && c.dateFin >= today && c.dateFin <= dans30,
    expire: c.type === 'cdd' && c.dateFin && c.dateFin < today
  })), [contrats, today, dans30])

  async function save() {
    if (!modal.employeId) return toast.error('Sélectionnez un employé')
    const emp = employes.find((e) => e.id === modal.employeId)
    const data = {
      employeId: modal.employeId, employeNom: emp?.nom || '', type: modal.type,
      dateDebut: modal.dateDebut, dateFin: modal.type === 'cdd' ? modal.dateFin : '',
      salaire: Number(modal.salaire) || 0, poste: modal.poste || emp?.poste || ''
    }
    if (modal.id) await updateItem(COL.contrats, modal.id, data)
    else await addItem(COL.contrats, data)
    toast.success('Contrat enregistré ✓'); setModal(null)
  }
  async function supprimer(c) { if (confirm('Supprimer ce contrat ?')) { await removeItem(COL.contrats, c.id); toast.success('Supprimé') } }

  const alertes = enrichis.filter((c) => c.echeanceProche).length

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Collaborateurs & Contrats</div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <FileText className="text-sky-600" /> Contrats de travail
          </h1>
          <p className="text-sm text-gray-500">CDI, CDD et autres contrats, avec suivi des échéances.</p>
        </div>
        <Button style={{ background: '#0284c7' }} onClick={() => setModal(vide())}><Plus size={16} /> Nouveau contrat</Button>
      </header>

      {alertes > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          <AlertTriangle size={16} /> {alertes} contrat(s) CDD arrivent à échéance dans moins de 30 jours.
        </div>
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                <th className="px-3 py-2.5">Employé</th><th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Début</th><th className="px-3 py-2.5">Fin</th>
                <th className="px-3 py-2.5 text-right">Salaire</th><th className="px-3 py-2.5">Statut</th><th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {enrichis.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Aucun contrat enregistré.</td></tr>}
              {enrichis.map((c) => (
                <tr key={c.id} className="group hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{c.employeNom || empNom(c.employeId)}</td>
                  <td className="px-3 py-2"><Badge tone="info">{TYPES_CONTRAT[c.type]?.label || c.type}</Badge></td>
                  <td className="px-3 py-2 text-gray-500">{formatDateShort(c.dateDebut)}</td>
                  <td className="px-3 py-2 text-gray-500">{c.dateFin ? formatDateShort(c.dateFin) : '—'}</td>
                  <td className="px-3 py-2 text-right">{c.salaire ? formatMoney(c.salaire) : '—'}</td>
                  <td className="px-3 py-2">{c.expire ? <Badge tone="danger">Expiré</Badge> : c.echeanceProche ? <Badge tone="warning">Échéance proche</Badge> : <Badge tone="success">Actif</Badge>}</td>
                  <td className="px-2 py-2"><div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={() => setModal({ ...c })} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
                    <button onClick={() => supprimer(c)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le contrat' : 'Nouveau contrat'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <Champ label="Employé"><select value={modal.employeId} onChange={(e) => setModal({ ...modal, employeId: e.target.value })} className="input-base">
              <option value="">Sélectionner…</option>
              {employes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select></Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Type de contrat"><select value={modal.type} onChange={(e) => setModal({ ...modal, type: e.target.value })} className="input-base">{Object.entries(TYPES_CONTRAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Champ>
              <Champ label="Salaire (XOF)"><input type="number" value={modal.salaire} onChange={(e) => setModal({ ...modal, salaire: e.target.value })} className="input-base" /></Champ>
              <Champ label="Date de début"><input type="date" value={modal.dateDebut} onChange={(e) => setModal({ ...modal, dateDebut: e.target.value })} className="input-base" /></Champ>
              {modal.type === 'cdd' && <Champ label="Date de fin"><input type="date" value={modal.dateFin} onChange={(e) => setModal({ ...modal, dateFin: e.target.value })} className="input-base" /></Champ>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}

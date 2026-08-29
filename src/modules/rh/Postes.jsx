// RH — Postes de travail (Structure RH). Fiches de postes & classification.
import { useState } from 'react'
import { ClipboardList, Plus, Pencil, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { COL } from './store/rhStore'
import { useDepartements } from './useDepartements'

const CLASSIFICATIONS = ['Ouvrier', 'Employé', 'Agent de maîtrise', 'Cadre', 'Direction']
const vide = () => ({ intitule: '', departement: '', classification: 'Employé', salaireBase: 0, missions: '' })

export default function Postes() {
  const { data: postes } = useCollection(COL.postes)
  const { data: employes } = useCollection(COL.employes)
  const { noms: departements } = useDepartements()
  const [modal, setModal] = useState(null)

  const effectif = (intitule) => employes.filter((e) => e.poste === intitule).length

  async function save() {
    const intitule = (modal.intitule || '').trim()
    if (!intitule) return toast.error('Intitulé requis')
    const data = { intitule, departement: modal.departement, classification: modal.classification, salaireBase: Number(modal.salaireBase) || 0, missions: modal.missions || '' }
    if (modal.id) await updateItem(COL.postes, modal.id, data)
    else await addItem(COL.postes, data)
    toast.success('Enregistré ✓'); setModal(null)
  }
  async function supprimer(p) { if (confirm(`Supprimer le poste « ${p.intitule} » ?`)) { await removeItem(COL.postes, p.id); toast.success('Supprimé') } }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Structure RH</div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <ClipboardList className="text-sky-600" /> Postes de travail
          </h1>
          <p className="text-sm text-gray-500">Fiches de postes, classification salariale et effectifs par poste.</p>
        </div>
        <Button style={{ background: '#0284c7' }} onClick={() => setModal(vide())}><Plus size={16} /> Nouveau poste</Button>
      </header>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                <th className="px-3 py-2.5">Intitulé</th><th className="px-3 py-2.5">Département</th>
                <th className="px-3 py-2.5">Classification</th><th className="px-3 py-2.5 text-right">Salaire de base</th>
                <th className="px-3 py-2.5 text-center">Effectif</th><th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {postes.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Aucun poste défini.</td></tr>}
              {postes.map((p) => (
                <tr key={p.id} className="group hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{p.intitule}</td>
                  <td className="px-3 py-2 text-gray-500">{p.departement}</td>
                  <td className="px-3 py-2"><Badge tone="info">{p.classification}</Badge></td>
                  <td className="px-3 py-2 text-right">{p.salaireBase ? formatMoney(p.salaireBase) : '—'}</td>
                  <td className="px-3 py-2 text-center">{effectif(p.intitule)}</td>
                  <td className="px-2 py-2"><div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={() => setModal({ ...p })} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
                    <button onClick={() => supprimer(p)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le poste' : 'Nouveau poste'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <Champ label="Intitulé du poste"><input value={modal.intitule} onChange={(e) => setModal({ ...modal, intitule: e.target.value })} className="input-base" /></Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Département"><select value={modal.departement} onChange={(e) => setModal({ ...modal, departement: e.target.value })} className="input-base"><option value="">— Non affecté —</option>{departements.map((d) => <option key={d}>{d}</option>)}</select></Champ>
              <Champ label="Classification"><select value={modal.classification} onChange={(e) => setModal({ ...modal, classification: e.target.value })} className="input-base">{CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}</select></Champ>
            </div>
            <Champ label="Salaire de base (XOF)"><input type="number" value={modal.salaireBase} onChange={(e) => setModal({ ...modal, salaireBase: e.target.value })} className="input-base" /></Champ>
            <Champ label="Missions principales"><textarea rows={2} value={modal.missions} onChange={(e) => setModal({ ...modal, missions: e.target.value })} className="input-base" /></Champ>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}

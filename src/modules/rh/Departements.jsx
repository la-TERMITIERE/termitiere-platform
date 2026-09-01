// RH — Départements (Structure RH). CRUD sur rh_departements + effectifs.
import { useMemo, useState } from 'react'
import { Factory, Plus, Pencil, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { DEPARTEMENTS, COL } from './store/rhStore'

export default function Departements() {
  const { data: departements } = useCollection(COL.departements)
  const { data: employes } = useCollection(COL.employes)
  const [modal, setModal] = useState(null)

  // Fusion : départements par défaut + ceux créés (Firebase).
  const liste = useMemo(() => {
    const defauts = DEPARTEMENTS.map((nom) => ({ nom, defaut: true }))
    const perso = departements.map((d) => ({ ...d }))
    const noms = new Set(perso.map((d) => d.nom))
    return [...perso, ...defauts.filter((d) => !noms.has(d.nom))]
  }, [departements])

  const effectif = (nom) => employes.filter((e) => e.departement === nom).length

  async function save() {
    const nom = (modal.nom || '').trim()
    if (!nom) return toast.error('Nom requis')
    const data = { nom, responsable: modal.responsable || '', description: modal.description || '' }
    if (modal.id) await updateItem(COL.departements, modal.id, data)
    else await addItem(COL.departements, data)
    toast.success('Enregistré ✓'); setModal(null)
  }
  async function supprimer(d) {
    if (!d.id) return toast.error('Département par défaut — non supprimable')
    if (confirm(`Supprimer « ${d.nom} » ?`)) { await removeItem(COL.departements, d.id); toast.success('Supprimé') }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Structure RH</div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <Factory className="text-sky-600" /> Départements
          </h1>
          <p className="text-sm text-gray-500">Organisez votre structure : départements, responsables et effectifs.</p>
        </div>
        <Button style={{ background: '#0284c7' }} onClick={() => setModal({ nom: '', responsable: '', description: '' })}><Plus size={16} /> Nouveau département</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {liste.map((d) => (
          <Card key={d.id || d.nom} className="group">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-800 dark:text-gray-100">{d.nom}</h3>
                {d.responsable && <p className="text-xs text-gray-500">Responsable : {d.responsable}</p>}
              </div>
              <span className="rounded-lg bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{effectif(d.nom)} agent(s)</span>
            </div>
            {d.description && <p className="mt-2 text-sm text-gray-500">{d.description}</p>}
            <div className="mt-3 flex justify-end gap-1 opacity-0 group-hover:opacity-100">
              <button onClick={() => setModal({ ...d })} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
              {d.id && <button onClick={() => supprimer(d)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le département' : 'Nouveau département'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <Champ label="Nom du département"><input value={modal.nom} onChange={(e) => setModal({ ...modal, nom: e.target.value })} className="input-base" /></Champ>
            <Champ label="Responsable"><input value={modal.responsable || ''} onChange={(e) => setModal({ ...modal, responsable: e.target.value })} className="input-base" /></Champ>
            <Champ label="Description"><textarea rows={2} value={modal.description || ''} onChange={(e) => setModal({ ...modal, description: e.target.value })} className="input-base" /></Champ>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}

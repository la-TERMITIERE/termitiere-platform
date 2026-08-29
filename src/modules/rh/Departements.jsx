// RH — Départements (Structure RH). CRUD complet + propagation.
// Les départements par défaut sont amorcés en base au premier affichage : tous
// deviennent donc éditables, renommables et supprimables. Un renommage se
// répercute sur les employés et les postes ; une suppression réaffecte les
// employés/postes concernés à « Non affecté ».
import { useEffect, useMemo, useRef, useState } from 'react'
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
  const { data: postes } = useCollection(COL.postes)
  const [modal, setModal] = useState(null)
  const seedRef = useRef(false)

  // Amorçage unique des départements par défaut (une seule fois, si vide).
  useEffect(() => {
    if (seedRef.current) return
    if (departements && departements.length === 0) {
      seedRef.current = true
      DEPARTEMENTS.forEach((nom) => addItem(COL.departements, { nom, responsable: '', description: '' }))
      toast.success('Départements par défaut initialisés')
    }
  }, [departements])

  const liste = useMemo(() => [...(departements || [])].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')), [departements])
  const effectif = (nom) => employes.filter((e) => e.departement === nom).length
  const nbPostes = (nom) => postes.filter((p) => p.departement === nom).length

  async function save() {
    const nom = (modal.nom || '').trim()
    if (!nom) return toast.error('Nom requis')
    const data = { nom, responsable: modal.responsable || '', description: modal.description || '' }
    if (modal.id) {
      const ancien = departements.find((d) => d.id === modal.id)?.nom
      await updateItem(COL.departements, modal.id, data)
      // Propagation du renommage sur employés + postes.
      if (ancien && ancien !== nom) {
        const majE = employes.filter((e) => e.departement === ancien).map((e) => updateItem(COL.employes, e.id, { departement: nom }))
        const majP = postes.filter((p) => p.departement === ancien).map((p) => updateItem(COL.postes, p.id, { departement: nom }))
        await Promise.all([...majE, ...majP])
        if (majE.length + majP.length > 0) toast.success(`Renommé — ${majE.length} employé(s) et ${majP.length} poste(s) mis à jour`)
      }
    } else {
      await addItem(COL.departements, data)
    }
    toast.success('Enregistré ✓'); setModal(null)
  }

  async function supprimer(d) {
    const nbE = effectif(d.nom), nbP = nbPostes(d.nom)
    if (nbE + nbP > 0) {
      if (!confirm(`« ${d.nom} » compte ${nbE} employé(s) et ${nbP} poste(s). Les supprimer du département les réaffectera à « Non affecté ». Continuer ?`)) return
      const majE = employes.filter((e) => e.departement === d.nom).map((e) => updateItem(COL.employes, e.id, { departement: '' }))
      const majP = postes.filter((p) => p.departement === d.nom).map((p) => updateItem(COL.postes, p.id, { departement: '' }))
      await Promise.all([...majE, ...majP])
    } else if (!confirm(`Supprimer « ${d.nom} » ?`)) return
    await removeItem(COL.departements, d.id)
    toast.success('Supprimé')
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Structure RH</div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <Factory className="text-sky-600" /> Départements
          </h1>
          <p className="text-sm text-gray-500">Organisez votre structure : départements, responsables et effectifs. Renommer ou supprimer un département se répercute sur les employés et les postes.</p>
        </div>
        <Button style={{ background: '#0284c7' }} onClick={() => setModal({ nom: '', responsable: '', description: '' })}><Plus size={16} /> Nouveau département</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {liste.length === 0 && <Card><p className="py-6 text-center text-sm text-gray-400">Initialisation des départements…</p></Card>}
        {liste.map((d) => (
          <Card key={d.id} className="group">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-800 dark:text-gray-100">{d.nom}</h3>
                {d.responsable && <p className="text-xs text-gray-500">Responsable : {d.responsable}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-lg bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{effectif(d.nom)} agent(s)</span>
                {nbPostes(d.nom) > 0 && <span className="text-[11px] text-gray-400">{nbPostes(d.nom)} poste(s)</span>}
              </div>
            </div>
            {d.description && <p className="mt-2 text-sm text-gray-500">{d.description}</p>}
            <div className="mt-3 flex justify-end gap-1 opacity-0 group-hover:opacity-100">
              <button onClick={() => setModal({ ...d })} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
              <button onClick={() => supprimer(d)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
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
            {modal.id && <p className="text-xs text-gray-400">Renommer ce département mettra à jour automatiquement les employés et postes qui y sont rattachés.</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}

function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}

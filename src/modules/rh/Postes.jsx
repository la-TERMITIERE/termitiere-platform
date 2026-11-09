// RH — Postes de travail (Structure RH). Fiches de postes & classification.
import { useState } from 'react'
import { ClipboardList, Plus, Pencil, Trash2, Briefcase, Building2, Layers, Banknote, AlignLeft } from 'lucide-react'
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
import { PageHeader, Champ, ModalRh, ChoixBoutons } from './rhui'
import { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from '../../shared/ui/BandeauVolet'

const CLASSIFICATIONS = ['Ouvrier', 'Employé', 'Agent de maîtrise', 'Cadre', 'Direction']
const vide = () => ({ intitule: '', departement: '', classification: '', salaireBase: 0, missions: '' })

export default function Postes() {
  const departements = useDepartements()
  const { data: postes } = useCollection(COL.postes)
  const { data: employes } = useCollection(COL.employes)
  const [modal, setModal] = useState(null)

  const norme = (t) => String(t || '').trim().toLowerCase()
  const effectif = (intitule) => employes.filter((e) => norme(e.poste) === norme(intitule)).length

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
      <PageHeader icon={ClipboardList} sousModule="Structure RH" titre="Postes de travail" sousTitre="Fiches de postes, classification salariale et effectifs par poste."
        action={<BoutonBande anime icone={Plus} onClick={() => setModal(vide())}>Nouveau poste</BoutonBande>} />

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
                  <td className="px-3 py-2">{p.classification ? <Badge tone="info">{p.classification}</Badge> : <span className="text-gray-400">—</span>}</td>
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

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le poste' : 'Nouveau poste'} titreHero={modal?.intitule?.trim() || undefined}
        icone={Briefcase} intro="Un poste décrit un emploi : son département, sa classification et son salaire de base." onSave={save}>
        {modal && (<>
          <Champ label="Intitulé du poste" icone={Briefcase} required>
            <input value={modal.intitule} onChange={(e) => setModal({ ...modal, intitule: e.target.value })} className="input-base" placeholder="Ex. Responsable d'élevage" autoFocus />
          </Champ>
          <Champ label="Département" icone={Building2} iconeLabel>
            <ChoixBoutons options={departements} value={modal.departement} onChange={(v) => setModal({ ...modal, departement: v })}
              placeholderAutre="Nom du département" vide="Aucun département créé : saisissez-en un ci-dessous ou créez-les dans le volet Départements." />
          </Champ>
          <Champ label="Classification" icone={Layers} iconeLabel>
            <ChoixBoutons options={CLASSIFICATIONS} value={modal.classification} onChange={(v) => setModal({ ...modal, classification: v })} placeholderAutre="Autre classification" />
          </Champ>
          <Champ label="Salaire de base (XOF)" icone={Banknote}>
            <input type="number" value={modal.salaireBase} onChange={(e) => setModal({ ...modal, salaireBase: e.target.value })} className="input-base" />
          </Champ>
          <Champ label="Missions principales" icone={AlignLeft} haut>
            <textarea rows={2} value={modal.missions} onChange={(e) => setModal({ ...modal, missions: e.target.value })} className="input-base" />
          </Champ>
        </>)}
      </ModalRh>
    </div>
  )
}


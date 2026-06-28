import { useMemo, useState } from 'react'
import { Plus, Eye, Search, FilePen } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { setItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { notify } from '../../core/notify'
import { todayStr, genId, formatDateShort } from '../../utils/formatters'
import { GROUPES_AGE, STATUTS_ENFANT } from './data'
import { calcAge, groupeRecommande } from './logic'

const empty = () => ({
  nom: '', prenom: '', dateNaissance: '', sexe: 'F',
  groupe: '', statut: 'actif',
  allergies: '', infoMedicale: '',
  parentId: '', parentNom: '', parentContact: '',
  parentContact2: '', adresse: '',
  dateInscription: todayStr(), notes: ''
})

export default function Enfants() {
  const { user, role } = useAuth()
  const { data: enfants }  = useCollection('garderie_enfants')
  const { data: parents }  = useCollection('garderie_parents')

  const [recherche, setRecherche] = useState('')
  const [filtreGroupe, setFiltreGroupe] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('actif')
  const [modal, setModal]   = useState(null)
  const [detail, setDetail] = useState(null)

  const liste = useMemo(() => {
    let rows = [...enfants]
    if (filtreStatut) rows = rows.filter((e) => e.statut === filtreStatut)
    if (filtreGroupe) rows = rows.filter((e) => e.groupe === filtreGroupe)
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      rows = rows.filter((e) => `${e.prenom} ${e.nom} ${e.parentNom}`.toLowerCase().includes(q))
    }
    return rows.sort((a, b) => `${a.prenom} ${a.nom}` < `${b.prenom} ${b.nom}` ? -1 : 1)
  }, [enfants, recherche, filtreGroupe, filtreStatut])

  function openCreate() { setModal({ data: empty(), isNew: true }) }
  function openEdit(e)  { setModal({ data: { ...empty(), ...e }, isNew: false, id: e.id }) }

  async function handleSave() {
    const d = modal.data
    if (!d.nom.trim() || !d.prenom.trim()) return toast.error('Nom et prénom requis')
    if (!d.dateNaissance) return toast.error('Date de naissance requise')
    if (!d.groupe) return toast.error('Groupe requis')

    if (modal.isNew) {
      const id = genId()
      await setItem('garderie_enfants', id, { ...d, id })
      audit('garderie', 'ENFANT_CREATE', `${d.prenom} ${d.nom}`, { groupe: d.groupe })
      notify({ type: 'info', title: '🍼 Nouvel enfant inscrit', body: `${d.prenom} ${d.nom} a été inscrit(e) à la garderie`, module: 'garderie', forRoles: ['super_admin','pau','ge','gerant'], excludeUid: user.uid, link: '/garderie/enfants' })
      toast.success(`${d.prenom} ${d.nom} inscrit(e) ✓`)
    } else {
      await setItem('garderie_enfants', modal.id, { ...d, id: modal.id })
      audit('garderie', 'ENFANT_EDIT', `${d.prenom} ${d.nom}`)
      toast.success('Fiche mise à jour ✓')
    }
    setModal(null)
  }

  const set = (k, v) => setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }))

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
          <input
            className="rounded-lg border border-gray-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            placeholder="Rechercher un enfant…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Groupe</label>
          <Select value={filtreGroupe} onChange={(e) => setFiltreGroupe(e.target.value)}>
            <option value="">Tous les groupes</option>
            {GROUPES_AGE.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Statut</label>
          <Select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}>
            <option value="">Tous</option>
            {Object.entries(STATUTS_ENFANT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">{liste.length} enfant(s)</span>
          <Button onClick={openCreate}><Plus size={16} /> Inscrire un enfant</Button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Prénom Nom</th>
              <th className="px-3 py-2 text-left">Âge</th>
              <th className="px-3 py-2 text-left">Groupe</th>
              <th className="px-3 py-2 text-left">Parent / Contact</th>
              <th className="px-3 py-2 text-left">Statut</th>
              <th className="px-3 py-2 text-left">Inscription</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liste.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-gray-400">Aucun enfant trouvé.</td></tr>
            )}
            {liste.map((e) => (
              <tr key={e.id} className="hover:bg-orange-50 transition-colors">
                <td className="px-3 py-2 font-semibold">{e.prenom} {e.nom}</td>
                <td className="px-3 py-2 text-gray-600">{calcAge(e.dateNaissance) || '—'}</td>
                <td className="px-3 py-2">{GROUPES_AGE.find((g) => g.id === e.groupe)?.label || '—'}</td>
                <td className="px-3 py-2">
                  <p>{e.parentNom || '—'}</p>
                  <p className="text-xs text-gray-400">{e.parentContact}</p>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={STATUTS_ENFANT[e.statut]?.tone}>{STATUTS_ENFANT[e.statut]?.label}</Badge>
                  {e.allergies && <span className="ml-1 text-xs text-orange-500">⚠ allergie</span>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-400">{formatDateShort(e.dateInscription)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => setDetail(e)} className="rounded p-1 hover:bg-gray-100"><Eye size={14} /></button>
                    <button onClick={() => openEdit(e)} title="Modifier la fiche" className="rounded p-1 text-orange-600 hover:bg-orange-50"><FilePen size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Modal création / édition */}
      <Modal open={!!modal} onClose={() => setModal(null)} size="lg"
        title={modal?.isNew ? 'Inscrire un enfant' : 'Modifier la fiche enfant'}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Annuler</Button><Button onClick={handleSave}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Prénom *">
                <Input value={modal.data.prenom} onChange={(e) => set('prenom', e.target.value)} />
              </FormGroup>
              <FormGroup label="Nom *">
                <Input value={modal.data.nom} onChange={(e) => set('nom', e.target.value)} />
              </FormGroup>
              <FormGroup label="Date de naissance *">
                <Input type="date" value={modal.data.dateNaissance} onChange={(e) => {
                  set('dateNaissance', e.target.value)
                  set('groupe', groupeRecommande(e.target.value))
                }} />
              </FormGroup>
              <FormGroup label="Sexe">
                <Select value={modal.data.sexe} onChange={(e) => set('sexe', e.target.value)}>
                  <option value="F">Fille</option>
                  <option value="M">Garçon</option>
                </Select>
              </FormGroup>
              <FormGroup label="Groupe d'âge *">
                <Select value={modal.data.groupe} onChange={(e) => set('groupe', e.target.value)}>
                  <option value="">— Choisir —</option>
                  {GROUPES_AGE.map((g) => <option key={g.id} value={g.id}>{g.label} ({g.desc})</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Statut">
                <Select value={modal.data.statut} onChange={(e) => set('statut', e.target.value)}>
                  {Object.entries(STATUTS_ENFANT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Date d'inscription">
                <Input type="date" value={modal.data.dateInscription} onChange={(e) => set('dateInscription', e.target.value)} />
              </FormGroup>
              <FormGroup label="Adresse">
                <Input value={modal.data.adresse} onChange={(e) => set('adresse', e.target.value)} />
              </FormGroup>
            </div>

            <div className="rounded-lg border border-pink-100 bg-orange-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase text-orange-700">Informations parents / tuteurs</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Nom du parent / tuteur">
                  <Input value={modal.data.parentNom} onChange={(e) => set('parentNom', e.target.value)} />
                </FormGroup>
                <FormGroup label="Contact principal">
                  <Input value={modal.data.parentContact} onChange={(e) => set('parentContact', e.target.value)} />
                </FormGroup>
                <FormGroup label="Contact secondaire">
                  <Input value={modal.data.parentContact2} onChange={(e) => set('parentContact2', e.target.value)} />
                </FormGroup>
              </div>
            </div>

            <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase text-orange-700">Santé & allergies</p>
              <div className="grid grid-cols-2 gap-3">
                <FormGroup label="Allergies connues">
                  <Input value={modal.data.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="ex: arachides, lait…" />
                </FormGroup>
                <FormGroup label="Info médicale importante">
                  <Input value={modal.data.infoMedicale} onChange={(e) => set('infoMedicale', e.target.value)} placeholder="ex: asthme, épilepsie…" />
                </FormGroup>
              </div>
            </div>

            <FormGroup label="Notes">
              <textarea
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                rows={2} value={modal.data.notes} onChange={(e) => set('notes', e.target.value)}
              />
            </FormGroup>
          </div>
        )}
      </Modal>

      {/* Modal détail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg"
        title={detail ? `${detail.prenom} ${detail.nom}` : ''}>
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="font-semibold text-gray-500">Âge :</span> {calcAge(detail.dateNaissance) || '—'}</div>
              <div><span className="font-semibold text-gray-500">Sexe :</span> {detail.sexe === 'F' ? 'Fille' : 'Garçon'}</div>
              <div><span className="font-semibold text-gray-500">Groupe :</span> {GROUPES_AGE.find((g) => g.id === detail.groupe)?.label || '—'}</div>
              <div><span className="font-semibold text-gray-500">Inscription :</span> {formatDateShort(detail.dateInscription)}</div>
              <div><span className="font-semibold text-gray-500">Parent :</span> {detail.parentNom || '—'}</div>
              <div><span className="font-semibold text-gray-500">Contact :</span> {detail.parentContact || '—'}</div>
              {detail.parentContact2 && <div><span className="font-semibold text-gray-500">Contact 2 :</span> {detail.parentContact2}</div>}
              <div><span className="font-semibold text-gray-500">Adresse :</span> {detail.adresse || '—'}</div>
            </div>
            {(detail.allergies || detail.infoMedicale) && (
              <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                {detail.allergies && <p><span className="font-semibold">Allergies :</span> {detail.allergies}</p>}
                {detail.infoMedicale && <p><span className="font-semibold">Info médicale :</span> {detail.infoMedicale}</p>}
              </div>
            )}
            {detail.notes && <p className="text-gray-500 italic">{detail.notes}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}

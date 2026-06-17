// Saisie matières premières — EF Initial · Achats · Consommation · EF Final.
import { useEffect, useMemo, useState } from 'react'
import { Save, CheckCircle2, Plus, Trash2, Lock } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import FormGroup from '../../shared/forms/FormGroup'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useBriqueterieStore } from './store/referentielStore'
import { setItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, formatDateTime, genId } from '../../utils/formatters'
import {
  previousInventoryDate, getInventaire, agregerMatiere, sommeMouvements,
  mergeMouvementsUtilisateur, peutModifierLigne, annoterLignesAgent
} from './logic'

export default function SaisieMatiere() {
  const { user, role } = useAuth()
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const matieres = useBriqueterieStore((s) => s.matieres)
  const saveMatiere = useBriqueterieStore((s) => s.saveMatiere)

  const [date, setDate] = useState(todayStr())
  const [stock, setStock] = useState({})
  const [saving, setSaving] = useState(false)
  const [mvtModal, setMvtModal] = useState(null)
  const [addModal, setAddModal] = useState(false)
  const [seedInit, setSeedInit] = useState({}) // { date: { id } } pour les matières fraîchement créées

  // Inventaire de la veille : s'il n'existe pas, on autorise la saisie du solde initial (ouverture).
  const prevInv = useMemo(() => {
    const prevDate = previousInventoryDate(inventaires, date)
    return prevDate ? getInventaire(inventaires, prevDate) : null
  }, [inventaires, date])

  const peutSaisir = role === 'agent'
  // Solde initial éditable uniquement au premier solde (pas d'antériorité), sinon reporté.
  const peutEditerInit = peutSaisir && !prevInv

  useEffect(() => {
    const inv = getInventaire(inventaires, date) || { matieres: {} }
    const seeds = seedInit[date] || {}

    const s = {}
    matieres.forEach((m) => {
      const saved = inv.matieres?.[m.id]
      s[m.id] = {
        init: saved?.init !== undefined ? saved.init : prevInv?.matieres?.[m.id]?.fin ?? seeds[m.id] ?? 0,
        entrees: saved?.entrees || [],
        consommations: saved?.consommations || []
      }
    })
    setStock(s)
  }, [date, inventaires, matieres, prevInv, seedInit])

  // Création d'une nouvelle matière première depuis la saisie.
  function handleAddMatiere({ nom, unite, initial }) {
    const base = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24)
    const id = (base || 'matiere') + '_' + genId().slice(0, 3).toLowerCase()
    saveMatiere({ id, nom: nom.trim(), unite: unite || 'sacs' })
    setSeedInit((s) => ({ ...s, [date]: { ...(s[date] || {}), [id]: Math.max(0, parseFloat(initial) || 0) } }))
    setAddModal(false)
    toast.success(`${nom.trim()} ajoutée ✓ — pensez à enregistrer la saisie`)
  }

  const existing = getInventaire(inventaires, date)
  const dejaSaisi = existing?.savedAt

  const setInit = (id, val) => {
    setStock((s) => ({ ...s, [id]: { ...s[id], init: Math.max(0, parseFloat(val) || 0) } }))
  }

  const setLignes = (id, field, lignes) => {
    if (!user) return
    setStock((s) => {
      const prev = s[id]?.[field] || []
      const merged = mergeMouvementsUtilisateur(prev, lignes, user.uid, user.nom)
      return { ...s, [id]: { ...s[id], [field]: merged } }
    })
  }

  async function save() {
    if (!user) return toast.error('Session expirée')
    setSaving(true)
    try {
      const inv = getInventaire(inventaires, date) || {}
      const matieresData = {}
      matieres.forEach((m) => {
        const d = stock[m.id] || { init: 0, entrees: [], consommations: [] }
        const agg = agregerMatiere(d)
        matieresData[m.id] = {
          ...agg,
          entrees: annoterLignesAgent(d.entrees || [], user.uid, user.nom),
          consommations: annoterLignesAgent(d.consommations || [], user.uid, user.nom)
        }
      })
      await setItem('evenementiel_inventaires', date, {
        ...inv,
        date,
        agentId: user.uid,
        agentNom: user.nom,
        savedAt: ts(),
        matieres: matieresData,
        briques: inv.briques || {}
      })
      await audit('evenementiel', 'SAISIE_MATIERE', `Saisie matières du ${date}`)
      toast.success('Saisie enregistrée ✓')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {!peutSaisir && (
        <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
          👁️ Mode consultation — seuls les agents peuvent effectuer des saisies
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Date</label>
          <input type="date" className="input-base w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Agent</label>
          <input className="input-base w-auto bg-gray-100" value={user?.nom || ''} readOnly />
        </div>
        <div className="ml-auto flex gap-2">
          {peutSaisir && <Button variant="outline" onClick={() => setAddModal(true)}><Plus size={16} /> Ajouter une matière</Button>}
          {peutSaisir && <Button onClick={save} loading={saving}><Save size={16} /> Enregistrer</Button>}
        </div>
      </div>

      <div className="rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-800">
        Matières premières : <strong>Ciment</strong>, <strong>Concassé</strong>, <strong>Sable fin</strong>.
        La consommation est aussi alimentée automatiquement lors des enregistrements de production.
      </div>

      {peutEditerInit && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          📥 <strong>Solde d'ouverture :</strong> aucune saisie antérieure — vous pouvez renseigner le <strong>stock initial existant</strong> de chaque matière. Les jours suivants, il sera reporté automatiquement.
        </div>
      )}

      {dejaSaisi && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 size={16} />
          Saisie du {formatDateTime(existing.savedAt)}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="max-h-[calc(100vh-14rem)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
              <tr>
                <th className="bg-gray-50 px-3 py-2 text-left">Matière</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Stock Initial 🔒</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Achats</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Consommation</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Stock Final 🔒</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {matieres.map((m) => {
                const d = stock[m.id] || { init: 0, entrees: [], consommations: [] }
                const totEnt = sommeMouvements(d.entrees)
                const totConso = sommeMouvements(d.consommations)
                const fin = Math.max(0, (d.init || 0) + totEnt - totConso)
                return (
                  <tr key={m.id}>
                    <td className="px-3 py-1.5 font-semibold">{m.nom} <span className="text-[10px] text-gray-400">({m.unite})</span></td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="number" min="0" step="0.1" value={d.init ?? 0} readOnly={!peutEditerInit}
                        onChange={(e) => setInit(m.id, e.target.value)}
                        className={`w-20 rounded border px-1 py-1 text-center text-sm ${peutEditerInit ? '' : 'num-readonly cursor-not-allowed'}`} />
                    </td>
                    <MvtCell total={totEnt} tone="green" onClick={() => setMvtModal({ id: m.id, dir: 'entree', nom: m.nom, unite: m.unite })} />
                    <MvtCell total={totConso} tone="amber" onClick={() => setMvtModal({ id: m.id, dir: 'conso', nom: m.nom, unite: m.unite })} />
                    <td className="px-2 py-1.5 text-center font-bold text-secondary">{fin.toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <MouvementModal modal={mvtModal} stock={stock} user={user} peutSaisir={peutSaisir} onClose={() => setMvtModal(null)}
        onChange={(field, lignes) => setLignes(mvtModal.id, field, lignes)} />

      <AddMatiereModal open={addModal} onClose={() => setAddModal(false)} onSave={handleAddMatiere} />
    </div>
  )
}

// Fenêtre de création d'une matière première : nom, unité, stock initial.
function AddMatiereModal({ open, onClose, onSave }) {
  const [nom, setNom] = useState('')
  const [unite, setUnite] = useState('sacs')
  const [initial, setInitial] = useState('')

  useEffect(() => {
    if (open) { setNom(''); setUnite('sacs'); setInitial('') }
  }, [open])

  function submit() {
    if (!nom.trim()) return toast.error('Nom requis')
    onSave({ nom, unite, initial })
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajouter une matière première"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit}>Ajouter</Button></>}>
      <FormGroup label="Nom de la matière" required>
        <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex : Adjuvant" autoFocus />
      </FormGroup>
      <div className="grid grid-cols-2 gap-3">
        <FormGroup label="Unité">
          <Select value={unite} onChange={(e) => setUnite(e.target.value)}>
            {['sacs', 'm³', 'kg', 'tonnes', 'litres', 'unités'].map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </FormGroup>
        <FormGroup label="Stock initial" hint="À cette date">
          <Input type="number" min="0" step="0.1" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0" />
        </FormGroup>
      </div>
    </Modal>
  )
}

function MvtCell({ total, tone, onClick }) {
  const colors = { green: 'text-green-700', amber: 'text-amber-700' }
  return (
    <td className="px-2 py-1.5 text-center">
      <button type="button" onClick={onClick}
        className="mx-auto flex min-w-[4rem] flex-col items-center rounded-lg border border-gray-200 px-2 py-1 hover:border-secondary hover:bg-violet-50">
        <span className={`font-bold ${colors[tone]}`}>{total}</span>
      </button>
    </td>
  )
}

function MouvementModal({ modal, stock, user, peutSaisir, onClose, onChange }) {
  if (!modal) return null
  const { id, dir, nom, unite } = modal
  const field = dir === 'entree' ? 'entrees' : 'consommations'
  const lignes = stock[id]?.[field] || []
  const peutEditer = (l) => peutSaisir && user && peutModifierLigne(l, user.uid)
  const titles = { entree: '⬇️ Achats / Entrées', conso: '⬆️ Consommation production' }

  const addLigne = () => onChange(field, [...lignes, { qte: 1, cout: 0, label: '', agentId: user?.uid, agentNom: user?.nom }])
  const setLigne = (i, patch) => { if (peutEditer(lignes[i])) onChange(field, lignes.map((l, k) => (k === i ? { ...l, ...patch } : l))) }
  const delLigne = (i) => { if (peutEditer(lignes[i])) onChange(field, lignes.filter((_, k) => k !== i)) }

  return (
    <Modal open onClose={onClose} title={`${titles[dir]} — ${nom}`} footer={<Button onClick={onClose}>Terminer</Button>}>
      <p className="mb-3 text-sm text-gray-500">Unité : <strong>{unite}</strong></p>
      <div className="space-y-2">
        {lignes.map((l, i) => {
          const locked = !peutEditer(l)
          return (
            <div key={i} className={`rounded-lg border p-2 ${locked ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200'}`}>
              {locked && l.agentNom && <p className="mb-1 text-[10px] font-semibold text-amber-700"><Lock size={10} /> {l.agentNom}</p>}
              <div className="flex gap-2">
                <Input type="number" min="0" step="0.1" className="w-24" value={l.qte} readOnly={locked} onChange={(e) => setLigne(i, { qte: parseFloat(e.target.value) || 0 })} />
                {dir === 'entree' && (
                  <Input type="number" min="0" className="flex-1" placeholder="Coût unitaire (FCFA)" value={l.cout || ''} readOnly={locked}
                    onChange={(e) => setLigne(i, { cout: parseFloat(e.target.value) || 0 })} />
                )}
                {!locked && <button onClick={() => delLigne(i)} className="text-red-500"><Trash2 size={16} /></button>}
              </div>
              <Input className="mt-2" placeholder="Motif / référence" value={l.label || ''} readOnly={locked} onChange={(e) => setLigne(i, { label: e.target.value })} />
            </div>
          )
        })}
      </div>
      {peutSaisir && <Button variant="outline" size="sm" className="mt-3" onClick={addLigne}><Plus size={15} /> Ajouter</Button>}
    </Modal>
  )
}

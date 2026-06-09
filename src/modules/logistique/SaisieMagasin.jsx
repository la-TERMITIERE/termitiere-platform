// Saisie magasin — EF Initial · Achats · Sorties (autorisées) · Retours · EF Final.
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Save, Send, CheckCircle2, Plus, Trash2, Lock } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useLogistiqueStore } from './store/referentielStore'
import { setItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, formatDateTime } from '../../utils/formatters'
import { CAT_MATERIEL, catColor } from './data'
import {
  previousInventoryDate, getInventaire, autoSorties, agregerMateriel, sommeMouvements,
  mouvementsDepuisSaisie, mergeMouvementsUtilisateur, peutModifierLigne, annoterLignesAgent,
  ENTREE_TYPES, SORTIE_TYPES_SAISIE, RETOUR_TYPES, sommeType
} from './logic'

export default function SaisieMagasin() {
  const { user, role } = useAuth()
  const { data: inventaires } = useCollection('logistique_inventaires')
  const { data: demandes } = useCollection('logistique_demandes')
  const materiel = useLogistiqueStore((s) => s.materiel)

  const [date, setDate] = useState(todayStr())
  const [stock, setStock] = useState({})
  const [saving, setSaving] = useState(false)
  const [mvtModal, setMvtModal] = useState(null) // { id, dir, nom, unite }

  const peutEditerInit = role === 'admin' || role === 'controleur'

  useEffect(() => {
    const inv = getInventaire(inventaires, date) || { materiels: {} }
    const prevDate = previousInventoryDate(inventaires, date)
    const prevInv = prevDate ? getInventaire(inventaires, prevDate) : null

    const s = {}
    materiel.forEach((m) => {
      const saved = inv.materiels?.[m.id]
      const { entrees, sorties, retours } = mouvementsDepuisSaisie(saved)
      const init = saved?.init !== undefined ? saved.init : prevInv?.materiels?.[m.id]?.fin ?? 0
      s[m.id] = { init, entrees, sorties, retours }
    })
    setStock(s)
  }, [date, inventaires, materiel])

  const existing = getInventaire(inventaires, date)
  const dejaSaisi = existing?.savedAt
  const autoSorOf = (id) => autoSorties(demandes, id, date)

  const cats = useMemo(() => {
    const custom = [...new Set(materiel.map((m) => m.cat))].filter((c) => !CAT_MATERIEL.includes(c))
    return [...CAT_MATERIEL, ...custom].filter((c) => materiel.some((m) => m.cat === c))
  }, [materiel])

  const setInit = (id, val) => {
    setStock((s) => ({ ...s, [id]: { ...s[id], init: Math.max(0, parseInt(val) || 0) } }))
  }

  const setLignes = (id, dir, lignes) => {
    if (!user) return
    const field = dir === 'entree' ? 'entrees' : dir === 'sortie' ? 'sorties' : 'retours'
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
      const materiels = {}
      materiel.forEach((m) => {
        const d = stock[m.id] || { init: 0, entrees: [], sorties: [], retours: [] }
        const autoSor = autoSorOf(m.id)
        const agg = agregerMateriel(d, autoSor)
        materiels[m.id] = {
          ...agg,
          entrees: annoterLignesAgent(d.entrees || [], user.uid, user.nom),
          sorties: annoterLignesAgent(d.sorties || [], user.uid, user.nom),
          retours: annoterLignesAgent(d.retours || [], user.uid, user.nom),
          autoSor
        }
      })
      await setItem('logistique_inventaires', date, {
        date, agentId: user.uid, agentNom: user.nom, savedAt: ts(), materiels
      })
      await audit('logistique', 'SAISIE_MAGASIN', `Saisie magasin du ${date}`)
      toast.success('Saisie enregistrée ✓')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
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
          <Link to="/logistique/demandes"><Button variant="outline"><Send size={16} /> Demander une sortie</Button></Link>
          <Button onClick={save} loading={saving}><Save size={16} /> Enregistrer</Button>
        </div>
      </div>

      {dejaSaisi && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 size={16} />
          Saisie du {formatDateTime(existing.savedAt)} — chaque agent modifie uniquement ses mouvements
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="max-h-[calc(100vh-14rem)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase text-gray-500 shadow-sm">
              <tr>
                <th className="bg-gray-50 px-3 py-2 text-left">Matériel</th>
                <th className="bg-gray-50 px-2 py-2 text-center">EF Initial 🔒</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Achats</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Sorties</th>
                <th className="bg-gray-50 px-2 py-2 text-center">Retours</th>
                <th className="bg-gray-50 px-2 py-2 text-center">EF Final 🔒</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cats.map((cat) => (
                <Fragment key={cat}>
                  <tr>
                    <td colSpan={6} className="px-3 py-1.5 text-xs font-bold uppercase text-white" style={{ background: catColor(cat) }}>{cat}</td>
                  </tr>
                  {materiel.filter((m) => m.cat === cat).map((m) => {
                    const d = stock[m.id] || { init: 0, entrees: [], sorties: [], retours: [] }
                    const autoSor = autoSorOf(m.id)
                    const totEnt = sommeMouvements(d.entrees)
                    const totSor = sommeMouvements(d.sorties) + autoSor
                    const totRet = sommeMouvements(d.retours)
                    const fin = Math.max(0, (d.init || 0) + totEnt - totSor + sommeType(d.retours, 'OK'))
                    return (
                      <tr key={m.id}>
                        <td className="px-3 py-1.5 font-semibold">{m.nom} <span className="text-[10px] text-gray-400">({m.unite})</span></td>
                        <td className="px-2 py-1.5 text-center">
                          <input type="number" min="0" value={d.init ?? 0} readOnly={!peutEditerInit}
                            onChange={(e) => setInit(m.id, e.target.value)}
                            className={`w-16 rounded border px-1 py-1 text-center text-sm ${peutEditerInit ? '' : 'num-readonly cursor-not-allowed'}`} />
                        </td>
                        <MvtCell total={totEnt} tone="green" onClick={() => setMvtModal({ id: m.id, dir: 'entree', nom: m.nom, unite: m.unite })} />
                        <MvtCell total={sommeMouvements(d.sorties)} tone="amber" sub={autoSor > 0 ? `+${autoSor} auto` : null}
                          onClick={() => setMvtModal({ id: m.id, dir: 'sortie', nom: m.nom, unite: m.unite })} />
                        <MvtCell total={totRet} tone="sky" onClick={() => setMvtModal({ id: m.id, dir: 'retour', nom: m.nom, unite: m.unite })} />
                        <td className="px-2 py-1.5 text-center font-bold text-secondary">{fin}</td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <MouvementModal
        modal={mvtModal}
        stock={stock}
        autoSor={mvtModal ? autoSorOf(mvtModal.id) : 0}
        user={user}
        onClose={() => setMvtModal(null)}
        onChange={(lignes) => setLignes(mvtModal.id, mvtModal.dir, lignes)}
      />
    </div>
  )
}

function MvtCell({ total, tone, onClick, sub }) {
  const colors = { green: 'text-green-700', amber: 'text-amber-700', sky: 'text-sky-700' }
  return (
    <td className="px-2 py-1.5 text-center">
      <button type="button" onClick={onClick}
        className="mx-auto flex min-w-[4rem] flex-col items-center rounded-lg border border-gray-200 px-2 py-1 hover:border-secondary hover:bg-sky-50">
        <span className={`font-bold ${colors[tone]}`}>{total}</span>
        {sub && <span className="text-[9px] text-gray-400">{sub}</span>}
      </button>
    </td>
  )
}

function MouvementModal({ modal, stock, autoSor, user, onClose, onChange }) {
  if (!modal) return null
  const { id, dir, nom, unite } = modal
  const field = dir === 'entree' ? 'entrees' : dir === 'sortie' ? 'sorties' : 'retours'
  const lignes = stock[id]?.[field] || []
  const types = dir === 'entree' ? ENTREE_TYPES : dir === 'sortie' ? SORTIE_TYPES_SAISIE : RETOUR_TYPES
  const peutEditer = (l) => user && peutModifierLigne(l, user.uid)

  const titles = { entree: '⬇️ Achats', sortie: '⬆️ Sorties', retour: '🔄 Retours' }

  const addLigne = () => {
    const base = { type: types[0], qte: 1, label: '' }
    if (dir === 'entree') base.cout = 0
    onChange([...lignes, { ...base, agentId: user?.uid, agentNom: user?.nom }])
  }
  const setLigne = (i, patch) => { if (peutEditer(lignes[i])) onChange(lignes.map((l, k) => (k === i ? { ...l, ...patch } : l))) }
  const delLigne = (i) => { if (peutEditer(lignes[i])) onChange(lignes.filter((_, k) => k !== i)) }

  return (
    <Modal open onClose={onClose} title={`${titles[dir]} — ${nom}`} footer={<Button onClick={onClose}>Terminer</Button>}>
      <p className="mb-3 text-sm text-gray-500">Unité : <strong>{unite}</strong></p>
      {dir === 'sortie' && (
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
          Les sorties de <strong>location</strong> passent par facture + autorisation hiérarchique. Seuls les ajustements manuels sont saisis ici.
          {autoSor > 0 && <span className="mt-1 block">{autoSor} sortie(s) auto (demandes approuvées).</span>}
        </p>
      )}
      {dir === 'retour' && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>OK</strong> = réintègre le stock · <strong>Cassé</strong> / <strong>Perdu</strong> = ne réintègre pas (suivi des pertes)
        </p>
      )}
      <div className="space-y-2">
        {lignes.map((l, i) => {
          const locked = !peutEditer(l)
          return (
            <div key={i} className={`rounded-lg border p-2 ${locked ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200'}`}>
              {locked && l.agentNom && <p className="mb-1 text-[10px] font-semibold text-amber-700"><Lock size={10} /> {l.agentNom}</p>}
              <div className="flex gap-2">
                <Select className="flex-1" value={l.type} disabled={locked} onChange={(e) => setLigne(i, { type: e.target.value })}>
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
                <Input type="number" min="0" className="w-20" value={l.qte} readOnly={locked} onChange={(e) => setLigne(i, { qte: parseInt(e.target.value) || 0 })} />
                {!locked && <button onClick={() => delLigne(i)} className="text-red-500"><Trash2 size={16} /></button>}
              </div>
              {dir === 'entree' && (
                <Input className="mt-2" type="number" min="0" placeholder="Coût unitaire (FCFA)" value={l.cout || ''} readOnly={locked}
                  onChange={(e) => setLigne(i, { cout: parseFloat(e.target.value) || 0 })} />
              )}
              <Input className="mt-2" placeholder="Motif / référence" value={l.label || ''} readOnly={locked} onChange={(e) => setLigne(i, { label: e.target.value })} />
            </div>
          )
        })}
      </div>
      <Button variant="outline" size="sm" className="mt-3" onClick={addLigne}><Plus size={15} /> Ajouter</Button>
    </Modal>
  )
}

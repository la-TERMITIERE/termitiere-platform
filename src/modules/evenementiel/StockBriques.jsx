// Stock briques — appatam → séchage → prêtes · caillasses.
import { useEffect, useState } from 'react'
import { ArrowRight, Save, AlertTriangle, Plus } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useBriqueterieStore } from './store/referentielStore'
import { setItem, ts, addItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, formatDateShort, genId } from '../../utils/formatters'
import { ETATS_BRIQUE, DUREE_SECHAGE_JOURS } from './data'
import { getInventaire, previousInventoryDate, joursDepuis } from './logic'

const TRANSITIONS = [
  { from: 'appatam', to: 'sechage', label: 'Vers séchage (extérieur)' },
  { from: 'sechage', to: 'pret', label: 'Prêtes à vendre' }
]

// Casse pendant la manutention : les briques cassées quittent leur état et
// s'ajoutent au total caillasses (vendues séparément).
const CASSE_TRANSITIONS = [
  { from: 'appatam', to: 'caillasses' },
  { from: 'sechage', to: 'caillasses' },
  { from: 'pret', to: 'caillasses' }
]

export default function StockBriques() {
  const { user, role } = useAuth()
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const { data: transferts } = useCollection('evenementiel_transferts')
  const briques = useBriqueterieStore((s) => s.briques)
  const saveBrique = useBriqueterieStore((s) => s.saveBrique)

  const [date, setDate] = useState(todayStr())
  const [stock, setStock] = useState({})
  const [saving, setSaving] = useState(false)
  const [transferModal, setTransferModal] = useState(null)
  const [addModal, setAddModal] = useState(false)

  const peutSaisir = role === 'agent'

  useEffect(() => {
    const inv = getInventaire(inventaires, date) || { briques: {} }
    const prevDate = previousInventoryDate(inventaires, date)
    const prevInv = prevDate ? getInventaire(inventaires, prevDate) : null
    const s = {}
    briques.forEach((b) => {
      // Stock du jour si saisi, sinon report de la veille (solde d'ouverture si rien).
      const saved = inv.briques?.[b.id] || prevInv?.briques?.[b.id]
      s[b.id] = {
        appatam: saved?.appatam || 0,
        sechage: saved?.sechage || 0,
        pret: saved?.pret || 0,
        caillasses: saved?.caillasses || 0
      }
    })
    setStock(s)
  }, [date, inventaires, briques])

  // Édition directe d'un état (solde existant / ouverture).
  const setEtat = (briqueId, etat, val) => {
    setStock((s) => ({ ...s, [briqueId]: { ...s[briqueId], [etat]: Math.max(0, parseInt(val) || 0) } }))
  }

  // Création d'un nouveau type de brique depuis le stock.
  function handleAddBrique({ nom, tarifVente }) {
    const base = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24)
    const id = (base || 'brique') + '_' + genId().slice(0, 3).toLowerCase()
    saveBrique({ id, nom: nom.trim(), tarifVente: parseFloat(tarifVente) || 0 })
    setAddModal(false)
    toast.success(`${nom.trim()} ajouté ✓`)
  }

  async function save() {
    if (!user) return
    setSaving(true)
    try {
      const inv = getInventaire(inventaires, date) || {}
      await setItem('evenementiel_inventaires', date, {
        ...inv, date, briques: stock, savedAt: ts(), agentId: user.uid, agentNom: user.nom,
        matieres: inv.matieres || {}
      })
      await audit('evenementiel', 'STOCK_BRIQUES', `Stock briques du ${date}`)
      toast.success('Stock enregistré ✓')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function executerTransfert() {
    const { briqueId, from, to, qte, dateSechage } = transferModal
    const q = parseInt(qte) || 0
    if (!q) return toast.error('Quantité requise')
    const cur = stock[briqueId] || {}
    if ((cur[from] || 0) < q) return toast.error(`Stock ${from} insuffisant`)

    if (from === 'sechage' && to === 'pret' && dateSechage) {
      const jours = joursDepuis(dateSechage)
      if (jours < DUREE_SECHAGE_JOURS) {
        toast.warning(`Attention : seulement ${jours} jour(s) de séchage (recommandé : ${DUREE_SECHAGE_JOURS}–6 jours)`)
      }
    }

    setStock((s) => {
      const src = { ...s[briqueId], [from]: (s[briqueId][from] || 0) - q }
      // Casse : la quantité s'ajoute au total caillasses (ligne « caillasses »).
      if (to === 'caillasses') {
        const cc = s.caillasses || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
        return { ...s, [briqueId]: src, caillasses: { ...cc, caillasses: (cc.caillasses || 0) + q } }
      }
      return { ...s, [briqueId]: { ...src, [to]: (s[briqueId][to] || 0) + q } }
    })

    await addItem('evenementiel_transferts', {
      date: todayStr(), briqueId,
      briqueNom: briques.find((b) => b.id === briqueId)?.nom,
      from, to, qte: q, dateSechage: dateSechage || '',
      agentNom: user.nom
    })

    toast.success('Transfert enregistré — n\'oubliez pas de sauvegarder le stock')
    setTransferModal(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Date</label>
          <input type="date" className="input-base w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-2">
          {peutSaisir && <Button variant="outline" onClick={() => setAddModal(true)}><Plus size={16} /> Ajouter un type</Button>}
          {peutSaisir && <Button onClick={save} loading={saving}><Save size={16} /> Enregistrer</Button>}
        </div>
      </div>

      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Séchage :</strong> 5 à 6 jours recommandés avant chargement pour limiter les casses.
        Les <strong>caillasses</strong> (briques cassées) sont vendues séparément.
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Catégorie</th>
                {ETATS_BRIQUE.map((e) => (
                  <th key={e.id} className="px-2 py-2 text-center" style={{ color: e.color }}>{e.label.split(' ')[0]}</th>
                ))}
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {briques.map((b) => {
                const d = stock[b.id] || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
                return (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-semibold">{b.nom}</td>
                    <EtatCell value={d.appatam} editable={peutSaisir && b.id !== 'caillasses'} disabled={b.id === 'caillasses'} color="#7c3aed" onChange={(v) => setEtat(b.id, 'appatam', v)} />
                    <EtatCell value={d.sechage} editable={peutSaisir && b.id !== 'caillasses'} disabled={b.id === 'caillasses'} color="#b45309" onChange={(v) => setEtat(b.id, 'sechage', v)} />
                    <EtatCell value={d.pret} editable={peutSaisir && b.id !== 'caillasses'} disabled={b.id === 'caillasses'} color="#15803d" onChange={(v) => setEtat(b.id, 'pret', v)} />
                    <EtatCell value={d.caillasses} editable={peutSaisir && b.id === 'caillasses'} disabled={b.id !== 'caillasses'} color="#4b5563" onChange={(v) => setEtat(b.id, 'caillasses', v)} />
                    <td className="px-2 py-2">
                      {b.id !== 'caillasses' && peutSaisir && TRANSITIONS.filter((t) => (d[t.from] || 0) > 0).map((t) => (
                        <button key={t.to} onClick={() => setTransferModal({ briqueId: b.id, briqueNom: b.nom, from: t.from, to: t.to, qte: 1, dateSechage: '' })}
                          className="mr-1 mb-1 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold hover:bg-violet-100">
                          {t.from}→{t.to}
                        </button>
                      ))}
                      {b.id !== 'caillasses' && peutSaisir && CASSE_TRANSITIONS.filter((t) => (d[t.from] || 0) > 0).map((t) => (
                        <button key={'casse-' + t.from} onClick={() => setTransferModal({ briqueId: b.id, briqueNom: b.nom, from: t.from, to: 'caillasses', qte: 1, dateSechage: '' })}
                          className="mr-1 mb-1 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-amber-100">
                          {t.from}→caillasses
                        </button>
                      ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Historique des transferts" className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Brique</th><th className="px-3 py-2">Mouvement</th><th className="px-3 py-2">Qté</th><th className="px-3 py-2">Agent</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[...transferts].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20).map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2">{formatDateShort(t.date)}</td>
                <td className="px-3 py-2 font-semibold">{t.briqueNom}</td>
                <td className="px-3 py-2">{t.from} <ArrowRight size={12} className="inline" /> {t.to}</td>
                <td className="px-3 py-2 text-center">{t.qte}</td>
                <td className="px-3 py-2 text-xs">{t.agentNom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={!!transferModal} onClose={() => setTransferModal(null)} title={`Transfert — ${transferModal?.briqueNom}`}
        footer={<><Button variant="ghost" onClick={() => setTransferModal(null)}>Annuler</Button><Button onClick={executerTransfert}>Confirmer</Button></>}>
        {transferModal && (
          <div className="space-y-3">
            <p className="text-sm">{transferModal.from} → <strong>{transferModal.to}</strong></p>
            <FormGroup label="Quantité"><Input type="number" min="1" max={stock[transferModal.briqueId]?.[transferModal.from] || 0}
              value={transferModal.qte} onChange={(e) => setTransferModal((m) => ({ ...m, qte: e.target.value }))} /></FormGroup>
            {transferModal.from === 'sechage' && transferModal.to === 'pret' && (
              <>
                <FormGroup label="Date mise en séchage">
                  <Input type="date" value={transferModal.dateSechage} onChange={(e) => setTransferModal((m) => ({ ...m, dateSechage: e.target.value }))} />
                </FormGroup>
                {transferModal.dateSechage && joursDepuis(transferModal.dateSechage) < DUREE_SECHAGE_JOURS && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle size={14} /> Séchage &lt; {DUREE_SECHAGE_JOURS} jours — risque de casse au chargement
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      <AddBriqueModal open={addModal} onClose={() => setAddModal(false)} onSave={handleAddBrique} />
    </div>
  )
}

// Cellule d'état du stock : éditable (input) ou en lecture seule selon les droits.
function EtatCell({ value = 0, editable, disabled, color, onChange }) {
  if (disabled) return <td className="px-2 py-2 text-center font-bold text-gray-300">—</td>
  if (!editable) return <td className="px-2 py-2 text-center font-bold" style={{ color }}>{value || 0}</td>
  return (
    <td className="px-2 py-2 text-center">
      <input type="number" min="0" value={value || 0} onChange={(e) => onChange(e.target.value)}
        className="w-16 rounded border border-gray-200 px-1 py-1 text-center text-sm font-bold focus:border-secondary focus:outline-none"
        style={{ color }} />
    </td>
  )
}

// Fenêtre de création d'un type de brique.
function AddBriqueModal({ open, onClose, onSave }) {
  const [nom, setNom] = useState('')
  const [tarifVente, setTarifVente] = useState('')

  useEffect(() => { if (open) { setNom(''); setTarifVente('') } }, [open])

  function submit() {
    if (!nom.trim()) return toast.error('Nom requis')
    onSave({ nom, tarifVente })
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un type de brique"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit}>Ajouter</Button></>}>
      <FormGroup label="Nom du type" required>
        <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex : 20 creux" autoFocus />
      </FormGroup>
      <FormGroup label="Tarif de vente unitaire" hint="FCFA">
        <Input type="number" min="0" value={tarifVente} onChange={(e) => setTarifVente(e.target.value)} placeholder="0" />
      </FormGroup>
    </Modal>
  )
}

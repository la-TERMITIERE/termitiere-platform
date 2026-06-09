// Stock briques — appatam → séchage → prêtes · caillasses.
import { useEffect, useState } from 'react'
import { ArrowRight, Save, AlertTriangle } from 'lucide-react'
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
import { todayStr, formatDateShort } from '../../utils/formatters'
import { ETATS_BRIQUE, DUREE_SECHAGE_JOURS } from './data'
import { getInventaire, joursDepuis } from './logic'

const TRANSITIONS = [
  { from: 'appatam', to: 'sechage', label: 'Vers séchage (extérieur)' },
  { from: 'sechage', to: 'pret', label: 'Prêtes à vendre' }
]

export default function StockBriques() {
  const { user } = useAuth()
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const { data: transferts } = useCollection('evenementiel_transferts')
  const briques = useBriqueterieStore((s) => s.briques)

  const [date, setDate] = useState(todayStr())
  const [stock, setStock] = useState({})
  const [saving, setSaving] = useState(false)
  const [transferModal, setTransferModal] = useState(null)

  useEffect(() => {
    const inv = getInventaire(inventaires, date) || { briques: {} }
    const s = {}
    briques.forEach((b) => {
      const saved = inv.briques?.[b.id]
      s[b.id] = saved || { appatam: 0, sechage: 0, pret: 0, caillasses: b.id === 'caillasses' ? 0 : 0 }
      if (b.id === 'caillasses') s[b.id] = saved || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
    })
    setStock(s)
  }, [date, inventaires, briques])

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

    setStock((s) => ({
      ...s,
      [briqueId]: {
        ...s[briqueId],
        [from]: (s[briqueId][from] || 0) - q,
        [to]: (s[briqueId][to] || 0) + q
      }
    }))

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
        <Button className="ml-auto" onClick={save} loading={saving}><Save size={16} /> Enregistrer</Button>
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
                    <td className="px-2 py-2 text-center font-bold text-violet-700">{d.appatam || 0}</td>
                    <td className="px-2 py-2 text-center font-bold text-amber-700">{d.sechage || 0}</td>
                    <td className="px-2 py-2 text-center font-bold text-green-700">{d.pret || 0}</td>
                    <td className="px-2 py-2 text-center font-bold text-gray-600">{b.id === 'caillasses' ? (d.caillasses || 0) : '—'}</td>
                    <td className="px-2 py-2">
                      {b.id !== 'caillasses' && TRANSITIONS.filter((t) => (d[t.from] || 0) > 0).map((t) => (
                        <button key={t.to} onClick={() => setTransferModal({ briqueId: b.id, briqueNom: b.nom, from: t.from, to: t.to, qte: 1, dateSechage: '' })}
                          className="mr-1 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold hover:bg-violet-100">
                          {t.from}→{t.to}
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

      <Card title="Historique des transferts" className="p-0">
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
    </div>
  )
}

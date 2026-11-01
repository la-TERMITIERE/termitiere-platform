// TRÉSORERIE — Rapprochement bancaire (aligné FEZIRE /accounting/bank-reconciliation) :
// on saisit un relevé (date + solde), on pointe les mouvements qui y figurent, et l'écart
// restant dit ce qu'il faut justifier (frais non saisis, chèque pas encore passé…).
import { useMemo, useState } from 'react'
import { Scale, Plus, Pencil, Trash2, CheckCircle2 } from 'lucide-react'
import Card from '../../../shared/ui/Card'
import Button from '../../../shared/ui/Button'
import Badge from '../../../shared/ui/Badge'
import Modal from '../../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../../core/db'
import { audit } from '../../../core/audit'
import { formatMoney, formatDateShort, todayStr } from '../../../utils/formatters'
import { useAuth } from '../../../hooks/useAuth'
import BandeauCompta, { BoutonBande } from '../BandeauCompta'
import { useTresorerie } from './useTresorerie'
import { COL_TRESO, rapprochement } from './logic'
import { Champ, MontantSigne } from './ui'

export default function Rapprochement() {
  const user = useAuth((s) => s.user)
  const { soldes, flux, releves, loading } = useTresorerie()
  const comptesRappro = soldes.filter((c) => c.type === 'BANQUE' || c.type === 'MOBILE_MONEY')
  const [compteId, setCompteId] = useState('')
  const compte = comptesRappro.find((c) => c.id === (compteId || comptesRappro[0]?.id))
  const [edition, setEdition] = useState(null)
  const liste = useMemo(() => releves.filter((r) => r.compteId === compte?.id).sort((a, b) => String(b.date).localeCompare(String(a.date))), [releves, compte])

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>
  return (
    <div className="space-y-5">
      <BandeauCompta icone={Scale} titre="Rapprochement bancaire" sous="Rapprochez les flux de vos comptes bancaires et Mobile Money avec vos relevés réels.">
        <select value={compte?.id || ''} onChange={(e) => setCompteId(e.target.value)} className="rounded-2xl border border-white/40 bg-white/15 px-3 py-2 text-xs font-bold text-white [&>option]:text-gray-800">
          {comptesRappro.length === 0 && <option value="">Aucun compte bancaire</option>}
          {comptesRappro.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        {compte && <BoutonBande icone={Plus} anime onClick={() => setEdition({ compteId: compte.id, date: todayStr(), soldeReleve: '', reference: '', pointes: [] })}>Saisir un relevé</BoutonBande>}
      </BandeauCompta>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Historique des relevés {compte ? `: ${compte.nom}` : ''}</p><p className="text-xs text-gray-500">Registre de tous les rapprochements de ce compte. Solde comptable actuel : <b>{formatMoney(compte?.solde || 0)}</b>.</p></div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Date du relevé</th><th className="px-3 py-2">Référence</th><th className="px-3 py-2 text-right">Solde relevé</th><th className="px-3 py-2 text-right">Solde comptable</th><th className="px-3 py-2 text-right">Écart</th><th className="px-3 py-2">Statut</th><th className="w-20"></th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {liste.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Aucun relevé enregistré pour ce compte.</td></tr>}
            {liste.map((r) => {
              const rp = rapprochement(r, flux, compte?.soldeInitial || 0)
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs">{formatDateShort(r.date)}</td><td className="px-3 py-2 text-xs">{r.reference || '—'}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(rp.soldeReleve)}</td><td className="px-3 py-2 text-right">{formatMoney(rp.soldeComptable)}</td>
                  <td className={`px-3 py-2 text-right font-bold ${rp.ecart ? 'text-red-600' : 'text-green-700'}`}>{formatMoney(rp.ecart)}</td>
                  <td className="px-3 py-2">{rp.ecartPointe === 0 ? <Badge tone="success">Rapproché</Badge> : <Badge tone="warning">{rp.nbPointes} pointé(s)</Badge>}</td>
                  <td className="px-2 py-2"><div className="flex justify-end gap-1">
                    <button title="Pointer" onClick={() => setEdition({ ...r })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={14} /></button>
                    <button title="Supprimer" onClick={async () => { if (confirm('Supprimer ce relevé ?')) await removeItem(COL_TRESO.releves, r.id) }} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <ReleveModal valeur={edition} onClose={() => setEdition(null)} flux={flux} compte={compte} user={user} />
    </div>
  )
}

function ReleveModal({ valeur, onClose, flux, compte, user }) {
  const [v, setV] = useState(null)
  const cur = v && v.__src === valeur ? v : (valeur ? { ...valeur, __src: valeur } : null)
  const maj = (p) => setV({ ...cur, ...p })
  const rp = cur ? rapprochement({ ...cur, soldeReleve: Number(cur.soldeReleve) || 0 }, flux, compte?.soldeInitial || 0) : null
  const candidats = cur ? flux.filter((f) => f.compteId === cur.compteId && f.date <= cur.date).slice().reverse() : []
  const pointes = new Set(cur?.pointes || [])
  const basculer = (id) => maj({ pointes: pointes.has(id) ? cur.pointes.filter((x) => x !== id) : [...(cur.pointes || []), id] })
  const enregistrer = async () => {
    const doc = { compteId: cur.compteId, date: cur.date, soldeReleve: Number(cur.soldeReleve) || 0, reference: cur.reference || '', pointes: cur.pointes || [] }
    if (cur.id) await updateItem(COL_TRESO.releves, cur.id, doc)
    else await addItem(COL_TRESO.releves, { ...doc, creePar: user?.nom || '' })
    await audit('comptabilite', 'RAPPROCHEMENT', `${compte?.nom} au ${doc.date} : écart ${formatMoney(rp.ecart)}`)
    onClose()
  }
  return (
    <Modal open={!!cur} onClose={onClose} size="lg" title={cur?.id ? 'Pointer le relevé' : 'Saisir un relevé'}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={enregistrer}>Enregistrer</Button></>}>
      {cur && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Champ label="Date du relevé"><input type="date" value={cur.date} onChange={(e) => maj({ date: e.target.value })} className="input-base" /></Champ>
            <Champ label="Solde du relevé"><input type="number" value={cur.soldeReleve} onChange={(e) => maj({ soldeReleve: e.target.value })} className="input-base" /></Champ>
            <Champ label="Référence"><input value={cur.reference} onChange={(e) => maj({ reference: e.target.value })} className="input-base" placeholder="N° du relevé" /></Champ>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-gray-50 p-2"><p className="text-gray-500">Solde comptable</p><p className="font-bold">{formatMoney(rp.soldeComptable)}</p></div>
            <div className={`rounded-xl p-2 ${rp.ecart ? 'bg-red-50' : 'bg-green-50'}`}><p className="text-gray-500">Écart total</p><p className="font-bold">{formatMoney(rp.ecart)}</p></div>
            <div className={`rounded-xl p-2 ${rp.ecartPointe ? 'bg-amber-50' : 'bg-green-50'}`}><p className="text-gray-500">Écart après pointage</p><p className="font-bold">{rp.ecartPointe === 0 ? <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 size={13} /> Rapproché</span> : formatMoney(rp.ecartPointe)}</p></div>
          </div>
          <p className="text-xs text-gray-500">Cochez les mouvements qui figurent sur le relevé. Ceux qui restent décochés expliquent l'écart.</p>
          <div className="max-h-72 overflow-auto rounded-xl border border-gray-100">
            {candidats.length === 0 && <p className="px-3 py-6 text-center text-sm text-gray-400">Aucun mouvement sur ce compte avant cette date.</p>}
            {candidats.map((f) => (
              <label key={f.id} className="flex cursor-pointer items-center gap-2 border-b border-gray-50 px-3 py-1.5 text-sm hover:bg-gray-50">
                <input type="checkbox" checked={pointes.has(f.id)} onChange={() => basculer(f.id)} />
                <span className="w-20 font-mono text-xs">{formatDateShort(f.date)}</span><span className="flex-1 truncate">{f.libelle}</span><MontantSigne sens={f.sens} montant={f.montant} />
              </label>
            ))}
          </div>
          {candidats.length > 0 && <button type="button" className="text-xs font-semibold text-orange-600" onClick={() => maj({ pointes: candidats.map((f) => f.id) })}>Tout pointer</button>}
        </div>
      )}
    </Modal>
  )
}

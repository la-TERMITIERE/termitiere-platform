// Modal d'ajustement d'un écart (hiérarchie) : pour chaque ligne de la facture,
// quantités réellement vendues + mortes au marché ; le reliquat est retourné au stock.
import { useState } from 'react'
import { Check, Clock } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import Input from '../../shared/forms/Input'
import { toast } from '../../core/notifications'

export default function EcartModal({ facture, onClose, onSubmit, busy }) {
  const lignes = (facture?.lignes || []).map((l, i) => ({ ...l, _idx: i })).filter((l) => l.articleId && (parseInt(l.qte) || 0) > 0)
  const [vals, setVals] = useState({})

  const initIfNeeded = (idx, qte) => vals[idx] || { sold: qte, dead: 0 }
  const set = (idx, patch, qte) => setVals((v) => ({ ...v, [idx]: { ...initIfNeeded(idx, qte), ...patch } }))

  function submit() {
    const ajustements = lignes.map((l) => {
      const cur = vals[l._idx] || { sold: parseInt(l.qte) || 0, dead: 0 }
      return { ligneIdx: l._idx, sold: Math.max(0, parseInt(cur.sold) || 0), dead: Math.max(0, parseInt(cur.dead) || 0) }
    })
    for (const l of lignes) {
      const aj = ajustements.find((a) => a.ligneIdx === l._idx)
      if (aj.sold + aj.dead > (parseInt(l.qte) || 0)) {
        return toast.error(`${l.article} : vendus + morts dépasse la quantité sortie (${l.qte})`)
      }
    }
    onSubmit(facture, ajustements)
  }

  return (
    <Modal open={!!facture} onClose={onClose} size="lg"
      title={facture ? `Ajuster l'écart — ${facture.numero}` : ''}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={submit} loading={busy}><Check size={15} /> Appliquer & réajuster le stock</Button></>}>
      {facture && (
        <div className="space-y-3">
          {facture.ecartMotif && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"><Clock size={14} className="mr-1 inline" />Écart signalé par {facture.ecartSignalePar} : « {facture.ecartMotif} »</p>}
          <p className="text-xs text-gray-500">Indiquez, pour chaque ligne, le nombre réellement <strong>vendu</strong> et le nombre <strong>mort au marché</strong>. Le reliquat (sortie − vendus − morts) est <strong>retourné au stock</strong> (entrée « Retour du marché »).</p>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr><th className="px-3 py-2 text-left">Article</th><th className="px-2 py-2 text-center">Sortis</th><th className="px-2 py-2 text-center">Vendus</th><th className="px-2 py-2 text-center">Morts</th><th className="px-2 py-2 text-center">Retournés</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignes.map((l) => {
                  const cur = vals[l._idx] || { sold: parseInt(l.qte) || 0, dead: 0 }
                  const sold = parseInt(cur.sold) || 0
                  const dead = parseInt(cur.dead) || 0
                  const ret = Math.max(0, (parseInt(l.qte) || 0) - sold - dead)
                  return (
                    <tr key={l._idx}>
                      <td className="px-3 py-1.5 font-semibold">{l.article}</td>
                      <td className="px-2 py-1.5 text-center font-bold">{l.qte}</td>
                      <td className="px-2 py-1.5 text-center"><Input type="number" min="0" className="w-20" value={cur.sold} onChange={(e) => set(l._idx, { sold: e.target.value }, parseInt(l.qte) || 0)} /></td>
                      <td className="px-2 py-1.5 text-center"><Input type="number" min="0" className="w-20" value={cur.dead} onChange={(e) => set(l._idx, { dead: e.target.value }, parseInt(l.qte) || 0)} /></td>
                      <td className="px-2 py-1.5 text-center font-semibold text-sky-700">{ret}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400">Le CA sera calculé sur les quantités <strong>vendues</strong> lors de la certification par l'agent.</p>
        </div>
      )}
    </Modal>
  )
}

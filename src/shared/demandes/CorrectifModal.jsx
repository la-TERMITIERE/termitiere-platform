// Formulaire « Relancer » — l'auteur d'une autorisation CERTIFIÉE corrige les
// quantités qu'il voulait réellement sortir et justifie la reprise. Rien n'est
// appliqué ici : la correction part en validation auprès de la hiérarchie
// (cf. shared/demandes/correctif).
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import FormGroup from '../forms/FormGroup'
import Input from '../forms/Input'
import { formatNumber } from '../../utils/formatters'
import { lignesEditables, sommeQte } from './correctif'

// Le parent ne monte ce composant que lorsqu'il y a une demande à relancer, et
// le remonte via `key` : l'état repart donc des quantités certifiées à chaque
// ouverture, sans effet de synchronisation qui écraserait la saisie en cours.
export default function CorrectifModal({
  onClose, onSubmit, busy = false,
  titre = 'Demander un correctif',
  lignes = [], nomField = 'nom', stockOf
}) {
  const [rows, setRows] = useState(() => lignesEditables(lignes))
  const [motif, setMotif] = useState('')

  const setQte = (i, v) => setRows((r) => r.map((l, j) => (j === i ? { ...l, qte: v } : l)))
  const totalAvant = sommeQte(lignes)
  const totalApres = sommeQte(rows)

  return (
    <Modal open onClose={onClose} title={titre}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="warning" loading={busy} onClick={() => onSubmit?.({ lignes: rows.map((l) => ({ ...l, qte: parseInt(l.qte) || 0 })), motif })}>
          <RotateCcw size={15} /> Envoyer le correctif
        </Button>
      </>}>
      <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Cette autorisation est <strong>certifiée</strong> : elle ne peut plus être supprimée. Corrigez les quantités —
        la hiérarchie validera, les anciennes quantités <strong>reviendront au stock</strong> et les nouvelles en seront décomptées.
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
            <tr>
              <th className="px-2 py-1.5 text-left">Article</th>
              <th className="px-2 py-1.5 text-center">Qté certifiée</th>
              <th className="px-2 py-1.5 text-center">Qté corrigée</th>
              {stockOf && <th className="px-2 py-1.5 text-center">Stock actuel</th>}
              <th className="px-2 py-1.5 text-center">Écart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((l, i) => {
              const avant = parseInt(lignes[i]?.qte) || 0
              const delta = (parseInt(l.qte) || 0) - avant
              const stock = stockOf ? stockOf(l) : null
              // Le supplément demandé doit tenir dans le stock encore disponible.
              const ko = stock !== null && delta > stock
              return (
                <tr key={i} className={ko ? 'bg-red-50/50' : ''}>
                  <td className="px-2 py-1.5 font-semibold">{l[nomField] || '—'}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{formatNumber(avant)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <Input type="number" min="0" className="mx-auto w-24 text-center" value={l.qte}
                      onChange={(e) => setQte(i, e.target.value)} />
                  </td>
                  {stockOf && <td className={`px-2 py-1.5 text-center ${ko ? 'font-bold text-red-600' : 'text-gray-500'}`}>{formatNumber(stock || 0)}{ko ? ' ⚠️' : ''}</td>}
                  <td className={`px-2 py-1.5 text-center font-bold ${delta > 0 ? 'text-red-600' : delta < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {delta > 0 ? '+' : ''}{formatNumber(delta)}
                  </td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={5} className="py-3 text-center text-gray-400">Aucune ligne.</td></tr>}
          </tbody>
          <tfoot>
            <tr className="border-t bg-gray-50 text-xs font-bold">
              <td className="px-2 py-1.5">Total</td>
              <td className="px-2 py-1.5 text-center text-gray-500">{formatNumber(totalAvant)}</td>
              <td className="px-2 py-1.5 text-center">{formatNumber(totalApres)}</td>
              {stockOf && <td />}
              <td className={`px-2 py-1.5 text-center ${totalApres - totalAvant > 0 ? 'text-red-600' : totalApres - totalAvant < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                {totalApres - totalAvant > 0 ? '+' : ''}{formatNumber(totalApres - totalAvant)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <FormGroup label="Motif du correctif" required className="mt-3"
        hint="Expliquez l'erreur — la hiérarchie voit ce message avec la demande.">
        <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. : 12 creux prévus, 10 saisis par erreur" />
      </FormGroup>
    </Modal>
  )
}

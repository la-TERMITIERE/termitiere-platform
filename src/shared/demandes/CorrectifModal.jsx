// Formulaire « Relancer » — l'auteur d'une autorisation CERTIFIÉE corrige ce
// qu'il voulait réellement sortir : la QUANTITÉ, l'ARTICLE lui-même (300
// « 10 creux » saisis alors qu'il s'agissait de « 12 creux ») et le PRIX
// UNITAIRE, qui doit rester saisissable — changer d'article propose le tarif du
// référentiel, mais un tarif négocié doit pouvoir passer. Rien n'est appliqué
// ici : la correction part en validation auprès de la hiérarchie
// (cf. shared/demandes/correctif).
import { useState } from 'react'
import { RotateCcw, ArrowRight } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import FormGroup from '../forms/FormGroup'
import Input from '../forms/Input'
import Select from '../forms/Select'
import { formatNumber, formatMoney } from '../../utils/formatters'
import { lignesEditables, sommeQte } from './correctif'

// Le parent ne monte ce composant que lorsqu'il y a une demande à relancer, et
// le remonte via `key` : l'état repart donc des lignes certifiées à chaque
// ouverture, sans effet de synchronisation qui écraserait la saisie en cours.
export default function CorrectifModal({
  onClose, onSubmit, busy = false,
  titre = 'Demander un correctif',
  lignes = [], champs = { key: 'id', nom: 'nom' },
  articles = [], onPickArticle,
  prixField, prixLabel = 'Prix unitaire',
  stockOf
}) {
  const { key, nom } = champs
  const [rows, setRows] = useState(() => lignesEditables(lignes))
  const [motif, setMotif] = useState('')

  const patchRow = (i, patch) => setRows((r) => r.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  // Changer l'article réécrit son identité ; le module décide du reste
  // (tarif, catégorie, unité, type d'article) via `onPickArticle`.
  const setArticle = (i, id) => {
    const art = articles.find((a) => a.id === id)
    if (!art) return
    patchRow(i, { [key]: art.id, [nom]: art.nom, ...(onPickArticle?.(art, rows[i]) || {}) })
  }

  const totalAvant = sommeQte(lignes)
  const totalApres = sommeQte(rows)
  const montantApres = prixField
    ? rows.reduce((s, l) => s + (parseInt(l.qte) || 0) * (parseFloat(l[prixField]) || 0), 0)
    : 0
  const modifiable = articles.length > 0

  return (
    <Modal open onClose={onClose} size="lg" title={titre}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant="warning" loading={busy} onClick={() => onSubmit?.({ lignes: rows.map((l) => ({ ...l, qte: parseInt(l.qte) || 0 })), motif })}>
          <RotateCcw size={15} /> Envoyer le correctif
        </Button>
      </>}>
      <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Cette autorisation est <strong>certifiée</strong> : elle ne peut plus être supprimée. Corrigez
        {modifiable ? <> l'<strong>article</strong>, la <strong>quantité</strong></> : <> la <strong>quantité</strong></>}
        {prixField ? <> et le <strong>prix unitaire</strong></> : null} —
        après validation de la hiérarchie, ce qui était sorti <strong>revient au stock</strong> et ce qui est corrigé en est décompté.
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
            <tr>
              <th className="px-2 py-1.5 text-left">Certifié</th>
              <th className="px-2 py-1.5 text-left">Article corrigé</th>
              <th className="px-2 py-1.5 text-center">Qté corrigée</th>
              {prixField && <th className="px-2 py-1.5 text-center">{prixLabel}</th>}
              {stockOf && <th className="px-2 py-1.5 text-center">Stock actuel</th>}
              <th className="px-2 py-1.5 text-center">Écart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((l, i) => {
              const avant = lignes[i] || {}
              const qteAvant = parseInt(avant.qte) || 0
              const qteApres = parseInt(l.qte) || 0
              const changeArticle = avant[key] !== l[key]
              // Article inchangé : seul le supplément doit tenir en stock.
              // Article remplacé : c'est toute la nouvelle quantité qui sort.
              const besoin = changeArticle ? qteApres : qteApres - qteAvant
              const stock = stockOf ? stockOf(l) : null
              const ko = stock !== null && besoin > stock
              return (
                <tr key={i} className={ko ? 'bg-red-50/50' : ''}>
                  <td className="px-2 py-1.5">
                    <span className={changeArticle ? 'text-gray-400 line-through' : 'font-semibold'}>{avant[nom] || '—'}</span>
                    <span className="block text-[11px] text-gray-400">
                      ×{formatNumber(qteAvant)}
                      {prixField && avant[prixField] != null ? ` · ${formatMoney(parseFloat(avant[prixField]) || 0)}` : ''}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    {modifiable ? (
                      <Select value={l[key] || ''} onChange={(e) => setArticle(i, e.target.value)}>
                        {articles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                      </Select>
                    ) : <span className="font-semibold">{l[nom] || '—'}</span>}
                    {changeArticle && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                        <ArrowRight size={11} /> article remplacé
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <Input type="number" min="0" className="mx-auto w-24 text-center" value={l.qte}
                      onChange={(e) => patchRow(i, { qte: e.target.value })} />
                  </td>
                  {/* Changer d'article propose son tarif du référentiel, mais le prix
                      reste saisissable : une remise ou un tarif négocié doit passer. */}
                  {prixField && (
                    <td className="px-2 py-1.5 text-center">
                      <Input type="number" min="0" className="mx-auto w-28 text-center" value={l[prixField] ?? ''}
                        onChange={(e) => patchRow(i, { [prixField]: e.target.value })} />
                      <span className="mt-0.5 block text-[11px] font-semibold text-gray-500">
                        {formatMoney(qteApres * (parseFloat(l[prixField]) || 0))}
                      </span>
                    </td>
                  )}
                  {stockOf && <td className={`px-2 py-1.5 text-center ${ko ? 'font-bold text-red-600' : 'text-gray-500'}`}>{formatNumber(stock || 0)}{ko ? ' ⚠️' : ''}</td>}
                  <td className="px-2 py-1.5 text-center text-xs font-bold">
                    {changeArticle ? (
                      <span className="text-amber-700">{formatNumber(qteAvant)} rendu(s) · {formatNumber(qteApres)} à sortir</span>
                    ) : (
                      <span className={besoin > 0 ? 'text-red-600' : besoin < 0 ? 'text-green-600' : 'text-gray-400'}>
                        {besoin > 0 ? '+' : ''}{formatNumber(besoin)}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={6} className="py-3 text-center text-gray-400">Aucune ligne.</td></tr>}
          </tbody>
          <tfoot>
            <tr className="border-t bg-gray-50 text-xs font-bold">
              <td className="px-2 py-1.5">Total {formatNumber(totalAvant)}</td>
              <td className="px-2 py-1.5" />
              <td className="px-2 py-1.5 text-center">{formatNumber(totalApres)}</td>
              {prixField && <td className="px-2 py-1.5 text-center text-gray-700">{formatMoney(montantApres)}</td>}
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
        <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. : 300 « 12 creux » commandés, « 10 creux » saisis par erreur" />
      </FormGroup>
    </Modal>
  )
}

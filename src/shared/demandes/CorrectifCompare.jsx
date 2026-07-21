// Vue « avant / après » d'une demande de correctif, présentée à la hiérarchie
// avant qu'elle ne tranche. Montre explicitement le mouvement de stock qui sera
// exécuté : ce qui RENTRE (quantités certifiées annulées) et ce qui RESSORT
// (quantités corrigées).
import { formatNumber } from '../../utils/formatters'

export default function CorrectifCompare({ correctif, deltas = [], stockOf }) {
  if (!correctif) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 px-3 py-2 text-xs text-amber-800">
        <span className="font-bold uppercase tracking-wide">🔄 Demande de correctif</span>
        {correctif.parNom && <span>par <strong>{correctif.parNom}</strong></span>}
        {correctif.le && <span>· {correctif.le}</span>}
      </div>

      {correctif.motif && (
        <p className="px-3 py-2 text-xs italic text-amber-900">« {correctif.motif} »</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-gray-500">
            <tr>
              <th className="px-3 py-1.5 text-left">Article</th>
              <th className="px-2 py-1.5 text-center">Certifié</th>
              <th className="px-2 py-1.5 text-center">Corrigé</th>
              {stockOf && <th className="px-2 py-1.5 text-center">Stock actuel</th>}
              <th className="px-3 py-1.5 text-center">Mouvement de stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {deltas.map((d) => {
              const stock = stockOf ? stockOf(d) : null
              const ko = stock !== null && d.delta > stock
              return (
                <tr key={d.id} className={ko ? 'bg-red-50/60' : ''}>
                  <td className="px-3 py-1.5 font-semibold">{d.nom || d.id}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500 line-through">{formatNumber(d.avant)}</td>
                  <td className="px-2 py-1.5 text-center font-bold">{formatNumber(d.apres)}</td>
                  {stockOf && <td className={`px-2 py-1.5 text-center ${ko ? 'font-bold text-red-600' : 'text-gray-500'}`}>{formatNumber(stock || 0)}{ko ? ' ⚠️' : ''}</td>}
                  <td className="px-3 py-1.5 text-center text-xs">
                    {d.delta === 0
                      ? <span className="text-gray-400">inchangé</span>
                      : d.delta > 0
                        ? <span className="font-bold text-red-600">−{formatNumber(d.delta)} à sortir en plus</span>
                        : <span className="font-bold text-green-600">+{formatNumber(-d.delta)} rendu(s) au stock</span>}
                  </td>
                </tr>
              )
            })}
            {!deltas.length && <tr><td colSpan={5} className="py-3 text-center text-gray-400">Aucune ligne.</td></tr>}
          </tbody>
        </table>
      </div>

      {deltas.some((d) => stockOf && d.delta > (stockOf(d) || 0)) && (
        <p className="px-3 py-2 text-xs font-semibold text-red-700">
          ⚠️ Stock insuffisant pour le supplément demandé sur au moins un article.
        </p>
      )}
    </div>
  )
}

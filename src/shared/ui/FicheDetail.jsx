// Fiche de consultation d'un document — vente, facture, prestation, autorisation.
// Lecture seule : en-tête clé/valeur, tableau de lignes, totaux, encarts libres.
// Responsive : cartes empilées sur téléphone, tableau sur écran large.
import { formatMoney } from '../../utils/formatters'

export default function FicheDetail({
  entetes = [], colonnes = [], lignes = [], pied = [],
  vide = 'Aucune ligne.', children
}) {
  const align = (a) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left')

  return (
    <div className="space-y-3">
      {entetes.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {entetes.filter((e) => e.value !== undefined && e.value !== null && e.value !== '').map((e, i) => (
            <div key={i} className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{e.label}</p>
              <p className="truncate text-sm font-semibold text-gray-800" title={typeof e.value === 'string' ? e.value : undefined}>{e.value}</p>
            </div>
          ))}
        </div>
      )}

      {colonnes.length > 0 && (
        <>
          {/* Téléphone : une carte par ligne — un tableau à 5 colonnes y est illisible. */}
          <div className="space-y-1.5 sm:hidden">
            {lignes.map((l, i) => (
              <div key={i} className="rounded-lg border border-gray-100 p-2">
                {colonnes.map((c, j) => {
                  const v = c.render(l, i)
                  if (v === null || v === undefined || v === '') return null
                  return (
                    <div key={j} className={`flex items-baseline justify-between gap-2 ${j === 0 ? 'mb-1' : ''}`}>
                      {j === 0
                        ? <span className="font-semibold text-gray-800">{v}</span>
                        : <><span className="text-[11px] text-gray-400">{c.label}</span><span className="text-xs font-semibold text-gray-700">{v}</span></>}
                    </div>
                  )
                })}
              </div>
            ))}
            {!lignes.length && <p className="py-4 text-center text-sm text-gray-400">{vide}</p>}
          </div>

          {/* Écran large : tableau classique. */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-100 sm:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                <tr>{colonnes.map((c, i) => <th key={i} className={`px-3 py-2 ${align(c.align)}`}>{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lignes.map((l, i) => (
                  <tr key={i}>
                    {colonnes.map((c, j) => (
                      <td key={j} className={`px-3 py-2 ${align(c.align)} ${j === 0 ? 'font-semibold text-gray-800' : 'font-medium text-gray-700'}`}>
                        {c.render(l, i)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!lignes.length && <tr><td colSpan={colonnes.length} className="py-6 text-center text-gray-400">{vide}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {children}

      {pied.length > 0 && (
        <div className="space-y-1 rounded-lg bg-gray-50 px-3 py-2">
          {pied.filter((p) => p.value !== undefined && p.value !== null && p.value !== '').map((p, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <span className={`text-xs ${p.fort ? 'font-bold uppercase tracking-wide text-gray-600' : 'text-gray-500'}`}>{p.label}</span>
              <span className={p.fort ? 'text-base font-extrabold text-gray-900' : 'text-sm font-semibold text-gray-700'}>
                {typeof p.value === 'number' ? formatMoney(p.value) : p.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

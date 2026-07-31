// Détail complet d'une demande / autorisation de sortie — présenté à CEUX QUI
// VALIDENT (approbateur / certificateur) AVANT le traitement. Montre clairement
// « tout ce qui va sortir » : articles, quantités, stock disponible et stock
// restant après la sortie (avec alerte si insuffisant), montants, motif, auteur.
// Présentation RESPONSIVE (téléphone : cartes empilées ; écran large : tableau).
import { formatNumber, formatMoney } from '../../utils/formatters'

// `masquerMontants` : cache toute valeur financière (colonne Montant + total) pour
// les profils qui valident sur la quantité et le motif seulement — ex. la secrétaire
// en MAXI LOGISTIQUE. Par défaut false : les autres modules ne changent pas.
export default function DemandeDetail({
  demandeur, dateHeure, client, motif, sortieLabel = 'Sortie prévue', sortieValue,
  items = [], montant, statutNode, trail = [], masquerMontants = false
}) {
  const totalQte = items.reduce((s, it) => s + (parseInt(it.qte) || 0), 0)
  const hasStock = items.some((it) => it.stock !== undefined && it.stock !== null)
  const hasMontant = !masquerMontants && items.some((it) => it.montant !== undefined && it.montant !== null)
  const alerte = items.some((it) => it.stock !== undefined && (parseInt(it.qte) || 0) > it.stock)

  return (
    <div className="space-y-3">
      {/* En-tête : auteur, date, statut */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        {demandeur && <span>👤 <strong className="text-gray-700">{demandeur}</strong></span>}
        {dateHeure && <span>🕒 {dateHeure}</span>}
        {statutNode && <span className="ml-auto">{statutNode}</span>}
      </div>

      {client && <p className="text-sm">Client : <strong>{client}</strong></p>}

      {(motif || sortieValue) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {motif && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800"><span className="font-semibold">Motif :</span> {motif}</p>}
          {sortieValue && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600"><span className="font-semibold">{sortieLabel} :</span> {sortieValue}</p>}
        </div>
      )}

      {/* Ce qui va sortir */}
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">
          Ce qui va sortir — {formatNumber(totalQte)} pièce(s)
        </p>

        {/* Téléphone : cartes empilées */}
        <div className="space-y-1.5 sm:hidden">
          {items.map((it, i) => {
            const reste = it.stock !== undefined ? it.stock - (parseInt(it.qte) || 0) : null
            const ko = reste !== null && reste < 0
            return (
              <div key={i} className={`rounded-lg border p-2 ${ko ? 'border-red-200 bg-red-50/50' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{it.nom}{it.cat ? <span className="ml-1 text-[10px] font-normal text-gray-400">{it.cat}</span> : null}</span>
                  <span className="shrink-0 font-bold">×{formatNumber(it.qte)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-gray-500">
                  {it.stock !== undefined && <span>Stock : <strong className={ko ? 'text-red-600' : 'text-gray-700'}>{formatNumber(it.stock)}</strong></span>}
                  {reste !== null && <span>Restant après : <strong className={ko ? 'text-red-600' : 'text-gray-700'}>{formatNumber(reste)}</strong>{ko ? ' ⚠️' : ''}</span>}
                  {!masquerMontants && it.montant !== undefined && <span className="ml-auto font-semibold text-gray-700">{formatMoney(it.montant)}</span>}
                </div>
              </div>
            )
          })}
          {!items.length && <p className="py-3 text-center text-sm text-gray-400">Aucun article.</p>}
        </div>

        {/* Écran large : tableau */}
        <div className="hidden overflow-x-auto rounded-lg border border-gray-100 sm:block">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="px-2 py-1.5 text-left">Article</th>
                <th className="px-2 py-1.5 text-center">Qté</th>
                {hasStock && <th className="px-2 py-1.5 text-center">Stock dispo.</th>}
                {hasStock && <th className="px-2 py-1.5 text-center">Restant après</th>}
                {hasMontant && <th className="px-2 py-1.5 text-right">Montant</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((it, i) => {
                const reste = it.stock !== undefined ? it.stock - (parseInt(it.qte) || 0) : null
                const ko = reste !== null && reste < 0
                return (
                  <tr key={i} className={ko ? 'bg-red-50/50' : ''}>
                    <td className="px-2 py-1.5">
                      <span className="font-semibold">{it.nom}</span>
                      {it.cat && <span className="ml-1 text-[10px] text-gray-400">{it.cat}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-center font-bold">{formatNumber(it.qte)}</td>
                    {hasStock && <td className={`px-2 py-1.5 text-center ${ko ? 'font-bold text-red-600' : 'text-gray-500'}`}>{it.stock !== undefined ? formatNumber(it.stock) : '—'}</td>}
                    {hasStock && <td className={`px-2 py-1.5 text-center ${ko ? 'font-bold text-red-600' : 'text-gray-600'}`}>{reste !== null ? formatNumber(reste) : '—'}{ko ? ' ⚠️' : ''}</td>}
                    {hasMontant && <td className="px-2 py-1.5 text-right font-semibold text-gray-700">{it.montant !== undefined ? formatMoney(it.montant) : '—'}</td>}
                  </tr>
                )
              })}
              {!items.length && <tr><td colSpan={5} className="py-3 text-center text-gray-400">Aucun article.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {alerte && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          ⚠️ Stock insuffisant sur au moins un article — vérifiez avant d'autoriser la sortie.
        </p>
      )}

      {!masquerMontants && montant !== undefined && montant !== null && (
        <p className="text-right text-sm font-extrabold text-gray-800">Montant total : {formatMoney(montant)}</p>
      )}

      {trail.length > 0 && (
        <div className="space-y-0.5 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
          {trail.map((t, i) => t.value && <p key={i}><span className="font-semibold">{t.label} :</span> {t.value}</p>)}
        </div>
      )}
    </div>
  )
}

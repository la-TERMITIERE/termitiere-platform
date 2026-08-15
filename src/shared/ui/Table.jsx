// Tableau responsive avec état vide. `columns` = [{ key, label, render?, align?, sticky?, width? }].
// - `stickyHeader` : l'en-tête reste visible au défilement vertical (téléphone/petit écran).
// - une colonne `sticky: true` reste visible au défilement HORIZONTAL (gauche→droite) ;
//   fournir `width` (ex. '110px') sur chaque colonne figée pour caler les décalages.
export default function Table({
  columns, rows, rowKey = 'id', empty = 'Aucune donnée', onRowClick,
  stickyHeader = false, maxHeight = 'calc(100vh - 16rem)'
}) {
  // Décalage gauche cumulé des colonnes figées (dans l'ordre d'apparition).
  let acc = 0
  const stickyLeft = columns.map((c) => {
    if (!c.sticky) return null
    const left = acc
    acc += parseInt(c.width) || 120
    return left
  })

  const alignCls = (a) => (a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : '')

  return (
    <div className={`overflow-auto rounded-lg border border-gray-100 dark:border-white/10 ${stickyHeader ? '' : ''}`}
      style={stickyHeader ? { maxHeight } : undefined}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-white/5 dark:text-gray-400">
            {columns.map((c, i) => (
              <th key={c.key}
                className={`bg-gray-50 px-3 py-2.5 font-semibold dark:bg-white/5 ${alignCls(c.align)} ${stickyHeader ? 'sticky top-0' : ''} ${c.sticky ? 'sticky' : ''}`}
                style={{
                  ...(c.sticky ? { left: stickyLeft[i], width: c.width } : {}),
                  zIndex: (stickyHeader && c.sticky) ? 30 : (c.sticky ? 20 : (stickyHeader ? 20 : undefined))
                }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 text-gray-800 dark:divide-white/10 dark:text-gray-200">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-400 dark:text-gray-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row[rowKey]}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`group hover:bg-gray-50 dark:hover:bg-white/5 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((c, i) => (
                  <td key={c.key}
                    className={`px-3 py-2.5 ${alignCls(c.align)} ${c.sticky ? 'sticky bg-white group-hover:bg-gray-50 dark:bg-[#1d2226] dark:group-hover:bg-white/5' : ''}`}
                    style={c.sticky ? { left: stickyLeft[i], width: c.width, zIndex: 10 } : undefined}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

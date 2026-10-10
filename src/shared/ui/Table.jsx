// Tableau responsive avec état vide. `columns` = [{ key, label, render?, align?, sticky?, width? }].
// - `stickyHeader` : l'en-tête reste visible au défilement vertical (téléphone/petit écran).
// - une colonne `sticky: true` reste visible au défilement HORIZONTAL (gauche→droite) ;
//   fournir `width` (ex. '110px') sur chaque colonne figée pour caler les décalages.
// - style « verre » (`.table-verre`, cf. index.css) : teinté de la couleur du module courant.
// - `emptyIcon` : icône 3D animée de l'état vide.
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Inbox, SearchX } from 'lucide-react'
import ChampRecherche from './ChampRecherche'
import EtatVide from './EtatVide'
import { COULEUR_MODULE } from '../../utils/color'

// - `searchBy` (optionnel) : active une barre de RECHERCHE PAR NOM au-dessus du tableau.
//   Tableau de clés (ex. ['clientNom', 'nom']) ou fonction (row) => texte à comparer ;
//   insensible à la casse et aux accents. Sans `searchBy`, rien ne change.
const norm = (v) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export default function Table({
  columns, rows: rowsProp, rowKey = 'id', empty = 'Aucune donnée', onRowClick,
  stickyHeader = false, maxHeight = 'calc(100vh - 16rem)',
  searchBy, searchPlaceholder = 'Rechercher par nom…', searchQuery, emptyIcon = Inbox
}) {
  const accent = COULEUR_MODULE[useLocation().pathname.split('/')[1]] || '#BC3C31'
  const [qInterne, setQ] = useState('')
  // `searchQuery` fourni : la page possède le champ (sur son bandeau) ; sinon barre intégrée.
  const externe = searchQuery !== undefined
  const q = externe ? searchQuery : qInterne
  const rows = useMemo(() => {
    const t = norm(q.trim())
    if (!searchBy || !t) return rowsProp
    const texte = typeof searchBy === 'function' ? searchBy : (r) => searchBy.map((k) => r[k]).join(' ')
    return rowsProp.filter((r) => norm(texte(r)).includes(t))
  }, [rowsProp, q, searchBy])
  const recherche = !!(searchBy && q.trim() && rows.length === 0)
  const emptyAffiche = recherche ? `Aucun résultat pour « ${q.trim()} »` : empty
  // Décalage gauche cumulé des colonnes figées (dans l'ordre d'apparition).
  let acc = 0
  const stickyLeft = columns.map((c) => {
    if (!c.sticky) return null
    const left = acc
    acc += parseInt(c.width) || 120
    return left
  })

  const alignCls = (a) => (a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : '')

  const tableau = (
    <div className="table-verre overflow-auto"
      style={{ '--tv-accent': accent, ...(stickyHeader ? { maxHeight } : {}) }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide">
            {columns.map((c, i) => (
              <th key={c.key}
                className={`px-3 py-2.5 font-semibold ${alignCls(c.align)} ${stickyHeader ? 'sticky top-0' : ''} ${c.sticky ? 'sticky' : ''}`}
                style={{
                  ...(c.sticky ? { left: stickyLeft[i], width: c.width } : {}),
                  zIndex: (stickyHeader && c.sticky) ? 30 : (c.sticky ? 20 : (stickyHeader ? 20 : undefined))
                }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-gray-800 dark:text-gray-200">
          {rows.length === 0 ? (
            <tr className="tv-vide">
              <td colSpan={columns.length}>
                <EtatVide icone={recherche ? SearchX : emptyIcon} texte={emptyAffiche} accent={accent} />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row[rowKey]}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`group ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((c, i) => (
                  <td key={c.key}
                    className={`px-3 py-2.5 ${alignCls(c.align)} ${c.sticky ? 'sticky tv-sticky' : ''}`}
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
  if (!searchBy || externe) return tableau
  return (
    <div>
      <div className="p-2.5"><ChampRecherche value={q} onChange={setQ} placeholder={searchPlaceholder} /></div>
      {tableau}
    </div>
  )
}

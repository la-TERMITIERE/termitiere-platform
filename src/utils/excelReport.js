// Génération de rapports Excel PRÉSENTABLES (titres, en-têtes stylés, bordures,
// lignes alternées, totaux, formats FCFA) — via xlsx-js-style.
//
// Un « rapport » = un classeur de plusieurs FEUILLES (sections). Chaque section
// est décrite par : { name, title, subtitle?, columns, rows, totals? }.
//   columns : [{ key, label, width?, type?: 'text'|'number'|'money'|'date', align? }]
//   rows    : tableau d'objets indexés par column.key
//   totals  : objet (par column.key) avec un libellé via __label (ligne de total)
import * as XLSXns from 'xlsx-js-style'
// xlsx-js-style est un module CJS : selon l'interop (bundler vs Node), l'API est
// soit sur le namespace, soit sur `.default`. On normalise pour les deux.
const XLSX = XLSXns.default || XLSXns

// Charte LA TERMITIÈRE
const ROUGE = 'BC3C31'
const ROUGE_FONCE = '9A2F26'
const ANTHRACITE = '2E2E2E'
const GRIS_TXT = '374151'
const GRIS_CLAIR = '6B7280'
const ZEBRA = 'FBF3F2' // fond chaud très clair (lignes paires)
const BORDURE = 'E5E7EB'

const MONEY_FMT = '#,##0\\ "FCFA"'
const NUM_FMT = '#,##0'

const thin = { style: 'thin', color: { rgb: BORDURE } }
const allBorders = { top: thin, bottom: thin, left: thin, right: thin }

const TITLE_STYLE = {
  font: { name: 'Calibri', sz: 16, bold: true, color: { rgb: ROUGE } },
  alignment: { horizontal: 'left', vertical: 'center' }
}
const SUB_STYLE = {
  font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: GRIS_CLAIR } },
  alignment: { horizontal: 'left', vertical: 'center' }
}
const HEADER_STYLE = {
  font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: ROUGE } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: { top: { style: 'thin', color: { rgb: ROUGE_FONCE } }, bottom: { style: 'thin', color: { rgb: ROUGE_FONCE } }, left: { style: 'thin', color: { rgb: ROUGE_FONCE } }, right: { style: 'thin', color: { rgb: ROUGE_FONCE } } }
}

function dataStyle(col, rowIndex) {
  const s = {
    font: { name: 'Calibri', sz: 10, color: { rgb: GRIS_TXT } },
    alignment: { horizontal: col.align || (col.type === 'number' || col.type === 'money' ? 'right' : 'left'), vertical: 'center' },
    border: allBorders
  }
  if (rowIndex % 2 === 1) s.fill = { fgColor: { rgb: ZEBRA } }
  if (col.type === 'money') s.numFmt = MONEY_FMT
  else if (col.type === 'number') s.numFmt = NUM_FMT
  return s
}

function totalStyle(col) {
  const s = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: ANTHRACITE } },
    fill: { fgColor: { rgb: 'F3F4F6' } },
    alignment: { horizontal: col.align || (col.type === 'number' || col.type === 'money' ? 'right' : 'left'), vertical: 'center' },
    border: { ...allBorders, top: { style: 'medium', color: { rgb: ROUGE } } }
  }
  if (col.type === 'money') s.numFmt = MONEY_FMT
  else if (col.type === 'number') s.numFmt = NUM_FMT
  return s
}

// Construit une feuille stylée à partir d'une définition de section.
function styledSheet({ title, subtitle, columns, rows = [], totals }) {
  const ncol = columns.length
  const aoa = []
  aoa.push([title, ...Array(ncol - 1).fill('')])
  aoa.push([subtitle || '', ...Array(ncol - 1).fill('')])
  aoa.push(Array(ncol).fill(''))
  aoa.push(columns.map((c) => c.label))
  rows.forEach((row) => aoa.push(columns.map((c) => (row[c.key] ?? ''))))
  const totalRowIdx = totals ? aoa.length : -1
  if (totals) aoa.push(columns.map((c, i) => (i === 0 ? (totals.__label || 'TOTAL') : (totals[c.key] ?? ''))))

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: ncol - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: ncol - 1 } }
  ]
  ws['!cols'] = columns.map((c) => ({ wch: c.width || 16 }))
  ws['!rows'] = [{ hpt: 26 }, { hpt: 16 }, { hpt: 6 }, { hpt: 20 }]
  // Fige les lignes d'en-tête (titre + entêtes de colonnes).
  ws['!freeze'] = { xSplit: 0, ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft', state: 'frozen' }

  const HEADER_ROW = 3
  const put = (r, c, s) => {
    const a = XLSX.utils.encode_cell({ r, c })
    if (!ws[a]) ws[a] = { t: 's', v: '' }
    ws[a].s = s
  }
  put(0, 0, TITLE_STYLE)
  put(1, 0, SUB_STYLE)
  for (let c = 0; c < ncol; c++) put(HEADER_ROW, c, HEADER_STYLE)
  rows.forEach((row, ri) => {
    const r = HEADER_ROW + 1 + ri
    columns.forEach((col, c) => {
      const a = XLSX.utils.encode_cell({ r, c })
      if (!ws[a]) ws[a] = { t: 's', v: '' }
      ws[a].s = dataStyle(col, ri)
      if ((col.type === 'money' || col.type === 'number') && typeof row[col.key] === 'number') ws[a].t = 'n'
    })
  })
  if (totals) {
    for (let c = 0; c < ncol; c++) {
      const a = XLSX.utils.encode_cell({ r: totalRowIdx, c })
      if (!ws[a]) ws[a] = { t: 's', v: '' }
      ws[a].s = totalStyle(columns[c])
      if ((columns[c].type === 'money' || columns[c].type === 'number') && typeof totals[columns[c].key] === 'number') ws[a].t = 'n'
    }
  }
  return ws
}

// Exporte un classeur multi-feuilles stylé. `sections` = tableau de définitions.
export function exportRapportExcel({ filename = 'rapport.xlsx', sections = [] }) {
  const wb = XLSX.utils.book_new()
  wb.Props = { Title: 'Rapport MAXI-AGRO', Company: 'LA TERMITIÈRE', CreatedDate: new Date() }
  sections.forEach((sec) => {
    const ws = styledSheet(sec)
    XLSX.utils.book_append_sheet(wb, ws, (sec.name || 'Feuille').slice(0, 31))
  })
  XLSX.writeFile(wb, filename)
}

// Helpers d'export Excel (SheetJS / xlsx).
import * as XLSX from 'xlsx'

// Exporte un tableau d'objets vers un fichier .xlsx.
export function exportExcel(rows, fichier = 'export.xlsx', sheetName = 'Données') {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, fichier)
}

// Exporte plusieurs feuilles : [{ name, rows }].
export function exportExcelMulti(sheets, fichier = 'export.xlsx') {
  const wb = XLSX.utils.book_new()
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows)
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  })
  XLSX.writeFile(wb, fichier)
}

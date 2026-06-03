// Helpers d'export PDF (jsPDF + autotable) avec en-tête LA TERMITIÈRE.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatMoney, formatDate } from './formatters'

const VERT = [188, 60, 49] // rouge LA TERMITIÈRE (conservé sous ce nom pour compat. interne)
const ENTREPRISE = {
  nom: 'LA TERMITIÈRE',
  devise: 'TOUJOURS DANS L\'ACTION',
  adresse: 'Agoe Daliko, Lomé — Togo',
  tel: '00228 96 09 49 49',
  email: 'latermitiere2021@gmail.com'
}

// En-tête commun à tous les documents. Renvoie l'ordonnée Y de fin d'en-tête.
function header(doc, sousTitre) {
  doc.setFillColor(...VERT)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(ENTREPRISE.nom, 14, 13)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.text(ENTREPRISE.devise, 14, 19)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(`${ENTREPRISE.adresse}  ·  ${ENTREPRISE.tel}`, 14, 24)
  if (sousTitre) {
    doc.setTextColor(...VERT)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(sousTitre, 14, 40)
  }
  doc.setTextColor(0, 0, 0)
  return 46
}

// Pied de page (mentions + coordonnées).
function footer(doc) {
  const h = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...VERT)
  doc.line(14, h - 16, 196, h - 16)
  doc.setFontSize(7)
  doc.setTextColor(120, 120, 120)
  doc.text(`${ENTREPRISE.nom} · ${ENTREPRISE.email} · ${ENTREPRISE.tel}`, 105, h - 11, { align: 'center' })
  doc.text(ENTREPRISE.devise, 105, h - 7, { align: 'center' })
}

// Génère une facture/devis PDF. `type` = 'FACTURE' | 'DEVIS'.
export function genererDocumentPDF(facture, type = 'FACTURE') {
  const doc = new jsPDF()
  let y = header(doc, `${type} N° ${facture.numero}`)

  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  doc.text(`Date : ${formatDate(facture.date)}`, 14, y)
  // Bloc client
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.text('Client', 14, y)
  doc.setFont('helvetica', 'normal')
  const c = facture.client || {}
  const lignesClient = [c.nom, c.tel, c.email, c.adresse].filter(Boolean)
  lignesClient.forEach((l, i) => doc.text(String(l), 14, y + 5 + i * 4))

  // Tableau des lignes
  autoTable(doc, {
    startY: y + 5 + lignesClient.length * 4 + 4,
    head: [['Article', 'Qté', 'Prix unit.', 'Total']],
    body: (facture.lignes || []).map((l) => [
      l.article,
      String(l.qte),
      formatMoney(l.prixUnit),
      formatMoney(l.total)
    ]),
    theme: 'striped',
    headStyles: { fillColor: VERT, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
  })

  // Totaux
  let ty = doc.lastAutoTable.finalY + 6
  const right = 196
  const ligne = (label, val, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 11 : 9)
    doc.text(label, 140, ty)
    doc.text(formatMoney(val), right, ty, { align: 'right' })
    ty += bold ? 7 : 5
  }
  ligne('Total HT', facture.totalHT || 0)
  if (facture.remise) ligne(`Remise (${facture.remise}%)`, -((facture.totalHT || 0) * facture.remise) / 100)
  if (facture.tva) ligne(`TVA (${facture.tva}%)`, ((facture.totalHT || 0) * (1 - (facture.remise || 0) / 100) * facture.tva) / 100)
  doc.setDrawColor(...VERT)
  doc.line(140, ty - 2, right, ty - 2)
  ligne('TOTAL TTC', facture.totalTTC || 0, true)

  footer(doc)
  doc.save(`${type}-${facture.numero}.pdf`)
}

// Génère un rapport simple à partir d'un tableau (titre + colonnes + lignes).
export function genererRapportPDF({ titre, colonnes, lignes, fichier }) {
  const doc = new jsPDF()
  const y = header(doc, titre)
  autoTable(doc, {
    startY: y + 2,
    head: [colonnes],
    body: lignes,
    theme: 'grid',
    headStyles: { fillColor: VERT, textColor: 255 },
    styles: { fontSize: 8, cellPadding: 2 }
  })
  footer(doc)
  doc.save(fichier || 'rapport.pdf')
}

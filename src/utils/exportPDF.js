// Helpers d'export PDF (jsPDF + autotable) avec en-tête LA TERMITIÈRE.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate } from './formatters'

const VERT = [188, 60, 49] // rouge LA TERMITIÈRE (conservé sous ce nom pour compat. interne)
const ENTREPRISE = {
  nom: 'LA TERMITIÈRE',
  devise: 'TOUJOURS DANS L\'ACTION',
  adresse: 'Agoe Daliko, Lomé — Togo',
  tel: '00228 96 09 49 49',
  email: 'latermitiere2021@gmail.com'
}

// Formatage des montants pour le PDF : séparateur de milliers = espace ASCII.
// (Intl.NumberFormat('fr-FR') utilise une espace insécable étroite U+202F que la
//  police standard de jsPDF ne sait pas afficher → caractères parasites « & / ».)
function fmtMontant(v) {
  const n = Math.round(Number(v) || 0)
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (n < 0 ? '-' : '') + s
}
const fmtFCFA = (v) => fmtMontant(v) + ' FCFA'

// Charge une image (logo) et la convertit en data URL pour jsPDF. Mise en cache.
let _logoCache
function chargerLogo() {
  if (_logoCache !== undefined) return Promise.resolve(_logoCache)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
        _logoCache = { dataURL: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }
      } catch { _logoCache = null }
      resolve(_logoCache)
    }
    img.onerror = () => { _logoCache = null; resolve(null) }
    img.src = '/logo-mark.png'
  })
}

// En-tête commun à tous les documents. Renvoie l'ordonnée Y de fin d'en-tête.
function header(doc, sousTitre, logo) {
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

  // Logo dans une pastille blanche à droite de la bande (rendu propre quel que
  // soit le fond du logo).
  if (logo?.dataURL) {
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(176, 4, 20, 20, 2.5, 2.5, 'F')
    const ratio = logo.w && logo.h ? logo.w / logo.h : 1
    let w = 16, h = 16
    if (ratio > 1) h = 16 / ratio
    else w = 16 * ratio
    doc.addImage(logo.dataURL, 'PNG', 176 + (20 - w) / 2, 4 + (20 - h) / 2, w, h)
  }

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
export async function genererDocumentPDF(facture, type = 'FACTURE') {
  const doc = new jsPDF()
  const logo = await chargerLogo()
  let y = header(doc, `${type} N° ${facture.numero}`, logo)

  // Bloc date + référence
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  doc.text(`Date d'émission : ${formatDate(facture.date)}`, 14, y)
  doc.text(`Référence : ${facture.numero}`, 14, y + 5)

  // Bloc client (à droite)
  const c = facture.client || {}
  y += 2
  doc.setDrawColor(...VERT)
  doc.setFillColor(252, 248, 248)
  const clientLines = [c.nom, c.tel, c.email, c.adresse].filter(Boolean)
  doc.roundedRect(120, y, 76, 8 + clientLines.length * 5, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...VERT)
  doc.text('DESTINATAIRE', 122, y + 5)
  doc.setTextColor(60, 60, 60)
  doc.setFont('helvetica', 'normal')
  clientLines.forEach((l, i) => doc.text(String(l), 122, y + 10 + i * 5))

  // Tableau des lignes
  const tableStartY = y + 12 + clientLines.length * 5 + 4
  autoTable(doc, {
    startY: tableStartY,
    head: [['N°', 'Désignation / Article', 'Qté', 'Prix unitaire (FCFA)', 'Montant (FCFA)']],
    body: (facture.lignes || []).map((l, i) => [
      String(i + 1),
      l.article || '—',
      String(l.qte),
      fmtMontant(l.prixUnit),
      fmtMontant(l.total)
    ]),
    theme: 'striped',
    headStyles: { fillColor: VERT, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      2: { halign: 'center', cellWidth: 12 },
      3: { halign: 'right', cellWidth: 42 },
      4: { halign: 'right', cellWidth: 42 }
    },
    alternateRowStyles: { fillColor: [252, 248, 248] }
  })

  // Totaux dans un cadre
  let ty = doc.lastAutoTable.finalY + 8
  const right = 196
  const boxLeft = 125

  // Cadre pour les totaux
  doc.setDrawColor(...VERT)
  doc.setFillColor(252, 252, 252)

  const formatNum = fmtFCFA

  const totalHT = facture.totalHT || 0
  const remiseMontant = facture.remise ? totalHT * facture.remise / 100 : 0
  const baseTVA = totalHT - remiseMontant
  const tvaMontant = facture.tva ? baseTVA * facture.tva / 100 : 0

  const ligneTotaux = (label, val, highlight = false) => {
    doc.setFont('helvetica', highlight ? 'bold' : 'normal')
    doc.setFontSize(highlight ? 11 : 9)
    if (highlight) doc.setTextColor(...VERT)
    else doc.setTextColor(60, 60, 60)
    doc.text(label, boxLeft, ty)
    doc.text(formatNum(val), right, ty, { align: 'right' })
    if (highlight) {
      doc.setDrawColor(...VERT)
      doc.line(boxLeft, ty - 3, right, ty - 3)
    }
    ty += highlight ? 8 : 6
    doc.setTextColor(60, 60, 60)
  }
  ligneTotaux('Sous-total HT', totalHT)
  if (facture.remise) ligneTotaux(`Remise (${facture.remise} %)`, -remiseMontant)
  if (facture.tva) ligneTotaux(`TVA (${facture.tva} %)`, tvaMontant)
  ligneTotaux('TOTAL À PAYER', facture.totalTTC || 0, true)

  // Note de bas de facture
  ty += 8
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(120, 120, 120)
  doc.text('Règlement à réception. Tout paiement doit être accompagné du numéro de facture.', 14, ty)

  footer(doc)
  doc.save(`${type}-${facture.numero}.pdf`)
}

// Génère un rapport simple à partir d'un tableau (titre + colonnes + lignes).
export async function genererRapportPDF({ titre, colonnes, lignes, fichier }) {
  const doc = new jsPDF()
  const logo = await chargerLogo()
  const y = header(doc, titre, logo)
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

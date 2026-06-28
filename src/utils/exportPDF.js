// Helpers d'export PDF (jsPDF + autotable) — design premium LA TERMITIÈRE.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate } from './formatters'

const ENTREPRISE = {
  nom: 'LA TERMITIÈRE',
  devise: 'TOUJOURS DANS L\'ACTION',
  adresse: 'Agoe Daliko, Lomé — Togo',
  tel: '00228 96 09 49 49',
  email: 'latermitiere2021@gmail.com'
}

// Config visuelle par module
const MODULE_CONFIG = {
  agro:         { couleur: [46, 170, 63],  couleur2: [26, 110, 39],  logo: '/maxi-agro-logo.png',       nom: 'MAXI AGRO'       },
  logistique:   { couleur: [188, 60, 49],  couleur2: [26, 26, 26],   logo: '/logo_maxi_logistique.png', nom: 'MAXI LOGISTIQUE' },
  evenementiel: { couleur: [124, 58, 237], couleur2: [49, 19, 102],  logo: null,                        nom: 'BRIQUETERIE'     },
  foncier:      { couleur: [5, 150, 105],  couleur2: [4, 80, 60],    logo: null,                        nom: 'FONCIER'         },
  garderie:     { couleur: [232, 57, 14],  couleur2: [245, 168, 0],  logo: '/garderie-logo.png',        nom: 'GARDERIE'        },
  default:      { couleur: [188, 60, 49],  couleur2: [26, 26, 26],   logo: null,                        nom: 'LA TERMITIÈRE'   }
}

// Formatage montants sans espace insécable
function fmtMontant(v) {
  const n = Math.round(Number(v) || 0)
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (n < 0 ? '-' : '') + s
}
const fmtFCFA = (v) => fmtMontant(v) + ' FCFA'

// Charge une image → data URL. Cache par chemin.
const _logoCache = {}
function chargerLogo(src) {
  if (!src) return Promise.resolve(null)
  if (_logoCache[src] !== undefined) return Promise.resolve(_logoCache[src])
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
        _logoCache[src] = { dataURL: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }
      } catch { _logoCache[src] = null }
      resolve(_logoCache[src])
    }
    img.onerror = () => { _logoCache[src] = null; resolve(null) }
    img.src = src
  })
}

// Place une image centrée dans un rectangle (w x h) à (x, y), en respectant le ratio.
function placerImage(doc, imgData, x, y, maxW, maxH) {
  if (!imgData?.dataURL) return
  const ratio = imgData.w / imgData.h
  let w = maxW, h = maxW / ratio
  if (h > maxH) { h = maxH; w = h * ratio }
  doc.addImage(imgData.dataURL, 'PNG', x + (maxW - w) / 2, y + (maxH - h) / 2, w, h)
}

// ─── EN-TÊTE PREMIUM ──────────────────────────────────────────────────────────
// Layout :
//   Fond blanc — logo module rond (petit, gauche) | texte centré | logo Termitière rond (grand, droite)
//   Bordure colorée en bas
async function headerPremium(doc, sousTitre, cfg, logoTermitiere, logoModule) {
  const C  = cfg.couleur
  const C2 = cfg.couleur2
  const PAGE_W = 210
  const HEADER_H = 42

  // — Fond blanc de l'en-tête
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F')

  // — Bordure colorée en bas de l'en-tête
  doc.setFillColor(...C)
  doc.rect(0, HEADER_H - 3, PAGE_W, 3, 'F')

  // — Fine ligne couleur2 au-dessus
  doc.setFillColor(...C2)
  doc.rect(0, HEADER_H - 5, PAGE_W, 2, 'F')

  // ── Logo La Termitière (gauche) — grand, cercle avec bordure colorée ──────
  if (logoTermitiere?.dataURL) {
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(...C)
    doc.setLineWidth(1.2)
    doc.circle(22, 20, 17, 'FD')
    placerImage(doc, logoTermitiere, 6, 4, 32, 32)
  }

  // ── Texte centré (sur fond blanc) ────────────────────────────────────────
  const textX = 46
  const textW = PAGE_W - 46 - 42

  doc.setTextColor(...C)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(cfg.nom, textX + textW / 2, 12, { align: 'center' })

  doc.setTextColor(...C2)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(ENTREPRISE.devise, textX + textW / 2, 19, { align: 'center' })

  doc.setTextColor(90, 90, 90)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(ENTREPRISE.adresse, textX + textW / 2, 26, { align: 'center' })
  doc.text(`${ENTREPRISE.tel}  ·  ${ENTREPRISE.email}`, textX + textW / 2, 32, { align: 'center' })

  // ── Logo module (droite) — petit, cercle avec bordure colorée ────────────
  if (logoModule?.dataURL) {
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(...C)
    doc.setLineWidth(1)
    doc.circle(PAGE_W - 22, 20, 14, 'FD')
    placerImage(doc, logoModule, PAGE_W - 35, 7, 26, 26)
  }

  // — Titre du document sous la bande (fond coloré léger)
  let y = HEADER_H + 6
  if (sousTitre) {
    doc.setFillColor(C[0], C[1], C[2], 0.08)
    doc.setFillColor(C[0] + Math.round((255 - C[0]) * 0.92), C[1] + Math.round((255 - C[1]) * 0.92), C[2] + Math.round((255 - C[2]) * 0.92))
    doc.roundedRect(14, y - 4, PAGE_W - 28, 10, 1.5, 1.5, 'F')

    doc.setTextColor(...C)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(sousTitre, PAGE_W / 2, y + 2.5, { align: 'center' })

    doc.setDrawColor(...C)
    doc.setLineWidth(0.4)
    doc.roundedRect(14, y - 4, PAGE_W - 28, 10, 1.5, 1.5, 'D')
    y += 10
  }

  doc.setTextColor(0, 0, 0)
  doc.setLineWidth(0.2)
  return y + 2
}

// ─── PIED DE PAGE ─────────────────────────────────────────────────────────────
function footer(doc, cfg) {
  const C = cfg?.couleur || [188, 60, 49]
  const h = doc.internal.pageSize.getHeight()

  doc.setDrawColor(...C)
  doc.setLineWidth(0.4)
  doc.line(14, h - 18, 196, h - 18)

  // Bande déco fine
  doc.setFillColor(...C)
  doc.rect(0, h - 8, 210, 8, 'F')

  doc.setFontSize(7)
  doc.setTextColor(255, 255, 255)
  doc.text(
    `${ENTREPRISE.nom}  ·  ${ENTREPRISE.email}  ·  ${ENTREPRISE.tel}  ·  ${ENTREPRISE.devise}`,
    105, h - 3.5, { align: 'center' }
  )

  doc.setFontSize(6.5)
  doc.setTextColor(140, 140, 140)
  doc.text(`${ENTREPRISE.adresse}`, 105, h - 11, { align: 'center' })
}

// ─── FACTURE / DEVIS ──────────────────────────────────────────────────────────
export async function genererDocumentPDF(facture, type = 'FACTURE', module = 'default') {
  const cfg = MODULE_CONFIG[module] || MODULE_CONFIG.default
  const C = cfg.couleur

  const [logoTermitiere, logoModule] = await Promise.all([
    chargerLogo('/termitiere-logo.png').then(r => r || chargerLogo('/logo-mark.png')),
    chargerLogo(cfg.logo)
  ])

  const doc = new jsPDF()
  let y = await headerPremium(doc, `${type} N° ${facture.numero}`, cfg, logoTermitiere, logoModule)

  // ── Bloc infos émetteur + destinataire côte à côte ───────────────────────
  const c = facture.client || {}
  const clientLines = [c.nom, c.tel, c.email, c.adresse].filter(Boolean)

  // Émetteur (gauche)
  doc.setFillColor(248, 248, 248)
  doc.setDrawColor(...C)
  doc.roundedRect(14, y, 85, 8 + 4 * 5, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C)
  doc.text('ÉMETTEUR', 17, y + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)
  doc.setFontSize(8)
  doc.text(cfg.nom, 17, y + 11)
  doc.setFontSize(7)
  doc.text(ENTREPRISE.adresse, 17, y + 16)
  doc.text(ENTREPRISE.tel, 17, y + 21)
  doc.text(ENTREPRISE.email, 17, y + 26)

  // Destinataire (droite)
  doc.setFillColor(250, 246, 246)
  doc.setDrawColor(...C)
  doc.roundedRect(111, y, 85, 8 + clientLines.length * 5, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C)
  doc.text('DESTINATAIRE', 114, y + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)
  doc.setFontSize(8)
  clientLines.forEach((l, i) => doc.text(String(l), 114, y + 11 + i * 5))

  // Infos date + ref (sous émetteur)
  const infoY = y + 8 + 4 * 5 + 4
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)
  doc.setFont('helvetica', 'normal')
  doc.text(`Date d'émission : ${formatDate(facture.date)}`, 14, infoY)
  doc.text(`Référence : ${facture.numero}`, 14, infoY + 5)
  if (facture.apporteur) doc.text(`Apporteur : ${facture.apporteur}`, 14, infoY + 10)

  // ── Tableau des articles ─────────────────────────────────────────────────
  const tableY = infoY + (facture.apporteur ? 14 : 9)
  autoTable(doc, {
    startY: tableY,
    head: [['N°', 'Désignation / Article', 'Qté', 'Prix unitaire (FCFA)', 'Montant (FCFA)']],
    body: (facture.lignes || []).map((l, i) => [
      String(i + 1),
      l.article || '—',
      String(l.qte),
      fmtMontant(l.prixUnit),
      fmtMontant(l.total)
    ]),
    theme: 'striped',
    headStyles: { fillColor: C, textColor: 255, fontStyle: 'bold', fontSize: 9, halign: 'center' },
    styles: { fontSize: 9, cellPadding: 3.5 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'right',  cellWidth: 45 },
      4: { halign: 'right',  cellWidth: 45 }
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    tableLineColor: [220, 220, 220],
    tableLineWidth: 0.15
  })

  // ── Totaux ───────────────────────────────────────────────────────────────
  let ty = doc.lastAutoTable.finalY + 6
  const right = 196
  const boxL  = 124

  const totalHT      = facture.totalHT || 0
  const remiseMontant = facture.remise ? totalHT * facture.remise / 100 : 0
  const baseTVA      = totalHT - remiseMontant
  const tvaMontant   = facture.tva ? baseTVA * facture.tva / 100 : 0

  // Cadre totaux
  const nbLignes = 1 + (facture.remise ? 1 : 0) + (facture.tva ? 1 : 0) + 1
  doc.setFillColor(250, 250, 250)
  doc.setDrawColor(...C)
  doc.setLineWidth(0.3)
  doc.roundedRect(boxL - 2, ty - 4, right - boxL + 4, nbLignes * 7 + 6, 2, 2, 'FD')

  const ligneTotaux = (label, val, highlight = false) => {
    doc.setFont('helvetica', highlight ? 'bold' : 'normal')
    doc.setFontSize(highlight ? 10.5 : 8.5)
    doc.setTextColor(highlight ? C[0] : 60, highlight ? C[1] : 60, highlight ? C[2] : 60)
    doc.text(label, boxL, ty)
    doc.text(fmtFCFA(val), right, ty, { align: 'right' })
    if (highlight) {
      doc.setDrawColor(...C)
      doc.setLineWidth(0.4)
      doc.line(boxL - 2, ty - 3.5, right, ty - 3.5)
    }
    ty += highlight ? 8 : 7
    doc.setTextColor(60, 60, 60)
    doc.setLineWidth(0.2)
  }

  ligneTotaux('Sous-total HT', totalHT)
  if (facture.remise) ligneTotaux(`Remise (${facture.remise} %)`, -remiseMontant)
  if (facture.tva)    ligneTotaux(`TVA (${facture.tva} %)`, tvaMontant)
  ligneTotaux('TOTAL À PAYER', facture.totalTTC || 0, true)

  // ── Note + cachet ────────────────────────────────────────────────────────
  ty += 6
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(130, 130, 130)
  doc.text('Règlement à réception. Tout paiement doit être accompagné du numéro de facture.', 14, ty)

  // Cachet / signature
  doc.setDrawColor(...C)
  doc.setLineWidth(0.3)
  doc.roundedRect(14, ty + 4, 60, 22, 2, 2, 'D')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C)
  doc.text('CACHET & SIGNATURE', 44, ty + 9, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(160, 160, 160)
  doc.text(cfg.nom, 44, ty + 22, { align: 'center' })

  footer(doc, cfg)
  doc.save(`${type}-${facture.numero}.pdf`)
}

// ─── RAPPORT SIMPLE ───────────────────────────────────────────────────────────
export async function genererRapportPDF({ titre, colonnes, lignes, fichier, module = 'default' }) {
  const cfg = MODULE_CONFIG[module] || MODULE_CONFIG.default
  const [logoTermitiere, logoModule] = await Promise.all([
    chargerLogo('/termitiere-logo.png').then(r => r || chargerLogo('/logo-mark.png')),
    chargerLogo(cfg.logo)
  ])
  const doc = new jsPDF()
  const y = await headerPremium(doc, titre, cfg, logoTermitiere, logoModule)
  autoTable(doc, {
    startY: y + 2,
    head: [colonnes],
    body: lignes,
    theme: 'striped',
    headStyles: { fillColor: cfg.couleur, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 3 },
    alternateRowStyles: { fillColor: [250, 250, 250] }
  })
  footer(doc, cfg)
  doc.save(fichier || 'rapport.pdf')
}

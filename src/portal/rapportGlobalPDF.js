// Rapport global de tous les secteurs en PDF (A4). En-tête de la société sur chaque page : logo LA TERMITIÈRE, ses domaines d'activité et la bande
// « Toujours dans l'action ! » ; pied de page : N° CFE et RCCM, téléphone, e-mail, adresse. Corps : synthèse chiffrée, barres comparées, puis une
// partie par secteur avec son activité et ses opérations (si demandées). Tout est dessiné avec jsPDF (aucune capture d'écran).
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { chargerLogo } from '../utils/exportPDF'

const ENTREPRISE = {
  domaines: [
    'LOGISTIQUE, QUINCAILLERIE, SALLE DE SPORT ET SANTE',
    'BTP, ELEVAGE, AGRO BUSINESS, FORMATION ET EDUCATION',
    'COMMUNICATION DES ENTREPRISES, COSMETIQUE ET BEAUTE',
    'NOUVELLES TECHNOLOGIES, HOTELLERIE ET RESTAURATION'
  ],
  devise: "Toujours dans l'action !",
  cfe: 'N° CFE : 06143PM2021 / 2024',
  rccm: 'N° RCCM : TG-LFW-01-2024-M-10838',
  tel: '00228 96 09 49 49',
  email: 'latermitiere2021@gmail.com',
  adresse: 'AGOE DALIKO, LOME'
}

const ROUGE = [188, 60, 49]
const ROSE = [223, 160, 155]
const GRIS_FONCE = [112, 112, 112]
const GRIS_TXT = [70, 70, 70]
const VERT = [22, 163, 74]
const ROUGE_DEP = [220, 38, 38]
const PAGE_W = 210
const MARGE = 14
const HAUT_CORPS = 52    // début du corps sous l'en-tête
const BAS_CORPS = 262    // fin du corps (au-dessus du pied de page)

// jsPDF ne sait pas afficher l'espace fine insécable de toLocaleString : on la remplace par une espace simple.
const nb = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')
const fcfa = (n) => `${nb(n)} FCFA`
const dateCourte = (j) => String(j || '').split('-').reverse().join('/')
const rgb = (hex) => { const h = String(hex || '#64748b').replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) }
const clair = (c, k = 0.9) => c.map((v) => Math.round(v + (255 - v) * k))

// Polygone plein à partir de points absolus [[x, y], ...].
function polygone(doc, points, couleur) {
  doc.setFillColor(...couleur)
  const [[x0, y0], ...reste] = points
  const segments = []
  let px = x0, py = y0
  reste.forEach(([x, y]) => { segments.push([x - px, y - py]); px = x; py = y })
  segments.push([x0 - px, y0 - py])
  doc.lines(segments, x0, y0, [1, 1], 'F', true)
}

// ─── EN-TÊTE (comme le papier à en-tête de la société) ─────────────────────────
function enTete(doc, logo) {
  if (logo?.dataURL) {
    const h = 33, w = h * (logo.w / logo.h)
    doc.addImage(logo.dataURL, 'PNG', 12, 5, w, h)
  }
  // Domaines d'activité : quatre lignes en italique gras gris
  doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(6.9); doc.setTextColor(...GRIS_FONCE)
  ENTREPRISE.domaines.forEach((l, i) => doc.text(l, 44, 13 + i * 4.8))
  // Bande « Toujours dans l'action ! » : deux petits traits penchés puis la bande rose
  polygone(doc, [[139, 31], [142, 31], [138, 22], [135, 22]], ROSE)
  polygone(doc, [[145, 31], [148, 31], [144, 22], [141, 22]], ROSE)
  polygone(doc, [[152, 31], [PAGE_W, 31], [PAGE_W, 22], [148, 22]], ROSE)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(255, 255, 255)
  doc.text(ENTREPRISE.devise, 182, 28, { align: 'center' })
  // Barre grise en pointe sous l'en-tête
  polygone(doc, [[12, 42], [112, 42], [109, 44.4], [12, 44.4]], [127, 127, 127])
}

// ─── PIED DE PAGE : bloc rose (CFE, RCCM) puis téléphone, e-mail, adresse ─────
function icone(doc, x, y, type) {
  doc.setFillColor(...GRIS_FONCE); doc.circle(x, y, 2.4, 'F')
  doc.setFillColor(255, 255, 255); doc.setDrawColor(255, 255, 255); doc.setTextColor(255, 255, 255)
  if (type === 'tel') doc.roundedRect(x - 0.9, y - 1.3, 1.8, 2.6, 0.4, 0.4, 'F')
  else if (type === 'mail') { doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); doc.text('@', x, y + 0.9, { align: 'center' }) }
  else { doc.circle(x, y - 0.3, 0.95, 'F'); doc.triangle(x - 0.9, y + 0.2, x + 0.9, y + 0.2, x, y + 1.6, 'F') }
}
function piedDePage(doc, numero, total, meta) {
  const h = doc.internal.pageSize.getHeight()
  polygone(doc, [[0, h - 25], [77, h - 25], [81, h - 10], [0, h - 10]], ROSE)
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6)
  doc.text(ENTREPRISE.cfe, 8, h - 19); doc.text(ENTREPRISE.rccm, 8, h - 14)
  const rubriques = [{ type: 'tel', texte: ENTREPRISE.tel, gras: false }, { type: 'mail', texte: ENTREPRISE.email, gras: true }, { type: 'pin', texte: ENTREPRISE.adresse, gras: true }]
  // Taille de texte la plus grande qui laisse les trois rubriques tenir entre le bloc rose et le bord de la page.
  let taille = 8
  const largeurs = (t) => { doc.setFontSize(t); doc.setFont('helvetica', 'bold'); return rubriques.map((r) => doc.getTextWidth(r.texte) + 4) }
  while (taille > 6.4 && 87 + largeurs(taille).reduce((a, b) => a + b + 6, 0) > PAGE_W - 4) taille -= 0.2
  const ws = largeurs(taille)
  let x = 87
  rubriques.forEach((r, i) => {
    icone(doc, x, h - 17, r.type)
    doc.setFontSize(taille); doc.setTextColor(...GRIS_FONCE)
    if (r.gras) { doc.setFont('helvetica', 'bold'); doc.text(r.texte, x + 4, h - 16.2) }
    else {
      const [debut, ...fin] = r.texte.split(' ')
      doc.setFont('helvetica', 'normal'); doc.text(`${debut} `, x + 4, h - 16.2)
      doc.setFont('helvetica', 'bold'); doc.text(fin.join(' '), x + 4 + doc.getTextWidth(`${debut} `), h - 16.2)
    }
    x += ws[i] + 6
  })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  doc.text(meta, MARGE, h - 4.5)
  doc.text(`Page ${numero} / ${total}`, PAGE_W - MARGE, h - 4.5, { align: 'right' })
}

// ─── CORPS ────────────────────────────────────────────────────────────────────
const titreSection = (doc, y, texte, couleur) => {
  doc.setFillColor(...couleur); doc.roundedRect(MARGE, y, PAGE_W - 2 * MARGE, 8, 1.6, 1.6, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(255, 255, 255)
  doc.text(texte, MARGE + 4, y + 5.5)
  return y + 12
}
const carte = (doc, x, y, w, couleur, libelle, valeur, sous) => {
  doc.setFillColor(...clair(couleur, 0.92)); doc.setDrawColor(...clair(couleur, 0.6)); doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, 21, 2.2, 2.2, 'FD')
  doc.setFillColor(...couleur); doc.roundedRect(x, y, 2, 21, 1, 1, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...GRIS_FONCE); doc.text(libelle.toUpperCase(), x + 5, y + 6)
  doc.setFontSize(11.5); doc.setTextColor(...couleur); doc.text(valeur, x + 5, y + 13.2)
  if (sous) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...GRIS_FONCE); doc.text(sous, x + 5, y + 18.2) }
}

// Barres comparées : recettes (vert) et dépenses (rouge) de chaque secteur, à la même échelle.
function barres(doc, y, secteurs) {
  const actifs = secteurs.filter((s) => s.recettes || s.depenses)
  if (!actifs.length) return y
  const max = Math.max(...actifs.flatMap((s) => [s.recettes, s.depenses]), 1)
  const largeur = 92, x0 = 56
  actifs.forEach((s) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.6); doc.setTextColor(...GRIS_TXT)
    doc.text(s.label, MARGE, y + 4.2, { maxWidth: 40 })
    doc.setFillColor(...clair(rgb(s.couleur), 0.8)); doc.roundedRect(x0 - 2, y, largeur + 4, 7.6, 1, 1, 'F')
    const wr = (s.recettes / max) * largeur, wd = (s.depenses / max) * largeur
    if (wr > 0.4) { doc.setFillColor(...VERT); doc.roundedRect(x0, y + 0.9, wr, 2.7, 0.6, 0.6, 'F') }
    if (wd > 0.4) { doc.setFillColor(...ROUGE_DEP); doc.roundedRect(x0, y + 4, wd, 2.7, 0.6, 0.6, 'F') }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...VERT); doc.text(nb(s.recettes), x0 + largeur + 7, y + 3)
    doc.setTextColor(...ROUGE_DEP); doc.text(nb(s.depenses), x0 + largeur + 7, y + 6.6)
    y += 10
  })
  return y
}

// Construit le PDF et le renvoie (jsPDF) ; `genererRapportGlobalPDF` l'enregistre.
export async function construireRapportGlobalPDF({ rapport, libelle, par = '', avecDetails = true, tousLesSecteurs = true }) {
  const logo = await chargerLogo('/logo-full.png')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const { secteurs, total } = rapport
  const maintenant = new Date()
  const horodatage = `${maintenant.toLocaleDateString('fr-FR')} à ${maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  let y = HAUT_CORPS
  const place = (hauteur) => { if (y + hauteur > BAS_CORPS) { doc.addPage(); y = HAUT_CORPS } }

  // Titre
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...ROUGE)
  doc.text('RAPPORT GLOBAL DES SECTEURS', MARGE, y + 4)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...GRIS_TXT)
  doc.text(`Période : ${libelle}`, MARGE, y + 11)
  const noms = tousLesSecteurs ? `Tous les secteurs (${secteurs.length})` : secteurs.map((s) => s.label).join(', ')
  doc.setFontSize(8.6); doc.setTextColor(...GRIS_FONCE)
  const ligneNoms = doc.splitTextToSize(`Secteurs : ${noms}`, PAGE_W - 2 * MARGE)
  doc.text(ligneNoms, MARGE, y + 16.5)
  y += 17 + ligneNoms.length * 4

  // Chiffres clés
  const w = (PAGE_W - 2 * MARGE - 9) / 4
  const croissance = total.croissance == null ? '' : `${total.croissance >= 0 ? '+' : ''}${Math.round(total.croissance)} % sur la période précédente`
  carte(doc, MARGE, y, w, VERT, 'Recettes', fcfa(total.recettes), croissance)
  carte(doc, MARGE + (w + 3), y, w, ROUGE_DEP, 'Dépenses', fcfa(total.depenses), `${total.nbOperations} opération(s)`)
  carte(doc, MARGE + (w + 3) * 2, y, w, total.benefice >= 0 ? [2, 132, 199] : ROUGE_DEP, 'Bénéfice', `${total.benefice >= 0 ? '' : '- '}${fcfa(Math.abs(total.benefice))}`, total.recettes > 0 ? `${Math.round((total.benefice / total.recettes) * 100)} % des recettes` : '')
  carte(doc, MARGE + (w + 3) * 3, y, w, [124, 58, 237], 'Objectif', total.cible > 0 ? `${Math.round(total.pct)} %` : 'Non fixé', total.cible > 0 ? `sur ${fcfa(total.cible)}` : 'Pour un mois ou une année')
  y += 27

  // Synthèse par secteur
  y = titreSection(doc, y, 'SYNTHÈSE PAR SECTEUR', ROUGE)
  autoTable(doc, {
    startY: y, margin: { left: MARGE, right: MARGE, top: HAUT_CORPS, bottom: 300 - BAS_CORPS },
    head: [['Secteur', 'Recettes', 'Dépenses', 'Bénéfice', 'Objectif', 'Atteint']],
    body: secteurs.map((s) => [s.label, nb(s.recettes), nb(s.depenses), `${s.benefice < 0 ? '-' : ''}${nb(Math.abs(s.benefice))}`, s.cible > 0 ? nb(s.cible) : '-', s.pct == null ? '-' : `${Math.round(s.pct)} %`]),
    foot: [['TOTAL', nb(total.recettes), nb(total.depenses), `${total.benefice < 0 ? '-' : ''}${nb(Math.abs(total.benefice))}`, total.cible > 0 ? nb(total.cible) : '-', total.pct == null ? '-' : `${Math.round(total.pct)} %`]],
    theme: 'grid', showFoot: 'lastPage',
    styles: { fontSize: 8.2, cellPadding: 2.2, lineColor: [229, 231, 235], lineWidth: 0.2, textColor: GRIS_TXT },
    headStyles: { fillColor: ROSE, textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [243, 244, 246], textColor: [40, 40, 40], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 245, 244] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'center' } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 3 && String(d.cell.raw).startsWith('-')) d.cell.styles.textColor = ROUGE_DEP
      if (d.section === 'body' && d.column.index === 1) d.cell.styles.textColor = VERT
      if (d.section === 'body' && d.column.index === 2 && d.cell.raw !== '0') d.cell.styles.textColor = ROUGE_DEP
    }
  })
  y = doc.lastAutoTable.finalY + 8

  // Barres comparées
  if (secteurs.some((s) => s.recettes || s.depenses)) {
    place(36)
    y = titreSection(doc, y, 'RECETTES ET DÉPENSES PAR SECTEUR', ROUGE)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setFillColor(...VERT); doc.rect(MARGE, y - 1.2, 3, 2.4, 'F'); doc.setTextColor(...GRIS_FONCE); doc.text('Recettes', MARGE + 4.5, y + 0.9)
    doc.setFillColor(...ROUGE_DEP); doc.rect(MARGE + 22, y - 1.2, 3, 2.4, 'F'); doc.text('Dépenses', MARGE + 26.5, y + 0.9)
    y += 4
    for (const s of secteurs.filter((x) => x.recettes || x.depenses)) {
      place(11)
      y = barres(doc, y, [s])
    }
    y += 3
  }

  // Une partie par secteur
  for (const s of secteurs) {
    const aDuContenu = s.recettes || s.depenses || s.nbOperations || s.activite.some((a) => a.valeur)
    if (!aDuContenu && !tousLesSecteurs) continue
    place(46)
    const c = rgb(s.couleur)
    y = titreSection(doc, y, s.label, c)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6)
    doc.setTextColor(...VERT); doc.text(`Recettes : ${fcfa(s.recettes)}`, MARGE, y)
    doc.setTextColor(...ROUGE_DEP); doc.text(`Dépenses : ${fcfa(s.depenses)}`, MARGE + 58, y)
    doc.setTextColor(...(s.benefice >= 0 ? [2, 132, 199] : ROUGE_DEP)); doc.text(`Bénéfice : ${s.benefice < 0 ? '- ' : ''}${fcfa(Math.abs(s.benefice))}`, MARGE + 116, y)
    y += 5
    if (s.cible > 0) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS_FONCE)
      doc.text(`Objectif : ${fcfa(s.cible)} · atteint à ${Math.round(s.pct)} % (${s.etat.libelle.toLowerCase()})`, MARGE, y)
      y += 5
    }
    if (s.activite.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS_TXT)
      doc.text(s.activite.map((a) => `${a.libelle} : ${nb(a.valeur)}`).join('   ·   '), MARGE, y)
      y += 5
    }
    if (avecDetails && s.operations.length) {
      autoTable(doc, {
        startY: y + 1, margin: { left: MARGE, right: MARGE, top: HAUT_CORPS, bottom: 300 - BAS_CORPS },
        head: [['Date', 'Type', 'Libellé', 'Montant (FCFA)']],
        body: s.operations.map((o) => [dateCourte(o.date), o.sens === 'recette' ? 'Recette' : 'Dépense', o.libelle || '-', `${o.sens === 'recette' ? '+' : '-'} ${nb(o.montant)}`]),
        theme: 'striped',
        styles: { fontSize: 7.6, cellPadding: 1.7, textColor: GRIS_TXT, overflow: 'linebreak' },
        headStyles: { fillColor: c, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: clair(c, 0.95) },
        columnStyles: { 0: { cellWidth: 21 }, 1: { cellWidth: 19 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' } },
        didParseCell: (d) => { if (d.section === 'body' && (d.column.index === 1 || d.column.index === 3)) d.cell.styles.textColor = d.row.raw[1] === 'Recette' ? VERT : ROUGE_DEP }
      })
      y = doc.lastAutoTable.finalY + 8
    } else {
      if (!s.operations.length) { doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.text('Aucune opération sur la période.', MARGE, y + 1); y += 5 }
      y += 4
    }
  }

  // En-tête et pied de page sur chaque page, une fois le nombre de pages connu.
  const pages = doc.getNumberOfPages()
  const meta = `Rapport édité le ${horodatage}${par ? ` par ${par}` : ''} · Période : ${libelle}`
  for (let i = 1; i <= pages; i++) { doc.setPage(i); enTete(doc, logo); piedDePage(doc, i, pages, meta) }
  return doc
}

export async function genererRapportGlobalPDF(options) {
  const doc = await construireRapportGlobalPDF(options)
  doc.save(options.fichier || 'rapport-global.pdf')
  return doc
}

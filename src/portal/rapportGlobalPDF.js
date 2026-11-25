// Rapport global de tous les secteurs en PDF (A4). En-tête de la société sur chaque page : logo LA TERMITIÈRE, ses domaines d'activité et la bande
// « Toujours dans l'action ! » ; pied de page : N° CFE et RCCM, téléphone, e-mail, adresse. Corps sobre, en police Times, texte noir : chiffres
// clés, un seul tableau de synthèse, puis une partie par secteur (son nom est la seule couleur du rapport) avec son activité et, si demandées, ses
// opérations. Sans montant (`sansMontant`) : uniquement l'activité de chaque secteur. Tout est dessiné avec jsPDF (aucune capture d'écran).
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

const ROSE = [223, 160, 155]
const GRIS_FONCE = [112, 112, 112]
const GRIS_TXT = [70, 70, 70]
const PAGE_W = 210
const MARGE = 14
const HAUT_CORPS = 52    // début du corps sous l'en-tête
const BAS_CORPS = 262    // fin du corps (au-dessus du pied de page)

// jsPDF ne sait pas afficher l'espace fine insécable de toLocaleString : on la remplace par une espace simple.
const nb = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')
const fcfa = (n) => `${nb(n)} FCFA`
const dateCourte = (j) => String(j || '').split('-').reverse().join('/')
const signe = (n) => `${n < 0 ? '- ' : ''}${fcfa(Math.abs(n))}`
const sn = (n) => `${n < 0 ? '-' : ''}${nb(Math.abs(n))}`
const rgb = (hex) => { const h = String(hex || '#64748b').replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) }

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
export function enTete(doc, logo) {
  if (logo?.dataURL) {
    const h = 33, w = h * (logo.w / logo.h)
    doc.addImage(logo.dataURL, 'PNG', 12, 5, w, h)
  }
  // Domaines d'activité : quatre lignes en italique gras gris
  doc.setFont('times', 'bolditalic'); doc.setFontSize(8); doc.setTextColor(...GRIS_FONCE)
  ENTREPRISE.domaines.forEach((l, i) => doc.text(l, 44, 13 + i * 4.8))
  // Bande « Toujours dans l'action ! » : deux petits traits penchés puis la bande rose
  polygone(doc, [[139, 31], [142, 31], [138, 22], [135, 22]], ROSE)
  polygone(doc, [[145, 31], [148, 31], [144, 22], [141, 22]], ROSE)
  polygone(doc, [[152, 31], [PAGE_W, 31], [PAGE_W, 22], [148, 22]], ROSE)
  doc.setFont('times', 'normal'); doc.setFontSize(10); doc.setTextColor(255, 255, 255)
  doc.text(ENTREPRISE.devise, 182, 28, { align: 'center' })
  // Barre grise en pointe sous l'en-tête
  polygone(doc, [[12, 42], [112, 42], [109, 44.4], [12, 44.4]], [127, 127, 127])
}

// ─── PIED DE PAGE : bloc rose (CFE, RCCM) puis téléphone, e-mail, adresse ─────
function icone(doc, x, y, type) {
  doc.setFillColor(...GRIS_FONCE); doc.circle(x, y, 2.4, 'F')
  doc.setFillColor(255, 255, 255); doc.setDrawColor(255, 255, 255); doc.setTextColor(255, 255, 255)
  if (type === 'tel') doc.roundedRect(x - 0.9, y - 1.3, 1.8, 2.6, 0.4, 0.4, 'F')
  else if (type === 'mail') { doc.setFont('times', 'bold'); doc.setFontSize(6.2); doc.text('@', x, y + 0.9, { align: 'center' }) }
  else { doc.circle(x, y - 0.3, 0.95, 'F'); doc.triangle(x - 0.9, y + 0.2, x + 0.9, y + 0.2, x, y + 1.6, 'F') }
}
export function piedDePage(doc, numero, total, meta) {
  const h = doc.internal.pageSize.getHeight()
  polygone(doc, [[0, h - 25], [77, h - 25], [81, h - 10], [0, h - 10]], ROSE)
  doc.setTextColor(255, 255, 255); doc.setFont('times', 'bold'); doc.setFontSize(8.6)
  doc.text(ENTREPRISE.cfe, 8, h - 19); doc.text(ENTREPRISE.rccm, 8, h - 14)
  const rubriques = [{ type: 'tel', texte: ENTREPRISE.tel, gras: false }, { type: 'mail', texte: ENTREPRISE.email, gras: true }, { type: 'pin', texte: ENTREPRISE.adresse, gras: true }]
  // Taille de texte la plus grande qui laisse les trois rubriques tenir entre le bloc rose et le bord de la page.
  let taille = 8
  const largeurs = (t) => { doc.setFontSize(t); doc.setFont('times', 'bold'); return rubriques.map((r) => doc.getTextWidth(r.texte) + 4) }
  while (taille > 6.4 && 87 + largeurs(taille).reduce((a, b) => a + b + 6, 0) > PAGE_W - 4) taille -= 0.2
  const ws = largeurs(taille)
  let x = 87
  rubriques.forEach((r, i) => {
    icone(doc, x, h - 17, r.type)
    doc.setFontSize(taille); doc.setTextColor(...GRIS_FONCE)
    if (r.gras) { doc.setFont('times', 'bold'); doc.text(r.texte, x + 4, h - 16.2) }
    else {
      const [debut, ...fin] = r.texte.split(' ')
      doc.setFont('times', 'normal'); doc.text(`${debut} `, x + 4, h - 16.2)
      doc.setFont('times', 'bold'); doc.text(fin.join(' '), x + 4 + doc.getTextWidth(`${debut} `), h - 16.2)
    }
    x += ws[i] + 6
  })
  doc.setFont('times', 'normal'); doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  doc.text(meta, MARGE, h - 4.5)
  doc.text(`Page ${numero} / ${total}`, PAGE_W - MARGE, h - 4.5, { align: 'right' })
}

// ─── CORPS ────────────────────────────────────────────────────────────────────
// Sobre : police Times, texte noir, filets gris très fins ; la seule couleur est celle du NOM de chaque secteur.
const NOIR = [20, 20, 20]
const FILET = [190, 190, 190]
const titreSection = (doc, y, texte) => {
  doc.setFont('times', 'bold'); doc.setFontSize(12); doc.setTextColor(...NOIR)
  doc.text(texte, MARGE, y + 4)
  doc.setDrawColor(...FILET); doc.setLineWidth(0.25); doc.line(MARGE, y + 6, PAGE_W - MARGE, y + 6)
  return y + 11
}
const titreSecteur = (doc, y, texte, couleur) => {
  doc.setFont('times', 'bold'); doc.setFontSize(13.5); doc.setTextColor(...couleur)
  doc.text(texte, MARGE, y + 4.5)
  doc.setDrawColor(...FILET); doc.setLineWidth(0.25); doc.line(MARGE, y + 7, PAGE_W - MARGE, y + 7)
  return y + 12
}
const ligne = (doc, texte, y, { taille = 10.5, style = 'normal', couleur = NOIR } = {}) => {
  doc.setFont('times', style); doc.setFontSize(taille); doc.setTextColor(...couleur)
  doc.text(texte, MARGE, y)
}
// Tableau sobre : fond blanc, filets fins, aucun aplat de couleur.
const STYLE_TABLEAU = {
  theme: 'grid',
  styles: { font: 'times', fontSize: 9.5, cellPadding: 1.8, lineColor: FILET, lineWidth: 0.2, textColor: NOIR, fillColor: [255, 255, 255] },
  headStyles: { fillColor: [255, 255, 255], textColor: NOIR, fontStyle: 'bold', lineColor: [120, 120, 120], lineWidth: 0.3 },
  footStyles: { fillColor: [255, 255, 255], textColor: NOIR, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [255, 255, 255] }
}

// Construit le PDF et le renvoie (jsPDF) ; `genererRapportGlobalPDF` l'enregistre.
//   sansMontant : rapport sans aucun montant (Assistant(e) GE) : seulement l'activité de chaque secteur.
export async function construireRapportGlobalPDF({ rapport, libelle, par = '', avecDetails = false, tousLesSecteurs = true, sansMontant = false }) {
  const logo = await chargerLogo('/logo-full.png')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const { secteurs, total } = rapport
  const maintenant = new Date()
  const horodatage = `${maintenant.toLocaleDateString('fr-FR')} à ${maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  let y = HAUT_CORPS
  const place = (hauteur) => { if (y + hauteur > BAS_CORPS) { doc.addPage(); y = HAUT_CORPS } }

  // Titre
  ligne(doc, 'RAPPORT GLOBAL DES SECTEURS', y + 4, { taille: 17, style: 'bold' })
  ligne(doc, `Période : ${libelle}`, y + 11, { taille: 11.5 })
  const noms = tousLesSecteurs ? `Tous les secteurs (${secteurs.length})` : secteurs.map((s) => s.label).join(', ')
  doc.setFont('times', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GRIS_FONCE)
  const ligneNoms = doc.splitTextToSize(`Secteurs : ${noms}`, PAGE_W - 2 * MARGE)
  doc.text(ligneNoms, MARGE, y + 16.5)
  y += 20 + ligneNoms.length * 4

  if (!sansMontant) {
    // Chiffres clés : une seule ligne de texte, sans cartes.
    y = titreSection(doc, y, 'Chiffres clés')
    const cles = [`Recettes : ${fcfa(total.recettes)}`, `Dépenses : ${fcfa(total.depenses)}`, `Bénéfice : ${total.benefice < 0 ? '- ' : ''}${fcfa(Math.abs(total.benefice))}`]
    if (total.cible > 0) cles.push(`Objectif atteint : ${Math.round(total.pct)} %`)
    ligne(doc, cles.join('     '), y)
    y += 9

    // Synthèse par secteur : le seul tableau du rapport.
    y = titreSection(doc, y, 'Synthèse par secteur')
    autoTable(doc, {
      ...STYLE_TABLEAU, startY: y, margin: { left: MARGE, right: MARGE, top: HAUT_CORPS, bottom: 300 - BAS_CORPS },
      head: [['Secteur', 'Recettes', 'Dépenses', 'Bénéfice']],
      body: secteurs.map((s) => [s.label, nb(s.recettes), nb(s.depenses), `${s.benefice < 0 ? '-' : ''}${nb(Math.abs(s.benefice))}`]),
      foot: [['TOTAL', nb(total.recettes), nb(total.depenses), `${total.benefice < 0 ? '-' : ''}${nb(Math.abs(total.benefice))}`]],
      showFoot: 'lastPage',
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      // Le nom du secteur garde sa couleur : c'est la seule couleur du tableau.
      didParseCell: (d) => { if (d.section === 'body' && d.column.index === 0) d.cell.styles.textColor = rgb(secteurs[d.row.index]?.couleur) }
    })
    y = doc.lastAutoTable.finalY + 9
  }

  // Une partie par secteur
  y = titreSection(doc, y, sansMontant ? 'Activité par secteur' : 'Détail par secteur')
  for (const s of secteurs) {
    const aDuContenu = s.nbOperations || s.activite.some((a) => a.valeur) || (!sansMontant && (s.recettes || s.depenses))
    if (!aDuContenu && !tousLesSecteurs) continue
    place(34)
    y = titreSecteur(doc, y, s.label, rgb(s.couleur))
    if (!sansMontant) {
      ligne(doc, `Recettes : ${fcfa(s.recettes)}     Dépenses : ${fcfa(s.depenses)}     Bénéfice : ${s.benefice < 0 ? '- ' : ''}${fcfa(Math.abs(s.benefice))}`, y)
      y += 5.5
      if (s.cible > 0) { ligne(doc, `Objectif : ${fcfa(s.cible)}, atteint à ${Math.round(s.pct)} %`, y, { taille: 9.5, couleur: GRIS_TXT }); y += 5.5 }
    }
    // Cumul du mois : visible par tous, y compris l'Assistant(e) GE (seul montant de son rapport).
    ligne(doc, `Cumul ${rapport.libelleCumul} : recettes ${fcfa(s.cumulRecettes)}     dépenses ${fcfa(s.cumulDepenses)}     bénéfice ${signe(s.cumulBenefice)}`, y, { style: 'bold' })
    y += 5.5
    const faits = s.activite.map((a) => `${a.libelle} : ${nb(a.valeur)}`)
    if (sansMontant) faits.push(`Opérations enregistrées : ${nb(s.nbOperations)}`)
    if (faits.length) {
      const lignes = doc.splitTextToSize(faits.join('   ·   '), PAGE_W - 2 * MARGE)
      doc.setFont('times', 'normal'); doc.setFontSize(10); doc.setTextColor(...GRIS_TXT)
      doc.text(lignes, MARGE, y)
      y += lignes.length * 4.8
    }
    if (avecDetails && s.operations.length) {
      // Sans montant (Assistant(e) GE) : le détail garde la date, la nature et le libellé de chaque opération, jamais la somme.
      autoTable(doc, {
        ...STYLE_TABLEAU, startY: y + 1, margin: { left: MARGE, right: MARGE, top: HAUT_CORPS, bottom: 300 - BAS_CORPS },
        styles: { ...STYLE_TABLEAU.styles, fontSize: 9, cellPadding: 1.5, overflow: 'linebreak' },
        head: [sansMontant ? ['Date', 'Nature', 'Libellé'] : ['Date', 'Type', 'Libellé', 'Montant (FCFA)']],
        body: s.operations.map((o) => (sansMontant
          ? [dateCourte(o.date), o.sens === 'recette' ? 'Recette' : 'Dépense', o.libelle || '-']
          : [dateCourte(o.date), o.sens === 'recette' ? 'Recette' : 'Dépense', o.libelle || '-', `${o.sens === 'recette' ? '+' : '-'} ${nb(o.montant)}`])),
        columnStyles: sansMontant
          ? { 0: { cellWidth: 22 }, 1: { cellWidth: 22 }, 2: { cellWidth: 'auto' } }
          : { 0: { cellWidth: 22 }, 1: { cellWidth: 20 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 32, halign: 'right' } }
      })
      y = doc.lastAutoTable.finalY + 8
    } else {
      y += 7
    }
  }

  // Situation générale : tous les secteurs, période et cumul du mois (du 1er du mois à la date d'extraction), avec le total général en bas.
  const sit = rapport.situation
  if (sit) {
    place(sansMontant ? 30 : 60)
    y = titreSection(doc, y, 'Situation générale de tous les secteurs')
    ligne(doc, `Cumul : ${rapport.libelleCumul} (du 1er du mois à la date d'extraction du rapport)`, y, { taille: 9.5, couleur: GRIS_TXT }); y += 6
    if (sansMontant) {
      // Assistant(e) GE : le cumul seulement (pas les montants de la période).
      autoTable(doc, {
        ...STYLE_TABLEAU, startY: y, margin: { left: MARGE, right: MARGE, top: HAUT_CORPS, bottom: 300 - BAS_CORPS },
        styles: { ...STYLE_TABLEAU.styles, fontSize: 9 },
        head: [['Secteur', 'Cumul recettes (mois)', 'Cumul dépenses (mois)', 'Cumul bénéfice (mois)']],
        body: sit.secteurs.map((l) => [l.label, nb(l.cumulRecettes), nb(l.cumulDepenses), sn(l.cumulBenefice)]),
        foot: [['TOTAL GÉNÉRAL', nb(sit.total.cumulRecettes), nb(sit.total.cumulDepenses), sn(sit.total.cumulBenefice)]],
        showFoot: 'lastPage',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        didParseCell: (d) => { if (d.section === 'body' && d.column.index === 0) d.cell.styles.textColor = rgb(sit.secteurs[d.row.index]?.couleur) }
      })
      y = doc.lastAutoTable.finalY + 6
      place(14)
      ligne(doc, `Au total, tous secteurs confondus, ${rapport.libelleCumul} : recettes ${fcfa(sit.total.cumulRecettes)}, dépenses ${fcfa(sit.total.cumulDepenses)}, bénéfice ${signe(sit.total.cumulBenefice)}.`, y, { taille: 10, style: 'bold' })
      y += 7
    } else {
      autoTable(doc, {
        ...STYLE_TABLEAU, startY: y, margin: { left: MARGE, right: MARGE, top: HAUT_CORPS, bottom: 300 - BAS_CORPS },
        styles: { ...STYLE_TABLEAU.styles, fontSize: 8.5, cellPadding: 1.6 },
        head: [['Secteur', 'Recettes (période)', 'Dépenses (période)', 'Bénéfice (période)', 'Cumul recettes (mois)', 'Cumul dépenses (mois)', 'Cumul bénéfice (mois)']],
        body: sit.secteurs.map((l) => [l.label, nb(l.recettes), nb(l.depenses), sn(l.benefice), nb(l.cumulRecettes), nb(l.cumulDepenses), sn(l.cumulBenefice)]),
        foot: [['TOTAL GÉNÉRAL', nb(sit.total.recettes), nb(sit.total.depenses), sn(sit.total.benefice), nb(sit.total.cumulRecettes), nb(sit.total.cumulDepenses), sn(sit.total.cumulBenefice)]],
        showFoot: 'lastPage',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
        didParseCell: (d) => { if (d.section === 'body' && d.column.index === 0) d.cell.styles.textColor = rgb(sit.secteurs[d.row.index]?.couleur) }
      })
      y = doc.lastAutoTable.finalY + 6
      place(14)
      ligne(doc, `Au total, tous secteurs confondus, ${rapport.libelleCumul} : recettes ${fcfa(sit.total.cumulRecettes)}, dépenses ${fcfa(sit.total.cumulDepenses)}, bénéfice ${signe(sit.total.cumulBenefice)}.`, y, { taille: 10, style: 'bold' })
      y += 7
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

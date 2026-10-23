// COMPTABILITÉ : rapport financier en PDF, celui que le DF envoie au PAU (en fin de journée, ou sur un mois, une année, une plage).
// La période suit le filtre choisi en haut de la page Recettes (Jour, Mois, Année, Plage) et elle est écrite dans l'en-tête.
// Même contenu que le modèle de la direction : situation financière, comptes bancaires, caisse, détail par secteur, dépenses et opérations.
// Logo de LA TERMITIÈRE en en-tête. Tout est repris de l'application, rien n'est ressaisi ; l'utilisateur choisit les parties à inclure (`sections`).
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { chargerLogo } from '../../utils/exportPDF'
import { getAll } from '../../core/db'
import { COL } from './data'

const COLLECTIONS_BANQUE = ['agro_banque', 'logistique_banque', 'gym_banque', 'garderie_banque', 'bat_banque', 'evenementiel_banque', 'transport_banque', 'siege_banque', 'autres_banque']
const VERT = [183, 228, 160]
const SAUMON = [248, 198, 176]
const GRIS = [217, 217, 217]
const ROUGE = [220, 38, 38]

// jsPDF ne sait pas afficher l'espace fine insécable que produit toLocaleString : on la remplace par une espace simple.
const nb = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')
const cellule = (n) => (Number(n) ? nb(n) : '-')
const dateCourte = (jour) => jour.split('-').reverse().join('/')

// Comptes bancaires sur la période : solde avant le début, dépôts et retraits de la période, solde à la fin (mêmes règles que « Mouvements bancaires »).
async function situationBanques(debut, fin) {
  const [banques, ...listes] = await Promise.all([getAll(COL.banques), ...COLLECTIONS_BANQUE.map((c) => getAll(c))])
  const mouvements = listes.flat().filter((m) => !m.ouverture && m.date)
  return (banques || []).sort((a, b) => (a.nom || '').localeCompare(b.nom || '')).map((b) => {
    const siens = mouvements.filter((m) => m.banqueId === b.id)
    const net = (l) => l.reduce((t, m) => t + (m.type === 'depot' ? 1 : -1) * (Number(m.montant) || 0), 0)
    const initial = Number(b.soldeOuverture) || 0
    const dansPeriode = siens.filter((m) => m.date >= debut && m.date <= fin).sort((x, y) => (x.date < y.date ? -1 : 1))
    return {
      nom: (b.nom || 'Banque').toUpperCase(),
      soldeVeille: initial + net(siens.filter((m) => m.date < debut)),
      depots: dansPeriode.filter((m) => m.type === 'depot').reduce((t, m) => t + (Number(m.montant) || 0), 0),
      retraits: dansPeriode.filter((m) => m.type === 'retrait').reduce((t, m) => t + (Number(m.montant) || 0), 0),
      soldeJour: initial + net(siens.filter((m) => m.date <= fin)),
      operations: dansPeriode.map((m) => `${debut !== fin ? `${dateCourte(m.date)} : ` : ''}${m.type === 'depot' ? 'Dépôt' : 'Retrait'} de ${nb(m.montant)} F${m.libelle ? ` : ${m.libelle}` : ''}${m.origine ? ` (${m.origine})` : ''}`)
    }
  })
}

// debut, fin : « AAAA-MM-JJ » (le filtre de période de la page) ; intitule : texte de l'en-tête (« AU 23/10/2026 », « MOIS D'OCTOBRE 2026 »…).
// periodes : { jour, mois, annee: { r, d } } pour un seul jour ; { choisie, annee: { r, d } } pour une période plus longue.
// caisse : { moisPrecedent, debutMoisPlusAlimentation, soldeVeille, alimentation, depenses, soldeFin }.
export async function genererRapportJournalier({ debut, fin, intitule, periodes, secteurs, caisse, depensesPeriode = [], sections = {} }) {
  const veut = (k) => sections[k] !== false // toutes les parties par défaut
  const jourSeul = debut === fin
  const banques = await situationBanques(debut, fin)
  const logo = await chargerLogo('/termitiere-logo.png').then((r) => r || chargerLogo('/logo-full.png')).then((r) => r || chargerLogo('/logo-mark.png'))
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const L = 210
  const M = 12
  const base = { theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.25, halign: 'right' }, margin: { left: M, right: M } }
  const suite = () => doc.lastAutoTable.finalY
  const place = (hauteur) => { if (doc._y + hauteur > 285) { doc.addPage(); doc._y = 14 } }
  const periodeTexte = jourSeul ? dateCourte(fin) : `du ${dateCourte(debut)} au ${dateCourte(fin)}`

  // En-tête : logo centré, titre encadré, puis la période en toutes lettres
  let y = 8
  if (logo?.dataURL) {
    const h = 24
    const w = Math.min(70, (logo.w / logo.h) * h)
    doc.addImage(logo.dataURL, 'PNG', (L - w) / 2, y, w, h)
    y += h + 4
  }
  doc.setDrawColor(0); doc.setLineWidth(0.4); doc.rect(M, y, L - 2 * M, 9)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
  doc.text(`SITUATION FINANCIÈRE ${intitule}`, L / 2, y + 6.2, { align: 'center' })
  y += 12
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60)
  doc.text(`Période du rapport : ${periodeTexte}`, L / 2, y, { align: 'center' })
  doc.setTextColor(0)
  y += 4

  // Situation financière
  const resAnnuel = periodes.annee.r - periodes.annee.d
  const res = (p) => p.r - p.d
  const enteteGris = { fillColor: GRIS, textColor: 0, fontStyle: 'bold', halign: 'center' }
  const caseResultat = { content: nb(resAnnuel), rowSpan: 3, styles: { halign: 'center', valign: 'middle', fontStyle: 'bold', fontSize: 11, fillColor: SAUMON, textColor: resAnnuel < 0 ? ROUGE : [0, 0, 0] } }
  const saumonGras = { fontStyle: 'bold', fillColor: SAUMON }
  const colonnes = jourSeul
    ? [['JOURNALIER', periodes.jour], ['MENSUELLE', periodes.mois], ['ANNUELLE', periodes.annee]]
    : [[`PÉRIODE CHOISIE`, periodes.choisie], [`ANNUELLE (AU ${dateCourte(fin)})`, periodes.annee]]
  autoTable(doc, {
    ...base, startY: y,
    head: [['PÉRIODE', ...colonnes.map(([t]) => t), 'RÉSULTAT ANNUEL']],
    headStyles: enteteGris,
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', fillColor: GRIS, cellWidth: 40 } },
    body: [
      ['RECETTES TOTALES', ...colonnes.map(([, p]) => nb(p.r)), caseResultat],
      ['CHARGES TOTALES', ...colonnes.map(([, p]) => nb(p.d))],
      [{ content: 'RÉSULTAT', styles: { fontStyle: 'bold', fillColor: GRIS, halign: 'left' } }, ...colonnes.map(([, p]) => ({ content: nb(res(p)), styles: saumonGras }))]
    ]
  })
  doc._y = suite() + 3

  // Banques
  const etiqBanque = jourSeul ? ['SOLDE J-1', 'DÉPÔT', 'RETRAIT', 'SOLDE J'] : ['SOLDE AU DÉBUT', 'DÉPÔTS', 'RETRAITS', 'SOLDE À LA FIN']
  if (veut('banques')) banques.forEach((b) => {
    place(26)
    autoTable(doc, {
      ...base, startY: doc._y,
      head: [[{ content: b.nom, colSpan: 5, styles: { halign: 'center', fillColor: [255, 255, 255], fontStyle: 'bold' } }],
        ['', ...etiqBanque].map((t, i) => ({ content: t, styles: { halign: i ? 'center' : 'left', fillColor: GRIS, fontStyle: 'bold' } }))],
      body: [[{ content: b.nom, styles: { halign: 'left', fontStyle: 'bold', fillColor: GRIS } }, nb(b.soldeVeille), cellule(b.depots), cellule(b.retraits),
        { content: nb(b.soldeJour), styles: { fontStyle: 'bold', textColor: b.soldeJour < 0 ? ROUGE : [22, 128, 61] } }]],
      columnStyles: { 0: { cellWidth: 40 } }
    })
    doc._y = suite() + 3
  })

  // Caisse
  if (veut('caisse')) {
  place(30)
  const enteteCaisse = jourSeul
    ? [`SOLDE FIN ${caisse.moisPrecedent} + ALIMENTATION MOIS`, 'SOLDE J-1', 'TOTAL DÉPENSES J', 'SOLDE J']
    : ['SOLDE AU DÉBUT', 'ALIMENTATION', 'TOTAL DÉPENSES', 'SOLDE À LA FIN']
  const valeursCaisse = jourSeul
    ? [caisse.debutMoisPlusAlimentation, caisse.soldeVeille, caisse.depenses, caisse.soldeFin]
    : [caisse.soldeVeille, caisse.alimentation, caisse.depenses, caisse.soldeFin]
  autoTable(doc, {
    ...base, startY: doc._y,
    head: [[{ content: 'CAISSE', colSpan: 4, styles: { halign: 'center', fillColor: [255, 255, 255], fontStyle: 'bold' } }],
      enteteCaisse.map((t) => ({ content: t, styles: { halign: 'center', fillColor: GRIS, fontStyle: 'bold', fontSize: 7 } }))],
    body: [valeursCaisse.map((v, i) => (i === 3
      ? { content: nb(v), styles: { fontStyle: 'bold', fillColor: v < 0 ? ROUGE : [255, 255, 255], textColor: v < 0 ? [255, 255, 255] : [0, 0, 0] } }
      : nb(v)))],
    columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' } }
  })
  doc._y = suite() + 6
  }

  // Détail par secteur
  if (veut('secteurs')) {
  place(70)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  const titre = `DÉTAIL DES FINANCES ${jourSeul ? `DU ${dateCourte(fin)}` : `DU ${dateCourte(debut)} AU ${dateCourte(fin)}`}`
  doc.text(titre, M, doc._y)
  doc.setLineWidth(0.3); doc.line(M, doc._y + 1, M + doc.getTextWidth(titre), doc._y + 1)
  const fond = (i) => (i % 2 === 0 ? VERT : SAUMON)
  const cles = jourSeul ? ['rj', 'dj', 'rm', 'dm'] : ['rm', 'dm']
  const entetesSecteurs = jourSeul ? ['SECTEURS', 'RECETTES DU JOUR', 'DÉPENSES DU JOUR', 'RECETTES MOIS', 'DÉPENSES DU MOIS'] : ['SECTEURS', 'RECETTES DE LA PÉRIODE', 'DÉPENSES DE LA PÉRIODE']
  autoTable(doc, {
    ...base, startY: doc._y + 3, styles: { ...base.styles, fontStyle: 'italic' },
    head: [entetesSecteurs.map((t, i) => ({ content: t, styles: { halign: 'center', fontStyle: 'bolditalic', fillColor: i === 0 ? [255, 255, 255] : fond(i - 1) } }))],
    body: [
      ...secteurs.rows.map((r) => [{ content: r.label, styles: { halign: 'left', fontStyle: 'normal' } }, ...cles.map((k, i) => ({ content: cellule(r[k]), styles: { fillColor: fond(i) } }))]),
      [{ content: 'TOTAL', styles: { halign: 'left', fontStyle: 'bold' } }, ...cles.map((k, i) => ({ content: nb(secteurs.total[k]), styles: { fillColor: fond(i), fontStyle: 'bolditalic', fontSize: 9 } }))]
    ],
    columnStyles: { 0: { cellWidth: 56 } }
  })
  doc._y = suite() + 6
  }

  // Dépenses de la période
  if (veut('depenses')) {
  place(30)
  const totalDepenses = depensesPeriode.reduce((t, d) => t + (Number(d.montant) || 0), 0)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('DÉPENSES', M, doc._y)
  doc.setLineWidth(0.3); doc.line(M, doc._y + 1, M + doc.getTextWidth('DÉPENSES'), doc._y + 1)
  autoTable(doc, {
    ...base, startY: doc._y + 3, theme: 'plain', styles: { fontSize: 8, cellPadding: 1.2, textColor: 0 },
    body: depensesPeriode.length
      ? depensesPeriode.map((d) => [`${jourSeul ? '' : `${dateCourte(d.date)}  `}${d.libelle || 'Dépense'}`, { content: nb(d.montant), styles: { halign: 'right' } }])
      : [[jourSeul ? 'Aucune dépense ce jour-là' : 'Aucune dépense sur cette période', '']],
    columnStyles: { 0: { cellWidth: 124 }, 1: { cellWidth: 40, halign: 'right' } }, margin: { left: M + 22, right: M }
  })
  autoTable(doc, {
    ...base, startY: suite() + 1, theme: 'grid', styles: { fontSize: 9, cellPadding: 1.6, lineColor: [0, 0, 0], lineWidth: 0.4, fontStyle: 'bold', textColor: 0 },
    body: [['TOTAL DÉPENSES', { content: nb(totalDepenses), styles: { halign: 'right' } }]],
    columnStyles: { 0: { cellWidth: 124 }, 1: { cellWidth: 40 } }, margin: { left: M + 22, right: M }
  })
  doc._y = suite() + 8
  }

  // Opérations : détail des mouvements bancaires et de la caisse
  const lignesNotes = []
  if (veut('operations')) banques.forEach((b) => lignesNotes.push([b.nom, b.operations.length ? b.operations.join('\n') : 'Néant']))
  if (veut('operations')) lignesNotes.push(['CAISSE', `Dépenser de ${nb(caisse.depenses)} Solde ${nb(caisse.soldeFin)}`])
  lignesNotes.forEach(([titreNote, texte]) => {
    const lignes = doc.splitTextToSize(texte, L - 2 * M - 44)
    place(lignes.length * 4.5 + 6)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text(titreNote, M, doc._y)
    doc.line(M, doc._y + 0.9, M + doc.getTextWidth(titreNote), doc._y + 0.9)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
    doc.text(lignes, M + 44, doc._y)
    doc._y += lignes.length * 4.5 + 3
  })

  // Pied de page : période et pagination
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120)
    doc.text(`LA TERMITIÈRE : rapport financier ${periodeTexte} · page ${i}/${n}`, L / 2, 292, { align: 'center' })
  }
  doc.save(`rapport-financier-${debut}${jourSeul ? '' : `_${fin}`}.pdf`)
}

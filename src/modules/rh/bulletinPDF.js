// Bulletin de paie en PDF (A4) : en-tête et pied de page de la société (comme les rapports), identité du salarié, rémunération, retenues sur le salaire,
// net à payer, puis les cotisations payées par l'employeur. Corps sobre : police Times, texte noir, filets gris fins. Tout est dessiné avec jsPDF.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { chargerLogo } from '../../utils/exportPDF'
import { enTete, piedDePage } from '../../portal/rapportGlobalPDF'

const NOIR = [20, 20, 20]
const GRIS = [100, 100, 100]
const FILET = [190, 190, 190]
const MARGE = 14
const PAGE_W = 210
const HAUT_CORPS = 52

// jsPDF ne sait pas afficher l'espace fine insécable de toLocaleString : on la remplace par une espace simple.
const nb = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR').replace(/[  ]/g, ' ')
const fcfa = (n) => `${nb(n)} FCFA`

export async function construireBulletinPDF({ bulletin: b, libelleMois = '', par = '' }) {
  const logo = await chargerLogo('/logo-full.png')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = HAUT_CORPS

  doc.setFont('times', 'bold'); doc.setFontSize(17); doc.setTextColor(...NOIR)
  doc.text('BULLETIN DE PAIE', MARGE, y + 4)
  doc.setFont('times', 'normal'); doc.setFontSize(11.5)
  doc.text(`Période : ${libelleMois || b.mois || ''}`, MARGE, y + 11)
  y += 17

  // Identité du salarié
  const identite = [
    ['Employé', b.employeNom || ''],
    ['Poste', b.poste || ''],
    ['Département', b.departement || ''],
    ['Statut du bulletin', { brouillon: 'Brouillon', valide: 'Validé', paye: 'Payé' }[b.statut] || '']
  ].filter(([, v]) => v)
  autoTable(doc, {
    startY: y, margin: { left: MARGE, right: MARGE, top: HAUT_CORPS, bottom: 40 }, theme: 'plain',
    styles: { font: 'times', fontSize: 10.5, cellPadding: 1.2, textColor: NOIR },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    body: identite
  })
  y = doc.lastAutoTable.finalY + 6

  const ligne = (rubrique, montant, { negatif = false, gras = false } = {}) => [{ content: rubrique, styles: gras ? { fontStyle: 'bold' } : {} }, { content: `${negatif ? '- ' : ''}${nb(montant)}`, styles: { halign: 'right', ...(gras ? { fontStyle: 'bold' } : {}) } }]
  const section = (titre) => [{ content: titre, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: NOIR, lineColor: [120, 120, 120], lineWidth: 0.3 } }]

  const corps = [
    section('Rémunération'),
    ligne('Salaire de base', b.salaireBase),
    ...((Number(b.primes) || 0) > 0 ? [ligne('Primes', b.primes)] : []),
    ...((Number(b.retenuePresence) || 0) > 0 ? [ligne('Retenue absences et retards', b.retenuePresence, { negatif: true })] : []),
    ligne('Salaire brut', b.brutTotal, { gras: true }),
    section("Retenues sur le salaire de l'employé"),
    ligne('CNSS salarié', b.cnssSalarie, { negatif: true }),
    ligne('AMU salarié', b.amuSalarie, { negatif: true }),
    ligne('IRPP retenu', b.its, { negatif: true }),
    ...((Number(b.retenueAvances) || 0) > 0 ? [ligne('Retenue avances et prêts', b.retenueAvances, { negatif: true })] : []),
    section('Cotisations payées par l\'employeur (non retenues sur le salaire)'),
    ligne('CNSS employeur', b.cnssEmployeur),
    ligne('AMU employeur', b.amuEmployeur)
  ]
  autoTable(doc, {
    startY: y, margin: { left: MARGE, right: MARGE, top: HAUT_CORPS, bottom: 40 }, theme: 'grid',
    styles: { font: 'times', fontSize: 10.5, cellPadding: 1.5, lineColor: FILET, lineWidth: 0.2, textColor: NOIR, fillColor: [255, 255, 255] },
    headStyles: { fillColor: [255, 255, 255], textColor: NOIR, fontStyle: 'bold', lineColor: [120, 120, 120], lineWidth: 0.3 },
    head: [['Rubrique', 'Montant (FCFA)']],
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 45, halign: 'right' } },
    body: corps
  })
  y = doc.lastAutoTable.finalY + 8

  // Net à payer, mis en évidence
  if (y > 250) { doc.addPage(); y = HAUT_CORPS }
  doc.setDrawColor(...NOIR); doc.setLineWidth(0.5); doc.rect(MARGE, y, PAGE_W - 2 * MARGE, 13)
  doc.setFont('times', 'bold'); doc.setFontSize(13); doc.setTextColor(...NOIR)
  doc.text('NET À PAYER', MARGE + 4, y + 8.6)
  doc.text(fcfa(b.net), PAGE_W - MARGE - 4, y + 8.6, { align: 'right' })
  y += 22

  // Primes détaillées, si présentes
  const primes = (b.primesDetail || []).filter((p) => p?.nom)
  if (primes.length) {
    doc.setFont('times', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GRIS)
    const texte = doc.splitTextToSize(`Primes du mois : ${primes.map((p) => `${p.nom} ${fcfa(p.montant)}`).join(', ')}.`, PAGE_W - 2 * MARGE)
    doc.text(texte, MARGE, y)
    y += texte.length * 4.5 + 4
  }

  // Signatures
  if (y > 246) { doc.addPage(); y = HAUT_CORPS }
  doc.setFont('times', 'normal'); doc.setFontSize(10); doc.setTextColor(...NOIR)
  doc.text("Signature de l'employeur", MARGE, y + 6)
  doc.text("Signature de l'employé", PAGE_W - MARGE, y + 6, { align: 'right' })

  const maintenant = new Date()
  const meta = `Bulletin édité le ${maintenant.toLocaleDateString('fr-FR')} à ${maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${par ? ` par ${par}` : ''}`
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) { doc.setPage(i); enTete(doc, logo); piedDePage(doc, i, pages, meta) }
  return doc
}

export async function genererBulletinPDF(options) {
  const doc = await construireBulletinPDF(options)
  const b = options.bulletin
  doc.save(`bulletin-${b.mois || 'paie'}-${String(b.employeNom || 'employe').replace(/\s+/g, '_')}.pdf`)
  return doc
}

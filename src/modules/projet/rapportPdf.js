// Génération du rapport PDF d'avancement d'un projet — utilisé depuis l'onglet Projets.
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { avancementProjet, tachesEnRetard, projetEnRetard } from './logic'
import { STATUTS_PROJET, PRIORITES, STATUTS_TACHE } from './data'

export async function genererRapportProjetPDF(projet, taches, depenses, commentaires) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const TEAL = [13, 148, 136]
  const GRAY = [100, 116, 139]
  const W = 210
  const MARGIN = 14

  const tachesProjet       = taches.filter((t) => t.projetId === projet.id)
  const depensesProjet     = depenses.filter((d) => d.projetId === projet.id)
  const commProjet         = commentaires.filter((c) => c.projetId === projet.id)
  const avancement         = avancementProjet(tachesProjet, projet)
  const retard             = tachesEnRetard(tachesProjet)
  const totalDepenses      = depensesProjet.reduce((s, d) => s + (Number(d.montant) || 0), 0)
  const budget             = Number(projet.budget) || 0

  let y = MARGIN

  // ── En-tête ──────────────────────────────────────────────────────────────
  doc.setFillColor(...TEAL)
  doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('RAPPORT D\'AVANCEMENT', MARGIN, 12)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, MARGIN, 20)
  doc.text('E-G.Pro — LA TERMITIÈRE', W - MARGIN, 20, { align: 'right' })

  y = 36

  // ── Identité projet ───────────────────────────────────────────────────────
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(projet.nom || 'Sans nom', MARGIN, y)
  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRAY)
  const statut = STATUTS_PROJET[projet.statut]?.label || projet.statut || '—'
  doc.text(`Statut : ${statut}   |   Responsable : ${projet.responsable || '—'}   |   Type : ${projet.type || '—'}`, MARGIN, y)
  y += 5
  const finTexte = projet.dureeIndeterminee ? 'Durée indéterminée' : formatDateShort(projet.dateFin)
  doc.text(`Début : ${formatDateShort(projet.dateDebut)}   |   Fin prévue : ${finTexte}${projetEnRetard(projet) ? '   ⚠ EN RETARD' : ''}`, MARGIN, y)
  y += 8

  if (projet.description) {
    doc.setTextColor(50, 50, 50)
    doc.setFontSize(8)
    const lines = doc.splitTextToSize(projet.description, W - MARGIN * 2)
    doc.text(lines, MARGIN, y)
    y += lines.length * 4 + 4
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(MARGIN, y, W - MARGIN * 2, 22, 3, 3, 'F')
  const kpiY = y + 8
  const kpiW = (W - MARGIN * 2) / 4
  const kpis = [
    { label: 'Avancement', val: `${avancement}%` },
    { label: 'Tâches',     val: `${tachesProjet.length}` },
    { label: 'En retard',  val: `${retard.length}` },
    { label: 'Budget',     val: formatMoney(budget) }
  ]
  kpis.forEach((k, i) => {
    const x = MARGIN + kpiW * i + kpiW / 2
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...TEAL)
    doc.text(k.val, x, kpiY, { align: 'center' })
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(k.label, x, kpiY + 5, { align: 'center' })
  })
  y += 28

  // ── Barre avancement ─────────────────────────────────────────────────────
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Avancement global', MARGIN, y)
  y += 4
  const barW = W - MARGIN * 2
  doc.setFillColor(226, 232, 240)
  doc.roundedRect(MARGIN, y, barW, 5, 2, 2, 'F')
  doc.setFillColor(...TEAL)
  doc.roundedRect(MARGIN, y, barW * (avancement / 100), 5, 2, 2, 'F')
  doc.setFontSize(7)
  doc.setTextColor(...TEAL)
  doc.text(`${avancement}%`, MARGIN + barW + 2, y + 4)
  y += 12

  // ── Tâches ────────────────────────────────────────────────────────────────
  if (tachesProjet.length) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...TEAL)
    doc.text('Tâches', MARGIN, y)
    y += 2
    autoTable(doc, {
      startY: y,
      head: [['Titre', 'Assignée à', 'Priorité', 'Statut', 'Échéance']],
      body: tachesProjet.map((t) => [
        t.titre || '—',
        t.assignee || '—',
        PRIORITES[t.priorite]?.label || t.priorite || '—',
        STATUTS_TACHE[t.statut]?.label || t.statut || '—',
        formatDateShort(t.echeance)
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: MARGIN, right: MARGIN }
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Dépenses ─────────────────────────────────────────────────────────────
  if (depensesProjet.length) {
    if (y > 230) { doc.addPage(); y = MARGIN }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...TEAL)
    doc.text('Dépenses', MARGIN, y)
    y += 2
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Catégorie', 'Description', 'Fournisseur', 'Montant (FCFA)']],
      body: [
        ...depensesProjet.map((d) => [
          formatDateShort(d.date),
          d.categorie || '—',
          d.description || '—',
          d.fournisseur || '—',
          Number(d.montant || 0).toLocaleString('fr-FR')
        ]),
        ['', '', '', 'TOTAL', totalDepenses.toLocaleString('fr-FR')]
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: MARGIN, right: MARGIN }
    })
    y = doc.lastAutoTable.finalY + 8

    // Budget vs dépenses
    if (budget > 0) {
      const pct = Math.round((totalDepenses / budget) * 100)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(50, 50, 50)
      doc.text(`Budget prévu : ${formatMoney(budget)}   |   Dépenses réelles : ${formatMoney(totalDepenses)}   |   Consommé : ${pct}%`, MARGIN, y)
      y += 8
    }
  }

  // ── Commentaires ─────────────────────────────────────────────────────────
  if (commProjet.length) {
    if (y > 230) { doc.addPage(); y = MARGIN }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...TEAL)
    doc.text('Journal de bord', MARGIN, y)
    y += 2
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Auteur', 'Note']],
      body: commProjet
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map((c) => [
          formatDateShort(c.createdAt),
          c.auteur || '—',
          c.texte || ''
        ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 2: { cellWidth: 110 } },
      margin: { left: MARGIN, right: MARGIN }
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── Pied de page ─────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(...GRAY)
    doc.text(`Page ${i} / ${pages}`, W / 2, 290, { align: 'center' })
    doc.text('E-G.Pro — LA TERMITIÈRE', MARGIN, 290)
    doc.text(new Date().toLocaleDateString('fr-FR'), W - MARGIN, 290, { align: 'right' })
  }

  // Téléchargement
  const nom = (projet.nom || 'projet').replace(/\s+/g, '_')
  doc.save(`rapport_${nom}_${new Date().toISOString().slice(0, 10)}.pdf`)
}

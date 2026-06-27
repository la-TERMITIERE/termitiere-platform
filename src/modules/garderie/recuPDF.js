// Générateur de reçu de paiement PDF — Garderie La Termitière
import jsPDF from 'jspdf'

const ORANGE = [232, 57, 14]
const JAUNE  = [245, 168, 0]
const NOIR   = [26, 26, 26]
const GRIS   = [90, 90, 90]

const GARDERIE = {
  nom: 'Garderie La Termitière',
  devise: 'Toujours dans l\'action',
  adresse: 'Agoe Daliko, Lomé — Togo',
  tel: '00228 96 09 49 49',
  email: 'latermitiere2021@gmail.com'
}

const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function fmtMontant(v) {
  const n = Math.round(Number(v) || 0)
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'
}

function chargerImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
        resolve({ dataURL: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight })
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function placerImg(doc, imgData, x, y, maxW, maxH) {
  if (!imgData?.dataURL) return
  const ratio = imgData.w / imgData.h
  let w = maxW, h = maxW / ratio
  if (h > maxH) { h = maxH; w = h * ratio }
  doc.addImage(imgData.dataURL, 'PNG', x + (maxW - w) / 2, y + (maxH - h) / 2, w, h)
}

export async function genererRecuPaiement(paiement, enfant) {
  const [logoTermitiere, logoGarderie] = await Promise.all([
    chargerImage('/termitiere-logo.png').then(r => r || chargerImage('/logo-mark.png')),
    chargerImage('/garderie-logo.png')
  ])

  const doc = new jsPDF({ format: 'a5', orientation: 'portrait' })
  const W = 148 // largeur A5

  // ── EN-TÊTE ──────────────────────────────────────────────────────────────
  // Fond blanc + bordure orange en bas
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, W, 36, 'F')
  doc.setFillColor(...ORANGE)
  doc.rect(0, 34, W, 2, 'F')
  doc.setFillColor(...JAUNE)
  doc.rect(0, 32, W, 2, 'F')

  // Logo Termitière (gauche, rond)
  if (logoTermitiere?.dataURL) {
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(...ORANGE)
    doc.setLineWidth(0.8)
    doc.circle(16, 17, 13, 'FD')
    placerImg(doc, logoTermitiere, 4, 5, 24, 24)
  }

  // Nom garderie centré
  doc.setTextColor(...ORANGE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(GARDERIE.nom, W / 2, 12, { align: 'center' })

  doc.setTextColor(...JAUNE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text(GARDERIE.devise.toUpperCase(), W / 2, 18, { align: 'center' })

  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text(GARDERIE.adresse, W / 2, 23, { align: 'center' })
  doc.text(`${GARDERIE.tel}  ·  ${GARDERIE.email}`, W / 2, 27, { align: 'center' })

  // Logo Garderie (droite, rond)
  if (logoGarderie?.dataURL) {
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(...ORANGE)
    doc.setLineWidth(0.8)
    doc.circle(W - 16, 17, 13, 'FD')
    placerImg(doc, logoGarderie, W - 28, 5, 24, 24)
  }

  // ── TITRE REÇU ───────────────────────────────────────────────────────────
  let y = 42
  doc.setFillColor(254, 246, 240)
  doc.setDrawColor(...ORANGE)
  doc.setLineWidth(0.4)
  doc.roundedRect(8, y - 4, W - 16, 11, 2, 2, 'FD')
  doc.setTextColor(...ORANGE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('REÇU DE PAIEMENT', W / 2, y + 3.5, { align: 'center' })

  // Numéro reçu + date
  y += 13
  const numRecu = `RC-GARD-${paiement.id?.slice(-6).toUpperCase() || '000000'}`
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...GRIS)
  doc.text(`N° ${numRecu}`, 10, y)
  doc.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, W - 10, y, { align: 'right' })

  // ── INFORMATIONS ENFANT / PARENT ──────────────────────────────────────────
  y += 6
  doc.setFillColor(249, 250, 251)
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.3)
  doc.roundedRect(8, y, W - 16, 28, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...ORANGE)
  doc.text('INFORMATIONS', 12, y + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...NOIR)

  const infos = [
    ['Enfant', `${enfant?.prenom || ''} ${enfant?.nom || paiement.enfantNom || '—'}`],
    ['Parent / Tuteur', enfant?.parentNom || '—'],
    ['Contact', enfant?.parentContact || '—'],
    ['Groupe', enfant?.groupe || '—'],
  ]
  infos.forEach(([label, val], i) => {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GRIS)
    doc.setFontSize(7)
    doc.text(`${label} :`, 12, y + 13 + i * 5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...NOIR)
    doc.setFontSize(7.5)
    doc.text(String(val), 42, y + 13 + i * 5)
  })

  // ── DÉTAILS PAIEMENT ─────────────────────────────────────────────────────
  y += 34
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...ORANGE)
  doc.text('DÉTAILS DU PAIEMENT', 10, y)

  // Ligne séparatrice
  y += 3
  doc.setDrawColor(...ORANGE)
  doc.setLineWidth(0.4)
  doc.line(8, y, W - 8, y)

  y += 5
  const lignes = [
    ['Période', `${MOIS_FR[(paiement.mois || 1) - 1]} ${paiement.annee}`],
    ['Type de paiement', paiement.type === 'mensuel' ? 'Mensualité' : paiement.type === 'inscription' ? "Frais d'inscription" : paiement.type || '—'],
    ['Mode de paiement', paiement.modePaiement === 'espece' ? 'Espèces' : paiement.modePaiement === 'mobile' ? 'Mobile money' : paiement.modePaiement || '—'],
    ['Date de paiement', paiement.date ? new Date(paiement.date).toLocaleDateString('fr-FR') : '—'],
  ]

  lignes.forEach(([label, val]) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRIS)
    doc.text(label, 10, y)
    doc.setTextColor(...NOIR)
    doc.text(String(val), W - 10, y, { align: 'right' })
    y += 7
  })

  // ── MONTANTS ─────────────────────────────────────────────────────────────
  y += 2
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.2)
  doc.line(8, y, W - 8, y)
  y += 5

  // Montant dû
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRIS)
  doc.text('Montant dû', 10, y)
  doc.setTextColor(...NOIR)
  doc.text(fmtMontant(paiement.montantDu), W - 10, y, { align: 'right' })
  y += 8

  // Montant payé — mis en valeur
  doc.setFillColor(232, 57, 14, 0.1)
  doc.setFillColor(254, 246, 240)
  doc.setDrawColor(...ORANGE)
  doc.setLineWidth(0.4)
  doc.roundedRect(8, y - 5, W - 16, 10, 1.5, 1.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...ORANGE)
  doc.text('MONTANT PAYÉ', 12, y + 1.5)
  doc.text(fmtMontant(paiement.montantPaye), W - 12, y + 1.5, { align: 'right' })
  y += 12

  // Solde restant si partiel
  const reste = (Number(paiement.montantDu) || 0) - (Number(paiement.montantPaye) || 0)
  if (reste > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(220, 80, 30)
    doc.text(`Solde restant : ${fmtMontant(reste)}`, 10, y)
    y += 7
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(22, 163, 74)
    doc.text('✓ Paiement soldé', 10, y)
    y += 7
  }

  // ── STATUT ────────────────────────────────────────────────────────────────
  const statutLabel = paiement.statut === 'paye' ? 'PAYÉ' : paiement.statut === 'partiel' ? 'PARTIEL' : 'IMPAYÉ'
  const statutColor = paiement.statut === 'paye' ? [22, 163, 74] : paiement.statut === 'partiel' ? [217, 119, 6] : [220, 38, 38]
  doc.setFillColor(...statutColor)
  doc.roundedRect(W / 2 - 15, y, 30, 8, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(statutLabel, W / 2, y + 5.5, { align: 'center' })
  y += 14

  // ── PIED DE PAGE ──────────────────────────────────────────────────────────
  const H = doc.internal.pageSize.getHeight()
  doc.setFillColor(...ORANGE)
  doc.rect(0, H - 10, W, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text(`${GARDERIE.nom}  ·  ${GARDERIE.email}  ·  ${GARDERIE.tel}`, W / 2, H - 4, { align: 'center' })

  // Mention légale
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6)
  doc.setTextColor(...GRIS)
  doc.text('Ce reçu atteste du paiement effectué. Veuillez le conserver comme justificatif.', W / 2, H - 13, { align: 'center' })

  doc.save(`recu-${paiement.enfantNom?.replace(/\s+/g, '-') || 'enfant'}-${MOIS_FR[(paiement.mois || 1) - 1]}-${paiement.annee}.pdf`)
}

// Logique métier du module Garderie.

// Calcule l'âge en années et mois à partir d'une date de naissance (YYYY-MM-DD).
export function calcAge(dateNaissance) {
  if (!dateNaissance) return null
  const naissance = new Date(dateNaissance)
  const now = new Date()
  let annees = now.getFullYear() - naissance.getFullYear()
  let mois = now.getMonth() - naissance.getMonth()
  if (mois < 0) { annees--; mois += 12 }
  if (annees === 0) return `${mois} mois`
  if (mois === 0) return `${annees} an${annees > 1 ? 's' : ''}`
  return `${annees} an${annees > 1 ? 's' : ''} ${mois} mois`
}

// Retourne le groupe d'âge recommandé selon l'âge en mois.
export function groupeRecommande(dateNaissance) {
  if (!dateNaissance) return ''
  const naissance = new Date(dateNaissance)
  const now = new Date()
  const moisTotal = (now.getFullYear() - naissance.getFullYear()) * 12 + (now.getMonth() - naissance.getMonth())
  if (moisTotal < 12) return 'nourrisson'
  if (moisTotal < 36) return 'bambin'
  if (moisTotal < 48) return 'petite_section'
  if (moisTotal < 60) return 'moyenne_section'
  return 'grande_section'
}

// Résumé des présences du jour pour le dashboard.
export function statsPresencesJour(presences, enfants) {
  const actifs = enfants.filter((e) => e.statut === 'actif')
  const presents = presences.filter((p) => p.statut === 'present')
  const absents = presences.filter((p) => p.statut === 'absent')
  const excuses = presences.filter((p) => p.statut === 'excuse')
  const nonPointes = actifs.filter((e) => !presences.find((p) => p.enfantId === e.id))
  return { total: actifs.length, presents: presents.length, absents: absents.length, excuses: excuses.length, nonPointes: nonPointes.length }
}

// Total payé vs attendu sur un mois pour un enfant.
export function soldeEnfant(paiements, enfantId, annee, mois) {
  return paiements
    .filter((p) => p.enfantId === enfantId && p.annee === annee && p.mois === mois)
    .reduce((acc, p) => acc + (Number(p.montantPaye) || 0), 0)
}

// Retourne vrai si un enfant a un paiement impayé sur le mois courant.
export function aImpayes(paiements, enfantId) {
  const now = new Date()
  return paiements.some(
    (p) => p.enfantId === enfantId && p.statut === 'impaye' &&
           p.annee === now.getFullYear() && p.mois === now.getMonth() + 1
  )
}

// Formate "YYYY-MM" → "Janvier 2026".
export function labelMoisAnnee(annee, mois) {
  const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  return `${MOIS[(mois || 1) - 1]} ${annee}`
}

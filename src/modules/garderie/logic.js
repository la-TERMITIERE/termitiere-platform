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
// Compte les enfants UNIQUES (pas les enregistrements) pour éviter les doublons.
export function statsPresencesJour(presences, enfants) {
  const actifs = enfants.filter((e) => e.statut === 'actif')
  // Dédupliquer : un enfant = un statut (prendre le dernier enregistrement)
  const parEnfant = {}
  presences.forEach((p) => {
    if (p.enfantId) parEnfant[p.enfantId] = p.statut
  })
  const presents   = actifs.filter((e) => parEnfant[e.id] === 'present').length
  const absents    = actifs.filter((e) => parEnfant[e.id] === 'absent').length
  const excuses    = actifs.filter((e) => parEnfant[e.id] === 'excuse').length
  const nonPointes = actifs.filter((e) => !parEnfant[e.id]).length
  return { total: actifs.length, presents, absents, excuses, nonPointes }
}

// Total payé vs attendu sur un mois pour un enfant.
export function soldeEnfant(paiements, enfantId, annee, mois) {
  return paiements
    .filter((p) => p.enfantId === enfantId && p.annee === annee && p.mois === mois)
    .reduce((acc, p) => acc + (Number(p.montantPaye) || 0), 0)
}

// Retourne vrai si un enfant a un paiement impayé sur le mois courant.
export function aImpayes(paiements, enfantId) {
  const now  = new Date()
  const mois = now.getMonth() + 1
  const annee = now.getFullYear()
  const prefixeMois = `${annee}-${String(mois).padStart(2, '0')}`
  return paiements.some(
    (p) => p.enfantId === enfantId &&
           p.type !== 'journalier' &&
           p.statut === 'impaye' &&
           (
             (Number(p.mois) === mois && Number(p.annee) === annee) ||
             ((p.date || '').startsWith(prefixeMois))
           )
  )
}

// Détecte les enfants mensuels présents ce mois sans paiement renouvelé.
export function enfantsSansRenouvellement(enfants, paiements, presences) {
  const now    = new Date()
  const mois   = now.getMonth() + 1
  const annee  = now.getFullYear()
  const prefixeMois = `${annee}-${String(mois).padStart(2, '0')}`

  return enfants.filter((e) => {
    if (e.statut !== 'actif') return false
    if (e.typeAbonnement === 'annuel') return false

    // Paiement valide ce mois = non journalier + non impayé
    // Triple vérification : par enfantId, OU par nom (fallback si enfantId mal stocké)
    const nomEnfant = `${e.prenom} ${e.nom}`.toLowerCase().trim()
    const aPaye = paiements.some(
      (p) => {
        const idMatch  = p.enfantId === e.id
        const nomMatch = (p.enfantNom || '').toLowerCase().trim() === nomEnfant
        if (!idMatch && !nomMatch) return false
        if (p.type === 'journalier') return false
        if (p.statut === 'impaye') return false
        return (Number(p.mois) === mois && Number(p.annee) === annee) ||
               ((p.date || '').startsWith(prefixeMois))
      }
    )
    if (aPaye) return false

    // Est-il présent au moins une fois ce mois ?
    const estPresent = presences.some(
      (p) => p.enfantId === e.id &&
             p.statut === 'present' &&
             (p.date || '').startsWith(prefixeMois)
    )
    return estPresent
  })
}

// Retourne les journaliers actifs pour une date donnée selon leur période (date + nombreJours).
export function journaliersActifsSurDate(journaliers, date) {
  if (!date) return []
  const cible = new Date(date)
  return journaliers.filter((j) => {
    if (!j.date) return false
    const debut = new Date(j.date)
    const fin   = new Date(j.date)
    fin.setDate(fin.getDate() + Math.max(0, (Number(j.nombreJours) || 1) - 1))
    return cible >= debut && cible <= fin
  })
}

// Retourne le tarif mensuel suggéré selon la date de naissance.
export function tarifSuggere(dateNaissance, grille) {
  if (!dateNaissance || !grille) return null
  const naissance = new Date(dateNaissance)
  const now = new Date()
  const moisTotal = (now.getFullYear() - naissance.getFullYear()) * 12 + (now.getMonth() - naissance.getMonth())
  return grille.find((t) => moisTotal >= t.minMois && moisTotal < t.maxMois) || null
}

// Formate "YYYY-MM" → "Janvier 2026".
export function labelMoisAnnee(annee, mois) {
  const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  return `${MOIS[(mois || 1) - 1]} ${annee}`
}

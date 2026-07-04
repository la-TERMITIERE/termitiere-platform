// Gestion de Projet — logique métier.

export function avancementProjet(taches = [], projet = null) {
  // Projet AVEC tâches : avancement = tâches terminées / total des tâches.
  if (taches.length) {
    const terminees = taches.filter((t) => t.statut === 'terminee').length
    return Math.round((terminees / taches.length) * 100)
  }
  // Projet SANS tâche : avancement = montant versé / budget arrêté (100% si soldé).
  const budget = Number(projet?.budget) || 0
  const verse  = Number(projet?.depenses) || 0
  if (budget <= 0) return 0
  return Math.min(100, Math.round((verse / budget) * 100))
}

export function tachesEnRetard(taches = []) {
  const now = Date.now()
  return taches.filter(
    (t) => t.statut !== 'terminee' && t.statut !== 'annulee' && t.echeance && t.echeance < now
  )
}

export function projetEnRetard(projet) {
  if (!projet.dateFin) return false
  if (['termine', 'annule'].includes(projet.statut)) return false
  return projet.dateFin < Date.now()
}

export function genererNumProjet(sequence) {
  const pad = String(sequence).padStart(4, '0')
  const annee = new Date().getFullYear()
  return `PRJ-${annee}-${pad}`
}

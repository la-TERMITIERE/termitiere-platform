// Gestion de Projet — logique métier.

export function avancementProjet(taches = [], projet = null) {
  if (taches.length) {
    const terminees = taches.filter((t) => t.statut === 'terminee').length
    return Math.round((terminees / taches.length) * 100)
  }
  // Fallback sur avancement manuel si aucune tâche
  return Number(projet?.avancementManuel) || 0
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

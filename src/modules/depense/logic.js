// Calculs budget / dépenses par secteur et par mois.
import { SECTEURS } from './data'

// Budget alloué à un secteur pour un mois donné (0 si non défini).
export function budgetSecteur(budgets, secteurId, annee, mois) {
  const b = budgets.find((x) =>
    x.secteurId === secteurId && Number(x.annee) === Number(annee) && Number(x.mois) === Number(mois)
  )
  return b ? Number(b.montant) || 0 : 0
}

// Une dépense compte dans le budget seulement une fois réellement décaissée
// (autorisation validée aux deux niveaux). Les entrées sans statut (anciennes
// données, avant l'ajout du circuit d'autorisation) restent comptées.
export function estDecaissee(d) {
  return !d.statut || d.statut === 'decaissee'
}

// Dépenses décaissées d'un secteur sur un mois donné (compte dans le budget).
export function depensesSecteurMois(depenses, secteurId, annee, mois) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return depenses.filter((d) => d.secteurId === secteurId && (d.date || '').startsWith(prefixe) && estDecaissee(d))
}

// Dépenses en attente d'approbation ou approuvées (à décaisser).
export function depensesEnCircuit(depenses) {
  return depenses.filter((d) => d.statut === 'en_attente' || d.statut === 'approuvee')
}

// Somme des montants d'une liste de dépenses.
export function totalDepenses(liste) {
  return liste.reduce((s, d) => s + (Number(d.montant) || 0), 0)
}

// Statut d'un secteur selon son taux de consommation du budget (0-100+).
export function statutBudget(pct) {
  if (pct >= 100) return { key: 'depasse', label: 'Dépassé', tone: 'danger' }
  if (pct >= 80) return { key: 'attention', label: 'Attention', tone: 'warning' }
  return { key: 'ok', label: 'Dans le budget', tone: 'success' }
}

// Secteurs dont le budget est en alerte (≥80%) ou dépassé (≥100%) pour un mois donné.
export function secteursEnAlerte(budgets, depenses, annee, mois) {
  return SECTEURS
    .map((s) => {
      const alloue = budgetSecteur(budgets, s.id, annee, mois)
      const depense = totalDepenses(depensesSecteurMois(depenses, s.id, annee, mois))
      const pct = alloue > 0 ? Math.round((depense / alloue) * 100) : (depense > 0 ? 100 : 0)
      return { ...s, alloue, depense, pct, statut: statutBudget(pct) }
    })
    .filter((s) => s.statut.key !== 'ok')
    .sort((a, b) => b.pct - a.pct)
}

// Les n derniers mois (le plus ancien en premier), sous la forme { annee, mois, label }.
export function derniersMois(n, moisLabels) {
  const now = new Date()
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const annee = d.getFullYear()
    const mois = d.getMonth() + 1
    out.push({ annee, mois, label: `${moisLabels[mois - 1].slice(0, 4)} ${String(annee).slice(2)}` })
  }
  return out
}

// Le mois précédent une paire (année, mois) donnée.
export function moisPrecedent(annee, mois) {
  return mois === 1 ? { annee: annee - 1, mois: 12 } : { annee, mois: mois - 1 }
}

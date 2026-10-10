// Retours de matériel en retard : prestation dont la sortie a été certifiée (matériel parti),
// dont la période est terminée depuis au moins un jour, et dont toutes les pièces ne sont pas
// revenues. Sert à la relance des agents (notification) et à l'alerte du Dashboard (autres rôles).
import { todayStr } from '../../utils/formatters'
import { normaliserStatut } from '../../shared/workflow'

// `demandes` : les matériels ne sont sortis que si l'autorisation de sortie est CERTIFIÉE. Marquer une
// prestation « approuvée » ne fait sortir aucun matériel : sans cette vérification, on alertait des
// retours « en retard » pour du matériel jamais parti.
export function retoursEnRetard(prestations, retours, aujourdhui = todayStr(), demandes = null) {
  const sorties = demandes ? new Set(demandes.filter((d) => d.prestationId && normaliserStatut(d.statut) === 'certifie').map((d) => d.prestationId)) : null
  const rendus = {}
  retours.forEach((r) => { if (r.prestationId) rendus[r.prestationId] = (rendus[r.prestationId] || 0) + (parseInt(r.qte) || 0) })
  return prestations
    .filter((p) => (sorties ? sorties.has(p.id) : p.approuvee) && p.statut !== 'annulee' && p.statut !== 'terminee' && p.dateFin && p.dateFin < aujourdhui)
    .map((p) => {
      const pris = (p.lignes || []).filter((l) => l.materielId).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
      const restant = pris - (rendus[p.id] || 0)
      const jours = Math.max(1, Math.round((new Date(aujourdhui) - new Date(p.dateFin)) / 86400000))
      return { p, pris, restant, jours }
    })
    .filter((x) => x.pris > 0 && x.restant > 0)
    .sort((a, b) => b.jours - a.jours)
}

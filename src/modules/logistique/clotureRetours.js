// Clôture automatique d'une prestation : dès que TOUTES les pièces sorties sont revenues en bon
// état (aucun retour cassé ou perdu), elle passe à « Terminée ». Si un retour est ensuite corrigé
// ou supprimé et que ce n'est plus vrai, elle repasse à « Facturée ». Appelée après chaque
// enregistrement, correction ou suppression de retour.
import { getAll, getOne, updateItem } from '../../core/db'

export async function synchroniserCloture(prestationId) {
  if (!prestationId) return
  try {
    const [presta, retours] = await Promise.all([getOne('logistique_prestations', prestationId), getAll('logistique_retours')])
    if (!presta || presta.statut === 'annulee' || presta.statut === 'brouillon') return
    const siens = retours.filter((r) => r.prestationId === prestationId)
    const pris = (presta.lignes || []).filter((l) => l.materielId).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
    const rendu = siens.reduce((s, r) => s + (parseInt(r.qte) || 0), 0)
    const complet = pris > 0 && rendu >= pris && siens.every((r) => r.type === 'OK')
    if (complet && presta.statut !== 'terminee') await updateItem('logistique_prestations', prestationId, { statut: 'terminee', termineeLe: Date.now() })
    else if (!complet && presta.statut === 'terminee') await updateItem('logistique_prestations', prestationId, { statut: 'facturee', termineeLe: null })
  } catch { /* non bloquant : le libellé calculé reste correct même sans le statut */ }
}

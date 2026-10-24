// MAXI-GYM : suppression d'un abonnement, partagée entre la liste des abonnements et la fiche client.
// Sa facture (et ses éventuels versements) part avec lui : sinon elle resterait comptée dans les totaux.
import { removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { categorieLabel } from './data'

export async function supprimerAbonnementGym(a, factures = []) {
  const liees = factures.filter((f) => f.sourceType === 'abonnement' && f.sourceId === a.id)
  const mentionFactures = liees.length ? `

Sa facture (${liees.map((f) => f.numero).join(', ')}) sera supprimée aussi : les totaux baisseront de ${formatMoney(liees.reduce((t, f) => t + (Number(f.montant) || 0), 0))}.` : ''
  if (!confirm(`Supprimer l'abonnement de ${a.clientNom} (${categorieLabel(a.categorie)}) ?${mentionFactures}`)) return false
  try {
    await removeItem('gym_abonnements', a.id)
    for (const f of liees) await removeItem('gym_factures', f.id, { sansMotif: true })
    if (liees.length) await audit('gym', 'FACTURE_SUPPRIMEE', `${liees.map((f) => f.numero).join(', ')} : supprimée avec l'abonnement de ${a.clientNom}`)
    await audit('gym', 'ABONNEMENT_DELETE', `${a.clientNom} : ${categorieLabel(a.categorie)} : ${Number(a.montant).toLocaleString('fr-FR')} FCFA`)
    toast.success('Abonnement supprimé')
    return true
  } catch (e) {
    if (e?.code !== 'SUPPRESSION_ANNULEE') toast.error(e.message) // motif non donné : on n'a rien supprimé, sans bruit
    return false
  }
}

// Suppression dans le module Ressources humaines : le bouton est réservé aux membres de l'administration (accès total), jamais à un
// agent ni à un simple utilisateur du module. Le droit « supprimer » du module accordé par Info est de toute façon vérifié par db.js.
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole } from '../../core/roles'
import { toast } from '../../core/notifications'

export const usePeutSupprimerRh = () => isFullAccessRole(useAuth((s) => s.role))

// Exécute une suppression en affichant le résultat : succès, erreur (droit refusé, réseau…). Annuler la fenêtre « Motif » n'est pas une erreur.
// Renvoie true si l'élément a bien été supprimé.
export async function supprimerAvecRetour(action, messageSucces = 'Supprimé') {
  try {
    await action()
    if (messageSucces) toast.success(messageSucces)
    return true
  } catch (err) {
    if (err?.name === 'SuppressionAnnulee' || err?.code === 'SUPPRESSION_ANNULEE') return false
    console.error('Suppression impossible', err)
    toast.error(err?.message || 'Suppression impossible')
    return false
  }
}

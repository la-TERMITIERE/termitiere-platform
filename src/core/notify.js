// Création de notifications applicatives (collection `notifications`, synchronisée
// en temps réel comme le reste). Une notification cible des RÔLES et/ou des
// UTILISATEURS précis ; chaque destinataire la voit dans sa cloche de notifications.
//
// En plus de la cloche, chaque notification déclenche aussi un vrai Web Push
// (best-effort, ne bloque jamais la notif in-app) — pour que l'utilisateur soit
// alerté même appli fermée, sur tous les appareils où il a cliqué « Activer les
// alertes ». Voir src/core/push.js.
import { addItem, getAll } from './db'
import { pushToUsers } from './push'
import { isViewAllRole } from './roles'

// Types « importants » : notification système persistante + vibration marquée
// (demandes d'autorisation, refus, alertes). Doit rester aligné avec
// TYPES_URGENTS de src/hooks/useNotifications.js.
const TYPES_URGENTS = ['demande', 'refus', 'warning', 'alerte']

// notify({ type, title, body, module, forRoles, forUsers, excludeUid, link })
//  - forRoles : rôles destinataires, ex. ['admin','controleur']
//  - forUsers : logins/uids destinataires précis, ex. ['agent']
//  - excludeUid : ne pas notifier l'auteur de l'action
//  - link : route ouverte au clic, ex. '/agro/demandes'
export async function notify({
  type = 'info', title, body = '', module = '',
  forRoles = [], forUsers = [], excludeUid = null, link = '',
  ...extra // ex. { projetId } : conservé sur le document pour un nettoyage ciblé
           // plus tard (ex. suppression des notifs d'un projet supprimé).
}) {
  if (!title) return
  let id = null
  try {
    id = await addItem('notifications', {
      type, title, body, module, forRoles, forUsers,
      excludeUid: excludeUid || null, link, readBy: {}, ...extra
    })
  } catch (e) {
    console.warn('[notify] échec :', e)
  }

  // Résout forRoles en identifiants concrets pour le push (le ciblage par rôle
  // n'existe que côté cloche in-app ; le push a besoin d'abonnements précis).
  try {
    let cibles = [...forUsers]
    if (forRoles.length) {
      const users = await getAll('users')
      // Un rôle correspondant ne suffit pas : il faut aussi posséder LE MODULE
      // concerné (même règle que la cloche in-app, cf. useNotifications.js →
      // hasModule) — sinon un gérant/contrôleur d'un autre module recevrait une
      // vraie notification système sur une affaire qui ne le concerne pas.
      cibles.push(...users
        .filter((u) => forRoles.includes(u.role))
        .filter((u) => !module || isViewAllRole(u.role) || (u.modules || []).includes(module))
        .map((u) => u.uid))
    }
    cibles = [...new Set(cibles)].filter((c) => c && c !== excludeUid)
    // `tag` = identifiant de la notification : la notification système affichée
    // par le service worker et celle affichée par l'onglet ouvert se remplacent
    // au lieu de se dédoubler.
    if (cibles.length) {
      await pushToUsers(cibles, {
        title, body, url: link || '/', tag: id || undefined,
        type, module, urgent: TYPES_URGENTS.includes(type)
      })
    }
  } catch (e) {
    // Best-effort : le push ne doit jamais faire échouer la notification.
  }
}

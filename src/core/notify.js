// Création de notifications applicatives (collection `notifications`, synchronisée
// en temps réel comme le reste). Une notification cible des RÔLES et/ou des
// UTILISATEURS précis ; chaque destinataire la voit dans sa cloche de notifications.
import { addItem } from './db'

// notify({ type, title, body, module, forRoles, forUsers, excludeUid, link })
//  - forRoles : rôles destinataires, ex. ['admin','controleur']
//  - forUsers : logins/uids destinataires précis, ex. ['agent']
//  - excludeUid : ne pas notifier l'auteur de l'action
//  - link : route ouverte au clic, ex. '/agro/demandes'
export async function notify({
  type = 'info', title, body = '', module = '',
  forRoles = [], forUsers = [], excludeUid = null, link = ''
}) {
  if (!title) return
  try {
    await addItem('notifications', {
      type, title, body, module, forRoles, forUsers,
      excludeUid: excludeUid || null, link, readBy: {}
    })
  } catch (e) {
    console.warn('[notify] échec :', e)
  }
}

/* global self, clients */
// Handlers Web Push, injectés dans le service worker (via Workbox importScripts).
// Permettent d'afficher une notification système même quand l'application est
// FERMÉE (le service worker reçoit le push et affiche la notification), et
// d'ouvrir l'app à l'endroit concerné quand l'utilisateur tape dessus.

// Emoji par type d'événement, repris dans le titre pour être identifiable d'un
// coup d'œil dans le centre de notifications du téléphone / de Windows.
var EMOJI = {
  demande: '📤', approuve: '✅', refus: '⛔', success: '✅',
  warning: '⚠️', rappel: '⏰', user: '👤', info: '🔔'
}

var NOM_MODULE = {
  agro: 'MAXI AGRO', logistique: 'Maxi Logistique', evenementiel: 'BRIQUETERIE',
  garderie: 'Garderie', foncier: 'FONCIER', rh: 'COMPTABILITÉ',
  projet: 'E-G.Pro', depense: 'E-DÉPENSES'
}

self.addEventListener('push', function (event) {
  var data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) {
    data = { title: 'LA TERMITIÈRE', body: event.data ? event.data.text() : '' }
  }
  var emoji = EMOJI[data.type] || '🔔'
  var module = NOM_MODULE[data.module] || 'LA TERMITIÈRE'
  var title = emoji + ' ' + (data.title || 'LA TERMITIÈRE')
  var options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    // Remplace la notification de même tag et re-alerte l'utilisateur.
    renotify: !!data.tag,
    // Les demandes d'autorisation restent affichées jusqu'à action de
    // l'utilisateur (comme un message important).
    requireInteraction: !!data.urgent,
    timestamp: Date.now(),
    // Nom du module concerné, affiché sous le titre sur Android.
    silent: false,
    data: { url: data.url || '/', module: data.module || '' },
    actions: [{ action: 'ouvrir', title: 'Voir' }, { action: 'fermer', title: 'Ignorer' }],
    vibrate: data.urgent ? [90, 60, 90, 60, 140] : [70, 45, 70]
  }
  // Sur les plateformes qui l'affichent, préfixe le corps du module concerné.
  if (data.module && options.body) options.body = module + ' — ' + options.body
  else if (data.module) options.body = module

  event.waitUntil(
    self.registration.showNotification(title, options).then(function () {
      // Met à jour la pastille de l'icône de l'application (PWA installée).
      return self.registration.getNotifications().then(function (list) {
        if (self.navigator && self.navigator.setAppBadge) {
          try { self.navigator.setAppBadge(list.length) } catch (e) { /* ignore */ }
        }
      })
    }).catch(function () { /* ignore */ })
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  if (event.action === 'fermer') return
  var url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (wins) {
      for (var i = 0; i < wins.length; i++) {
        var w = wins[i]
        if ('focus' in w) {
          if ('navigate' in w) { try { w.navigate(url) } catch (e) { /* ignore */ } }
          return w.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

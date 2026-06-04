/* global self, clients */
// Handlers Web Push, injectés dans le service worker (via Workbox importScripts).
// Permettent d'afficher une notification système même quand l'application est
// FERMÉE (le service worker reçoit le push et affiche la notification), et
// d'ouvrir l'app à l'endroit concerné quand l'utilisateur tape dessus.

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = { title: 'LA TERMITIÈRE', body: event.data ? event.data.text() : '' } }
  const title = data.title || 'LA TERMITIÈRE'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
    vibrate: [80, 40, 80]
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          if ('navigate' in w) { try { w.navigate(url) } catch (e) { /* ignore */ } }
          return w.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

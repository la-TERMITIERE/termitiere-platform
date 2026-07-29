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

// Logo du module concerné (grande image affichée dans la notification système) —
// pour identifier d'un coup d'œil de quelle appli vient l'alerte. Modules sans
// logo dédié : repli sur le logo général LA TERMITIÈRE.
var LOGO_MODULE = {
  agro: '/maxi-agro-logo.png',
  logistique: '/logo_maxi_logistique.png',
  garderie: '/garderie-logo.png'
}

// Vrai si la chaîne contient déjà un emoji — sert à ne pas doubler l'icône
// quand le titre applicatif en porte déjà un (ex. « 💰 Demande de décaissement »).
function contientEmoji(s) {
  try { return /\p{Extended_Pictographic}/u.test(s || '') } catch (e) { return false }
}

self.addEventListener('push', function (event) {
  var data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) {
    data = { title: 'LA TERMITIÈRE', body: event.data ? event.data.text() : '' }
  }
  var module = NOM_MODULE[data.module] || 'LA TERMITIÈRE'
  var titreBrut = data.title || 'LA TERMITIÈRE'
  // N'ajoute l'emoji générique du type que si le titre n'en porte pas déjà un —
  // évite le doublon visuel (« ⚠️ 💰 Demande… ») présent sur la quasi-totalité
  // des notifications, qui incluent déjà leur propre emoji.
  var title = contientEmoji(titreBrut) ? titreBrut : ((EMOJI[data.type] || '🔔') + ' ' + titreBrut)
  var options = {
    body: data.body || '',
    icon: LOGO_MODULE[data.module] || '/termitiere-logo.png',
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
    actions: [{ action: 'ouvrir', title: '👀 Voir détails' }, { action: 'fermer', title: 'Ignorer' }],
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

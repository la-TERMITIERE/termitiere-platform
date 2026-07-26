# Notifications — comme WhatsApp

Toute notification de l'application (demande d'autorisation, sortie, validation,
refus, alerte de stock…) est désormais **visible immédiatement**, sur téléphone
comme sur PC, avec trois niveaux qui se complètent :

| Situation de l'utilisateur | Ce qu'il voit |
|---|---|
| L'appli est **à l'écran** | Un **bandeau qui glisse depuis le haut** (façon WhatsApp), aux couleurs du module, avec **son + vibration**. Un clic ouvre la page concernée. |
| L'appli est **ouverte mais en arrière-plan** (autre onglet, autre appli) | Une **vraie notification système** (centre de notifications Android / Windows) + pastille sur l'onglet. |
| L'appli est **fermée** | Une **notification push** envoyée par le serveur, affichée par le service worker. C'est le cas « WhatsApp fermé » — il faut l'avoir autorisée une fois (voir plus bas). |

Dans tous les cas la notification reste consultable dans la **cloche** en haut à
droite, et le nombre de non-lues s'affiche sur l'**icône de l'application**
installée (PWA) et dans le **titre de l'onglet**.

## Ce qu'il faut faire une seule fois, par appareil
À la première connexion, une carte **« Activer les notifications »** s'affiche en
bas de l'écran. L'utilisateur tape **Activer** puis accepte la demande du
navigateur. C'est indispensable : sans cette autorisation, rien ne peut arriver
quand l'appli est fermée.

- Reporté 3 jours si l'utilisateur choisit « Plus tard ».
- Toujours accessible ensuite depuis la cloche 🔔.
- Si l'utilisateur a **refusé**, la cloche explique comment débloquer le site
  dans les réglages du navigateur (cadenas 🔒 à côté de l'adresse).
- Sur iPhone, l'app doit être **ajoutée à l'écran d'accueil** (Partager →
  « Sur l'écran d'accueil ») pour que les notifications soient autorisées : c'est
  une limite d'iOS, pas de l'application.

## Côté serveur (à faire une fois)
Le push « appli fermée » passe par la fonction `netlify/functions/send-push.js`,
qui a besoin d'une paire de clés VAPID dans **Netlify → Site settings →
Environment variables** :

```
VAPID_PUBLIC   = <clé publique>
VAPID_PRIVATE  = <clé privée>
```

La clé **publique** doit être identique côté client (`VITE_VAPID_PUBLIC`, valeur
par défaut dans `src/core/push.js`). Sans ces variables, la fonction répond
`{ ok:false, skipped:'Push non configuré' }` : l'application continue à
fonctionner normalement, seul le push appli-fermée est ignoré.

Pour générer une paire :
```bash
npx web-push generate-vapid-keys
```

## Réglages disponibles pour l'utilisateur
- **Son des alertes** : bouton 🔊 / 🔇 dans le panneau de la cloche (mémorisé par
  appareil).
- **Masquer une alerte** : bouton ✕ sur la carte, ou la faire **glisser** vers le
  haut / le côté.
- Les alertes disparaissent seules (9 s, ou 20 s pour les demandes
  d'autorisation) ; la notification reste dans la cloche.

## Comment ça marche (pour la maintenance)

| Fichier | Rôle |
|---|---|
| `src/core/notify.js` | Point d'entrée unique : `notify({ type, title, body, module, forRoles, forUsers, link })`. Écrit dans la collection `notifications` **et** déclenche le push. |
| `src/hooks/useNotifications.js` | Filtre les notifications de l'utilisateur, déclenche le bandeau ou la notification système selon que l'onglet est visible, met à jour les pastilles. |
| `src/core/alertes.js` | File des bandeaux + son (synthétisé, aucun fichier audio) + vibration + pastille de l'icône. |
| `src/shared/Layout/AlertesHeadsUp.jsx` | Affichage des bandeaux (monté dans `AppShell`). |
| `src/shared/Layout/ActiverAlertes.jsx` | Invitation à autoriser les notifications de l'appareil. |
| `src/shared/Layout/NotificationBell.jsx` | Cloche + panneau + réglage du son. |
| `src/core/push.js` | Abonnement Web Push de l'appareil (stocké dans `push_subs`). |
| `netlify/functions/send-push.js` | Envoi serveur signé VAPID. |
| `public/push-handler.js` | Affichage de la notification système appli fermée + ouverture au clic. |

**Cloisonnement par module** : la cloche ne montre que les notifications du
module ouvert (pour ne pas mélanger les acteurs), mais les **bandeaux d'alerte et
la pastille couvrent tous les modules autorisés** — une demande d'autorisation
doit alerter même si on travaille ailleurs. Le panneau de la cloche indique alors
« N notifications dans d'autres applications ».

**Types de notification** : `demande`, `approuve`, `refus`, `success`, `warning`,
`rappel`, `user`, `info`. Les types `demande`, `refus`, `warning` et `alerte`
sont traités comme **importants** : vibration plus marquée, bandeau affiché plus
longtemps, et notification système qui reste jusqu'à ce que l'utilisateur agisse.

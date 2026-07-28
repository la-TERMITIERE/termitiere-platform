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
  une limite d'iOS, pas de l'application. Une carte dédiée explique cette étape
  aux utilisateurs iPhone (sinon le push est techniquement impossible).

## Gérer les notifications dans la cloche
- Les notifications **restent** jusqu'à ce que l'utilisateur les efface lui-même
  (plus d'auto-effacement après 5 min, qui les faisait « disparaître puis
  réapparaître »).
- **Effacer une seule** : le **✕** à droite de chaque notification (toujours
  visible, y compris au toucher sur mobile). L'effacement est **persistant par
  utilisateur** (`dismissedBy/{uid}`) — elle ne revient plus au rechargement, et
  n'affecte pas les autres destinataires de la même notification.
- **Tout effacer** : vide **tout** ce qui est affiché (lues comprises), après
  confirmation.
- Toucher une notification l'**ouvre** (va sur la page concernée) et la marque lue.

## Pourquoi « ça marche sur PC mais pas sur mobile »
Sur PC, l'app est souvent ouverte → bandeau + notification système fonctionnent
sans push. Sur mobile, l'app est fermée → il faut le **vrai push**, qui exige :
1. la permission accordée sur l'appareil (carte « Activer ») ;
2. sur **iPhone**, l'app **installée** à l'écran d'accueil (voir ci-dessus) ;
3. les clés **VAPID** cohérentes entre le client et Netlify, **et le site
   redéployé** après leur mise en place (cf. section serveur).
Si l'un manque, le mobile ne reçoit rien tandis que le PC (app ouverte) semble
fonctionner.

## Côté serveur (à faire une fois)
Le push « appli fermée » passe par la fonction `netlify/functions/send-push.js`,
qui a besoin d'une paire de clés VAPID.

Trois variables sont nécessaires dans **Netlify → Site configuration →
Environment variables** :

| Variable | Rôle |
|---|---|
| `VAPID_PRIVATE` | Secret de signature, utilisé par la fonction `send-push`. |
| `VAPID_PUBLIC` | Clé publique correspondante, côté serveur. |
| `VITE_VAPID_PUBLIC` | **La même valeur que `VAPID_PUBLIC`**, lue par Vite au moment du build pour que le navigateur s'abonne avec la bonne clé. |

⚠️ **Le point qui casse tout, sans aucun message d'erreur** : la clé publique
utilisée par le navigateur pour s'abonner et celle utilisée par le serveur pour
signer doivent être **identiques**. Sinon le service de push (Google, Apple,
Mozilla…) rejette l'envoi avec un 403 : l'app ne voit rien, le destinataire ne
reçoit rien. C'est exactement le piège dans lequel le projet est tombé.

La valeur par défaut inscrite dans `src/core/push.js` a été alignée sur la clé
`VAPID_PUBLIC` du site (commence par `BBSBKK3f…`), donc le client s'abonne
désormais avec la bonne clé même sans `VITE_VAPID_PUBLIC`. Si un jour vous
changez la paire de clés du serveur, remettez la valeur à jour **des deux
côtés** (Netlify + `src/core/push.js`), sans quoi le silence reviendra.

Pour diagnostiquer : la console du navigateur affiche
`[push] aucun envoi abouti (0/N)` quand tous les envois sont refusés.

Sans `VAPID_PUBLIC`/`VAPID_PRIVATE`, la fonction répond
`{ ok:false, skipped:'Push non configuré' }` : l'application continue à
fonctionner normalement, seul le push appli-fermée est ignoré.

Pour regénérer une paire (par exemple si la clé privée a fuité) :
```bash
npx web-push generate-vapid-keys
```
⚠️ Regénérer **invalide tous les abonnements existants** : chaque appareil devra
se réabonner. Ne le faire que si c'est nécessaire.
Il faut alors mettre à jour **les deux** côtés : `VAPID_PUBLIC`/`VAPID_PRIVATE`
dans Netlify **et** la valeur par défaut dans `src/core/push.js`. Les appareils
déjà abonnés avec l'ancienne clé se réabonnent tout seuls à leur prochaine
connexion (`subscribeToPush` détecte l'abonnement périmé et le remplace).

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

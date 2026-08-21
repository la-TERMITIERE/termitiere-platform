# Notifications WhatsApp (app fermée)

L'app envoie une alerte WhatsApp pour toute notification « importante » (demande
d'autorisation, refus, alerte budget/stock…) — les mêmes types déjà classés
prioritaires pour le push (cf. `TYPES_URGENTS` dans `src/core/notify.js`) — même
application fermée. Cela passe par l'**API WhatsApp Business Cloud (Meta)** via une
fonction serveur Netlify (`netlify/functions/whatsapp-notify.js`), appelée
automatiquement par `notify()` (aucun branchement à faire module par module).

> ⚠️ La plomberie est **déjà en place** (fonction serveur + champ « Téléphone
> WhatsApp » sur les comptes + déclenchement automatique depuis `notify()`). Il
> reste à **brancher un compte Meta WhatsApp Business** et à renseigner 2
> variables. Tant que ce n'est pas fait, l'app continue normalement (les autres
> notifications fonctionnent), seul l'envoi WhatsApp est ignoré.

## Étape 1 — Créer l'accès WhatsApp Business Cloud (Meta)
1. https://developers.facebook.com → **Mes apps** → **Créer une app** → type
   « Entreprise ».
2. Ajoute le produit **WhatsApp**.
3. Dans **WhatsApp → Démarrage rapide** tu obtiens :
   - un **identifiant de numéro de téléphone** (*Phone number ID*) ;
   - un **jeton d'accès** (temporaire 24 h pour tester ; génère un **jeton
     permanent** via un utilisateur système pour la production).
4. (Test) Ajoute jusqu'à 5 **numéros destinataires vérifiés** dans la console.
   (Production) Vérifie l'entreprise + crée un **template** de message approuvé.

## Étape 2 — Renseigner les variables dans Netlify
Netlify → Site settings → **Environment variables** :
```
WHATSAPP_TOKEN     = <ton jeton d'accès>
WHATSAPP_PHONE_ID  = <Phone number ID>
# Optionnel (production, hors fenêtre 24 h) :
WHATSAPP_TEMPLATE  = <nom_du_template_approuvé>
WHATSAPP_LANG      = fr
```
Puis **Deploys → Trigger deploy**.

## Étape 3 — Renseigner les numéros
Portail → **Utilisateurs** → pour chaque responsable (admin/contrôleur) et agent,
remplir **Téléphone WhatsApp** au **format international sans `+` ni espaces**
(ex. Togo : `22890000000`).

## Test
Crée une demande d'autorisation (sortie de stock, décaissement…) ou provoque un
refus : les destinataires avec un numéro reçoivent un WhatsApp. La fonction renvoie
un statut détaillé ; en cas d'absence de configuration elle répond
`{ ok:false, skipped:'WhatsApp non configuré' }` (aucune erreur côté app).

## Notes importantes
- **Messages business-initiés** : en dehors d'une fenêtre de 24 h après un message
  du destinataire, Meta impose un **template approuvé** (renseigne `WHATSAPP_TEMPLATE`).
  En test/sandbox vers numéros vérifiés, le texte simple fonctionne.
- Le **jeton** est secret : il vit uniquement côté serveur (variable Netlify),
  jamais dans le code client.
- Coût : l'API WhatsApp Cloud a un volume gratuit puis une tarification Meta selon
  le pays/volume — à vérifier sur la console Meta.

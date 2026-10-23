# E-mails d'alerte (E-DÉPENSES)

Le PAU et la GE reçoivent un e-mail pour **chaque dépense** enregistrée et pour **chaque demande de décaissement** à valider.

## Circuit des dépenses

1. Une dépense de **20 000 FCFA ou moins** est décaissée tout de suite. Le PAU et la GE sont prévenus par e-mail.
2. Une dépense de **plus de 20 000 FCFA** (ou imprévue, ou qui dépasse le budget restant) devient automatiquement une **demande** : le PAU et la GE reçoivent un e-mail et une alerte, et l'un d'eux la valide ou la refuse (écran Demandes).
3. Une demande **validée** passe à « Approuvée : à décaisser ». La caisse (secrétaire, Info, Assistant PAU) reçoit un signalement et dispose du bouton **Décaisser**.
4. À la confirmation de la caisse, la demande devient « Décaissée » et la dépense compte dans le budget.

Le seuil est la constante `SEUIL_DEMANDE_FCFA` de `src/modules/depense/data.js`. Les rôles de la caisse sont `CAISSE_DECAISSEMENT_ROLES` dans `src/core/roles.js`.

## Mise en route des e-mails

1. Créer un compte sur https://resend.com et une clé API.
2. Dans Netlify (Site configuration, Environment variables), ajouter :
   - `RESEND_API_KEY` : la clé API (obligatoire) ;
   - `EMAIL_FROM` : expéditeur, par exemple `LA TERMITIÈRE <alertes@latermitiere.com>`. Le domaine doit être vérifié dans Resend. Sans cette variable, l'envoi part de `onboarding@resend.dev`, qui n'écrit **qu'à l'adresse du compte Resend** (essai seulement) ;
   - `APP_URL` : l'adresse de l'application, pour le bouton « Ouvrir » de l'e-mail.
3. `FIREBASE_SERVICE_ACCOUNT` doit déjà être configurée (comme pour WhatsApp et les notifications push).
4. Renseigner l'**adresse e-mail** du PAU et de la GE dans Paramètres, Utilisateurs (fiche de l'utilisateur, champ « Adresse e-mail »).

Tant que la clé n'est pas configurée, rien n'est envoyé et rien ne plante : les alertes dans l'application et les notifications push continuent normalement.

# Sauvegarde automatique de la base (Netlify planifiée + Resend)

Chaque nuit à **03 h (heure du Togo)**, Netlify exécute la fonction
[`netlify/functions/backup-db.mjs`](../netlify/functions/backup-db.mjs) qui :
1. lit **toute** la base `tp/` (les 26 collections) via l'API REST Firebase ;
2. génère un instantané `tp-AAAA-MM-JJ.json` ;
3. te l'envoie **en pièce jointe** par e-mail (via Resend).

Ta boîte mail devient l'archive des sauvegardes — une copie complète et restaurable,
stockée **hors** de Firebase.

---

## Mise en route (une seule fois, ~5 min)

### 1. Créer un compte Resend + une clé API
1. Va sur https://resend.com → inscris-toi (gratuit, 100 e-mails/jour).
2. Menu **API Keys** → **Create API Key** → copie la clé (commence par `re_…`).
3. Note l'**adresse e-mail de ton compte Resend** : avec l'expéditeur par défaut,
   Resend n'enverra QUE vers cette adresse (voir l'encadré plus bas).

### 2. Renseigner les variables d'environnement dans Netlify
Netlify → ton site → **Site configuration → Environment variables** → ajoute :

| Variable | Valeur | Obligatoire |
|---|---|---|
| `RESEND_API_KEY` | la clé `re_…` copiée | ✅ |
| `BACKUP_EMAIL_TO` | l'adresse qui reçoit la sauvegarde (= e-mail du compte Resend) | ✅ |
| `BACKUP_EMAIL_FROM` | expéditeur vérifié (sinon laisser vide → `onboarding@resend.dev`) | ⬜ |
| `FIREBASE_DB_URL` | seulement si la base change (défaut = prod `max-agro-83baf`) | ⬜ |

### 3. Déployer
Pousse le code (ou redéploie depuis Netlify). La fonction planifiée est détectée
automatiquement — tu la verras dans **Functions** avec sa planification.

---

## Tester tout de suite (sans attendre 03 h)
- **Tableau de bord Netlify** → **Functions** → `backup-db` → bouton pour la déclencher,
  **ou**
- **En ligne de commande** (CLI Netlify) :
  ```bash
  npx netlify functions:invoke backup-db
  ```
Vérifie ensuite ta boîte mail : tu dois recevoir `tp-AAAA-MM-JJ.json` en pièce jointe.
Les logs d'exécution sont dans Netlify → Functions → `backup-db`.

---

## ⚠️ Important — expéditeur Resend
Tant que tu n'as **pas vérifié de domaine**, Resend impose l'expéditeur
`onboarding@resend.dev` et **n'autorise l'envoi que vers l'adresse de ton compte
Resend**. Donc : mets `BACKUP_EMAIL_TO` = l'e-mail avec lequel tu t'es inscrit sur Resend.

Pour envoyer vers **n'importe quelle adresse** (ex. plusieurs personnes), vérifie un
domaine dans Resend (**Domains → Add Domain**, ex. `latermitiere.com`) puis mets
`BACKUP_EMAIL_FROM=sauvegarde@latermitiere.com`. Tu peux alors lister plusieurs
destinataires séparés par des virgules dans `BACKUP_EMAIL_TO`.

---

## Restaurer une sauvegarde
La pièce jointe est le contenu exact du namespace `tp/`. Pour restaurer :
Firebase Console → Realtime Database → nœud `tp` → menu **⋮ → Importer un JSON** →
choisir le fichier. *(À faire avec précaution : l'import remplace le nœud `tp`.)*

## Réglages
- **Heure** : modifiable via `export const config = { schedule: '0 3 * * *' }` dans la
  fonction (format cron, en UTC ; le Togo est à UTC+0).
- **Rétention** : gérée par ta boîte mail (les e-mails s'accumulent). Tu peux créer un
  filtre/dossier « Sauvegardes Termitière ».
- **Coût** : nul. ~260 Ko/jour × 30 = ~8 Mo/mois, bien en deçà des quotas gratuits.

# 🔴 Mise en sécurité — marche à suivre

Audit du **4 août 2026**. Ce document liste ce qui a été corrigé **dans le code**
(déjà fait) et ce qui reste à faire **dans les consoles** (vous seul pouvez le faire).

---

## Le constat, vérifié en conditions réelles

| Test effectué | Résultat |
|---|---|
| `GET .../tp.json` sans aucun compte | **200 — 54 collections lisibles** |
| `PUT` à la racine sans aucun compte | **200 — écriture acceptée** |

Étaient exposés sans mot de passe : `garderie_enfants` (santé de mineurs),
`foncier_pieces` (scans de CNI), `users_secret` (hachages), `rh_employes`,
`depense_*`. L'adresse de la base est publique (elle est dans le JavaScript du site).

Un mot de passe de base **Supabase** était également commité en clair dans git
(`migration/supabase/.connection-url.txt`), poussé sur GitHub.

---

## ÉTAPE 1 — À faire MAINTENANT (30 min, dans les consoles)

### 1.1 Fermer la base
Console Firebase → **Realtime Database** → onglet **Règles** → remplacer par le
contenu de **`database.rules.json`** → **Publier**.

Effet immédiat : plus aucune lecture ni écriture sans compte, hors `users` /
`users_secret` (nécessaires à la connexion — voir étape 3).

> **Rollback** si quoi que ce soit casse : republier les anciennes règles. Gardez
> une copie de l'écran avant modification.

### 1.2 Changer les mots de passe compromis
Ces mots de passe sont **publics** (ils étaient dans le code source livré au
navigateur) : `superadmin`, `pau`, `ge`, `admin`, `gerant`, `controleur`, `agent`,
`agent_log`, `agent_briq`, `agent_foncier`, `superviseur`.

→ Portail → **Utilisateurs** → changer chacun. Utilisez des mots de passe longs
et différents.

### 1.3 Faire tourner les clés qui ont fuité
- **Supabase** : dashboard → Settings → Database → *Reset database password*.
  (Si ce projet ne sert plus, **supprimez-le** : c'est plus sûr.)
- **Resend** : régénérer la clé API (elle a circulé en clair).
- **VAPID** : la clé privée a été commitée par le passé. `npx web-push generate-vapid-keys`,
  puis mettre à jour `VAPID_PUBLIC`, `VAPID_PRIVATE` **et** `VITE_VAPID_PUBLIC`
  dans Netlify. Les appareils se réabonnent automatiquement.

---

## ÉTAPE 2 — La sauvegarde (à faire AVANT ou EN MÊME TEMPS que l'étape 1)

⚠️ **Point critique** : l'ancienne sauvegarde lisait la base *sans authentification*.
En fermant la base, elle se serait arrêtée **en silence**.

Le code a été corrigé : la sauvegarde essaie d'abord une lecture **authentifiée**,
et retombe sur l'ancienne méthode si le compte de service n'est pas configuré.
**Elle continue donc de fonctionner comme avant, sans rien faire de votre part.**

Pour qu'elle survive au verrouillage complet, ajoutez dans Netlify :

| Variable | Valeur |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Le JSON complet : Console Firebase → ⚙️ Paramètres du projet → **Comptes de service** → *Générer une nouvelle clé privée* |
| `BACKUP_PASSPHRASE` | Une phrase secrète longue (chiffre la sauvegarde). **Conservez-la ailleurs que dans la boîte mail** — sans elle, la sauvegarde est illisible. |
| `BACKUP_EMAIL_TO` | Idéalement **plusieurs** adresses séparées par des virgules (nécessite un domaine vérifié dans Resend) |

**Vérification** : Netlify → Functions → `backup-db` → *Run*. Vous devez recevoir
l'e-mail. En cas d'échec, vous recevez désormais une **alerte** (avant, l'échec
était totalement silencieux).

**Pour relire une sauvegarde chiffrée :**
```bash
node scripts/dechiffrer-sauvegarde.mjs tp-2026-08-04.json.enc
```

**Restauration** : Console Firebase → Realtime Database → nœud `tp` → *Importer un JSON*.
⚠️ L'import **remplace tout le nœud**. À tester une fois sur un projet de test —
une sauvegarde jamais restaurée n'est pas une sauvegarde.

---

## ÉTAPE 3 — Fermer le dernier trou (après vérification)

`users` et `users_secret` restent lisibles sans compte, car la connexion de
**repli** en dépend. Pour les fermer :

1. Vérifier que `FIREBASE_SERVICE_ACCOUNT` est bien dans Netlify (étape 2).
2. Déployer, se connecter, et vérifier dans l'onglet **Réseau** du navigateur que
   `POST /.netlify/functions/login` répond **200 avec un `token`**.
   - Si la réponse contient `not_configured` → **NE PAS CONTINUER**, corriger d'abord.
3. Publier **`database.rules.etage2.json`**.

---

## Ce qui a déjà été corrigé dans le code

| Faille | Correctif |
|---|---|
| Racine de la base publique en lecture/écriture (`$legacy`) | Racine fermée par défaut |
| N'importe qui pouvait **se promouvoir super_admin** | `role`, `modules`, `actif`, `login` verrouillés aux administrateurs |
| N'importe qui pouvait écraser le mot de passe d'autrui | `users_secret` : écriture réservée au titulaire ou à un admin |
| Journal d'audit **effaçable** depuis Paramètres Agro / Garderie | Retiré des réinitialisations + ajout seul côté serveur |
| Une personne pouvait créer, approuver **et** certifier | Séparation des pouvoirs (demandes de sortie + E-DÉPENSES) |
| Le certificateur pouvait être l'approbateur N1 | Interdit |
| Sauvegarde en clair, échec silencieux | Chiffrement optionnel + lecture authentifiée + **alerte en cas d'échec** |
| Poste partagé : cache et notifications survivaient à la déconnexion | Purge du cache + désabonnement push à la déconnexion |
| Suppression d'un compte laissait son hachage en base | Suppression du secret associé |
| XSS via le nom d'une pièce jointe | Construction par le DOM, plus d'injection HTML |
| `send-push` : authentification contournée si mal configuré | Refus explicite (plus de « fail-open ») |
| Notification pouvant pointer vers un site d'hameçonnage | Liens restreints aux chemins internes |
| Mot de passe Supabase commité | Retiré du suivi git + `.gitignore` + script corrigé |
| En-têtes HTTP manquants | HSTS, Permissions-Policy, COOP, CSP en mode signalement |

---

## Ce qui reste à traiter (important, non urgent)

1. **Cloisonner les collections par rôle** dans les règles. Aujourd'hui, tout
   compte connecté peut encore lire/écrire toutes les collections métier. C'est le
   chantier suivant — il demande une règle par collection.
2. **Sortir les pièces d'identité de la base** (stockage objet + liens signés).
3. **Auto-certification 10 min** : elle s'exécute dans le navigateur du demandeur
   et se déclenche sur une date qu'il écrit lui-même. À déplacer côté serveur.
4. **Obligations légales** (loi togolaise 2019-014 / RGPD) : politique de
   confidentialité, consentement parental pour la garderie, registre des
   traitements, formalités IPDCP, durées de conservation. **Une notification de
   violation de données est probablement due** — à examiner avec un juriste.
5. **Propriété des comptes** : Firebase, Netlify, GitHub et Resend sont sous des
   comptes personnels. À transférer à un compte d'entreprise avec 2 administrateurs.

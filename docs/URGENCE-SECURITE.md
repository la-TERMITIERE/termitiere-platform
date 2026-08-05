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

# ✅ ÉTAT AU 5 AOÛT 2026 — LA BRÈCHE EST FERMÉE

Firebase Authentication a été activé, et les **règles strictes sont publiées**.
Vérifié en conditions réelles :

| Test | Sans compte | Avec un compte |
|---|---|---|
| Lire `garderie_enfants` (santé d'enfants) | **401** | 200 |
| Lire `foncier_pieces` (scans de CNI) | **401** | 200 |
| Lire `rh_employes` (salaires) | **401** | 200 |
| Lire toute la base d'un coup | **401** | — |
| Écrire une donnée | **401** | 200 |
| Lire `users` / `users_secret` (connexion) | 200 | 200 |

`users` et `users_secret` restent lisibles : la connexion en dépend. Ils se
ferment à l'étape 3 (étage 2), une fois la connexion serveur vérifiée.

### ⚠️ UNE ACTION RESTE À FAIRE — la sauvegarde automatique

La sauvegarde nocturne lisait la base **sans authentification**. Elle ne le peut
plus (c'est le but). Elle vous enverra une **alerte** au lieu d'échouer en silence.

**Pour la remettre en route (2 min)** : Netlify → Site settings → Environment
variables → ajouter `FIREBASE_SERVICE_ACCOUNT` avec le JSON complet obtenu via
Console Firebase → ⚙️ Paramètres du projet → **Comptes de service** → *Générer une
nouvelle clé privée*.

> La même variable réactive aussi la vérification d'identité de `send-push`
> (notifications), désormais fermée par défaut. **Une seule variable, deux
> fonctions rétablies.**

**En attendant, vous n'êtes pas sans sauvegarde** :
```bash
npm run sauvegarde              # sauvegarde immédiate (utilise votre session Firebase)
npm run sauvegarde -- --chiffrer  # version chiffrée
```
Testé contre la base verrouillée : 55 collections, 5 892 enregistrements, 5,46 Mo.
Une sauvegarde du 5 août 2026 est déjà présente à la racine du projet
(`tp-2026-08-05.json`, ignorée par git — **à mettre en lieu sûr**).

---

## ⚠️ LE VRAI BLOCAGE (résolu le 5 août) : Firebase Authentication n'était pas activé

Vérifié le 2026-08-04 : l'API d'authentification du projet répond
`CONFIGURATION_NOT_FOUND`. **Firebase Auth n'a jamais été activé.**

Conséquence : **aucun utilisateur n'a de session Firebase**, même après s'être
connecté dans l'application (la connexion compare le mot de passe côté navigateur).
`auth` vaut toujours `null`.

C'est pour cette raison que la base a été laissée ouverte : sans authentification,
c'est la seule façon dont l'application fonctionne. Et c'est pour cette raison que
**publier les règles strictes bloquerait immédiatement TOUS les utilisateurs** :
ils se connecteraient mais ne verraient plus aucune donnée.

**Cette étape conditionne tout le reste.**

---

## ÉTAPE 1 — DÉJÀ FAITE ✅ (règles de transition publiées)

Des règles de transition ont été **publiées le 2026-08-04** (`database.rules.transition.json`).
Elles ferment ce qui pouvait l'être sans authentification, sans aucun risque :

| Test anonyme | Avant | Après |
|---|---|---|
| Écriture à la racine | 200 | **401** |
| Lecture du nœud hérité `maxiagro` | ouvert | **401** |
| **Effacement total de la base** | possible | **401** |
| Suppression d'une entrée du journal d'audit | possible | **401** |
| Sauvegarde `GET /tp.json` | 200 | **200** (préservée) |
| Application (lecture/écriture) | 200 | **200** (préservée) |

⚠️ **Ce qui reste ouvert** : les collections sous `tp/` sont toujours lisibles et
inscriptibles sans compte. C'est indissociable de l'absence d'authentification.
Seule l'étape 1 bis ci-dessous permet de le fermer.

## ÉTAPE 1 bis — ACTIVER L'AUTHENTIFICATION (à faire par vous, ~10 min)

1. Console Firebase → **Authentication** → **Get started**
2. Onglet **Sign-in method** → activer **E-mail/Mot de passe** (le premier seulement,
   pas « lien e-mail »)
3. Demander à **chaque utilisateur de se connecter une fois** : l'application crée
   alors automatiquement son compte Firebase (migration déjà prévue dans le code).
   Vérifier leur apparition dans **Authentication → Users**.
4. Quand tous les comptes actifs y figurent, publier **`database.rules.json`**
   (Realtime Database → Règles), puis suivre l'étape 3 pour l'étage 2.

> **Rollback** à tout moment : republier `database.rules.transition.json`,
> l'application refonctionne immédiatement.

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

## ÉTAPE 3 — Fermer le dernier trou (après l'étape 1 bis)

`users` et `users_secret` restent lisibles sans compte, car la connexion de
**repli** en dépend. Pour les fermer :

0. **Prérequis : l'étape 1 bis doit être faite** (authentification activée et
   comptes migrés), sinon rien de tout cela n'est possible.
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

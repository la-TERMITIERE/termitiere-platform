# Cours 1 — Firebase (le cœur de ta plateforme)

> Objectif : comprendre ce qu'est Firebase, **quelle base de données** ta plateforme utilise,
> comment l'**administrer**, la sécuriser, la surveiller et la sauvegarder.

---

## 1. C'est quoi Firebase ?

**Firebase** est une plateforme de Google qui fournit un **backend prêt à l'emploi** (on dit
**BaaS** — *Backend-as-a-Service*). Au lieu de programmer et d'héberger toi-même un serveur et
une base de données, tu « branches » des services Firebase et tu te concentres sur ton app.

Firebase regroupe plusieurs **produits**. Ta plateforme en utilise quelques-uns :

| Produit Firebase | Utilisé chez toi ? | Rôle |
|---|---|---|
| **Realtime Database** | ✅ OUI (principal) | Stocke **toutes les données** du portail, en temps réel |
| **Authentication** | ✅ fondation en place | Gérer les identités/connexions (vraie auth) |
| **App Check** | ✅ câblé (à activer) | Bloquer les bots / requêtes non issues de l'app |
| Firestore | ⬜ initialisé mais non utilisé | Autre base (voir §3) |
| Hosting | ⬜ non (on utilise Netlify) | Héberger un site |
| Storage | ⬜ disponible | Stocker des fichiers (images…) |

**Ton projet Firebase** s'appelle `max-agro-83baf`. Compte propriétaire :
`leeknoxalfred@gmail.com`. Console : **https://console.firebase.google.com**.

Le code qui initialise Firebase dans ton app : **`src/core/firebase.js`**.

---

## 2. La notion de « base de données » — rappel

Une **base de données** (BDD), c'est l'endroit où une application **range ses informations de
façon durable** : tes ventes, ton stock, tes utilisateurs, etc. Quand tu fermes l'app et que tu
la rouvres, les données sont toujours là → elles vivent dans la base, pas dans le navigateur.

Il existe deux grandes familles :
- **SQL / relationnelle** (PostgreSQL, MySQL…) : les données sont rangées en **tables** (comme
  des feuilles Excel avec des colonnes). C'était l'approche de l'essai Supabase (retiré).
- **NoSQL** (Firebase, MongoDB…) : pas de tables rigides ; les données sont rangées en
  **documents/objets** souples. C'est ce qu'utilise Firebase.

---

## 3. QUELLE base utilises-tu ? → **Realtime Database (RTDB)**

Firebase propose **deux** bases NoSQL. Il est crucial de ne pas les confondre :

| | **Realtime Database (RTDB)** ← la tienne | Firestore |
|---|---|---|
| Modèle | Un **seul grand arbre JSON** | Collections de documents |
| Temps réel | ✅ oui | ✅ oui |
| Requêtes | Simples (par chemin) | Riches (filtres composés) |
| Idéal pour | Données live, structure simple | Données complexes, gros volumes |

**Ta plateforme utilise la Realtime Database.** Pourquoi ? Parce que l'app a besoin de
**synchronisation temps réel** entre tous les appareils (quand un agent saisit une vente, le
gérant la voit instantanément), avec une structure simple. RTDB est parfaite pour ça.

> ⚠️ Firestore est aussi *initialisé* dans `src/core/firebase.js` (lignes ~65) mais **n'est pas
> utilisé** par le socle actuel. Ne le confonds pas avec ta vraie base. Ta vraie base = RTDB.

### Le modèle de données RTDB : un grand arbre JSON

Imagine un **arbre** (ou un gros objet JSON, ou des dossiers imbriqués). Chaque donnée a un
**chemin**. Ta base ressemble à ceci :

```
max-agro-83baf-default-rtdb         ← la racine de TA base
└── tp/                              ← "namespace" de ta plateforme (Termitière Platform)
    ├── users/                       ← collection des comptes
    │   ├── superadmin/  { login, nom, role, passHash, ... }
    │   └── ge/          { login, nom, role, ... }
    ├── audit_global/                ← journal des actions
    │   ├── -NxAbc123/   { userId, action, timestamp, ... }
    │   └── -NxAbc124/   { ... }
    ├── agro_demandes/   { ... }
    ├── evenementiel_ventes/  { ... }
    └── ... (26 collections au total)
```

**Vocabulaire :**
- **Nœud** (*node*) : un « emplacement » dans l'arbre (ex. `tp/users`).
- **Clé** (*key*) : le nom d'un nœud (ex. `superadmin`, ou un identifiant auto comme `-NxAbc123`).
- **Namespace `tp/`** : tout ce qui appartient à ton portail est rangé sous `tp/`, pour ne PAS
  mélanger avec les données de l'ancienne app MAXI-AGRO qui vit ailleurs dans la même base.

> 🔑 Règle d'or RTDB : une **clé** ne peut PAS contenir `. # $ [ ] /` ni d'espace. C'est
> pourquoi ton code « assainit » les identifiants en clés techniques (cf. `src/core/users.js`,
> fonction `safeKey`).

### Comment ton code parle à la base

Tu n'écris jamais directement dans Firebase depuis 50 endroits. Tout passe par **une seule
couche** : `src/core/db.js` → `src/core/db.firebase.js`. Elle expose 8 fonctions :

| Fonction | Rôle | Exemple |
|---|---|---|
| `getAll('users')` | lire toute une collection | charger tous les comptes |
| `getOne('users', id)` | lire un élément | un compte précis |
| `addItem('ventes', data)` | ajouter (clé auto) | enregistrer une vente |
| `setItem('users', id, data)` | créer/écraser un élément | créer un compte |
| `updateItem('users', id, data)` | mettre à jour des champs | changer un rôle |
| `removeItem('users', id)` | supprimer | retirer un compte |
| `subscribeCollection('ventes', cb)` | **écouter en temps réel** | recevoir chaque nouvelle vente |
| `ts()` | horodatage | maintenant |

**Avantage de cette couche unique :** toute écriture passe par `sanitize.js` (nettoyage) et
`rateLimit.js` (limite anti-rafale) **automatiquement**. C'est de la bonne architecture (cf.
cours 5).

---

## 4. Administrer ta base depuis la console

Va sur **https://console.firebase.google.com** → projet **max-agro-83baf** → menu de gauche
**Build → Realtime Database**. Tu vois l'arbre de tes données en direct.

### Lire et explorer
- Déplie les nœuds (`tp` → `users` → un compte). Tu vois les données **en direct** : si un
  agent saisit pendant que tu regardes, ça change sous tes yeux.
- La barre en haut affiche le **chemin** ; tu peux cliquer dessus pour naviguer.

### Modifier à la main (prudence ⚠️)
- Clique sur une valeur pour l'éditer. Le **`+`** ajoute un nœud enfant ; la **croix** supprime.
- ⚠️ **Une modification est immédiate et définitive** (pas de « Ctrl+Z »). Modifier à la main
  est utile pour un dépannage ponctuel, **jamais** pour de la saisie courante (ça contourne
  le nettoyage et le workflow de l'app).

### Importer / Exporter du JSON
- Menu **⋮** (en haut à droite du nœud) → **Exporter le JSON** : télécharge une copie.
- **Importer le JSON** : remplace le nœud par un fichier. ⚠️ Importer sur `tp` **écrase** tout
  `tp`. C'est exactement ce que fait ta **sauvegarde** pour restaurer (cf. `docs/SAUVEGARDE_AUTO.md`).

### Surveiller l'usage
- Onglet **Usage** : connexions simultanées, stockage, bande passante téléchargée. Aujourd'hui
  tu es à **<1 %** des limites (≈605 enregistrements, 260 Ko).

---

## 5. Les règles de sécurité RTDB (très important)

Par défaut, ta base est en **lecture/écriture ouvertes** : n'importe qui connaissant l'URL peut
lire. La sécurité repose donc, pour l'instant, sur l'**auth applicative** (les mots de passe
hachés). C'est l'état historique que tu as choisi de garder… jusqu'à la sécurisation.

Les **règles** (*security rules*) sont un petit programme qui dit **qui a le droit de lire/écrire
quoi**. Elles vivent dans le fichier `database.rules.json` de ton projet :

```json
{
  "rules": {
    "tp": {
      ".read": "auth != null",   // lire seulement si connecté (Firebase Auth)
      ".write": "auth != null"   // écrire seulement si connecté
    }
  }
}
```

- `auth != null` veut dire : « il faut une **session Firebase Auth valide** ». C'est le verrou
  final du principe #3 (cf. cours 5 et `docs/SECURITE.md`).
- ⚠️ **Ne déploie ces règles qu'après** que la plupart des comptes ont une session Firebase Auth
  (sinon tu bloques tout le monde). Déploiement : `npx firebase-tools deploy --only database`.
- **Rollback** (annuler) : republier des règles ouvertes `{ "rules": { ".read": true, ".write": true } }`.

> Tu peux tester/éditer les règles dans la console : Realtime Database → onglet **Règles**, avec
> un simulateur intégré (« Rules Playground »).

---

## 6. Firebase Authentication

**Auth** est le service dédié aux **identités** : qui es-tu, prouve-le. Tu ne réinventes pas la
sécurité des mots de passe — tu branches un service audité par Google.

- Dans ton projet, la **fondation** est en place : à chaque connexion, l'app crée/établit une
  vraie **session Firebase Auth** en arrière-plan (cf. `ensureFirebaseAuthSession` dans
  `src/core/auth.js`). Les comptes Auth utilisent un e-mail synthétique `<login>@termitiere.local`.
- **À activer (console)** : *Authentication → Sign-in method → E-mail/Mot de passe → Activer.*
- **Bonus offerts par Auth** une fois en place : **connexion Google**, **magic links** (lien de
  connexion par e-mail, sans mot de passe), **2FA** (double facteur).

Concepts Auth à connaître :
- **Provider** (fournisseur) : une méthode de connexion (e-mail/mdp, Google, téléphone…).
- **UID** : identifiant unique d'un utilisateur Auth (différent de ton `login`).
- **ID token** : un jeton signé prouvant l'identité, qu'un serveur peut **vérifier** (utile pour
  sécuriser une fonction Netlify plus tard).

---

## 7. App Check (anti-bots)

**App Check** garantit que **seules les requêtes issues de ton app authentique** atteignent
Firebase — un robot externe qui tape l'URL est rejeté. C'est gratuit et déjà câblé dans
`src/core/firebase.js` (il s'active dès que `VITE_RECAPTCHA_KEY` est fourni).

Pour l'activer : créer une clé **reCAPTCHA v3**, l'enregistrer dans **App Check** (console),
puis activer l'**enforcement** sur Realtime Database. (Détails : `docs/SECURITE.md`.)

---

## 8. Plans et facturation (à connaître absolument)

Firebase a deux plans :

| | **Spark (gratuit)** ← le tien | **Blaze (à l'usage)** |
|---|---|---|
| Prix | 0 € | tu paies ce que tu consommes |
| RTDB connexions simultanées | **100 max** | ~200 000 |
| RTDB stockage | 1 Go | au-delà, payant |
| RTDB téléchargement | 10 Go/mois | au-delà, payant |
| Cloud Functions (serveur Firebase) | ❌ indisponible | ✅ disponible |

**Pour toi aujourd'hui :** le plan gratuit suffit très largement. Tu passeras à **Blaze**
seulement si tu dépasses 100 connexions simultanées, OU si tu veux des **Cloud Functions**
Firebase (un vrai serveur côté Firebase). Blaze reste bon marché à ton échelle, mais **mets une
alerte de budget** (console → ⚙️ → Usage and billing → Budgets & alerts).

---

## 9. Sauvegardes

RTDB sur le plan gratuit **ne fait aucune sauvegarde automatique**. Tu as donc mis en place une
**sauvegarde quotidienne** (fonction Netlify planifiée + e-mail Resend) — cf.
`docs/SAUVEGARDE_AUTO.md`. **La sauvegarde est ton filet de sécurité n°1.** Vérifie de temps en
temps que tu reçois bien l'e-mail.

Restaurer : Realtime Database → nœud `tp` → menu ⋮ → **Importer un JSON** → choisir le fichier
de sauvegarde. (⚠️ remplace le nœud `tp`.)

---

## 10. Pièges et bonnes pratiques (à retenir)

- ✅ **La config Firebase web (apiKey…) n'est PAS un secret.** Elle est publique par conception ;
  la sécurité vient des règles + Auth. Ne perds pas de temps à la « cacher ».
- ✅ **Toujours passer par la couche `db.js`** dans le code, jamais d'appel Firebase brut ailleurs.
- ⚠️ **Charger une collection entière ne passe pas à l'échelle indéfiniment** : `getAll` lit TOUT.
  Aujourd'hui c'est instantané, mais dans 1-3 ans sur `audit_global`/ventes, il faudra paginer /
  filtrer par date / archiver (cf. cours 5).
- ⚠️ **Ne fais jamais tourner deux bases en réel en même temps** (le piège Firebase + Supabase).
- 🔐 **Gouvernance** : active la **2FA** sur `leeknoxalfred@gmail.com`, ajoute un **2ᵉ
  propriétaire**, et envisage de transférer le projet au compte entreprise. Perdre l'accès au
  compte = perdre la base. C'est le risque n°1, avant la technique.

---

## 11. Exercices pratiques (sur TON projet)

1. **Explorer** : console → Realtime Database → déplie `tp/users`. Combien de comptes ? Repère le
   champ `role` de `superadmin`.
2. **Exporter** : exporte le nœud `tp/agro_referentiel` en JSON. Ouvre le fichier : tu reconnais
   la structure « clé → objet » ?
3. **Usage** : onglet Usage → note ta bande passante du mois. À quel % de 10 Go es-tu ?
4. **Règles** : onglet Règles → lis les règles actuelles. Sont-elles ouvertes ou fermées ?
5. **Relier au code** : ouvre `src/core/db.firebase.js`. Retrouve la fonction `getAll` et
   comprends comment elle transforme l'arbre JSON en tableau d'objets `{ id, ...data }`.

➡️ Cours suivant : [Netlify](02-netlify.md).

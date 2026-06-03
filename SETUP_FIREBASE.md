# Guide d'installation — Socle Firebase + Déploiement Netlify

Plateforme **LA TERMITIÈRE** · _Toujours dans l'action_

Ce guide met en place le **vrai** backend (Firebase) et le déploiement (Netlify).
Tant que `.env` n'est pas rempli, l'app tourne en **mode démo local** (localStorage).

---

## Étape 1 — Créer le projet Firebase

1. Aller sur <https://console.firebase.google.com> → **Ajouter un projet**.
2. Nom : `la-termitiere` (ou autre). Désactiver Google Analytics (optionnel).
3. Attendre la création, puis ouvrir le projet.

## Étape 2 — Activer l'authentification

1. Menu **Build → Authentication → Commencer**.
2. Onglet **Sign-in method** → activer **E-mail/Mot de passe** → Enregistrer.

## Étape 3 — Créer la base Firestore

1. Menu **Build → Firestore Database → Créer une base de données**.
2. Choisir **Mode production** (les règles sécurisées seront déployées à l'étape 7).
3. Région : `eur3` (Europe) ou la plus proche du Togo disponible.

## Étape 4 — (Optionnel) Activer Storage

Seulement si on utilise les photos RH : **Build → Storage → Commencer** (mode production).

## Étape 5 — Récupérer la configuration Web

1. **Paramètres du projet** (roue dentée) → section **Vos applications** → icône **Web `</>`**.
2. Surnom : `termitiere-web` → Enregistrer.
3. Copier les valeurs de `firebaseConfig`.

## Étape 6 — Renseigner les variables d'environnement

Créer un fichier `.env` à la racine (copie de `.env.example`) et remplir :

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=la-termitiere.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=la-termitiere
VITE_FIREBASE_STORAGE_BUCKET=la-termitiere.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

> Ces mêmes variables devront être ajoutées dans **Netlify → Site settings → Environment variables**.

## Étape 7 — Déployer les règles de sécurité

```bash
# Installer la CLI Firebase (une fois)
npm install -g firebase-tools
firebase login

# Lier le projet : éditer .firebaserc OU exécuter
firebase use --add        # choisir le projet, alias "default"

# Déployer règles + index Firestore + règles Storage
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Les règles (`firestore.rules`) appliquent le **contrôle d'accès par module côté serveur**
(un agent logistique ne peut ni lire ni écrire les données AGRO, même via l'API).

## Étape 8 — Créer les comptes initiaux

```bash
npm install -D firebase-admin
# Console Firebase → Paramètres → Comptes de service → Générer une clé privée
# Enregistrer le fichier sous : scripts/serviceAccountKey.json  (déjà gitignoré)
node scripts/seed-admin.mjs
```

Comptes créés (identifiant / mot de passe) — **à changer immédiatement** :

| Identifiant | Mot de passe | Rôle | Modules |
|-------------|-------------|------|---------|
| admin | admin123 | admin | tous |
| controleur | ctrl123 | contrôleur | agro, logistique |
| agent | agent123 | agent | agro |
| agent_log | log123 | agent | logistique |

> La connexion se fait avec l'**identifiant** (ex : `admin`), pas l'email.
> Les comptes suivants se gèrent ensuite depuis **Accueil → Gestion des utilisateurs**.

Le référentiel (espèces / aliments) s'amorce **automatiquement** à la première ouverture
du module MAXI-AGRO (collection `agro_referentiel`).

## Étape 9 — 🔴 Sécuriser l'ancienne base (important)

L'ancienne app MAXI-AGRO expose sa base Realtime Database **publiquement**
(`max-agro-83baf`). Après migration des données :

1. Console Firebase du projet `max-agro-83baf` → **Realtime Database → Règles**.
2. Remplacer par : `{ "rules": { ".read": false, ".write": false } }` → Publier.
3. Ou supprimer la base si elle n'est plus utilisée.

## Étape 10 — Déployer sur Netlify

```bash
npm install -g netlify-cli
netlify init        # lier le dépôt / créer le site
netlify deploy --prod
```

Ou via l'interface Netlify : connecter le dépôt Git, build `npm run build`, publish `dist`.
Ne pas oublier d'ajouter les variables `VITE_*` dans les paramètres Netlify.
Domaine `latermitiere.com` : **Domain settings → Add custom domain** (SSL automatique).

---

## Vérifier que tout marche

- [ ] `npm run dev` → la page de connexion s'affiche (sans les comptes démo si `.env` rempli).
- [ ] Connexion avec `admin` / `admin123`.
- [ ] Un agent logistique ne voit pas MAXI-AGRO et ne peut pas y accéder.
- [ ] Une catégorie créée sur un appareil apparaît sur un autre (synchro Firestore).
- [ ] Mode avion → l'app reste utilisable, resynchronise au retour réseau.

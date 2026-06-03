# Activer la synchronisation multi-appareils (Firebase)

Le portail fonctionne en deux modes (voir `src/core/firebase.js`) :

- **Mode démo** (par défaut, aucune variable d'environnement) : données stockées
  **localement** dans le navigateur (`localStorage`). ⚠️ **Pas de synchronisation**
  entre appareils — chaque téléphone/PC a ses propres données.
- **Mode Firebase** (variables `VITE_FIREBASE_*` renseignées) : données dans
  **Firestore**, **synchronisées en temps réel** entre tous les appareils, avec
  cache hors-ligne automatique. **C'est ce mode qu'il faut activer** pour un usage
  multi-utilisateurs.

> Le code est déjà prêt : il bascule automatiquement en mode Firebase dès que les
> variables sont présentes. Il reste 3 actions, côté console Firebase + Netlify.

---

## Étape 1 — Activer Firestore + Authentification dans Firebase

Projet existant : **`max-agro-83baf`** (https://console.firebase.google.com).

1. **Build → Firestore Database → Créer une base** → **Mode production** → région la plus proche.
2. **Build → Authentication → Commencer** → onglet **Sign-in method** →
   activer **E-mail/Mot de passe** → Enregistrer.

## Étape 2 — Ajouter les variables d'environnement dans Netlify

Netlify → ton site → **Site settings → Environment variables** → ajoute ces 7 clés
(valeurs du projet `max-agro-83baf`) :

```
VITE_FIREBASE_API_KEY=AIzaSyDMuTQpe7ab2juY-Vw1xp_2qO2OtNAaPks
VITE_FIREBASE_AUTH_DOMAIN=max-agro-83baf.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://max-agro-83baf-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=max-agro-83baf
VITE_FIREBASE_STORAGE_BUCKET=max-agro-83baf.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=576214759800
VITE_FIREBASE_APP_ID=1:576214759800:web:14f31828082bee770e708d
```

Puis **Deploys → Trigger deploy → Deploy site** (pour reconstruire avec les variables).

> 💡 Ces clés web Firebase ne sont **pas** des secrets (la sécurité repose sur les
> règles Firestore + l'authentification). Tu peux aussi créer un **nouveau** projet
> Firebase dédié au portail si tu préfères séparer du MAXI-AGRO d'origine (qui, lui,
> utilise la *Realtime Database* ; le portail utilise *Firestore* — bases distinctes).

## Étape 3 — Créer les comptes utilisateurs + déployer les règles

En mode Firebase, les comptes démo ne fonctionnent plus : il faut de **vrais comptes**.

**a) Déployer les règles de sécurité** (depuis le dossier du projet) :
```bash
npm install -g firebase-tools
firebase login
firebase use max-agro-83baf
firebase deploy --only firestore:rules,firestore:indexes
```

**b) Amorcer les comptes** (admin, contrôleur, agents) :
```bash
npm install -D firebase-admin
# Console Firebase → Paramètres → Comptes de service → Générer une clé privée
# → enregistrer sous scripts/serviceAccountKey.json   (NE PAS COMMITER)
node scripts/seed-admin.mjs
```
Cela crée les comptes (admin / admin123, etc.) dans Firebase Auth + leurs profils
dans `users/{uid}`. **Change les mots de passe par défaut ensuite** (via la gestion
des utilisateurs du portail, ou la console Firebase).

---

## Vérifier que la sync marche
1. Connecte-toi sur deux appareils différents (ou deux navigateurs).
2. Sur l'un, fais une **Saisie journalière** et enregistre.
3. Sur l'autre, la donnée apparaît **en quelques secondes** sans recharger.

> Tant que les étapes ci-dessus ne sont pas faites, l'app reste en mode démo
> (mono-appareil). Une fois faites, la synchronisation est **automatique** partout.

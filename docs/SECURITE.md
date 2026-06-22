# Sécurité de la plateforme — les 4 principes

État au 2026-06-19. Stack : Firebase RTDB (base) + Netlify (hébergement + fonctions).

| Principe | État code | Reste à faire (console — par le propriétaire) |
|---|---|---|
| **1. Aucune clé sensible côté client** | ✅ | rien |
| **2. Valider + nettoyer toutes les entrées** | ✅ | rien |
| **3. Vraie auth (Firebase Auth)** | ✅ fondation | activer le provider + (plus tard) verrouiller les règles |
| **4. Limite anti-bots par utilisateur / par route** | ✅ code | activer App Check (clé reCAPTCHA + enforcement) |

---

## 1. Aucune clé sensible côté client ✅
Vérifié : le navigateur ne détient AUCUN secret.
- Config Firebase = **publique par conception** (la sécurité repose sur les règles + l'auth).
- VAPID : seule la clé **publique** est côté client ; la privée est dans la fonction `send-push`.
- WhatsApp (`WHATSAPP_TOKEN`), Resend (`RESEND_API_KEY`) : **variables d'env Netlify**, lues
  uniquement côté serveur (fonctions). Le client appelle des routes `/.netlify/functions/…`,
  jamais les API tierces directement.

## 2. Valider + nettoyer toutes les entrées ✅
`src/core/sanitize.js` (`sanitizeData`) est appliqué à **TOUS les champs de TOUTES les écritures**
dans `src/core/db.firebase.js` (addItem/setItem/updateItem) — pas seulement le login. Il retire les
caractères de contrôle, plafonne longueurs et profondeur, et rejette fonctions/symboles.
Validateurs de format : `isValidLogin`, `isValidPhone`.

## 3. Vraie auth — Firebase Auth (service dédié, audité)
**Fondation en place (code), non bloquante pour la prod.** À chaque connexion réussie (vérifiée
par l'auth applicative), la connexion suit une stratégie **« Firebase Auth d'abord »**
(`src/core/auth.js`, fonction `login`) :
1. tentative `signInWithEmailAndPassword(<login>@termitiere.local, mot de passe)` — le cas normal
   une fois l'utilisateur migré, et **indispensable** quand les règles sont verrouillées ;
2. repli sur l'auth applicative (hash SHA-256) tant que tout n'est pas migré, **en créant** au
   passage le compte Firebase Auth (migration transparente) ;
3. `logout` ferme aussi la session Firebase Auth.
Rétrocompatible : si le provider e-mail n'est pas encore activé, l'étape 1 échoue proprement et
l'app fonctionne comme avant. **Déployer ce code ne casse rien.**

### 🔐 Bascule SÛRE vers la base verrouillée (par étapes, avec filet)

> Règle d'or : on **migre tout le monde AVANT de verrouiller**. Avec ~13 utilisateurs, c'est rapide.

- **Étape 0 — Filet** : la sauvegarde quotidienne tourne ✅. Avant de verrouiller, exporte aussi
  un JSON de `tp/` (console). Rollback = republier des règles ouvertes
  `{ "rules": { ".read": true, ".write": true } }` (ou redéployer `database.rules.json`).
- **Étape 1 — Activer le provider** (console) : Authentication → Sign-in method →
  **E-mail/Mot de passe** → Activer. (Sans rien casser : règles encore ouvertes.)
- **Étape 2 — Déployer le code** « Firebase Auth d'abord » (push GitHub → Netlify). Toujours sans
  rien casser (règles ouvertes).
- **Étape 3 — Migrer tout le monde** : que **chaque** utilisateur se connecte **une fois**
  (ou le propriétaire se connecte à chaque compte). Chaque connexion crée le compte Firebase
  Auth. Vérifier dans **Authentication → Users** que les ~13 comptes apparaissent.
  - Rattrapage des absents : script Admin SDK (mot de passe temporaire) — cf. §Limites.
  - ⚠️ S'assurer qu'aucun mot de passe ne fait **< 6 caractères** (refusé par Firebase Auth).
- **Étape 4 — Verrouiller** : publier les règles `auth != null` (fichier
  `database.rules.locked.json`) dans la console (Realtime Database → Règles), OU
  `npx firebase-tools deploy --only database` après avoir copié le contenu verrouillé dans
  `database.rules.json`. Tester immédiatement une connexion de bout en bout.
- **Étape 5 — En cas de souci** : rollback règles ouvertes (10 s), on diagnostique, on recommence.

*(Bonus une fois la base sur Auth)* : **Google login**, **magic links**, **2FA** — activables
dans Authentication sans réécrire l'auth.

### Limites connues (documentées)
- **Utilisateur non migré après verrouillage** : il ne pourra plus se connecter (l'étape 2 de
  `login` lit `users`, bloqué sans session Auth) → le rattraper via le script Admin SDK ou en
  rouvrant brièvement les règles. D'où l'importance de l'étape 3 (migrer AVANT de verrouiller).
- Reset de mot de passe par l'admin (page Utilisateurs) non propagé à Firebase Auth (le SDK client
  ne peut pas changer le mot de passe d'autrui) → l'utilisateur garderait l'ancien mdp côté Auth.
  Rattrapage par script Admin SDK. (Le changement self-service via « Mon compte » EST propagé.)
- Mot de passe < 6 caractères refusé par Firebase Auth (compte créé quand l'utilisateur l'allonge).

## 4. Limite anti-bots — par utilisateur et par route
- **Client** : `src/core/rateLimit.js` borne les écritures/lectures **par utilisateur ET par
  collection** (fenêtre glissante) → casse les rafales automatiques.
- **Serveur** : les endpoints publics `whatsapp-notify` (⚠️ envois **payants**) et `send-push` ont
  une **limite par IP** (429 au-delà). 1re barrière contre l'abus.
- **Anti-bots réseau (le vrai verrou)** : **Firebase App Check** est câblé dans `firebase.js`
  (s'active dès que `VITE_RECAPTCHA_KEY` est fourni). Il garantit que seules les requêtes issues de
  l'app authentique atteignent Firebase.

### À faire côté console (par le propriétaire — réglages de sécurité)
1. Créer une clé **reCAPTCHA v3** et l'enregistrer dans **App Check** (console Firebase).
2. Ajouter `VITE_RECAPTCHA_KEY` aux variables d'env Netlify, puis redéployer.
3. Activer l'**enforcement** App Check sur Realtime Database.

---

## Récap des actions du propriétaire (console)
Tout le code est prêt. Pour « fermer les portes » il reste, côté console (réglages de sécurité que
seul le propriétaire doit toucher) :
1. **Authentication → activer E-mail/Mot de passe** (débloque le principe #3).
2. **App Check → clé reCAPTCHA v3 + enforcement RTDB** + `VITE_RECAPTCHA_KEY` sur Netlify (#4).
3. *(plus tard)* **Verrouiller les règles RTDB** une fois l'adoption Auth confirmée (#3).

## Gouvernance (rappels)
- Régénérer les clés partagées en chat : **Resend** (`re_…`) et **Supabase** (service_role/anon/DB).
- Activer la **2FA** sur le compte Google propriétaire ; ajouter un **2ᵉ propriétaire** Firebase ;
  envisager de transférer le projet Firebase vers le compte entreprise.

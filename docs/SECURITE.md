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
par l'auth applicative), `ensureFirebaseAuthSession` (dans `src/core/auth.js`) crée/établit en
arrière-plan une **vraie session Firebase Auth** (`<login>@termitiere.local`). Le changement de mot
de passe (« Mon compte ») est propagé à Firebase Auth. **Si Firebase Auth échoue, la connexion
n'est jamais bloquée.**

### À faire côté console Firebase (par le propriétaire — réglages de sécurité)
1. **Activer le provider** : Authentication → Sign-in method → **E-mail/Mot de passe** → Activer.
   À partir de là, chaque connexion crée un compte Firebase Auth réel (sans rien casser).
2. *(Plus tard, après adoption)* **Verrouiller la base** : déployer les règles `database.rules.json`
   (`auth != null` sur `tp/`) via `npx firebase-tools deploy --only database`. ⚠️ À ne faire
   qu'une fois que la majorité des comptes ont une session Auth (sinon blocage). Rollback =
   republier des règles ouvertes.
3. *(Bonus offerts par Firebase Auth, une fois la base sur Auth)* : **Google login**, **magic links**
   (lien de connexion par e-mail), **2FA** — activables dans Authentication sans réécrire l'auth.

### Limites connues (documentées)
- Reset de mot de passe par l'admin (page Utilisateurs) non propagé à Firebase Auth (le SDK client
  ne peut pas changer le mot de passe d'autrui). Rattrapage par script Admin SDK avant verrouillage.
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

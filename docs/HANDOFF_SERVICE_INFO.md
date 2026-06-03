# Dossier technique — Plateforme LA TERMITIÈRE
### Document de transfert à destination du Service Informatique

> _Toujours dans l'action_ — Agoe Daliko, Lomé, Togo
> Version 1.0 · Document de référence pour l'exploitation, la sécurité et la maintenance.

---

## 1. Présentation

**Nature** : application web professionnelle (PWA) multi-secteurs regroupant, sous un portail unique avec authentification partagée, les modules métier de l'entreprise :

- **MAXI-AGRO** — élevage, inventaire journalier, facturation, santé animale, demandes de sortie.
- **LOGISTIQUE** — véhicules, livraisons, fournisseurs, stock matériel.
- **ÉVÉNEMENTIEL** — événements (Kanban), devis, matériel de location, clients.
- **RH** — employés, présences (en construction).

**Caractéristiques** : responsive (usage mobile prioritaire), installable (PWA), fonctionnement **hors-ligne** avec synchronisation automatique, monnaie FCFA, interface en français.

**URL cible** : `https://app.latermitiere.com`

---

## 2. Architecture technique

```
   Navigateur (PWA installable, cache hors-ligne)
            │  HTTPS
            ▼
   ┌──────────────────────┐        ┌───────────────────────────┐
   │   NETLIFY (CDN)       │        │   FIREBASE (Google Cloud)  │
   │  Sert l'app statique  │◄──────►│  • Authentication (comptes)│
   │  app.latermitiere.com │  API   │  • Firestore (base données)│
   │  SSL automatique      │        │  • Storage (fichiers RH)   │
   └──────────────────────┘        └───────────────────────────┘
            ▲
            │ build & déploiement automatiques
   ┌──────────────────────┐
   │  Dépôt Git (org. ent.)│
   └──────────────────────┘
```

**Il n'y a pas de serveur à administrer.** Le frontend est un site **statique** servi par le CDN Netlify ; toute la logique « backend » (authentification, base de données, sécurité) est **managée par Firebase** (sauvegardes, montée en charge et disponibilité assurées par Google). Le rôle du Service Info se concentre sur la **gouvernance des comptes, le DNS et la supervision** — pas sur de l'administration système.

### Pile technologique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18, Vite 5, Tailwind CSS 3 |
| État / routage | Zustand, React Router 6 |
| Backend managé | Firebase v10 — Firestore, Authentication, Storage |
| Hors-ligne / PWA | Workbox (Service Worker) + cache Firestore IndexedDB |
| Hébergement | Netlify (CDN, SSL, CI/CD) |

---

## 3. Gouvernance & propriété des comptes — PRIORITÉ

> ⚠️ **Principe directeur** : tous les actifs numériques doivent appartenir à **l'entreprise**, via des comptes d'entreprise, et **jamais** à un compte personnel d'un développeur ou employé. Les développeurs sont **administrateurs**, pas propriétaires.

### Comptes à mettre en place (action Service Info)

| Actif | Recommandation | Propriétaire |
|-------|----------------|--------------|
| Compte Google **maître** | Créer `admin@latermitiere.com` (Google Workspace) | Entreprise |
| Projet **Firebase** | Créé **sous** ce compte Google maître | Entreprise |
| Équipe **Netlify** | Créée avec un email d'entreprise | Entreprise |
| Dépôt **Git** | Organisation GitHub/GitLab d'entreprise | Entreprise |
| **Domaine** `latermitiere.com` | Compte registrar d'entreprise | Entreprise |
| **Facturation** cloud | Moyen de paiement d'entreprise | Entreprise |

### Modèle d'accès recommandé
- **2 administrateurs minimum** sur chaque service (éviter le point de défaillance unique).
- Accès développeur en **rôle limité** (Editor), révocable.
- Activer l'**authentification à deux facteurs (2FA)** sur tous les comptes maîtres.

---

## 4. Domaine & DNS

**Décision retenue** : la plateforme est servie sur le sous-domaine **`app.latermitiere.com`**.
Le domaine racine `latermitiere.com` reste disponible pour une future vitrine publique.

### Enregistrement DNS à ajouter (chez le registrar / la zone DNS d'entreprise)

| Type | Nom (hôte) | Valeur | TTL |
|------|-----------|--------|-----|
| `CNAME` | `app` | `<NOM-DU-SITE>.netlify.app` | 3600 |

> `<NOM-DU-SITE>` est fourni par Netlify à la création du site (ex. `termitiere-platform.netlify.app`).
> **Aucune migration de nameservers nécessaire** : un seul enregistrement à ajouter, le Service Info garde le contrôle total de la zone DNS.

### SSL / HTTPS
Automatique. Une fois le `CNAME` résolu, Netlify provisionne un certificat **Let's Encrypt** (renouvellement automatique). Forcer la redirection HTTPS dans Netlify (option « Force HTTPS »).

### Email professionnel (recommandé, optionnel)
Pour remplacer `latermitiere2021@gmail.com` par `contact@latermitiere.com` :
- **Google Workspace** (~6 €/utilisateur/mois) ou **Zoho Mail** (offre gratuite).
- Le fournisseur fournit les enregistrements **MX / TXT (SPF, DKIM)** à ajouter à la zone DNS.

---

## 5. Environnements

| Environnement | Branche Git | URL | Usage |
|---------------|-------------|-----|-------|
| Production | `main` | `app.latermitiere.com` | Utilisateurs finaux |
| Pré-production | `staging` | `staging.latermitiere.com` (option) | Tests avant mise en ligne |
| Preview | Pull Request | URL temporaire Netlify | Revue de chaque modification |

---

## 6. Déploiement (CI/CD)

Le déploiement est **automatique** et déclenché par Git — aucun déploiement manuel.

**Paramètres de build Netlify** (déjà définis dans `netlify.toml`) :

| Paramètre | Valeur |
|-----------|--------|
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node version | 20 |
| Redirections SPA | `/* → /index.html` (200) |
| En-têtes sécurité | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` |

### Variables d'environnement (à saisir dans Netlify → Site settings → Environment variables)

> Ces clés sont **publiques par conception** côté client Firebase ; la sécurité repose sur les **règles Firestore + l'authentification**, pas sur le secret des clés.

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL          (laisser vide — non utilisé, Firestore uniquement)
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_EMAILJS_SERVICE_ID             (optionnel — rapports email)
VITE_EMAILJS_TEMPLATE_ID            (optionnel)
VITE_EMAILJS_PUBLIC_KEY             (optionnel)
```

### Déploiement des règles Firebase (CLI, depuis le poste d'un admin)
```bash
npm install -g firebase-tools
firebase login
firebase use --add                 # sélectionner le projet, alias "default"
firebase deploy --only firestore:rules,firestore:indexes,storage
```
Fichiers concernés : `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`.

---

## 7. Sécurité

| Mesure | État |
|--------|------|
| Authentification e-mail/mot de passe (Firebase Auth) | ✅ |
| Contrôle d'accès **par module côté serveur** (règles Firestore) | ✅ `firestore.rules` |
| Isolation des données par module (un agent ne lit que ses modules) | ✅ |
| Sessions persistantes sécurisées | ✅ |
| En-têtes de sécurité HTTP | ✅ `netlify.toml` |
| Secrets hors du code source (variables d'env) | ✅ |
| 2FA sur les comptes maîtres | ⏳ à activer (Service Info) |

### Modèle de rôles
- **admin** : accès total, gestion des utilisateurs.
- **controleur** : lecture + validation (factures, demandes, inventaires), modules attribués.
- **agent** : saisie sur ses modules uniquement.

Les droits d'accès aux modules sont stockés dans `users/{uid}.modules` et **appliqués par les règles Firestore** — un utilisateur ne peut pas contourner via l'API.

### 🔴 Action de sécurité prioritaire
L'**ancienne** application MAXI-AGRO expose sa base Realtime Database **publiquement** (`max-agro-83baf`, lecture sans authentification, mots de passe en clair). **Après migration des données**, fermer ses règles (`{".read": false, ".write": false}`) ou supprimer la base.

---

## 8. Base de données (Firestore)

Base NoSQL documentaire. Collections principales :

| Collection | Contenu |
|-----------|---------|
| `users` | Profils, rôles, droits modules |
| `agro_referentiel` | Espèces & aliments (synchro multi-appareils) |
| `agro_inventaires` | Saisies journalières (1 doc / jour) |
| `agro_factures`, `agro_demandes`, `agro_sante` | Facturation, demandes de sortie, santé |
| `logistique_*` | Véhicules, livraisons, fournisseurs, stock |
| `evenementiel_*` | Événements, devis, matériel |
| `rh_*` | Employés, présences |
| `audit_global` | Journal des actions (lecture admin) |

**Quotas plan gratuit (Spark)** : 1 Go stockage · 50 000 lectures / 20 000 écritures par jour — largement suffisant à l'échelle d'une entreprise mono-site. Passage au plan **Blaze** (paiement à l'usage) uniquement si ajout de fonctions serveur ou export programmé, **avec alerte de budget**.

---

## 9. Sauvegardes & reprise

| Mécanisme | Description |
|-----------|-------------|
| Export manuel JSON | Intégré à l'app (Paramètres → Données) |
| Export Firestore programmé | Via Firebase + Cloud Storage (nécessite plan Blaze) — **à planifier** : 1 export/jour, rétention 30 j |
| Résilience Google | Firestore est répliqué et sauvegardé par Google (haute disponibilité) |

**Recommandation** : mettre en place l'export Firestore programmé quotidien vers un bucket Cloud Storage dès le passage en production.

---

## 10. Exploitation & supervision

- **Console Firebase** : suivi de l'usage (lectures/écritures), alertes de quota.
- **Alerte de budget** Firebase à configurer (ex. seuil 5 $/mois) → email au Service Info.
- **Netlify** : journal des déploiements, statut du site, analytics (option).
- **Mises à jour applicatives** : automatiques via Git (le PWA se met à jour seul côté utilisateur).

### Coûts prévisionnels (démarrage)
| Poste | Coût |
|-------|------|
| Domaine | déjà acquis |
| Netlify | 0 € (Free) |
| Firebase | 0 € (Spark) |
| Email pro (option) | ~6 €/utilisateur/mois |

---

## 11. Gestion des utilisateurs

- **Premiers comptes** : créés via le script `scripts/seed-admin.mjs` (Firebase Admin SDK) — voir `SETUP_FIREBASE.md`.
- **Comptes suivants** : profils et droits gérés depuis l'app (**Accueil → Gestion des utilisateurs**, admin).
- **Création du compte d'authentification** depuis l'interface : prévue via une **Cloud Function** (évolution) ; en attendant, création dans la console Firebase Auth + profil renseigné dans l'app.
- ⚠️ **Changer les mots de passe par défaut** dès la première connexion.

---

## 12. Répartition des responsabilités (RACI)

| Tâche | Service Info | Développement |
|-------|:---:|:---:|
| Compte Google/Firebase d'entreprise | **R** | C |
| Zone DNS & enregistrement `app` | **R** | C (fournit valeurs) |
| Email professionnel | **R** | I |
| Variables d'environnement Netlify | **A** | R |
| Code, règles de sécurité, déploiement | C / revue | **R** |
| Sauvegardes programmées | **A** | R (mise en place) |
| Supervision quotas & budget | **R** | I |
| Gestion comptes métier | **A** (co-admin) | C (outil) |

_R = Réalise · A = Approuve · C = Consulté · I = Informé_

---

## 13. Checklist de mise en production

- [ ] Compte Google/Firebase d'entreprise créé (propriété entreprise)
- [ ] 2FA activé sur les comptes maîtres
- [ ] Projet Firebase : Auth (e-mail/mot de passe) + Firestore (prod) + Storage activés
- [ ] Variables d'environnement renseignées dans Netlify
- [ ] Règles `firestore.rules` / `storage.rules` déployées
- [ ] Comptes initiaux créés, mots de passe par défaut changés
- [ ] `CNAME app → Netlify` ajouté, HTTPS forcé
- [ ] Ancienne RTDB `max-agro-83baf` fermée/supprimée
- [ ] Export Firestore quotidien programmé
- [ ] Alerte de budget Firebase configurée
- [ ] Test : connexion, isolation des modules, synchro multi-appareils, mode hors-ligne

---

## 14. Références & contacts

| Ressource | Emplacement |
|-----------|-------------|
| Guide d'installation Firebase pas-à-pas | `SETUP_FIREBASE.md` |
| Règles de sécurité | `firestore.rules`, `storage.rules` |
| Configuration de déploiement | `netlify.toml`, `firebase.json`, `.firebaserc` |
| Script d'amorçage des comptes | `scripts/seed-admin.mjs` |
| Variables d'environnement (modèle) | `.env.example` |

**Entreprise** : LA TERMITIÈRE · Agoe Daliko, Lomé, Togo · 00228 96 09 49 49

---

_Document maintenu avec le code source. Toute évolution de l'architecture doit y être reportée._

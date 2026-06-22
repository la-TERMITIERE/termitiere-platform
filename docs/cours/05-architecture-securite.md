# Cours 5 — Architecture & sécurité de ta plateforme

> Objectif : prendre de la hauteur. Comprendre **comment ton code est organisé** (pour qu'il
> reste maintenable) et **comment il est sécurisé** (les 4 principes appliqués chez toi).

---

## 1. Pourquoi l'architecture compte

Au début, tout marche. Le vrai test, c'est dans 1 an : peux-tu ajouter une fonctionnalité sans
tout casser ? Une **bonne architecture** = du code **organisé en couches**, où chaque morceau a
**une seule responsabilité**. Ta plateforme suit ce principe.

### Les couches de ton app

```
  PAGES & COMPOSANTS (src/portal, src/modules/*)        ← ce que voit l'utilisateur
        │  appellent
        ▼
  STORES (Zustand : auth.js, users.js, *Store.js)       ← la "mémoire" partagée
        │  utilisent
        ▼
  COUCHE DONNÉES (src/core/db.js → db.firebase.js)       ← UNE porte unique vers la base
        │  qui applique
        ▼
  GARDE-FOUS (sanitize.js, rateLimit.js)                 ← nettoyage + limite, AUTOMATIQUES
        │
        ▼
  FIREBASE RTDB                                          ← le stockage
```

**La règle clé** : aucune page n'appelle Firebase directement. **Tout** passe par `db.js`. Comme
ça, le nettoyage et la limite anti-rafale s'appliquent **partout, automatiquement**, et si un
jour tu changes de base, tu ne touches qu'**un seul fichier**. (C'est ce qui a permis de retirer
Supabase proprement : un seul aiguillage à changer.)

---

## 2. Les concepts métier de TA plateforme

> ⚠️ Piège : les noms de dossiers ne correspondent pas aux secteurs ! À mémoriser :

| Dossier | Secteur réel |
|---|---|
| `src/modules/agro` | **Maxi-Agro** (élevage/ferme) |
| `src/modules/logistique` | **Logistique & Événementiel** |
| `src/modules/evenementiel` | **Briqueterie** (⚠️ PAS l'événementiel) |
| `src/modules/foncier` | **Foncier** (terrains/titres) |
| `src/modules/rh` | **Comptabilité** (à venir) |

### Les rôles (`src/core/roles.js`)
`super_admin`, `pau`, `ge`, `superviseur` (lecture seule, voit tout), `gerant`, `agent` (saisie).
Des **helpers** (`isAdmin()`, `canManage()`, `canCertify()`…) centralisent « qui a le droit de
quoi ». On ne dissémine jamais les tests de rôle dans les pages : on appelle un helper.

### Le workflow d'autorisation à 2 niveaux (`src/shared/workflow.js`)
`en_attente` → (gérant) `approuve_n1` → (direction) `certifie`. L'**effet métier** (décompte du
stock, vente autorisée) ne s'applique qu'à la **certification**. C'est une règle métier importante
codée une seule fois et réutilisée par agro/logistique/briqueterie.

---

## 3. Les 4 principes de sécurité (appliqués chez toi)

> Référence complète et à jour : `docs/SECURITE.md`. Résumé pédagogique ici.

### Principe 1 — Le client ne détient jamais ce qui coûte de l'argent ou ouvre une porte
**Idée** : tout secret (clé qui coûte ou qui donne accès) doit transiter par **ton serveur**, pas
par le navigateur. Une clé dans le navigateur est lisible par n'importe qui.
**Chez toi** : les tokens WhatsApp/Resend et la clé VAPID privée vivent en **variables d'env
Netlify** (côté fonction). Le navigateur appelle des routes `/.netlify/functions/…` qui font
l'appel à ta place. La config Firebase web, elle, est publique **par conception** (ce n'est pas
un secret).

### Principe 2 — Valider et nettoyer chaque entrée, sur TOUS les champs
**Idée** : avant qu'une donnée touche la base, vérifier qu'elle a le **bon format** et retirer ce
qui pourrait être interprété comme une commande (caractères de contrôle, structures piégées).
Pas seulement le login : **tous** les champs.
**Chez toi** : `src/core/sanitize.js` (`sanitizeData`) est branché dans la couche `db.firebase.js`
→ il s'applique à **toute** écriture, automatiquement. Il retire les caractères de contrôle,
plafonne longueurs et profondeur, et rejette fonctions/symboles. Plus des validateurs de format
(`isValidLogin`, `isValidPhone`).

### Principe 3 — Ne pas réinventer l'authentification
**Idée** : la sécurité des identités/mots de passe est un métier à part entière. On **branche un
service dédié et audité** — **Firebase Auth** — plutôt que de bricoler. En prime : Google login,
magic links, 2FA gratuits.
**Chez toi** : la **fondation** est posée (`ensureFirebaseAuthSession` dans `auth.js` crée une
vraie session Firebase Auth en arrière-plan, sans casser la connexion existante). **Reste** à
activer le provider en console et, plus tard, à **verrouiller les règles RTDB** sur `auth != null`
(le fichier `database.rules.json` est prêt). C'est ce qui transforme « la base est ouverte » en
« seuls les utilisateurs authentifiés accèdent aux données ».

### Principe 4 — Une limite de requêtes par utilisateur et par route
**Idée** : sans garde-fou, un bot peut marteler ton app/tes endpoints. Une **limite** referme la
porte.
**Chez toi** : `rateLimit.js` borne les écritures/lectures **par utilisateur et par collection**.
Les endpoints publics payants (`whatsapp-notify`, `send-push`) ont une **limite par IP** (429).
Et **App Check** (le vrai verrou réseau anti-bots) est câblé, à activer en console.

---

## 4. Le réflexe « défense en profondeur »

La sécurité n'est pas UN mur, c'est **plusieurs couches** : même si une cède, les autres tiennent.
Chez toi : nettoyage des entrées **+** limites de débit **+** App Check **+** (à venir) règles
RTDB fermées **+** auth dédiée. Aucune couche n'est parfaite seule ; ensemble, elles protègent.

---

## 5. Penser « long terme » (dette technique)

Quelques points de vigilance d'ingénieur, à garder en tête (pas urgents aujourd'hui) :
- **`getAll` charge des collections entières.** Parfait à 600 enregistrements ; à surveiller sur
  `audit_global`/ventes dans 1-3 ans → il faudra **paginer / filtrer par date / archiver**.
- **Une seule source de vérité.** Ne jamais faire tourner deux bases réelles en parallèle (le
  piège Firebase + Supabase, déjà évité).
- **Gouvernance = sécurité aussi.** 2FA sur le compte Google, 2ᵉ propriétaire, régénérer les
  clés partagées en chat (Resend, Supabase). Perdre l'accès au compte est le risque n°1.
- **La sauvegarde est sacrée.** Vérifie régulièrement que l'e-mail quotidien arrive.

---

## 6. Ta « checklist d'ingénieur » au quotidien

Avant de livrer un changement :
- [ ] `npm run build` passe sans erreur ?
- [ ] J'ai testé en local (`npm run dev`) ?
- [ ] Aucun secret ajouté dans le code (tout en variable d'env) ?
- [ ] Les écritures passent bien par la couche `db.js` (pas d'appel Firebase brut) ?
- [ ] Message de commit clair ?
- [ ] Après déploiement, j'ai vérifié que la prod marche toujours ?
- [ ] En cas de souci : je sais faire un **rollback** Netlify.

---

## 7. Pour aller plus loin (ressources fiables)
- **Firebase** : firebase.google.com/docs (Realtime Database, Auth, App Check).
- **Netlify** : docs.netlify.com (Functions, Scheduled Functions, Environment variables).
- **React** : react.dev (le tutoriel officiel « Tic-Tac-Toe » est excellent pour débuter).
- **Tailwind** : tailwindcss.com/docs.
- **Git** : le livre gratuit « Pro Git » (git-scm.com/book/fr) en français.
- **Cron** : crontab.guru pour déchiffrer/écrire les horaires planifiés.

---

## 8. Exercices de synthèse
1. Dessine (sur papier) le voyage d'une **vente** : du clic de l'agent jusqu'à l'affichage chez
   le gérant. Cite les couches traversées (cours 3 §7 + ce cours §1).
2. Pour chacun des 4 principes de sécurité, **cite le fichier** de ton projet qui l'implémente.
3. Ouvre `src/core/db.firebase.js` : retrouve où `sanitizeData` et `checkRate` sont appelés.
   Pourquoi est-ce un bon endroit (une seule porte) ?
4. Liste les **3 actions console** qu'il te reste à faire pour « fermer les portes »
   (réponse dans `docs/SECURITE.md`).
5. Explique à quelqu'un, en 3 phrases, la différence entre **Netlify** (app) et **Firebase**
   (données). Si tu y arrives, tu as compris l'essentiel. 🎯

---

🎓 **Bravo.** Tu as fait le tour des outils de ta plateforme. Reprends les cours dans l'ordre,
fais les exercices avec le projet ouvert, et reviens-y régulièrement : la maîtrise vient avec la
répétition et la pratique.

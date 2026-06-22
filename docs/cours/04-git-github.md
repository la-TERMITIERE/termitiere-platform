# Cours 4 — Git & GitHub + le déploiement

> Objectif : comprendre comment on **versionne** le code (Git), comment GitHub stocke ce code,
> et comment un simple « push » publie ta plateforme en production.

---

## 1. Git — la machine à remonter le temps du code

**Git** est un **gestionnaire de versions** : il enregistre l'historique de chaque modification
de ton code. Tu peux revenir en arrière, voir qui a changé quoi et quand, et travailler sans
peur de « tout casser ».

Le concept clé : le **commit** = une **photo** de ton code à un instant donné, avec un message
qui décrit le changement. L'historique de ton projet est une suite de commits.

```
... ── 7622c2f ── b862ffa ── 276bf46   (chaque code = un commit)
       "ajustement"  "sauvegarde"  "sécurisation"
```

### Les commandes essentielles

| Commande | Ce qu'elle fait |
|---|---|
| `git status` | que s'est-il passé ? (fichiers modifiés/nouveaux) |
| `git add <fichier>` | préparer un fichier pour le prochain commit (« staging ») |
| `git add -A` | préparer **tous** les changements |
| `git commit -m "message"` | prendre la photo (créer le commit) |
| `git push` | envoyer tes commits sur GitHub |
| `git pull` | récupérer les commits des autres depuis GitHub |
| `git log --oneline` | voir l'historique des commits |
| `git diff` | voir précisément ce qui a changé |

> **Workflow typique** : je modifie du code → `git status` (vérifier) → `git add -A` →
> `git commit -m "ce que j'ai fait"` → `git push`.

### Notions à connaître
- **Dépôt** (*repository / repo*) : le projet versionné (ton dossier + son historique `.git`).
- **Branche** (*branch*) : une ligne de développement. La principale s'appelle **`main`**. On
  peut créer des branches pour expérimenter sans toucher `main`, puis fusionner.
- **Staging** : la zone de préparation entre « modifié » et « commité » (remplie par `git add`).
- **Remote** (`origin`) : la copie distante sur GitHub.

---

## 2. GitHub — le dépôt central dans le cloud

**GitHub** héberge ton dépôt Git dans le cloud. Ton projet :
`https://github.com/la-TERMITIERE/termitiere-platform`. Rôles de GitHub :
- **Sauvegarde du code** (différente de la sauvegarde des *données* qui, elle, est sur Firebase).
- **Collaboration** : plusieurs personnes travaillent sur le même code.
- **Source de déploiement** : Netlify écoute GitHub et déploie à chaque push (cf. §4).

### Pull Requests (PR) — proposer un changement
Une **Pull Request** est une demande de fusion d'une branche dans `main`, avec discussion et
relecture avant d'accepter. Bonne pratique quand on est plusieurs : on ne pousse pas directement
sur `main`, on ouvre une PR, on relit, on fusionne. (Bonus : Netlify crée une **preview** de la
PR — cf. cours 2.)

---

## 3. `.gitignore` — ce qu'on ne versionne JAMAIS

Certains fichiers ne doivent **pas** aller sur GitHub :
- les **secrets** (`.env`, clés de service) — sinon fuite publique ;
- les fichiers **générés** (`node_modules/`, `dist/`) — lourds et reconstruits automatiquement.

Le fichier **`.gitignore`** liste ces exclusions. Dans ton projet, `migration/.gitignore` ignore
par exemple les clés (`.env`, `serviceAccount*.json`). **Règle d'or : un secret ne va jamais dans
Git.** (Les secrets vont dans les **variables d'environnement** Netlify — cf. cours 2.)

---

## 4. Du « push » à la production (le déploiement)

C'est le lien magique entre tes 3 outils :

```
   toi          GitHub                    Netlify                     en ligne
  ─────         ──────                    ───────                     ────────
git push  ──▶  reçoit le commit  ──▶  détecte le push  ──▶  npm run build  ──▶  site publié
                                       (CI/CD automatique)                    latermitiere-app.netlify.app
```

1. Tu fais `git push origin main`.
2. GitHub enregistre le commit sur la branche `main`.
3. Netlify (connecté au dépôt) **détecte** le changement et lance un déploiement.
4. ~1-2 min plus tard, la nouvelle version est **en ligne**.

> C'est exactement ce qui s'est passé pour ta **sauvegarde** et ta **sécurisation** : un commit,
> un push, et Netlify a déployé tout seul. **Tu n'as pas besoin de « livrer » à la main.**

---

## 5. Bonnes pratiques de commit

- **Messages clairs** : décris le *quoi* et le *pourquoi*. ✅ « ajout sauvegarde automatique »
  plutôt que ❌ « modif ».
- **Commits petits et fréquents** : un commit = une idée. Plus facile à relire et à annuler.
- **Ne commit jamais de secret.** (Si ça arrive : régénère le secret, il est considéré compromis.)
- **Vérifie avant de pousser** : `git status` puis `git diff` pour relire ce que tu envoies.

---

## 6. Réflexes de dépannage

- **« J'ai cassé quelque chose, je veux revenir en arrière »**
  - Pas encore commité ? `git checkout -- <fichier>` annule les modifs d'un fichier.
  - Déjà déployé ? → **Netlify : republie le déploiement précédent** (rollback, cours 2). Le plus
    simple et le plus sûr en urgence.
- **« git push refusé »** → souvent il faut d'abord `git pull` (récupérer les changements
  distants), puis re-pousser.
- **« je ne sais plus où j'en suis »** → `git status` et `git log --oneline` répondent à 90 % des
  questions.

---

## 7. Exercices pratiques

1. Dans le projet, lance `git log --oneline` (via le terminal). Retrouve les commits
   « sauvegarde » et « sécurisation ».
2. Modifie un commentaire dans un fichier, puis `git status`, `git diff` : observe ce que Git
   détecte.
3. Sur GitHub, ouvre le dépôt → onglet **Commits**. Clique un commit : tu vois exactement les
   lignes ajoutées (vert) / supprimées (rouge).
4. Ouvre `.gitignore` (et `migration/.gitignore`). Quels fichiers sont exclus, et pourquoi ?
5. (Réflexe) Sans rien faire, repère sur Netlify où tu cliquerais pour **annuler** un déploiement
   raté. C'est ton bouton d'urgence.

➡️ Cours suivant : [Architecture & sécurité de ta plateforme](05-architecture-securite.md).

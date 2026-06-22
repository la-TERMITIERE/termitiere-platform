# Lab 6 — Le cycle Git complet (branche → commit → PR) 🟢

> **Objectif** : maîtriser le geste quotidien du développeur : créer une branche, modifier,
> commiter, pousser, ouvrir une Pull Request, fusionner.
> **Durée** : ~30 min · **Prérequis** : cours 4 · le projet ouvert dans un terminal.

> 💡 On fait l'exercice sur un fichier **inoffensif** pour ne rien risquer.

---

## Étape 1 — Voir où tu en es
```bash
git status            # rien en cours ?
git branch            # sur quelle branche es-tu ? (probablement * main)
git log --oneline -5  # les 5 derniers commits
```
✅ Tu vois `* main` et l'historique récent (dont « sécurisation », « sauvegarde »).

---

## Étape 2 — Créer une branche
On ne travaille **jamais** directement sur `main` pour une expérimentation. On crée une branche :
```bash
git checkout -b mon-premier-lab
```
✅ `git branch` montre maintenant `* mon-premier-lab`. Tu es **isolé** : tout ce que tu fais ici
ne touche pas `main`.

---

## Étape 3 — Faire une modification
👉 Crée un fichier `MES-NOTES.md` à la racine et écris dedans, par exemple :
```
# Mes notes d'apprentissage
- J'ai compris la différence Netlify (app) / Firebase (données).
- Prochain objectif : activer l'auth Firebase.
```

```bash
git status            # MES-NOTES.md apparaît en "untracked" (nouveau)
```

---

## Étape 4 — Commiter (prendre la photo)
```bash
git add MES-NOTES.md
git commit -m "ajout de mes notes d'apprentissage"
```
✅ `git log --oneline -1` montre ton nouveau commit.

> 💡 `git add -A` aurait préparé **tous** les changements d'un coup.

---

## Étape 5 — Pousser la branche
```bash
git push -u origin mon-premier-lab
```
✅ Ta branche est maintenant sur GitHub (mais **pas** dans `main`).

---

## Étape 6 — Ouvrir une Pull Request (PR)
👉 Va sur GitHub (`la-TERMITIERE/termitiere-platform`). Un bandeau propose **« Compare & pull
request »**. Clique, ajoute un titre, **Create pull request**.
✅ Tu vois exactement les lignes ajoutées (vert). C'est ici qu'on **relit** avant de fusionner.

💡 Bonus : Netlify crée une **Deploy Preview** de ta PR (une URL de test), sans toucher la prod.

---

## Étape 7 — Fusionner (ou annuler)
- Pour **intégrer** : bouton **Merge pull request** → la branche rejoint `main` → Netlify déploie.
- Pour **abandonner** l'exercice (recommandé ici) : ferme la PR sans merger, puis nettoie :
```bash
git checkout main
git branch -D mon-premier-lab           # supprime la branche locale
git push origin --delete mon-premier-lab # supprime la branche distante
```

---

## Le cycle à retenir (par cœur)
```
git checkout -b <branche>   # créer une branche
... je code ...
git add -A                  # préparer
git commit -m "message"     # photographier
git push -u origin <branche># envoyer
→ Pull Request sur GitHub   # relire
→ Merge                     # intégrer (→ déploiement auto)
```

---

## 🧠 QCM
1. Pourquoi créer une branche ?
   - a) pour aller plus vite — b) pour expérimenter sans toucher `main` — c) c'est obligatoire pour commiter
2. `git commit` …
   - a) envoie sur GitHub — b) crée une photo locale du code — c) supprime des fichiers
3. `git push` …
   - a) crée un commit — b) envoie tes commits sur GitHub — c) annule un commit
4. Une Pull Request sert à…
   - a) déployer — b) proposer/relire une fusion vers `main` — c) créer une branche

<details><summary>✅ Réponses</summary>

1. **b** · 2. **b** (commit = local ; c'est `push` qui envoie) · 3. **b** · 4. **b**
</details>

---

## 🚀 Pour aller plus loin
- Apprends `git diff` (avant `add`) et `git diff --staged` (après `add`).
- Découvre `git stash` (mettre de côté des changements en cours).
- Lis le livre gratuit **Pro Git** en français (git-scm.com/book/fr).

➡️ Dernier défi : [PROJET FIL ROUGE — Mini-Stock](capstone-mini-stock.md).

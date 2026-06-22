# Lab 1 — Explorer & sauvegarder ta base Firebase 🟢

> **Objectif** : savoir naviguer dans ta vraie base, exporter une sauvegarde, et comprendre une
> restauration — **sans rien casser**.
> **Durée** : ~20 min · **Prérequis** : cours 1 lu, accès à la console Firebase.

---

## Partie A — Explorer (lecture seule, zéro risque)

👉 **Étape 1.** Va sur https://console.firebase.google.com → projet **max-agro-83baf**.

👉 **Étape 2.** Menu gauche → **Build → Realtime Database**. Tu vois l'arbre de données.

👉 **Étape 3.** Déplie `tp` → `users`. Clique sur un compte (ex. `superadmin`).
✅ Tu vois des champs : `login`, `nom`, `role`, `passHash`, `modules`…

❓ **Questions** (réponds dans ta tête) :
- Combien de comptes y a-t-il sous `tp/users` ?
- Quel est le `role` de `superadmin` ?
- Pourquoi le mot de passe est stocké comme `passHash` et pas en clair ? *(indice : cours 1)*

💡 Le champ s'appelle `passHash` car on stocke une **empreinte SHA-256**, pas le mot de passe.
Même l'administrateur ne peut pas lire les mots de passe — c'est voulu.

👉 **Étape 4.** Déplie `tp/audit_global`. Tu vois des clés bizarres comme `-NxAbc123…`.
✅ Ce sont des **clés auto-générées** par `addItem` (ordonnées dans le temps). Chaque entrée est
une action tracée (qui, quoi, quand).

---

## Partie B — Exporter une sauvegarde (lecture, sûr)

👉 **Étape 5.** Place-toi sur le nœud `tp` (clique dessus). Bouton **⋮** (en haut à droite) →
**Exporter le JSON**.
✅ Un fichier `max-agro-83baf-export.json` se télécharge : c'est une **copie complète** de `tp/`.

👉 **Étape 6.** Ouvre ce fichier avec un éditeur de texte (ou ton navigateur).
✅ Tu reconnais la structure « clé → objet » de chaque collection. **C'est exactement ce que
ta sauvegarde automatique t'envoie chaque nuit par e-mail.**

---

## Partie C — Comprendre la restauration (à NE PAS exécuter sur la prod)

> ⚠️ On **n'exécute pas** cette partie sur ta vraie base. On la comprend seulement.

Pour restaurer, on irait sur le nœud `tp` → ⋮ → **Importer un JSON** → choisir un fichier de
sauvegarde. ⚠️ L'import **remplace** entièrement le nœud `tp` par le contenu du fichier.

💡 **Si tu veux vraiment pratiquer une restauration**, fais-le sur un **projet bac à sable**
(cf. README des labs), jamais sur la prod.

---

## 🧠 QCM

1. Quelle base de données utilise ta plateforme ?
   - a) Firestore — b) Realtime Database — c) MySQL
2. Que contient le champ `passHash` ?
   - a) le mot de passe en clair — b) une empreinte du mot de passe — c) le rôle
3. L'export JSON du nœud `tp`, c'est…
   - a) une suppression — b) une copie de sauvegarde — c) une mise à jour
4. Importer un JSON sur `tp`…
   - a) ajoute sans rien effacer — b) remplace tout le nœud `tp` — c) ne fait rien

<details><summary>✅ Réponses</summary>

1. **b** — Realtime Database (Firestore est initialisé mais non utilisé).
2. **b** — une empreinte SHA-256 (irréversible).
3. **b** — une copie de sauvegarde téléchargée.
4. **b** — il **remplace** tout `tp` (d'où la prudence).
</details>

---

## 🚀 Pour aller plus loin
- Onglet **Usage** : note ta bande passante du mois. À quel % de 10 Go es-tu ?
- Onglet **Règles** : tes règles sont-elles ouvertes (`.read: true`) ou fermées (`auth != null`) ?
- Relie au code : ouvre `src/core/db.firebase.js` et retrouve la fonction `getAll`.

➡️ Lab suivant : [Ta 1re app Firebase RTDB](lab-02-firebase-rtdb.md).

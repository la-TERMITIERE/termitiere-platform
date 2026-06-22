# Lab 2 — Ta 1re app Firebase RTDB (lire/écrire en temps réel) 🟡

> **Objectif** : écrire, de zéro, une mini-page web qui **enregistre des notes dans Firebase**
> et les affiche **en temps réel** (comme la synchro multi-appareils de La Termitière, en miniature).
> **Durée** : ~45 min · **Prérequis** : cours 1 et 3 · un éditeur de texte · un navigateur.

> ⚠️ **Utilise un projet Firebase « bac à sable »** (cf. README des labs), ou écris sous un nœud
> `lab/` que tu supprimeras. Ne touche pas à `tp/`.

---

## Étape 1 — Récupérer ta config Firebase

👉 Console Firebase → ton projet bac à sable → ⚙️ **Paramètres du projet** → section **Tes
applications** → si aucune app Web, clique **`</>`** (Ajouter une app Web), donne un nom, valide.
✅ Firebase t'affiche un objet `firebaseConfig` comme ceci (le tien aura d'autres valeurs) :

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "termitiere-sandbox.firebaseapp.com",
  databaseURL: "https://termitiere-sandbox-default-rtdb.firebaseio.com",
  projectId: "termitiere-sandbox",
  // ...
};
```
> ⚠️ Il **faut** la ligne `databaseURL`. Si elle manque : active d'abord la Realtime Database
> (Build → Realtime Database → Créer une base, mode « test » pour le lab).

💡 Rappel cours 1 : cette config **n'est pas secrète**, elle est publique par conception.

---

## Étape 2 — Créer le fichier

👉 Crée un fichier `lab-notes.html` (n'importe où sur ton PC) et colle ce squelette. Tu
remplaceras `firebaseConfig` par le **tien** (étape 1).

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Lab — Notes en temps réel</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 500px; margin: 40px auto; }
    li { display: flex; justify-content: space-between; padding: 6px 0; }
    button { cursor: pointer; }
  </style>
</head>
<body>
  <h1>📝 Mes notes (temps réel)</h1>
  <input id="texte" placeholder="Écris une note…" />
  <button id="ajouter">Ajouter</button>
  <ul id="liste"></ul>

  <script type="module">
    // 1) On importe les fonctions Firebase dont on a besoin (version 10, via CDN)
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
    import { getDatabase, ref, push, onValue, remove }
      from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

    // 2) COLLE TA CONFIG ICI
    const firebaseConfig = {
      /* ... la tienne (étape 1) ... */
    };

    // 3) On démarre Firebase et on récupère la base
    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);

    // 4) On vise un "dossier" lab/notes (pas tp/ !)
    const notesRef = ref(db, "lab/notes");

    // 5) ÉCRIRE : au clic, on ajoute une note (clé auto avec push)
    document.getElementById("ajouter").onclick = () => {
      const input = document.getElementById("texte");
      const texte = input.value.trim();
      if (!texte) return;
      push(notesRef, { texte, date: Date.now() });  // ← écriture dans Firebase
      input.value = "";
    };

    // 6) LIRE EN TEMPS RÉEL : onValue se déclenche à chaque changement
    onValue(notesRef, (snapshot) => {
      const data = snapshot.val() || {};            // objet { cle: {texte,date} }
      const liste = document.getElementById("liste");
      liste.innerHTML = "";
      // On transforme l'objet en tableau [ {id, texte, date} ]
      Object.entries(data).forEach(([id, note]) => {
        const li = document.createElement("li");
        li.textContent = note.texte;
        const suppr = document.createElement("button");
        suppr.textContent = "🗑️";
        suppr.onclick = () => remove(ref(db, "lab/notes/" + id)); // ← suppression
        li.appendChild(suppr);
        liste.appendChild(li);
      });
    });
  </script>
</body>
</html>
```

---

## Étape 3 — Lancer et tester

👉 Ouvre `lab-notes.html` dans ton navigateur (double-clic).
👉 Tape une note, clique **Ajouter**.
✅ La note apparaît dans la liste **et** dans ta console Firebase (Realtime Database → `lab/notes`).

👉 **Le test magique** : ouvre le **même fichier dans un 2ᵉ onglet** (ou un 2ᵉ appareil). Ajoute
une note dans un onglet.
✅ Elle apparaît **instantanément dans l'autre onglet**, sans recharger. **C'est ça, le temps
réel** — exactement le mécanisme qui fait que ton gérant voit la saisie de l'agent en direct.

👉 Clique 🗑️ sur une note.
✅ Elle disparaît partout, en direct.

---

## Étape 4 — Relier à La Termitière

Tu viens d'utiliser, en miniature, les **mêmes fonctions** que ton vrai projet :

| Dans ce lab | Dans La Termitière (`src/core/db.firebase.js`) |
|---|---|
| `push(notesRef, {...})` | `addItem('ventes', {...})` |
| `onValue(notesRef, cb)` | `subscribeCollection('ventes', cb)` |
| `remove(ref(db, ...))` | `removeItem('ventes', id)` |
| `snapshot.val()` → objet | `snapToRows()` transforme en tableau `{id, ...data}` |

La seule différence : ton vrai projet **ajoute** par-dessus le **nettoyage** (`sanitize`) et la
**limite** (`rateLimit`). Mais le moteur Firebase, c'est **exactement** ce que tu viens d'écrire.

---

## 🐞 Erreurs fréquentes

- **Rien ne se passe / erreur console** → ouvre les **outils développeur** (F12 → Console).
  - `Firebase: Error (database/...)` ou `permission denied` → ta base n'est pas en mode test, ou
    les règles bloquent. Pour le lab : Realtime Database → Règles → `{".read": true, ".write": true}`.
  - `Cannot read databaseURL` → la ligne `databaseURL` manque dans ta config.
- **La page est blanche** → vérifie que le `<script>` a bien `type="module"`.
- **Les imports échouent** → vérifie l'URL CDN (version `10.12.0`) et ta connexion internet.

---

## 🧠 QCM

1. Quelle fonction **ajoute** une donnée avec une clé automatique ?
   - a) `set` — b) `push` — c) `onValue`
2. Quelle fonction permet la **lecture en temps réel** ?
   - a) `get` — b) `onValue` — c) `remove`
3. `snapshot.val()` renvoie…
   - a) un tableau — b) un objet `{ clé: valeur }` — c) du texte
4. Dans La Termitière, l'équivalent de `onValue` s'appelle…
   - a) `getAll` — b) `subscribeCollection` — c) `addItem`

<details><summary>✅ Réponses</summary>

1. **b** `push` (clé auto). `set` écrit à une clé précise.
2. **b** `onValue` (se redéclenche à chaque changement).
3. **b** un objet ; on le transforme ensuite en tableau avec `Object.entries`.
4. **b** `subscribeCollection` (cf. `db.firebase.js`).
</details>

---

## 🚀 Pour aller plus loin
1. Ajoute un champ « auteur » à chaque note (`push(notesRef, { texte, auteur, date })`).
2. Affiche la **date** formatée à côté de chaque note.
3. Trie les notes de la plus récente à la plus ancienne (`Object.entries(...).sort(...)`).
4. **Nettoyage** : quand tu as fini, supprime le nœud `lab/` dans la console (⋮ → Supprimer).

➡️ Lab suivant : [Créer une fonction Netlify](lab-03-netlify-function.md).

# Lab 4 — Composant & formulaire React 🟢

> **Objectif** : créer tes premiers **composants React** avec état (`useState`), puis un petit
> **formulaire** — les briques de base de toutes tes pages.
> **Durée** : ~40 min · **Prérequis** : cours 3.

> 💡 Deux façons de faire ce lab :
> - **(Simple)** En ligne, sans rien installer : ouvre **stackblitz.com** → *React* (un projet
>   React prêt à coder dans le navigateur). Idéal pour apprendre.
> - **(Dans ton projet)** Crée une page de test et branche-la temporairement sur une route.

---

## Partie A — Le compteur (le « hello world » de React)

👉 Crée un composant `Compteur` :
```jsx
import { useState } from "react";

function Compteur() {
  // useState = une valeur qui change + une fonction pour la changer
  const [n, setN] = useState(0);

  return (
    <div>
      <p>Compteur : {n}</p>
      <button onClick={() => setN(n + 1)}>+1</button>
      <button onClick={() => setN(n - 1)}>-1</button>
      <button onClick={() => setN(0)}>Réinitialiser</button>
    </div>
  );
}
export default Compteur;
```
✅ Clique `+1` : l'affichage passe à 1, 2, 3… **Tu n'as pas écrit de code pour mettre à jour le
texte** : React le fait pour toi dès que l'état (`n`) change. **C'est le cœur de React.**

❓ Que se passe-t-il si tu remplaces `setN(n + 1)` par `n = n + 1` ? → **Rien ne s'affiche.**
React ne « voit » le changement que si tu passes par la fonction `setN`. **Retiens ça.**

---

## Partie B — Un formulaire contrôlé

👉 Crée un composant `AjoutPersonne` :
```jsx
import { useState } from "react";

function AjoutPersonne() {
  const [nom, setNom] = useState("");
  const [liste, setListe] = useState([]); // tableau de noms

  const ajouter = () => {
    if (!nom.trim()) return;            // validation simple
    setListe([...liste, nom.trim()]);   // on ajoute au tableau (copie + nouvel élément)
    setNom("");                         // on vide le champ
  };

  return (
    <div>
      <input
        value={nom}                                  // "contrôlé" par l'état
        onChange={(e) => setNom(e.target.value)}     // à chaque frappe, on met à jour
        placeholder="Nom…"
      />
      <button onClick={ajouter}>Ajouter</button>
      <ul>
        {liste.map((personne, i) => <li key={i}>{personne}</li>)}
      </ul>
    </div>
  );
}
export default AjoutPersonne;
```

✅ Tape un nom, clique **Ajouter** : il s'affiche dans la liste, le champ se vide.

**Concepts vus :**
- **Composant contrôlé** : la valeur du champ EST l'état (`value={nom}`) ; toute frappe passe par
  `setNom`. C'est exactement ce que fait `src/portal/MonCompte.jsx`.
- **`.map()`** : transformer un tableau en liste d'éléments JSX. La **`key`** aide React à suivre
  chaque élément (toujours en mettre une).
- **Immutabilité** : on ne fait pas `liste.push(...)` ; on crée un **nouveau** tableau
  `[...liste, nom]`. React détecte le changement uniquement si c'est un nouvel objet/tableau.

---

## Partie C — Relier à La Termitière
Ouvre `src/portal/MonCompte.jsx` et retrouve les **mêmes patterns** :
- `const [nom, setNom] = useState('')` (état)
- `<Input value={nom} onChange={(e) => setNom(e.target.value)} />` (champ contrôlé)
- `useEffect(() => { load() }, [load])` (charger des données à l'ouverture)

Tu sais maintenant lire n'importe quelle page de ton app. 🎉

---

## 🧠 QCM
1. Pour changer un état, on utilise…
   - a) `n = n + 1` — b) la fonction `setN(...)` — c) `document.write`
2. Un champ « contrôlé » signifie…
   - a) sa valeur vient de l'état React — b) il est en lecture seule — c) il a un mot de passe
3. Pourquoi `[...liste, nom]` et pas `liste.push(nom)` ?
   - a) c'est pareil — b) React détecte le changement seulement avec un nouveau tableau — c) push est interdit
4. À quoi sert `key` dans un `.map()` ?
   - a) la sécurité — b) aider React à suivre chaque élément — c) rien

<details><summary>✅ Réponses</summary>

1. **b** · 2. **a** · 3. **b** (immutabilité) · 4. **b**
</details>

---

## 🚀 Pour aller plus loin
- Ajoute un bouton 🗑️ pour retirer un nom (`setListe(liste.filter((_, idx) => idx !== i))`).
- Empêche les doublons.
- Style avec Tailwind si tu es dans ton projet (`className="..."`).

➡️ Lab suivant : [Un store Zustand minimal](lab-05-zustand-store.md).

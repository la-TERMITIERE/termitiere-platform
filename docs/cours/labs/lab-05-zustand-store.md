# Lab 5 — Un store Zustand minimal 🟡

> **Objectif** : comprendre le **state management** en créant un store **partagé** entre
> plusieurs composants — le mécanisme derrière `useAuthStore` et `useUsersStore`.
> **Durée** : ~35 min · **Prérequis** : labs 4, cours 3.

> 💡 Fais ce lab sur **stackblitz.com** (React) ou dans un projet de test. Installe Zustand :
> `npm install zustand`.

---

## Le problème que Zustand résout

Sans store : si deux composants éloignés ont besoin de la **même** donnée (ex. le panier, ou
l'utilisateur connecté), il faut la faire passer de parent en enfant… pénible. Un **store** est
une **boîte globale** : n'importe quel composant y lit/écrit, et **tous se mettent à jour** quand
la donnée change.

---

## Étape 1 — Créer le store

👉 Crée `panierStore.js` :
```js
import { create } from "zustand";

// Un store = des DONNÉES + des ACTIONS pour les modifier
export const usePanier = create((set, get) => ({
  articles: [],                                   // donnée

  ajouter: (nom) =>                               // action
    set({ articles: [...get().articles, nom] }),

  vider: () => set({ articles: [] }),

  // une "valeur dérivée" calculée à la demande
  total: () => get().articles.length,
}));
```
- `set({...})` : remplace/met à jour des données du store.
- `get()` : lit l'état courant du store (utile dans une action).

---

## Étape 2 — Utiliser le store dans DEUX composants

👉 Composant A (ajoute des articles) :
```jsx
import { usePanier } from "./panierStore";

function Ajout() {
  const ajouter = usePanier((s) => s.ajouter);
  return <button onClick={() => ajouter("🍌 Banane")}>Ajouter une banane</button>;
}
```

👉 Composant B (affiche le panier) — **complètement séparé** de A :
```jsx
import { usePanier } from "./panierStore";

function Panier() {
  const articles = usePanier((s) => s.articles);
  const total = usePanier((s) => s.total());
  return (
    <div>
      <p>Total : {total} article(s)</p>
      <ul>{articles.map((a, i) => <li key={i}>{a}</li>)}</ul>
    </div>
  );
}
```

👉 Affiche les deux dans ton app : `<Ajout />` et `<Panier />`.

✅ Clique le bouton dans **A** → la liste se met à jour dans **B**, alors qu'ils ne se
« connaissent » pas. **C'est ça, un état partagé.** Aucune donnée passée manuellement entre eux.

---

## Étape 3 — Relier à La Termitière

Ouvre `src/core/auth.js`. Tu retrouves **exactement** cette structure, en plus gros :
```js
export const useAuthStore = create((set, get) => ({
  user: null,                          // donnée (comme "articles")
  login: async (id, pass) => { ... set({ user, role, modules }) },  // action (comme "ajouter")
  logout: async () => set({ user: null, ... }),                     // action (comme "vider")
}))
```
Quand `login()` met `user` à jour, **toute l'app** (barre du haut, menus, pages) réagit. Tu
comprends maintenant comment la connexion « se propage » partout. 🎯

---

## 🧠 QCM
1. À quoi sert un store ?
   - a) styliser — b) partager un état entre composants — c) appeler le serveur
2. `set(...)` sert à…
   - a) lire l'état — b) modifier l'état — c) supprimer le store
3. Quand une donnée du store change…
   - a) rien — b) tous les composants qui l'utilisent se réaffichent — c) la page recharge
4. Dans ton projet, quel store gère l'utilisateur connecté ?
   - a) `useUsersStore` — b) `useAuthStore` — c) `usePanier`

<details><summary>✅ Réponses</summary>

1. **b** · 2. **b** · 3. **b** · 4. **b** (`useAuthStore`, dans `src/core/auth.js`)
</details>

---

## 🚀 Pour aller plus loin
- Ajoute une action `retirer(index)` au panier.
- Ajoute une donnée `ouvert` (booléen) + une action `basculer()` pour ouvrir/fermer le panier.
- Combine avec le lab 2 : remplace le tableau local par une lecture **Firebase temps réel**.

➡️ Lab suivant : [Le cycle Git complet](lab-06-git-cycle.md).

# Cours 3 — Le frontend : React, Vite, PWA, Tailwind, Zustand

> Objectif : comprendre les outils qui font l'**interface** de ton app (ce que voient les
> utilisateurs) et comment ils s'articulent.

Le **frontend**, c'est tout ce qui tourne **dans le navigateur**. Ta stack frontend :
**React** (l'interface) + **Vite** (l'outil de build) + **Tailwind** (le style) + **Zustand**
(la mémoire de l'app) + **React Router** (la navigation) + **PWA** (l'app installable).

---

## 1. React — construire l'interface avec des composants

**React** est une **bibliothèque** JavaScript pour fabriquer des interfaces. Idée centrale : on
découpe l'écran en **composants** réutilisables (un bouton, une carte, un tableau…), comme des
briques Lego.

### Un composant = une fonction qui renvoie de l'affichage (JSX)

```jsx
function Bonjour({ nom }) {        // "nom" est une "prop" (donnée passée au composant)
  return <h1>Bonjour {nom}</h1>    // ceci ressemble à du HTML : c'est du JSX
}
// utilisation : <Bonjour nom="Leek" />
```

- **JSX** : du HTML écrit à l'intérieur du JavaScript. React le transforme en vrais éléments.
- **Props** : les « paramètres » qu'un composant reçoit de son parent (en lecture seule).
- **State (état)** : les données internes qui changent et **re-déclenchent l'affichage** quand
  elles changent. Avec le **hook** `useState` :
  ```jsx
  const [compteur, setCompteur] = useState(0)   // valeur + fonction pour la changer
  ```
- **Hooks** : des fonctions spéciales `useXxx` qui ajoutent des capacités à un composant.
  Les plus courants :
  - `useState` : garder une valeur qui change.
  - `useEffect` : exécuter du code après l'affichage (ex. charger des données, s'abonner au
    temps réel). Tu en verras partout dans tes pages : `useEffect(() => { load() }, [])`.

### Dans ton projet
Tes composants sont dans `src/` : les pages de portail (`src/portal/`), les modules métier
(`src/modules/agro`, `logistique`, etc.), et des briques réutilisables (`src/shared/ui/` :
`Card`, `Button`, `Modal`, `Table`…). Ouvre `src/portal/MonCompte.jsx` : tu y verras `useState`,
`useEffect`, du JSX, et l'appel à des composants partagés. C'est un bon exemple complet.

---

## 2. Vite — l'outil qui construit et fait tourner l'app

**Vite** (prononcé « vit ») est l'**outil de développement et de build**. Deux usages :

- **`npm run dev`** : lance un serveur local de développement (sur `localhost`). Tu modifies un
  fichier → la page se met à jour **instantanément** (HMR, *Hot Module Replacement*). C'est ton
  environnement pour coder et tester.
- **`npm run build`** : compile et **optimise** tout le projet en fichiers statiques dans
  `dist/` (minifiés, découpés en morceaux). C'est ce dossier que Netlify met en ligne.

Vite est très rapide. Tu n'as quasiment jamais à le configurer (config dans `vite.config.js`).

> Vocabulaire : **`npm`** (*Node Package Manager*) installe les **dépendances** (les
> bibliothèques externes listées dans `package.json`, stockées dans `node_modules/`).
> `npm install` installe tout ; `npm run <script>` lance un script défini dans `package.json`.

---

## 3. Tailwind CSS — styliser avec des classes utilitaires

**Tailwind** est un système de **CSS utilitaire** : au lieu d'écrire des fichiers CSS séparés, tu
stylises directement dans le JSX avec de petites classes.

```jsx
<button className="rounded-lg bg-primary px-4 py-2 font-semibold text-white">
  Enregistrer
</button>
```
- `rounded-lg` = coins arrondis, `bg-primary` = fond couleur principale, `px-4 py-2` = marges
  intérieures, `text-white` = texte blanc.
- Avantage : tu styles vite, sans inventer des noms de classes, et c'est cohérent partout.
- Les couleurs/thème de ton projet sont définis dans `tailwind.config.js`.

> Pour apprendre une classe : le site **tailwindcss.com** a une recherche excellente. Tape
> « padding », « background color », etc.

---

## 4. Zustand — la « mémoire » partagée de l'app (state management)

Quand plusieurs écrans doivent partager les **mêmes données** (l'utilisateur connecté, la liste
des comptes, le stock…), on utilise un **store** (magasin de données global). Ton app utilise
**Zustand**, simple et léger.

Un store = un objet avec des **données** + des **fonctions** pour les modifier. Exemple réel,
`src/core/auth.js` (le store d'authentification) :

```js
export const useAuthStore = create((set, get) => ({
  user: null,                 // donnée : l'utilisateur connecté
  login: async (id, pass) => { ... set({ user: ... }) },  // action
  logout: async () => { ... },
}))
```

Dans un composant, tu « consommes » le store :
```jsx
const { user, logout } = useAuthStore()
```
Quand `user` change (connexion/déconnexion), **tous les composants qui l'utilisent se
réaffichent** automatiquement. C'est la magie du state management.

Tes stores : `src/core/auth.js` (auth), `src/core/users.js` (utilisateurs), et un store par
module pour les référentiels (`src/modules/*/store/`).

---

## 5. React Router — naviguer entre les pages

Une SPA n'a qu'une page HTML, mais plusieurs « écrans ». **React Router** associe une **URL** à
un **composant** :

```jsx
<Route path="/agro" element={<Agro />} />
<Route path="/mon-compte" element={<MonCompte />} />
```
Quand l'URL change (clic sur un lien `<Link to="/agro">`), Router affiche le bon composant **sans
recharger la page**. C'est pour ça que Netlify renvoie toutes les URL vers `index.html` (cf.
cours 2 §4) : c'est Router, côté navigateur, qui décide quoi afficher.

---

## 6. PWA — l'app installable

**PWA** (*Progressive Web App*) transforme ton site en **app installable** qui marche comme une
app mobile : icône sur l'écran d'accueil, démarrage rapide, fonctionnement même hors-ligne pour
les parties déjà chargées, et **notifications push**.

Deux ingrédients (gérés par `vite-plugin-pwa` dans ton projet) :
- Le **manifest** : décrit l'app (nom, icône, couleurs) pour l'installation.
- Le **service worker** (`sw.js`) : un script qui tourne en arrière-plan, met en cache les
  fichiers (pour l'hors-ligne et la rapidité) et reçoit les **push** (cf. `src/core/push.js`).

> C'est grâce à la PWA que tes agents peuvent « installer » la plateforme sur leur téléphone et
> recevoir des notifications même app fermée.

---

## 7. Comment tout s'assemble (le voyage d'un clic)

1. L'agent clique « Enregistrer une vente » → un **composant React** (`onClick`).
2. Le composant appelle une **action d'un store Zustand** (ou directement la couche `db.js`).
3. La couche données **assainit** puis écrit dans **Firebase RTDB** (`addItem`).
4. Firebase prévient en **temps réel** tous les appareils abonnés (`subscribeCollection`).
5. Les autres écrans (gérant, direction) **se réaffichent** automatiquement avec la nouvelle vente.

---

## 8. Exercices pratiques

1. Ouvre `src/portal/MonCompte.jsx`. Repère : un `useState`, un `useEffect`, du JSX, une classe
   Tailwind, et l'appel à un store (`useAuth`, `useUsersStore`).
2. Lance `npm run dev`. Modifie un texte dans une page et observe la mise à jour instantanée.
3. Dans `src/core/auth.js`, retrouve l'objet du store : quelles sont les **données** et les
   **actions** ? (indice : `user`, `login`, `logout`…)
4. Sur ton téléphone, ouvre l'app dans Chrome et « Ajouter à l'écran d'accueil » → tu viens
   d'installer la PWA.
5. Trouve dans `package.json` la liste des **dépendances**. Repère `react`, `zustand`,
   `react-router-dom`, `firebase`, `tailwindcss`.

➡️ Cours suivant : [Git & GitHub + le déploiement](04-git-github.md).

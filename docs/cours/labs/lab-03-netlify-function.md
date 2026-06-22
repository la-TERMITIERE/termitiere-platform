# Lab 3 — Créer une fonction Netlify (serveur) 🟡

> **Objectif** : écrire ta 1re **fonction serveur**, la tester en local, comprendre pourquoi
> certains codes doivent vivre côté serveur (secrets), et voir une fonction **planifiée**.
> **Durée** : ~40 min · **Prérequis** : cours 2 · Node.js installé · le projet ouvert.

> 💡 On travaille **dans une branche** du projet pour ne pas toucher `main` directement (cf. lab 6).

---

## Étape 1 — Créer la fonction « hello »

👉 Crée le fichier `netlify/functions/hello.js` :

```js
// Une fonction serveur minimale. Reçoit une requête HTTP, renvoie une réponse.
export async function handler(event) {
  // event contient : httpMethod, headers, body, queryStringParameters...
  const nom = event.queryStringParameters?.nom || "monde";
  return {
    statusCode: 200,
    body: JSON.stringify({ message: `Bonjour, ${nom} !`, heure: new Date().toISOString() })
  };
}
```

---

## Étape 2 — Tester en local

👉 Installe l'outil Netlify (une fois) puis lance le serveur local :
```bash
npm install -g netlify-cli      # (une seule fois)
netlify dev
```
✅ Netlify démarre ton app **et** tes fonctions en local (souvent sur `http://localhost:8888`).

👉 Dans le navigateur, ouvre :
```
http://localhost:8888/.netlify/functions/hello?nom=Leek
```
✅ Tu obtiens : `{"message":"Bonjour, Leek !","heure":"..."}`.

🎉 Tu viens d'exécuter du **code serveur**. Le navigateur a fait une requête, le serveur a
répondu — exactement comme ton app appelle `whatsapp-notify` ou `send-push`.

---

## Étape 3 — Comprendre « pourquoi serveur ? » (les secrets)

👉 Modifie `hello.js` pour lire une **variable d'environnement** :
```js
export async function handler(event) {
  const secret = process.env.MON_SECRET || "(non défini)";
  return { statusCode: 200, body: JSON.stringify({ secret }) };
}
```
👉 Crée un fichier `.env` à la racine (⚠️ il est **ignoré par Git** — un secret ne va jamais sur
GitHub) :
```
MON_SECRET=ceci-est-cote-serveur
```
👉 Relance `netlify dev`, rappelle la fonction.
✅ Tu vois `ceci-est-cote-serveur`. **Mais ce secret n'apparaît JAMAIS dans le navigateur** : il
est lu côté serveur (`process.env`). C'est **le principe de sécurité #1** : les clés qui coûtent
ou ouvrent une porte vivent côté serveur. (En prod, tu mets ce secret dans Netlify → Environment
variables, pas dans `.env`.)

---

## Étape 4 — Une fonction PLANIFIÉE (comme ta sauvegarde)

👉 Crée `netlify/functions/ping-planifie.mjs` :
```js
export default async () => {
  console.log("⏰ Je m'exécute tout seul à l'heure prévue :", new Date().toISOString());
  return new Response("ok");
};
// S'exécute toutes les 5 minutes (cron). Voir crontab.guru pour décoder.
export const config = { schedule: "*/5 * * * *" };
```
✅ Une fois **déployée**, Netlify l'appelle **tout seul** toutes les 5 min — sans que personne ne
clique. C'est **exactement** le mécanisme de `backup-db.mjs` (qui, lui, tourne à 3 h du matin).

> Pour tester une fonction planifiée localement : `netlify functions:invoke ping-planifie`.

---

## Étape 5 — Nettoyage
👉 Quand tu as compris, **supprime** `hello.js` et `ping-planifie.mjs` (ce sont des exercices, on
ne les garde pas dans le projet). Si tu avais commité, fais un commit de suppression.

---

## 🧠 QCM

1. Une fonction Netlify s'exécute…
   - a) dans le navigateur — b) sur les serveurs de Netlify — c) sur Firebase
2. On appelle une fonction via l'URL…
   - a) `/api/...` — b) `/.netlify/functions/<nom>` — c) `/functions/<nom>`
3. Un secret se met…
   - a) dans le code, en `VITE_SECRET` — b) en variable d'env serveur (sans `VITE_`) — c) dans GitHub
4. `export const config = { schedule: "..." }` sert à…
   - a) styliser — b) planifier l'exécution automatique — c) définir l'URL

<details><summary>✅ Réponses</summary>

1. **b** · 2. **b** · 3. **b** (les `VITE_` finissent dans le navigateur → jamais de secret) · 4. **b**
</details>

---

## 🚀 Pour aller plus loin
- Ajoute une **limite par IP** à ta fonction `hello` (inspire-toi de `whatsapp-notify.js`, §rate limit).
- Fais répondre `hello` différemment selon `event.httpMethod` (GET vs POST).

➡️ Lab suivant : [Composant & formulaire React](lab-04-react-composant.md).

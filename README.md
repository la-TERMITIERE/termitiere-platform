# LA TERMITIÈRE — Plateforme multi-secteurs

Portail web PWA regroupant plusieurs applications métier sous authentification partagée.
**TOUJOURS DANS L'ACTION** — Agoe Daliko, Lomé, Togo.

## Stack
React 18 + Vite 5 · Tailwind CSS 3 · React Router 6 · Zustand · Firebase v10 (Firestore + Auth + Storage) · Chart.js · jsPDF · SheetJS · PWA (Workbox) · Déploiement Netlify.

## Modules
- **MAXI-AGRO** — élevage, saisie journalière, facturation, analyses, santé, demandes de sortie, journal, paramètres.
- **Logistique** — véhicules, livraisons, fournisseurs, stock matériel.
- **Événementiel** — événements (Kanban), devis, matériel de location, clients.
- **RH** — employés, présences & congés.

## Démarrage
```bash
npm install
cp .env.example .env   # renseigner les clés Firebase (facultatif)
npm run dev            # http://localhost:5173
npm run build          # production → dist/
npm run preview
```

## Mode de fonctionnement
- **Firebase configuré** (`.env` renseigné) : authentification Firebase Auth + données Firestore temps réel.
- **Mode DÉMO** (sans `.env`) : authentification locale contre les comptes par défaut + données en `localStorage`. L'application est pleinement utilisable hors-ligne pour tester.

### Comptes par défaut (mode démo / 1er lancement)
| Identifiant | Mot de passe | Rôle | Modules |
|---|---|---|---|
| admin | admin123 | admin | tous |
| controleur | ctrl123 | contrôleur | agro, logistique |
| agent | agent123 | agent | agro |
| agent_log | log123 | agent | logistique |

## Firebase
- Règles de sécurité : `firestore.rules`
- Index : `firestore.indexes.json`
- Authentification : email synthétique `login@termitiere.internal` + profil dans la collection `users/{uid}`.

## Migration depuis l'ancienne app
`src/utils/migration.js` importe les données `localStorage` `maxiagro_db_v1` (inventaires, factures, demandes, sanitaire) vers le nouveau stockage.

## Déploiement Netlify
`netlify.toml` est fourni (build `npm run build`, publish `dist`, redirects SPA, en-têtes de sécurité). Renseigner les variables d'environnement `VITE_FIREBASE_*` dans Netlify.

# Migration des données → PostgreSQL / Supabase

Ce dossier contient tout le nécessaire pour **recréer la base de l'application sur PostgreSQL/Supabase, avec exactement les mêmes données** que la version Firebase actuelle — **sans perdre un seul enregistrement**.

La version Firebase **continue de tourner normalement** pendant toute la manœuvre : cette migration crée une **copie parallèle** sur Postgres (le choix final de la techno reste ouvert).

## Contenu
| Fichier | Rôle |
|---|---|
| `../firebase-export.json` | Export complet de la base Firebase (sauvegarde + source de la migration) |
| `schema.sql` | Création des 26 tables `tp_*` + `legacy_maxiagro` (régénérable avec `npm run schema`) |
| `import.mjs` | Importe l'export dans Postgres/Supabase (idempotent) |
| `.env.example` | Modèle pour la chaîne de connexion |

## Stratégie (sans perte)
Une table **par collection** (`tp_users`, `tp_agro_inventaires`, …) au format :
`id text` (clé) · `data jsonb` (la donnée exacte, structure préservée à 100 %) · `created_at timestamptz`.
Le JSONB permet ensuite des **requêtes SQL puissantes** tout en gardant la souplesse du modèle d'origine.

## Étapes pour finaliser sur Supabase

1. **Créer le projet Supabase**
   - Va sur https://supabase.com → connecte-toi avec le compte de l'entreprise → **New project**.
   - Note le **mot de passe** de la base que tu choisis.

2. **Récupérer la chaîne de connexion**
   - Projet → **Settings → Database → Connection string → URI**.
   - Copie l'URI (forme `postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres`).

3. **Renseigner le fichier `.env`** (dans ce dossier)
   ```
   cp .env.example .env
   ```
   puis colle l'URI dans `DATABASE_URL=` (en remplaçant le mot de passe).

4. **Créer les tables** (au choix)
   - **Option A (simple)** : dans Supabase → **SQL Editor** → colle le contenu de `schema.sql` → **Run**.
   - **Option B** : l'import crée les tables automatiquement si elles n'existent pas (étape 5).

5. **Importer les données**
   ```
   npm install
   npm run import
   ```
   Le script affiche le nombre d'enregistrements importés par table.

6. **Vérifier** dans Supabase → **Table Editor** : tu retrouves toutes les tables `tp_*` remplies, et `legacy_maxiagro`.

## Rafraîchir la copie plus tard
Pour resynchroniser avec les dernières données Firebase :
```
# 1. ré-exporter depuis Firebase (à la racine du projet) :
npx --yes firebase-tools database:get "/" -o migration/firebase-export.json --project max-agro-83baf
# 2. relancer l'import (idempotent) :
npm run import
```

## Important
- L'import est **idempotent** (UPSERT) : on peut le relancer sans créer de doublons.
- Ceci **ne bascule pas** l'application sur Postgres — ça prépare la base. Le branchement de l'app (réécriture de la couche `src/core/db.js` + authentification) est un chantier séparé, à décider ensuite.

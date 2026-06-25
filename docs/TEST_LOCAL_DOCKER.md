# Tester le stack self-hosted EN LOCAL (sur ton PC, Docker Desktop)

> But : essayer chez toi, avant le prestataire, la chaîne complète **Supabase
> auto-hébergé (Docker) + l'app pointée dessus**, sur `localhost` (sans domaine ni SSL).
> Ton **Firebase de production n'est pas touché**.
> ⚠️ Les valeurs par défaut de Supabase sont **OK pour un test local uniquement** — jamais en prod.

## Prérequis
- **Docker Desktop pour Windows** installé et démarré (avec WSL2).
- Node.js (déjà installé) + git.
- ~4 Go de RAM libres (le stack Supabase = plusieurs conteneurs).

---

## 1. Lancer Supabase en local
```powershell
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
copy .env.example .env
docker compose pull
docker compose up -d
docker compose ps        # attendre que tout soit "healthy" (1-2 min)
```
- **API (Kong)** : http://localhost:8000
- **Studio** (interface base) : http://localhost:8000 → identifiants par défaut dans `.env`
  (`DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`).
- Note depuis `supabase/docker/.env` : `POSTGRES_PASSWORD`, `ANON_KEY`, `SERVICE_ROLE_KEY`.

## 2. Créer les tables + importer les données
```powershell
cd <dossier-du-depot>\migration\supabase
npm install

# (Schéma) — le plus simple : Studio → SQL Editor → coller le contenu de schema.sql → Run.
#   (ou via psql si tu l'as)

# (Données) — l'export existant migration\firebase-export.json suffit pour un test.
#   Pour des données fraîches : npx --yes firebase-tools database:get "/" -o ..\firebase-export.json --project max-agro-83baf
$env:DATABASE_URL = "postgresql://postgres:LE_POSTGRES_PASSWORD@localhost:5432/postgres"
node import.mjs          # affiche le nb d'enregistrements importés par table
```

## 3. Créer les comptes de connexion
```powershell
$env:SUPABASE_URL = "http://localhost:8000"
$env:SUPABASE_SERVICE_KEY = "LA_SERVICE_ROLE_KEY"   # depuis supabase\docker\.env
node auth-migrate.mjs    # mot de passe temporaire = l'identifiant
```

## 4. Lancer l'app pointée sur le Supabase local
À la **racine du dépôt**, crée un fichier **`.env.local`** :
```
VITE_USE_SUPABASE=true
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_ANON_KEY=LA_ANON_KEY
```
Puis :
```powershell
npm run dev
```
Ouvre **http://localhost:5173** → connecte-toi (identifiant + mot de passe temporaire).
Tu testes : connexion, saisies, dashboard, factures, retours… le tout sur PostgreSQL local.

> 🔁 **Pour revenir à Firebase en local** : supprime simplement `.env.local`, relance `npm run dev`.

## 5. (Optionnel) tester le frontend « comme en prod » (Caddy + Docker)
Le `deploy/` est prévu pour des domaines + HTTPS, donc moins adapté au pur localhost.
Pour un test « buildé », le plus simple reste :
```powershell
npm run build
npm run preview        # sert le build sur http://localhost:4173 (utilise aussi .env.local)
```

---

## En cas de souci
- **Conteneurs pas “healthy”** → `docker compose logs` dans `supabase/docker` ; souvent RAM/disque.
- **L'app ne joint pas la base / erreurs CORS** → vérifie `VITE_SUPABASE_URL=http://localhost:8000`
  et la `ANON_KEY` ; au besoin, dans `supabase/docker/.env`, ajoute `http://localhost:5173`
  à `ADDITIONAL_REDIRECT_URLS` puis `docker compose up -d`.
- **« Identifiant/mot de passe incorrect »** → l'étape 3 (auth-migrate) a-t-elle bien tourné ?
  Studio → Authentication → Users : les comptes `…@latermitiere.local` doivent apparaître.
- **Tout arrêter** : `docker compose down` (les données persistent dans les volumes ;
  `docker compose down -v` les efface).

# Guide d'installation — La Termitière sur VPS (Docker)



L'architecture cible :

```
   Navigateurs/téléphones
        │ HTTPS
        ▼
   ┌────────────────────────────┐
   │  Caddy (conteneur)         │  app.<domaine>  → sert l'app React (statique)
   │  HTTPS auto (Let's Encrypt)│  api.<domaine>  → reverse-proxy ↓
   └────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────┐
   │  Supabase self-hosted (Docker, port 8000)  │
   │  Kong · Auth (GoTrue) · PostgREST ·        │
   │  Realtime · PostgreSQL · Studio            │
   └────────────────────────────────────────────┘
```

---

## 0. Prérequis (IMPORTANT)

- **OS : Debian 12 (Bookworm) ou Ubuntu 22.04+.**
  ⚠️ **Ne pas utiliser Debian 9** (fin de vie, plus de correctifs de sécurité) pour une
  application de gestion contenant des données d'entreprise. Merci de provisionner un OS à jour.
- **Ressources VPS** : minimum **2 vCPU / 4 Go RAM / 20 Go disque** (le stack Supabase est
  composé de plusieurs services). 4 Go est un minimum confortable.
- **Docker** + **Docker Compose v2** installés.
- **2 sous-domaines** pointant (enregistrements DNS **A**) vers l'IP du VPS :
  - `app.latermitiere.com` → l'application
  - `api.latermitiere.com` → l'API Supabase
  - Ports **80 et 443** ouverts (pare-feu) pour Caddy / Let's Encrypt.
- Le **code de l'app** (ce dépôt) disponible sur le VPS (git clone ou archive).

Installer Docker (Debian/Ubuntu) :
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # puis se reconnecter
docker compose version          # vérifier Compose v2
```

---

## 1. Installer le backend : Supabase auto-hébergé

```bash
# Récupérer le stack officiel Supabase (Docker)
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

Éditer `supabase/docker/.env` et **changer TOUS les secrets** (ne jamais garder les valeurs par défaut) :
- `POSTGRES_PASSWORD` → un mot de passe fort (notez-le).
- `JWT_SECRET` → une chaîne aléatoire de **40+ caractères**.
- `ANON_KEY` et `SERVICE_ROLE_KEY` → **générer** à partir du `JWT_SECRET`
  (outil officiel : https://supabase.com/docs/guides/self-hosting#api-keys — ou `supabase`
  CLI). La `ANON_KEY` est publique (front), la `SERVICE_ROLE_KEY` reste **secrète**.
- `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` → accès au Studio.
- `SITE_URL=https://app.latermitiere.com` et `API_EXTERNAL_URL=https://api.latermitiere.com`.
- `KONG_HTTP_PORT=8000` (défaut — c'est le port que Caddy proxifie).
- *(Optionnel mais recommandé)* configurer le **SMTP** (`SMTP_*`) pour les e-mails d'auth.

Démarrer :
```bash
docker compose pull
docker compose up -d
docker compose ps          # tous les services doivent être "healthy"
```
Le Studio est accessible en local (via SSH tunnel) sur `http://localhost:8000` →
identifiants `DASHBOARD_USERNAME/PASSWORD`.

---

## 2. Créer le schéma + la sécurité (RLS)

Le dépôt fournit le schéma (26 tables `tp_*` + `legacy_maxiagro`) et les règles de sécurité.

Depuis le dépôt de l'app (sur le VPS), copiez le contenu de ces fichiers dans le **SQL Editor**
du Studio Supabase (ou via `psql`) et exécutez, **dans cet ordre** :

1. `migration/supabase/schema.sql` → crée les tables.
2. *(plus tard, après l'étape 4)* `migration/supabase/secure-auth.sql` → active le **RLS**
   (accès réservé aux utilisateurs connectés) + table `profiles`.

Via `psql` (exemple) :
```bash
# DB exposée par le stack Supabase (port 5432, mot de passe = POSTGRES_PASSWORD)
export PGPASSWORD='le_mot_de_passe_postgres'
psql -h localhost -p 5432 -U postgres -d postgres -f migration/supabase/schema.sql
```

---

## 3. Importer les données existantes (sans perte)

Les données actuelles sont exportées depuis Firebase puis importées dans PostgreSQL.
Outils dans `migration/supabase/` (déjà prêts).

```bash
cd migration/supabase
npm install

# (a) Rafraîchir l'export avec les données LES PLUS RÉCENTES (à faire au moment de la bascule) :
#     -> fourni par l'entreprise (fichier ../firebase-export.json), OU régénéré :
npx --yes firebase-tools database:get "/" -o ../firebase-export.json --project max-agro-83baf

# (b) Importer dans le PostgreSQL self-hosted :
export DATABASE_URL='postgresql://postgres:LE_MOT_DE_PASSE@localhost:5432/postgres'
node import.mjs
```
Le script est **idempotent** (réexécutable sans doublon) et affiche le nombre
d'enregistrements importés par table. Vérifiez dans le Studio → **Table Editor**.

---

## 4. Créer les comptes d'authentification

Les utilisateurs sont créés dans **Supabase Auth** (e-mail synthétique `<login>@latermitiere.local`,
mot de passe temporaire = l'identifiant). Script `migration/supabase/auth-migrate.mjs` :

```bash
cd migration/supabase
export SUPABASE_URL='https://api.latermitiere.com'      # ou http://localhost:8000
export SUPABASE_SERVICE_KEY='la_service_role_key'        # SECRÈTE
node auth-migrate.mjs
```
Communiquez ensuite les **mots de passe temporaires** aux utilisateurs (à changer à la 1re connexion).

Puis **fermez la base** (RLS) — exécutez `migration/supabase/secure-auth.sql` dans le SQL Editor.
(À faire **après** la création des comptes, sinon plus personne ne peut lire.)

---

## 5. Déployer le frontend (app + HTTPS + proxy API)

Toujours depuis le dépôt de l'app, dossier `deploy/` :
```bash
cd deploy
cp .env.example .env
# Éditer .env :
#   DOMAIN_APP=app.latermitiere.com
#   DOMAIN_API=api.latermitiere.com
#   VITE_SUPABASE_ANON_KEY=<la ANON_KEY du stack Supabase>
docker compose up -d --build
```
Caddy obtient automatiquement les certificats HTTPS (Let's Encrypt) pour les deux domaines
et sert l'application. **Vérifier** : ouvrir `https://app.latermitiere.com` → page de connexion.

> ⚠️ Les ports 80/443 doivent être libres (si un autre serveur web tourne, l'arrêter)
> et ouverts dans le pare-feu. Le DNS des 2 sous-domaines doit déjà pointer sur le VPS.

---

## 6. Vérification de bout en bout
1. `https://app.latermitiere.com` s'ouvre en HTTPS (cadenas).
2. Connexion avec un compte (login + mot de passe temporaire) → le tableau de bord s'affiche.
3. Une saisie test apparaît en temps réel sur un 2ᵉ appareil.
4. Studio Supabase → Table Editor : les données `tp_*` sont bien présentes.

---

## 7. Sauvegardes & maintenance (à la charge de l'hébergeur)

- **Sauvegarde quotidienne de PostgreSQL** (indispensable) :
  ```bash
  docker exec supabase-db pg_dump -U postgres postgres | gzip > /backups/termitiere-$(date +%F).sql.gz
  ```
  (à planifier via `cron`, avec rotation + copie hors-serveur).
- **Mises à jour de sécurité de l'OS** : `unattended-upgrades` activé.
- **Mises à jour Docker/Supabase** : `docker compose pull && up -d` périodiquement.
- **Supervision** : disque, RAM, et que les conteneurs restent `healthy`.

---

## 8. Sécurité — points non négociables
- OS **à jour** (Debian 12+/Ubuntu 22.04+), pare-feu (ufw : autoriser 22/80/443 seulement).
- Tous les **secrets Supabase changés** (jamais les valeurs par défaut).
- `SERVICE_ROLE_KEY` et `POSTGRES_PASSWORD` **jamais** dans le frontend ni dans git.
- **RLS activé** (`secure-auth.sql`) : la base n'est accessible qu'aux comptes authentifiés.
- Le Studio Supabase **non exposé publiquement** (accès via tunnel SSH uniquement).
- **L'entreprise reste propriétaire** des données : un `pg_dump` peut être exporté à tout moment.

---

## 9. Bascule finale (cutover) — ordre recommandé
1. Installer et tester tout ce qui précède **pendant que Firebase tourne encore** (aucune coupure).
2. Le jour J : **re-exporter** les données Firebase les plus récentes (étape 3a) → **réimporter** (3b).
3. Basculer le DNS / communiquer la nouvelle adresse aux utilisateurs.
4. **Geler l'ancienne version Firebase** (ne plus y saisir) — une seule base « vivante » à la fois.
5. Garder l'export Firebase final comme archive.

---

### Récap des fichiers fournis dans le dépôt
| Chemin | Rôle |
|---|---|
| `deploy/docker-compose.yml`, `deploy/Dockerfile`, `deploy/Caddyfile`, `deploy/.env.example` | Déploiement du frontend (app + HTTPS + proxy API) |
| `migration/supabase/schema.sql` | Création des tables PostgreSQL |
| `migration/supabase/import.mjs` | Import des données (Firebase → PostgreSQL) |
| `migration/supabase/auth-migrate.mjs` | Création des comptes Supabase Auth |
| `migration/supabase/secure-auth.sql` | Activation du RLS (sécurité) |



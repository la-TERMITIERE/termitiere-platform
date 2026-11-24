# Guide CI/CD — La Termitière

**Version :** 1.0  
**Statut :** Production  
**Cible :** Équipe technique / DevOps  
**Dernière mise à jour :** Juillet 2026  

---

# 1. Objectif

Ce document décrit le pipeline d'intégration et de déploiement continus (CI/CD) pour le Frontend React (`termitiere-web`). 
Le déploiement est 100% automatisé grâce à **GitHub Actions** et **GitHub Container Registry (GHCR)**.

---

# 2. Architecture du Pipeline

Le flux de déploiement fonctionne de la manière suivante :

1. Les développeurs collaborent sur la branche `dev` (ou des branches de feature).
2. Quand le code est prêt, il est poussé (merge) sur la branche **`vps-deploy`**.
3. **GitHub Actions** se déclenche automatiquement (uniquement sur cette branche).
4. Le code est compilé (Build Vite/React) et packagé dans une image Docker.
5. L'image Docker est poussée sur le registre privé de GitHub (**GHCR**).
6. GitHub Actions se connecte au VPS via SSH.
7. Le VPS télécharge (pull) la nouvelle image et redémarre le conteneur Frontend via `docker compose`.

---

# 3. Prérequis (GitHub Secrets)

Pour que GitHub Actions puisse compiler l'application et se connecter au VPS, il faut configurer les **Secrets** suivants dans les paramètres du dépôt GitHub (*Settings > Secrets and variables > Actions*) :

| Nom du Secret | Description |
|---|---|
| `HOST` | L'adresse IP du VPS (ex: `31.207.37.96`) |
| `USERNAME` | L'utilisateur SSH (ex: `bawa` ou `root`) |
| `SSH_PRIVATE_KEY` | La clé SSH privée (Ed25519) pour se connecter au VPS sans mot de passe. Voir la section 3.1. |
| `CR_PAT` | Le Personal Access Token (PAT) GitHub pour que le VPS puisse pull l'image depuis GHCR |
| `VITE_SUPABASE_URL` | L'URL publique de l'API (ex: `https://api.latermitiere.com`) |
| `VITE_SUPABASE_ANON_KEY` | La clé publique anonyme générée par Supabase |

### 3.1 Génération de la clé SSH (github-actions)

Pour permettre à GitHub de se connecter au VPS :
1. Sur le VPS, on génère une clé asymétrique dédiée (sans mot de passe) :
   ```bash
   ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github-actions
   ```
2. On autorise cette clé sur le VPS :
   ```bash
   cat ~/.ssh/github-actions.pub >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```
3. On copie le contenu de la clé privée (`cat ~/.ssh/github-actions`) et on le colle dans le secret **`SSH_PRIVATE_KEY`** sur GitHub.

> ⚠️ **Piège classique :** Assure-toi de copier l'intégralité du texte, y compris les lignes `-----BEGIN OPENSSH PRIVATE KEY-----` et `-----END OPENSSH PRIVATE KEY-----`. S'il manque un tiret, la connexion GitHub Actions échouera.

---

# 4. Le Personal Access Token (PAT) — CRITIQUE

Le VPS a besoin d'une autorisation pour télécharger l'image Docker privée depuis GHCR. C'est le rôle du `CR_PAT`.

### 4.1 Création du PAT
1. Sur GitHub, va dans **Settings** (Profil) > **Developer settings** > **Personal access tokens** > **Tokens (classic)**.
2. Clique sur **Generate new token (classic)**.
3. Nom : `VPS Deploy Token La Termitiere`.
4. Expiration : **90 jours** (Standard de sécurité).
5. Scopes (Permissions) : Coche **`read:packages`** (c'est la seule permission requise pour pull l'image).
6. Copie le token généré (il commence par `ghp_...`).

### 4.2 Injection sur le VPS
Sur le VPS, il faut s'authentifier une fois pour toutes auprès du registre. 

*(Remplace `ghp_TON_TOKEN_PAT` par ton vrai token, et `TON_USER_GITHUB` par ton nom d'utilisateur GitHub en minuscules)* :
```bash
echo "ghp_TON_TOKEN_PAT" | \
  docker login ghcr.io -u TON_USER_GITHUB --password-stdin
```
*(Le VPS est maintenant autorisé à télécharger les mises à jour privées).*

---

# 5. Procédure de Rotation du PAT (Tous les 90 jours)

⚠️ **Attention :** Le PAT expire tous les 90 jours. Si le pipeline CI/CD plante subitement avec une erreur `unauthorized` au moment du `docker pull` sur le VPS, c'est que le token a expiré.

**En cas d'expiration (Procédure en 5 minutes) :**
1. Retourne sur GitHub et génère un nouveau PAT (même procédure que 4.1).
2. Met à jour le secret `CR_PAT` dans les paramètres Actions du dépôt.
3. Connecte-toi au VPS via SSH et relance l'authentification :
   ```bash
   echo "ghp_NOUVEAU_TOKEN" | \
     docker login ghcr.io -u TON_USER_GITHUB --password-stdin
   ```
4. Relance le job GitHub Actions qui avait échoué.

---

# 6. Tolérance aux pannes et Déploiement "Zero Downtime"

Le workflow GitHub Actions (`ghcr-test.yml`) intègre une stratégie de **Rollback Automatique** extrêmement robuste, indispensable en production :

1. Avant de télécharger la nouvelle version, le script sauvegarde l'identifiant (tag) de l'image actuellement en production.
2. Il télécharge et déploie la nouvelle image.
3. Il effectue un test de santé (Health Check) en vérifiant que le domaine (`https://app.latermitiere.com`) répond correctement avec `curl`.
4. **En cas d'échec (Erreur 500 ou site indisponible)** : Le script restaure immédiatement l'ancien tag (Rollback) et relance l'ancienne version, assurant qu'il n'y ait presque aucune interruption de service pour l'utilisateur final.

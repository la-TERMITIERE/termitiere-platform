# Guide de Dépannage (Troubleshooting) — La Termitière

**Version :** 1.0  
**Statut :** Production  
**Cible :** Équipe technique / DevOps  
**Dernière mise à jour :** Juillet 2026  

---

# 1. Objectif

Ce document répertorie les problèmes courants rencontrés sur le VPS lors de l'administration de La Termitière et leurs solutions immédiates, basées sur des cas réels du terrain.

---

# 2. Base de données & API (Supabase)

## 2.1 Erreur `No API key found in request`

**Symptôme :**
En exécutant un test `curl` sur l'API (ex: `http://31.207.37.96:8000/rest/v1/`), le serveur renvoie :
```json
{
  "message":"No API key found in request",
  "request_id":"..."
}
```

**Cause :** La passerelle d'API Kong exige une clé API valide.

**Solution (Si l'erreur vient de l'application React) :**
C'est que le Frontend n'envoie pas la clé publique à Supabase.
1. Ouvre le fichier `.env.deploy` (ou `.env`) de ton Frontend (`/home/bawa/termitiere-platform/deploy/`).
2. Vérifie que la variable `VITE_SUPABASE_ANON_KEY` est bien présente et remplie avec la longue clé qui commence par `eyJ...` (clé générée dans le `.env` du dossier Supabase).
3. Si tu la modifies, tu dois relancer le conteneur web.

**Solution (Pour tester manuellement depuis le terminal avec `curl`) :**
Toujours inclure le header `apikey` dans vos requêtes :
```bash
# Accès public (soumis au RLS)
curl http://localhost:8000/rest/v1/ -H "apikey: ta_cle_anon"

# Accès total (bypass le RLS)
curl http://localhost:8000/rest/v1/ -H "apikey: ta_SERVICE_ROLE_KEY"
```

## 2.2 Problème de certificats JWT (`Auth / Realtime`)

**Symptôme :** Vous n'arrivez pas à vous authentifier, ou l'erreur pointe vers un problème de signature JWT.

**Solution :**
Vérifier que le couple de clés asymétriques a bien été généré et inséré dans le fichier `.env`.
1. Naviguer dans `/home/bawa/supabase/docker`
2. Lancer le script de rotation officiel :
   ```bash
   sh utils/add-new-auth-keys.sh --update-env
   ```
3. Appliquer les changements en redémarrant le stack complet :
   ```bash
   docker compose down
   docker compose up -d
   ```

---

# 3. Réseau & SSH

## 3.1 Déconnexion SSH inopinée (`client_loop: send disconnect: Connection reset`)

**Symptôme :**
En pleine session terminal sur le VPS (`ssh bawa@31.207.37.96`), la connexion se coupe avec le message `Connection reset`.

**Cause :** 
Soit le réseau local est instable, soit le pare-feu du VPS tue la session inactive.

**Solution :**
Pour éviter que la session ne meure, configurez votre client SSH local (sur votre PC Windows/Mac) pour envoyer un "ping" régulier.

Dans le fichier `~/.ssh/config` (ou `C:\Users\TonUser\.ssh\config` sur Windows), ajoutez :
```text
Host 31.207.37.96
    ServerAliveInterval 60
    ServerAliveCountMax 10
```
> 💡 **Besoin d'aide ?** Regarde la section **4.2 du Guide d'Installation (02-Guide...)** pour le tutoriel pas-à-pas (spécifique à Windows ou Mac/Linux).

## 3.2 Vérifier quels ports sont écoutés (Docker Proxy)

**Symptôme :** On ne sait plus si le port 8000 (Kong) ou 3000 (Studio) est ouvert.

**Solution :**
Utiliser `ss` au lieu de `netstat` (qui est obsolète). Puisque l'utilisateur `bawa` n'a pas les droits sudo, il faut passer `root` :
```bash
su -
# Taper le mot de passe root, puis :
ss -tulpn | grep -E '3000|8000|80|443'
exit # pour revenir à l'utilisateur bawa
```
*Si un port est occupé par `docker-proxy`, c'est que Docker gère bien le flux entrant.*

---

# 4. Node.js Scripts (Migrations, Auth)

## 4.1 Erreur `TypeError: fetch failed`

**Symptôme :** Lors de l'exécution d'un script `.mjs` qui tape sur l'API Supabase via HTTPS.

**Solution (Contournement local uniquement) :**
Désactiver la vérification SSL pour l'exécution du script via la variable d'environnement :
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 node mon_script.mjs
```
*(Attention : Ne jamais utiliser cela dans le code frontend React en production !)*

---

# 5. Reverse-Proxy & HTTPS (Caddy)

Caddy est le composant critique qui sécurise les connexions (HTTPS) et route le trafic vers le Frontend (React) et le Backend (Kong). S'il plante, tout le site est inaccessible.

## 5.1 Erreur SSL (Le cadenas rouge) ou site inaccessible

**Symptôme :** Le navigateur affiche "Votre connexion n'est pas privée" ou "ERR_CONNECTION_REFUSED".

**Cause :** Caddy n'a pas réussi à obtenir le certificat gratuit Let's Encrypt. C'est souvent dû à un problème de DNS ou parce que les ports 80/443 sont bloqués par un pare-feu.

**Solution (Diagnostic) :**
Lire les logs de Caddy pour comprendre pourquoi Let's Encrypt a refusé le certificat :
```bash
# Dans le dossier deploy du Frontend
cd /home/bawa/termitiere-platform/deploy
docker compose logs --tail 50 web
```
*Cherchez des mots clés comme `tls.obtain`, `timeout` ou `rate limit`.*
> 💡 **Le réflexe :** Vérifie toujours sur ton registraire (ex: OVH/Hostinger) que l'enregistrement de type "A" pour `app.latermitiere.com` et `api.latermitiere.com` pointe **exactement** vers l'IP `31.207.37.96`.

## 5.2 Erreur 502 Bad Gateway sur l'API

**Symptôme :** L'application web s'affiche bien, mais quand on essaie de s'inscrire ou de charger des données, la console du navigateur affiche des erreurs 502 (Bad Gateway).

**Cause :** Caddy n'arrive pas à transmettre la requête au conteneur Supabase (Kong, qui tourne sur le port 8000).

**Solution :**
1. Vérifie d'abord que Supabase n'est pas planté (cf. Section 4 du guide d'Administration).
2. Vérifie que la configuration "magique" de Docker est bien présente dans ton `deploy/docker-compose.prod.yml` :
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```
C'est cette ligne qui permet au conteneur Caddy de communiquer avec le port 8000 ouvert par Supabase sur le système hôte. Sans elle, Caddy se heurte à un mur.

# Déploiement — LA TERMITIÈRE (portail multi-secteurs)

> ⚠️ **Sécurité d'abord** : ton mot de passe GitHub a été partagé en clair dans une
> conversation. **Change-le immédiatement** : GitHub → Settings → Password.
> Ne partage jamais un mot de passe ; pour l'automatisation, utilise un **token**.

L'application MAXI-AGRO approuvée est embarquée **sans aucune modification** sous
`public/apps/maxi-agro/` et chargée dans le portail via une iframe (`/agro`).

---

## Option A — Lien immédiat sans compte (Netlify Drop)

Le plus rapide pour obtenir un lien public tout de suite :

1. `npm install && npm run build` (génère le dossier `dist/`)
2. Ouvre https://app.netlify.com/drop
3. Glisse-dépose le dossier **`dist/`** dans la page.
4. Netlify te donne un lien public `https://<nom>.netlify.app` en quelques secondes.

> Limite : pas de redéploiement automatique. Pour ça, voir l'option B.

---

## Option B — GitHub + Netlify (déploiement continu, recommandé)

### 1. Créer le dépôt sur GitHub
- Connecte-toi sur https://github.com (compte/organisation `la-TERMITIERE`).
- « New repository » → nom : `termitiere-platform` → **Private** → Create.
- **Ne pas** initialiser avec README (le dépôt local en a déjà un).

### 2. Pousser le code (avec un Personal Access Token, pas le mot de passe)
- Crée un token : GitHub → Settings → Developer settings →
  Personal access tokens → **Fine-grained token** → accès au dépôt `termitiere-platform`,
  permission « Contents: Read and write ». Copie le token (`github_pat_…`).
- Dans `C:\Users\ACP\Documents\termitiere-platform`, exécute :

```powershell
git remote add origin https://github.com/la-TERMITIERE/termitiere-platform.git
git push -u origin main
```

  Quand Git demande le mot de passe, **colle le token** (pas ton mot de passe GitHub).

### 3. Connecter à Netlify
- https://app.netlify.com → « Add new site » → « Import an existing project » →
  GitHub → autorise → choisis `termitiere-platform`.
- Réglages de build détectés automatiquement via `netlify.toml` :
  - Build command : `npm run build`
  - Publish directory : `dist`
- « Deploy site ». Netlify fournit un lien `https://<nom>.netlify.app`.

### 4. (Facultatif) Activer Firebase en production
Par défaut l'app fonctionne en **mode démo** (données locales). Pour activer la
synchronisation temps réel, renseigne dans Netlify → Site settings → Environment
variables les clés `VITE_FIREBASE_*` (voir `.env.example`), puis redéploie.

---

## Comptes par défaut (démo)
| Identifiant | Mot de passe | Rôle |
|---|---|---|
| admin | admin123 | Administrateur |
| controleur | ctrl123 | Contrôleur |
| agent | agent123 | Agent |

> Pense à modifier ces mots de passe par défaut avant une mise en production réelle.

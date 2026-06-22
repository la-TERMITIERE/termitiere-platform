# Cours 2 — Netlify (où vit ton application)

> Objectif : comprendre comment Netlify **héberge** ton app, la **construit** automatiquement
> depuis GitHub, fait tourner tes **fonctions serveur**, et comment l'administrer.

---

## 1. C'est quoi Netlify ?

**Netlify** est une plateforme d'**hébergement** pour applications web modernes. Son rôle :
1. **Servir ton site** au monde entier, rapidement et en HTTPS (cadenas 🔒).
2. **Construire** ton site automatiquement à chaque fois que tu modifies le code (sur GitHub).
3. Faire tourner des **fonctions serveur** (serverless) pour le code qui ne peut pas vivre dans
   le navigateur (envoi d'e-mails, WhatsApp, sauvegarde…).

**Ton site Netlify** s'appelle `latermitiere-app`, équipe `la-termitiere`, connecté au dépôt
GitHub `la-TERMITIERE/termitiere-platform`. URL : `latermitiere-app.netlify.app`. Compte :
`support@latermitiere.com`. Console : **https://app.netlify.com**.

> 📌 Distinction clé : **Netlify héberge l'APP. Firebase stocke les DONNÉES.** Deux services
> séparés et complémentaires. Si tu arrêtes ton abonnement Netlify Pro, tu repasses au plan
> gratuit (l'app reste en ligne) ; **tes données ne sont pas sur Netlify**, elles sont intactes.

---

## 2. Hébergement d'une app « statique » / SPA

Ton app React est compilée en **fichiers statiques** (du HTML, du CSS, du JavaScript). Netlify
les sert depuis un **CDN** (*Content Delivery Network*) — un réseau de serveurs répartis dans le
monde qui rapproche le site de chaque visiteur (donc rapide, même depuis le Togo).

Ton app est une **SPA** (*Single Page Application*) : une seule page HTML qui change de contenu
en JavaScript sans recharger. C'est pour ça qu'il y a une **règle de redirection** (cf. §4) qui
renvoie toutes les URL vers `index.html`.

---

## 3. Le build : de ton code au site en ligne

Tu n'envoies pas le site « fini » à Netlify. Tu envoies le **code source** (sur GitHub), et
Netlify **construit** (build) le site lui-même. Le cycle :

```
1. Tu modifies le code  →  2. tu pousses sur GitHub (git push)
                                       │
                                       ▼
3. Netlify détecte le push  →  4. lance `npm run build`  →  5. obtient le dossier `dist/`
                                       │
                                       ▼
                          6. publie `dist/` en ligne (déploiement)
```

C'est ce qu'on appelle le **CI/CD** (*Continuous Integration / Continuous Deployment*) :
livraison continue et **automatique**. Tu pousses, c'est en ligne 1-2 min après.

**`npm run build`** (défini dans `package.json`) lance **Vite** qui compile React → fichiers
optimisés dans `dist/`. (Vite est expliqué au cours 3.)

---

## 4. Le fichier `netlify.toml` (ta config, ligne par ligne)

Ce fichier à la racine pilote Netlify. Voici le tien, commenté :

```toml
[build]
  publish = "dist"            # le dossier à mettre en ligne (sortie du build)
  command = "npm run build"   # la commande qui construit le site
  functions = "netlify/functions"  # où sont tes fonctions serveur

[build.environment]
  NODE_VERSION = "20"         # version de Node.js utilisée pour le build

[functions]
  node_bundler = "esbuild"    # l'outil qui empaquette tes fonctions

[[redirects]]
  from = "/*"                 # TOUTES les URL...
  to = "/index.html"          # ...renvoient vers index.html (indispensable pour une SPA)
  status = 200

[[headers]]                   # en-têtes HTTP de sécurité
  for = "/*"
  [headers.values]
    X-Frame-Options = "SAMEORIGIN"      # empêche d'intégrer ton site dans un iframe étranger
    X-Content-Type-Options = "nosniff"  # empêche le navigateur de « deviner » les types
    Referrer-Policy = "strict-origin-when-cross-origin"
```

**La règle de redirection est cruciale** : sans elle, si un utilisateur ouvre directement
`latermitiere-app.netlify.app/agro`, Netlify chercherait un fichier `/agro` qui n'existe pas →
erreur 404. Avec la règle, toute URL renvoie `index.html`, et c'est React (le routeur) qui
affiche la bonne page côté navigateur.

---

## 5. Netlify Functions (tes fonctions serveur)

Une **fonction** (*serverless function*) est un petit bout de code qui s'exécute **sur les
serveurs de Netlify**, à la demande, **sans que tu gères de machine**. C'est là que vit le code
qui ne doit PAS être dans le navigateur (parce qu'il manipule des **secrets**).

Tes fonctions sont dans `netlify/functions/` :

| Fichier | Rôle | Déclenchée par |
|---|---|---|
| `whatsapp-notify.js` | envoyer un WhatsApp (API Meta) | l'app (POST) |
| `send-push.js` | envoyer une notification push | l'app (POST) |
| `backup-db.mjs` | **sauvegarder la base** chaque nuit | **planificateur** (cron) |

**Pourquoi serveur et pas navigateur ?** Parce qu'elles utilisent des **clés secrètes**
(`WHATSAPP_TOKEN`, `RESEND_API_KEY`, clé VAPID privée). Si ces clés étaient dans le navigateur,
n'importe qui pourrait les voler (principe de sécurité #1). Sur le serveur, le visiteur ne les
voit jamais.

**Comment l'app appelle une fonction :** par une simple requête HTTP vers
`/.netlify/functions/<nom>`. Exemple dans `src/core/whatsapp.js` :
```js
await fetch('/.netlify/functions/whatsapp-notify', { method: 'POST', body: ... })
```

**Anatomie d'une fonction** (forme classique) :
```js
export async function handler(event) {
  // event.httpMethod, event.headers, event.body ...
  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
```

### Les Scheduled Functions (fonctions planifiées) — ta sauvegarde

Une fonction **planifiée** s'exécute **toute seule** à intervalle régulier (un **cron**), sans
être appelée par personne. C'est ta sauvegarde `backup-db.mjs` :

```js
export default async () => { /* lit la base, envoie l'e-mail */ }
export const config = { schedule: '0 3 * * *' }   // tous les jours à 03:00 UTC
```

**Lire un cron** `0 3 * * *` : `minute heure jour mois jour-semaine`. Ici : minute 0, heure 3,
tous les jours → **03:00 chaque jour**. (Le Togo est à UTC+0, donc 3 h du matin local.)
> Pour t'aider : le site **crontab.guru** traduit n'importe quel cron en français.

---

## 6. Les variables d'environnement

Une **variable d'environnement** (*env var*) est une valeur de configuration (souvent un
**secret**) stockée **dans Netlify**, pas dans le code. Le code la lit via `process.env.NOM`
(côté fonction) ou `import.meta.env.NOM` (côté app, préfixe `VITE_`).

**Où les régler :** app.netlify.com → ton site → *Site configuration → Environment variables*.

Les tiennes :
| Variable | Pour quoi | Secrète ? |
|---|---|---|
| `RESEND_API_KEY` | envoi des e-mails de sauvegarde | ✅ |
| `BACKUP_EMAIL_TO` | destinataire des sauvegardes | non |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | API WhatsApp | ✅ |
| `VITE_RECAPTCHA_KEY` | (à venir) App Check | non (clé publique) |

**Règles importantes :**
- Préfixe **`VITE_`** = la variable est intégrée dans le code **du navigateur** → ne mets JAMAIS
  un secret en `VITE_`. (Les clés Firebase web et reCAPTCHA sont publiques, donc OK.)
- Une variable **sans** `VITE_` n'est lisible que **côté serveur** (fonctions) → c'est là que
  vivent les vrais secrets.
- Après avoir changé une variable, **redéploie** pour qu'elle soit prise en compte.

---

## 7. Les déploiements (deploys)

Onglet **Deploys** de ton site. Chaque déploiement est une **version publiée**, horodatée, liée
à un commit GitHub.

- **Production** : la version live (branche `main`).
- **Deploy Previews** : si tu ouvres une *Pull Request* sur GitHub, Netlify crée une version de
  test à une URL séparée, sans toucher la prod. Pratique pour valider avant de publier.
- **Trigger deploy** : relancer un déploiement manuellement (ex. après avoir changé une variable
  d'env) → bouton « Trigger deploy » → « Deploy project ».
- **Rollback (revenir en arrière)** : clique sur un ancien déploiement réussi → « Publish deploy ».
  En 10 secondes tu reviens à la version précédente. **C'est ton bouton d'urgence** si une
  nouvelle version casse quelque chose.

> 💡 Chaque déploiement est conservé : tu as un historique complet et tu peux republier
> n'importe quelle ancienne version. Très rassurant.

---

## 8. Domaines et HTTPS

- Par défaut ton app est sur `latermitiere-app.netlify.app`.
- Tu peux brancher un **domaine personnalisé** (ex. `app.latermitiere.com`) : *Domain management
  → Add a domain*, puis configurer le DNS (Netlify te guide). Netlify fournit le **certificat
  HTTPS gratuitement** (Let's Encrypt) — le cadenas 🔒 apparaît automatiquement.

---

## 9. Plans, quotas, surveillance

| | **Starter (gratuit)** | **Pro (ton abonnement actuel)** |
|---|---|---|
| Bande passante | 100 Go/mois | 1 To/mois |
| Minutes de build | 300/mois | 25 000/mois |
| Fonctions | 125 000 appels/mois | plus |
| Fonctions planifiées | ✅ incluses | ✅ |

**Pour ton app interne (~13 utilisateurs), le plan GRATUIT suffit très largement.** Pro apporte
surtout plus de bande passante/builds + analytics — utile à grande échelle, pas indispensable ici.

**Surveiller :** onglet **Usage & billing** (bande passante, builds consommés) et **Logs &
metrics → Functions** (exécutions, erreurs de tes fonctions, dont la sauvegarde).

---

## 10. Diagnostiquer un problème (réflexes)

- **L'app ne se met pas à jour après un push ?** → Deploys : le dernier build a-t-il réussi
  (vert « Published ») ou échoué (rouge) ? Clique dessus → lis le **log de build**.
- **Une fonction ne marche pas ?** → Logs & metrics → Functions → clique la fonction → lis les
  logs d'exécution (tu y verras les `console.log`/`console.error`).
- **Une variable d'env semble ignorée ?** → vérifie l'orthographe exacte, le préfixe `VITE_` si
  besoin, et **redéploie** après modification.
- **Urgence (la prod est cassée)** → Deploys → republie le dernier déploiement qui marchait
  (rollback).

---

## 11. Exercices pratiques (sur TON site)

1. **Deploys** : ouvre l'onglet Deploys. Quel est le dernier déploiement « Published » ? À quel
   commit GitHub correspond-il ?
2. **Build log** : ouvre un déploiement → lis le log. Repère la ligne `npm run build` et la fin
   « Site is live ».
3. **Functions** : Logs & metrics → Functions. Retrouve `backup-db` marquée **Scheduled** et sa
   prochaine exécution.
4. **Variables** : Site configuration → Environment variables. Lesquelles sont marquées
   « secret » ? Pourquoi celles-là et pas les autres ?
5. **Relier au code** : ouvre `netlify.toml`. Pour chaque ligne, dis à quoi elle sert (tu as la
   réponse au §4).
6. **(Avancé) Rollback à blanc** : repère dans Deploys comment tu republierais une version
   précédente — sans le faire. Sache où est le bouton d'urgence.

➡️ Cours suivant : [Le frontend (React, Vite, PWA, Tailwind, Zustand)](03-frontend.md).

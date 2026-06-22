# 🎓 Cours — Maîtriser les outils de la plateforme La Termitière

Bienvenue. Cette série de cours t'apprend, **en tant qu'ingénieur/développeur**, à comprendre
et administrer chaque outil qui fait tourner ta plateforme. Tout est ancré sur **ton vrai
projet** (fichiers, config, données réelles) pour que ce soit directement utile.

## Comment ta plateforme est construite (vue d'ensemble)

```
  TON NAVIGATEUR / TÉLÉPHONE
        │  (l'app React, une PWA)
        ▼
  ┌─────────────────────┐        ┌──────────────────────────────┐
  │      NETLIFY        │        │           FIREBASE            │
  │  héberge le site    │        │  Realtime Database (les       │
  │  + fonctions        │◀──────▶│  données) + Auth + App Check  │
  │  serveur (e-mail,   │  REST  │                               │
  │  WhatsApp, backup)  │        │  Compte: leeknoxalfred@gmail  │
  └─────────────────────┘        └──────────────────────────────┘
        ▲
        │ déploie automatiquement à chaque push
  ┌─────────────────────┐
  │      GITHUB         │  la-TERMITIERE/termitiere-platform
  │  le code source     │
  └─────────────────────┘
```

**En une phrase :** GitHub stocke le code → Netlify le construit et l'héberge → l'app tourne
dans le navigateur → elle lit/écrit les données dans Firebase.

## Parcours d'apprentissage conseillé

| # | Cours | Pourquoi |
|---|---|---|
| 1 | [Firebase](01-firebase.md) | **Le cœur** : où vivent tes données, comment les administrer |
| 2 | [Netlify](02-netlify.md) | **Où vit ton app** : hébergement, fonctions serveur, déploiements |
| 3 | [Le frontend : React, Vite, PWA, Tailwind, Zustand](03-frontend.md) | Comment l'interface est faite |
| 4 | [Git & GitHub + le déploiement](04-git-github.md) | Versionner le code et livrer en production |
| 5 | [Architecture & sécurité de ta plateforme](05-architecture-securite.md) | Comment tout s'assemble proprement |

## Conseils pour apprendre
- **Lis avec le projet ouvert** à côté : chaque cours cite des fichiers réels (ex.
  `src/core/firebase.js`). Ouvre-les, relis-les après la théorie.
- **Pratique** : chaque cours finit par des exercices concrets sur TON projet.
- **N'apprends pas tout d'un coup.** Un cours par jour, c'est déjà beaucoup. Reviens-y.
- Le vocabulaire technique est en **gras** la 1re fois et expliqué simplement.

> Glossaire express : **Frontend** = ce qui tourne dans le navigateur. **Backend** = ce qui
> tourne sur un serveur. **Serverless** = du code serveur qui s'exécute à la demande, sans que
> tu gères de machine. **BaaS** (Backend-as-a-Service) = un backend prêt à l'emploi (Firebase).
> **PWA** = une app web installable qui marche comme une app mobile. **Déployer** = publier
> une nouvelle version en ligne.

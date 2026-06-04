# Synchronisation multi-appareils — ACTIVE ✅

Le portail synchronise désormais **en temps réel entre tous les appareils**, sans
configuration. Les données et les comptes vivent dans la **Realtime Database** du
projet Firebase `max-agro-83baf` (config intégrée au code, voir `src/core/firebase.js`).

- Une saisie, une facture, une demande, un changement de compte faits sur un
  appareil apparaissent **en quelques secondes** sur tous les autres.
- L'**administrateur** gère les comptes et les droits d'accès depuis
  *Portail → Utilisateurs* → propagation immédiate partout.
- Les données du portail sont rangées sous le nœud `tp/` (séparé de l'app
  MAXI-AGRO d'origine, qui utilise d'autres nœuds de la même base).

## Comptes par défaut (créés automatiquement au 1er lancement)
| Identifiant | Mot de passe | Rôle |
|---|---|---|
| admin | admin123 | Administrateur |
| controleur | ctrl123 | Contrôleur |
| agent | agent123 | Agent (MAXI-AGRO) |
| agent_log | log123 | Agent (Logistique) |

Les mots de passe sont stockés **hachés** (SHA-256), jamais en clair.

---

## 🔒 Sécurité — à renforcer (important)

La sync fonctionne, mais la base est actuellement en **règles ouvertes** (héritées
de l'app MAXI-AGRO d'origine) : techniquement, quelqu'un qui connaît l'URL de la
base peut lire/écrire les données. Pour un usage en production, fais ces 2 choses :

1. **Change les mots de passe par défaut tout de suite** (Portail → Utilisateurs →
   modifier chaque compte). Choisis des mots de passe **forts** (≥ 12 caractères).
2. **Restreindre l'accès à la base** quand tu peux (console Firebase → Realtime
   Database → Règles). Idéalement, activer l'authentification Firebase puis exiger
   `auth != null`. Je peux t'accompagner pour cette étape.

> Tant que ce durcissement n'est pas fait, considère les données comme « privées
> mais non chiffrées » — adapté à un déploiement interne, à sécuriser pour un usage
> ouvert au public.

## Pointer vers un autre projet Firebase (optionnel)
Renseigne les variables `VITE_FIREBASE_*` dans Netlify (Site settings →
Environment variables) : elles **surchargent** la config par défaut. Voir
`.env.example`.

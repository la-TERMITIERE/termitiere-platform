# Runbook de mise en production — La Termitière (Supabase)

État au moment de l'écriture : socle Firebase Hosting + Supabase opérationnel (site de test
https://termitiere-test.web.app). Données migrées (605/605). Il reste à **verrouiller la
sécurité** puis **basculer proprement**. Ce document liste TOUT, dans l'ordre.

---

## A. Sécurité (OBLIGATOIRE avant d'ouvrir aux utilisateurs)
> Pourquoi toi et pas l'assistant : la clé `service_role` donne un accès TOTAL à la base.
> Par principe de sécurité, elle ne doit JAMAIS être partagée — tu lances donc ces 2 étapes.

1. Récupérer la clé : Supabase → **Settings → API → `service_role`** (la copier).
2. Créer les comptes Supabase Auth (dans `migration/supabase/`) :
   ```powershell
   $env:SUPABASE_URL="https://qwfomwfzwhpdnmozxdrm.supabase.co"
   $env:SUPABASE_SERVICE_KEY="<clé service_role>"
   node auth-migrate.mjs
   ```
   → crée 1 compte par utilisateur, mot de passe **temporaire = identifiant** (à changer).
3. Fermer la base au public : Supabase → **SQL Editor** → coller `secure-auth.sql` → **Run**.
4. Prévenir l'assistant (« c'est fait ») → il **bascule le code en Supabase Auth + redéploie**.

## B. Sauvegardes
- Manuel (gratuit) : `npm run backup` dans `migration/supabase/` (copie horodatée dans `migration/backups/`).
- Automatique (recommandé en prod) : **plan Supabase Pro ~25 $/mois** (sauvegardes quotidiennes).

## C. Gouvernance (tes clics — accès au compte)
- Activer la **2FA** sur `support@latermitiere.com`.
- Ajouter un **2ᵉ propriétaire** : Supabase → Settings → Team ; idem côté hébergement.
- Conserver le **mot de passe base** Supabase en lieu sûr.
- (Plus tard) mettre l'entreprise propriétaire de l'**hébergement** (aujourd'hui sous leeknoxalfred@gmail.com).

## D. Bascule (jour J)
1. Dernière re-synchro Firebase → Supabase : `node run-migration.mjs` (idempotent).
2. Vérifier le site de prod sur Supabase.
3. **Geler l'ancienne version Firebase** (ne plus l'utiliser) → une seule source de vérité.
4. Diffuser l'URL aux utilisateurs (idéalement le domaine `app.latermitiere.com`).

## E. Coûts — décision actée
- **Lancement : 0 € (gratuit).** Hébergement, base, sécurité, sauvegardes manuelles = gratuits.
- **Optionnel ensuite : Supabase Pro ~25 $/mois** (sauvegardes auto) + **domaine ~12 $/an**.

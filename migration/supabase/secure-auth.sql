-- Sécurisation PRODUCTION : ferme la base au public, n'autorise que les
-- utilisateurs CONNECTÉS via Supabase Auth. (Remplace les politiques de test.)
--
-- À exécuter APRÈS la création des comptes Supabase Auth (script auth-migrate.mjs).
--
-- Modèle :
--   * profiles : lie chaque compte Auth (uid) à son login + rôle.
--   * tp_*     : RLS activée ; accès réservé aux utilisateurs authentifiés.
--               (Affinage par rôle possible ensuite via la fonction app_role().)

-- 1) Table de profils (uid Auth -> login + rôle)
create table if not exists profiles (
  uid uuid primary key references auth.users(id) on delete cascade,
  login text unique not null,
  role text not null default 'agent'
);
alter table profiles enable row level security;
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select to authenticated using (true);

-- 2) Rôle du demandeur courant (depuis son profil)
create or replace function app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from profiles where uid = auth.uid()
$$;

-- 3) Fermer toutes les tables tp_* : accès réservé aux comptes authentifiés
do $$
declare t text;
begin
  for t in select tablename from pg_tables
           where schemaname='public' and tablename like 'tp\_%'
  loop
    execute format('alter table public.%I enable row level security;', t);
    -- on retire les politiques de TEST (ouvertes au public anon)
    execute format('drop policy if exists %I on public.%I;', t||'_test_all', t);
    -- accès uniquement aux utilisateurs connectés (Supabase Auth)
    execute format('drop policy if exists %I on public.%I;', t||'_auth_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t||'_auth_all', t
    );
    -- couper l''accès direct du rôle public/anon
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant all on public.%I to authenticated;', t);
  end loop;
end $$;

-- NB : « using (true) » = tout utilisateur CONNECTÉ accède (déjà bien mieux que
-- l''accès public anonyme). Pour un cloisonnement fin par rôle/secteur, on
-- remplacera ensuite par des conditions basées sur app_role().

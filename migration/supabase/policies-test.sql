-- Politiques d'accès pour l'ENVIRONNEMENT DE TEST.
-- Permet au client web (clé anon) de lire/écrire les tables tp_* via Supabase.
-- ⚠️ Permissif (using true) : convient à un environnement de TEST.
--    Pour la production, on remplacera par des règles fines (par rôle, via Supabase Auth).
--
-- À exécuter dans Supabase → SQL Editor → New query → Run.

grant usage on schema public to anon, authenticated;

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename like 'tp\_%'
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_test_all', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true);',
      t || '_test_all', t
    );
    execute format('grant all on public.%I to anon, authenticated;', t);
  end loop;
end $$;

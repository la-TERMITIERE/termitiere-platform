-- VÉRIFICATION DE LA MIGRATION — lecture seule, aucun risque.
-- Compare le nombre de lignes réellement en base avec l'effectif attendu.
-- Colle ce bloc entier dans Supabase Studio → SQL Editor → Run.

with attendu(table_name, attendu) as (values
  ('tp_agro_demandes', 28),
  ('tp_agro_factures', 21),
  ('tp_agro_inventaires', 44),
  ('tp_agro_partenaires', 3),
  ('tp_agro_referentiel', 59),
  ('tp_agro_sante', 43),
  ('tp_agro_vaccins', 16),
  ('tp_audit_global', 1571),
  ('tp_depense_depenses', 4),
  ('tp_evenementiel_clients', 8),
  ('tp_evenementiel_demandes', 9),
  ('tp_evenementiel_evenements', 1),
  ('tp_evenementiel_factures', 8),
  ('tp_evenementiel_inventaires', 11),
  ('tp_evenementiel_partenaires', 1),
  ('tp_evenementiel_productions', 25),
  ('tp_evenementiel_referentiel', 13),
  ('tp_evenementiel_transferts', 81),
  ('tp_evenementiel_ventes', 9),
  ('tp_foncier_dossiers', 11),
  ('tp_foncier_partenaires', 1),
  ('tp_foncier_pieces', 1),
  ('tp_garderie_checklist_items', 7),
  ('tp_garderie_enfants', 8),
  ('tp_garderie_incidents', 7),
  ('tp_garderie_journaliers', 3),
  ('tp_garderie_menus', 3),
  ('tp_garderie_nutrition', 8),
  ('tp_garderie_paiements', 12),
  ('tp_garderie_params', 1),
  ('tp_garderie_personnel', 4),
  ('tp_garderie_presences', 53),
  ('tp_garderie_repas', 13),
  ('tp_garderie_routine_items', 8),
  ('tp_garderie_taches', 1),
  ('tp_logistique_clients', 70),
  ('tp_logistique_demandes', 18),
  ('tp_logistique_factures', 17),
  ('tp_logistique_inventaires', 11),
  ('tp_logistique_partenaires', 1),
  ('tp_logistique_prestations', 20),
  ('tp_logistique_referentiel', 34),
  ('tp_logistique_retours', 13),
  ('tp_notifications', 759),
  ('tp_projet_alertes_dashboard_fermees', 4),
  ('tp_projet_alertes_fermees', 1),
  ('tp_projet_alertes_notif', 9),
  ('tp_projet_depenses', 25),
  ('tp_projet_depenses_notes', 1),
  ('tp_projet_dernieres_vues', 78),
  ('tp_projet_params', 1),
  ('tp_projet_taches', 29),
  ('tp_projets', 21),
  ('tp_push_subs', 7),
  ('tp_users', 25),
  ('tp_users_secret', 6),
  ('legacy_maxiagro', 9)
),
reel as (
  select c.relname::text as table_name, c.reltuples,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as reel
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (c.relname like 'tp\_%' or c.relname = 'legacy_maxiagro')
)
select
  a.table_name                                   as "table",
  a.attendu                                      as "attendu",
  coalesce(r.reel, 0)                            as "en base",
  case
    when r.reel is null            then '❌ TABLE ABSENTE'
    when r.reel = a.attendu        then '✅ OK'
    when r.reel < a.attendu        then '❌ MANQUE ' || (a.attendu - r.reel)::text
    else                                'ℹ️ +' || (r.reel - a.attendu)::text || ' (ajoutés depuis l''export)'
  end                                            as "statut"
from attendu a
left join reel r on r.table_name = a.table_name
order by
  case when r.reel is null or r.reel <> a.attendu then 0 else 1 end,  -- anomalies en premier
  a.table_name;

-- ── VERDICT GÉNÉRAL ────────────────────────────────────────────────────────
-- Le test qui compte est « aucune table en dessous de l'attendu ».
-- Un SURPLUS n'est PAS une perte : ce sont des enregistrements créés dans
-- l'application depuis l'export (journal d'audit, notifications…).
with attendu(table_name, attendu) as (values
  ('tp_agro_demandes', 28),
  ('tp_agro_factures', 21),
  ('tp_agro_inventaires', 44),
  ('tp_agro_partenaires', 3),
  ('tp_agro_referentiel', 59),
  ('tp_agro_sante', 43),
  ('tp_agro_vaccins', 16),
  ('tp_audit_global', 1571),
  ('tp_depense_depenses', 4),
  ('tp_evenementiel_clients', 8),
  ('tp_evenementiel_demandes', 9),
  ('tp_evenementiel_evenements', 1),
  ('tp_evenementiel_factures', 8),
  ('tp_evenementiel_inventaires', 11),
  ('tp_evenementiel_partenaires', 1),
  ('tp_evenementiel_productions', 25),
  ('tp_evenementiel_referentiel', 13),
  ('tp_evenementiel_transferts', 81),
  ('tp_evenementiel_ventes', 9),
  ('tp_foncier_dossiers', 11),
  ('tp_foncier_partenaires', 1),
  ('tp_foncier_pieces', 1),
  ('tp_garderie_checklist_items', 7),
  ('tp_garderie_enfants', 8),
  ('tp_garderie_incidents', 7),
  ('tp_garderie_journaliers', 3),
  ('tp_garderie_menus', 3),
  ('tp_garderie_nutrition', 8),
  ('tp_garderie_paiements', 12),
  ('tp_garderie_params', 1),
  ('tp_garderie_personnel', 4),
  ('tp_garderie_presences', 53),
  ('tp_garderie_repas', 13),
  ('tp_garderie_routine_items', 8),
  ('tp_garderie_taches', 1),
  ('tp_logistique_clients', 70),
  ('tp_logistique_demandes', 18),
  ('tp_logistique_factures', 17),
  ('tp_logistique_inventaires', 11),
  ('tp_logistique_partenaires', 1),
  ('tp_logistique_prestations', 20),
  ('tp_logistique_referentiel', 34),
  ('tp_logistique_retours', 13),
  ('tp_notifications', 759),
  ('tp_projet_alertes_dashboard_fermees', 4),
  ('tp_projet_alertes_fermees', 1),
  ('tp_projet_alertes_notif', 9),
  ('tp_projet_depenses', 25),
  ('tp_projet_depenses_notes', 1),
  ('tp_projet_dernieres_vues', 78),
  ('tp_projet_params', 1),
  ('tp_projet_taches', 29),
  ('tp_projets', 21),
  ('tp_push_subs', 7),
  ('tp_users', 25),
  ('tp_users_secret', 6),
  ('legacy_maxiagro', 9)
),
reel as (
  select c.relname::text as table_name,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint as reel
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname='public' and c.relkind='r' and (c.relname like 'tp\_%' or c.relname='legacy_maxiagro')
),
j as (select a.table_name, a.attendu, coalesce(r.reel, 0) as reel, (r.reel is null) as absente
      from attendu a left join reel r on r.table_name = a.table_name)
select
  3255                                                   as "total attendu",
  (select sum(reel) from j)                                  as "total en base",
  (select count(*) from j where absente or reel < attendu)    as "tables incompletes",
  (select coalesce(sum(attendu - reel), 0) from j where reel < attendu) as "enregistrements manquants",
  (select coalesce(sum(reel - attendu), 0) from j where reel > attendu) as "ajoutes depuis l'export",
  case
    when (select count(*) from j where absente) > 0
      then '❌ TABLE(S) ABSENTE(S) — voir le 1er résultat'
    when (select count(*) from j where reel < attendu) > 0
      then '❌ DONNÉES MANQUANTES — voir le 1er résultat (lignes ❌ en haut)'
    when (select sum(reel) from j) > 3255
      then '✅ AUCUNE PERTE — toutes les tables sont complètes (le surplus = activité de l''app depuis l''export)'
    else '✅ MIGRATION COMPLÈTE — comptes exactement identiques'
  end                                                        as "verdict";

-- Schema PostgreSQL / Supabase - Plateforme La Termitiere
-- Genere depuis l'export Firebase (namespace tp/). 1 table par collection.
-- Strategie sans perte : id + data JSONB (structure exacte preservee) + created_at.

-- collection "agro_demandes" (16 enregistrements)
create table if not exists tp_agro_demandes (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_agro_demandes_data on tp_agro_demandes using gin (data);

-- collection "agro_factures" (12 enregistrements)
create table if not exists tp_agro_factures (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_agro_factures_data on tp_agro_factures using gin (data);

-- collection "agro_inventaires" (13 enregistrements)
create table if not exists tp_agro_inventaires (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_agro_inventaires_data on tp_agro_inventaires using gin (data);

-- collection "agro_referentiel" (57 enregistrements)
create table if not exists tp_agro_referentiel (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_agro_referentiel_data on tp_agro_referentiel using gin (data);

-- collection "agro_sante" (16 enregistrements)
create table if not exists tp_agro_sante (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_agro_sante_data on tp_agro_sante using gin (data);

-- collection "agro_vaccins" (16 enregistrements)
create table if not exists tp_agro_vaccins (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_agro_vaccins_data on tp_agro_vaccins using gin (data);

-- collection "audit_global" (335 enregistrements)
create table if not exists tp_audit_global (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_audit_global_data on tp_audit_global using gin (data);

-- collection "evenementiel_clients" (1 enregistrements)
create table if not exists tp_evenementiel_clients (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_evenementiel_clients_data on tp_evenementiel_clients using gin (data);

-- collection "evenementiel_demandes" (3 enregistrements)
create table if not exists tp_evenementiel_demandes (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_evenementiel_demandes_data on tp_evenementiel_demandes using gin (data);

-- collection "evenementiel_evenements" (1 enregistrements)
create table if not exists tp_evenementiel_evenements (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_evenementiel_evenements_data on tp_evenementiel_evenements using gin (data);

-- collection "evenementiel_inventaires" (2 enregistrements)
create table if not exists tp_evenementiel_inventaires (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_evenementiel_inventaires_data on tp_evenementiel_inventaires using gin (data);

-- collection "evenementiel_productions" (2 enregistrements)
create table if not exists tp_evenementiel_productions (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_evenementiel_productions_data on tp_evenementiel_productions using gin (data);

-- collection "evenementiel_referentiel" (12 enregistrements)
create table if not exists tp_evenementiel_referentiel (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_evenementiel_referentiel_data on tp_evenementiel_referentiel using gin (data);

-- collection "evenementiel_transferts" (21 enregistrements)
create table if not exists tp_evenementiel_transferts (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_evenementiel_transferts_data on tp_evenementiel_transferts using gin (data);

-- collection "evenementiel_ventes" (3 enregistrements)
create table if not exists tp_evenementiel_ventes (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_evenementiel_ventes_data on tp_evenementiel_ventes using gin (data);

-- collection "foncier_dossiers" (1 enregistrements)
create table if not exists tp_foncier_dossiers (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_foncier_dossiers_data on tp_foncier_dossiers using gin (data);

-- collection "logistique_clients" (2 enregistrements)
create table if not exists tp_logistique_clients (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_logistique_clients_data on tp_logistique_clients using gin (data);

-- collection "logistique_demandes" (1 enregistrements)
create table if not exists tp_logistique_demandes (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_logistique_demandes_data on tp_logistique_demandes using gin (data);

-- collection "logistique_factures" (2 enregistrements)
create table if not exists tp_logistique_factures (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_logistique_factures_data on tp_logistique_factures using gin (data);

-- collection "logistique_inventaires" (1 enregistrements)
create table if not exists tp_logistique_inventaires (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_logistique_inventaires_data on tp_logistique_inventaires using gin (data);

-- collection "logistique_prestations" (2 enregistrements)
create table if not exists tp_logistique_prestations (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_logistique_prestations_data on tp_logistique_prestations using gin (data);

-- collection "logistique_referentiel" (11 enregistrements)
create table if not exists tp_logistique_referentiel (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_logistique_referentiel_data on tp_logistique_referentiel using gin (data);

-- collection "logistique_retours" (2 enregistrements)
create table if not exists tp_logistique_retours (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_logistique_retours_data on tp_logistique_retours using gin (data);

-- collection "notifications" (53 enregistrements)
create table if not exists tp_notifications (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_notifications_data on tp_notifications using gin (data);

-- collection "push_subs" (7 enregistrements)
create table if not exists tp_push_subs (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_push_subs_data on tp_push_subs using gin (data);

-- collection "users" (13 enregistrements)
create table if not exists tp_users (
  id text primary key,
  data jsonb not null,
  created_at timestamptz
);
create index if not exists idx_tp_users_data on tp_users using gin (data);

-- Donnees heritees de l ancienne application (preservees integralement)
create table if not exists legacy_maxiagro (
  node text primary key,
  data jsonb not null
);

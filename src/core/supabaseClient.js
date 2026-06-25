// Client Supabase PARTAGÉ (couche données ET authentification), afin que la session
// Auth s'applique aussi aux requêtes de données (RLS). Actif uniquement quand l'app
// est construite pour la cible PostgreSQL/Supabase (VITE_USE_SUPABASE=true) — ex.
// déploiement auto-hébergé chez le prestataire (Supabase self-hosted dans Docker).
//
// Variables (build) : VITE_SUPABASE_URL (ex. https://api.latermitiere.com)
//                     VITE_SUPABASE_ANON_KEY (clé anon du Supabase self-hosted)
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = (url && key)
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

// Les comptes reposent sur l'identifiant (login), pas sur un e-mail réel.
// On reconstruit un e-mail synthétique déterministe (identique à la migration Auth).
export const loginToEmail = (login) =>
  `${String(login || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_')}@latermitiere.local`

// Aiguillage de la couche de données (backend interchangeable, même API publique).
//
//   - PRODUCTION (défaut)                    → Firebase Realtime Database (db.firebase.js)
//   - Cible auto-hébergée (VITE_USE_SUPABASE=true) → PostgreSQL / Supabase (db.supabase.js)
//
// Aucun autre fichier de l'app n'a besoin de savoir quel backend est utilisé. Les
// garde-fous (sanitize, rateLimit) sont appliqués dans chaque implémentation.
import * as firebaseImpl from './db.firebase'
import * as supabaseImpl from './db.supabase'

const useSupabase = import.meta.env.VITE_USE_SUPABASE === 'true'
const impl = useSupabase ? supabaseImpl : firebaseImpl

if (useSupabase) console.info('[db] Backend de données : PostgreSQL / Supabase (auto-hébergé)')

export const subscribeCollection = impl.subscribeCollection
export const getAll = impl.getAll
export const getOne = impl.getOne
export const addItem = impl.addItem
export const setItem = impl.setItem
export const updateItem = impl.updateItem
export const removeItem = impl.removeItem
export const ts = impl.ts

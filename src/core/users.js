// Gestion globale des utilisateurs de la plateforme (store Zustand).
// Les droits d'accès aux modules sont GLOBAUX (non liés à un module) :
// la gestion se fait depuis le portail (Accueil), réservée à l'administrateur.
//
// Mode DÉMO   → liste persistée dans localStorage (termitiere_demo_users).
// Mode Firebase → collection `users` (profils). La création d'un compte Auth
//   réel se fait via la console Firebase ; ici on gère les profils/droits.
import { create } from 'zustand'
import { isFirebaseConfigured } from './firebase'
import { DEFAULT_USERS } from './auth'
import { getAll, setItem, removeItem } from './db'

const KEY = 'termitiere_demo_users'

function loadDemo() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  localStorage.setItem(KEY, JSON.stringify(DEFAULT_USERS))
  return DEFAULT_USERS
}
const persistDemo = (list) => localStorage.setItem(KEY, JSON.stringify(list))

export const useUsersStore = create((set, get) => ({
  users: [],
  loading: true,

  // Charge la liste des utilisateurs selon le mode.
  load: async () => {
    set({ loading: true })
    if (!isFirebaseConfigured) {
      set({ users: loadDemo(), loading: false })
      return
    }
    try {
      const rows = await getAll('users')
      set({ users: rows.length ? rows : DEFAULT_USERS, loading: false })
    } catch (e) {
      set({ users: [], loading: false })
    }
  },

  // Crée ou met à jour un utilisateur (clé = login en démo, uid/login en Firebase).
  saveUser: async (u) => {
    if (!isFirebaseConfigured) {
      const list = [...get().users]
      const idx = list.findIndex((x) => x.login === u.login)
      if (idx >= 0) list[idx] = { ...list[idx], ...u }
      else list.push(u)
      persistDemo(list)
      set({ users: list })
      return
    }
    const id = u.uid || u.id || u.login
    await setItem('users', id, { ...u, uid: id })
    await get().load()
  },

  removeUser: async (u) => {
    if (!isFirebaseConfigured) {
      const list = get().users.filter((x) => x.login !== u.login)
      persistDemo(list)
      set({ users: list })
      return
    }
    await removeItem('users', u.uid || u.id || u.login)
    await get().load()
  }
}))

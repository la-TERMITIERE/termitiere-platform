// Store d'authentification global (Zustand).
// Deux modes :
//  1. Firebase configuré → Firebase Auth (email synthétique login@termitiere.internal)
//     + profil complet dans la collection users/{uid}.
//  2. Mode DÉMO (pas de .env Firebase) → auth locale contre DEFAULT_USERS,
//     session persistée dans localStorage. Permet à l'app de tourner sans backend.
import { create } from 'zustand'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from './firebase'

// Domaine interne utilisé pour fabriquer un email à partir d'un identifiant.
export const INTERNAL_DOMAIN = 'termitiere.internal'
export const loginToEmail = (login) => `${login}@${INTERNAL_DOMAIN}`

// Comptes par défaut (premier lancement / mode démo)
export const DEFAULT_USERS = [
  { login: 'admin', pass: 'admin123', nom: 'Administrateur', role: 'admin', modules: ['agro', 'logistique', 'evenementiel', 'rh'], secteur: 'Direction', actif: true },
  { login: 'controleur', pass: 'ctrl123', nom: 'Contrôleur', role: 'controleur', modules: ['agro', 'logistique'], secteur: 'Contrôle', actif: true },
  { login: 'agent', pass: 'agent123', nom: 'Agent Edah Josué', role: 'agent', modules: ['agro'], secteur: 'Élevage', actif: true },
  { login: 'agent_log', pass: 'log123', nom: 'Agent Logistique', role: 'agent', modules: ['logistique'], secteur: 'Transport', actif: true }
]

const DEMO_SESSION_KEY = 'termitiere_demo_session'
const DEMO_USERS_KEY = 'termitiere_demo_users'

function loadDemoUsers() {
  try {
    const raw = localStorage.getItem(DEMO_USERS_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(DEFAULT_USERS))
  return DEFAULT_USERS
}

export const useAuthStore = create((set, get) => ({
  user: null, // { uid, login, nom, role, modules, secteur, actif }
  role: null,
  modules: [],
  isLoading: false,
  ready: false, // true une fois l'état initial déterminé
  error: null,

  // Démarre l'écoute de l'état d'authentification (appelé une fois au boot).
  init: () => {
    if (!isFirebaseConfigured) {
      // Mode démo : restaurer la session locale si présente
      try {
        const raw = localStorage.getItem(DEMO_SESSION_KEY)
        if (raw) {
          const u = JSON.parse(raw)
          set({ user: u, role: u.role, modules: u.modules || [], ready: true })
          return () => {}
        }
      } catch (e) { /* ignore */ }
      set({ ready: true })
      return () => {}
    }

    // Mode Firebase
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const snap = await getDoc(doc(db, 'users', fbUser.uid))
          const profile = snap.exists() ? snap.data() : {}
          const u = {
            uid: fbUser.uid,
            login: profile.login || fbUser.email?.split('@')[0],
            nom: profile.nom || 'Utilisateur',
            role: profile.role || 'agent',
            modules: profile.modules || [],
            secteur: profile.secteur || '',
            actif: profile.actif !== false
          }
          set({ user: u, role: u.role, modules: u.modules, ready: true })
        } catch (e) {
          set({ error: e.message, ready: true })
        }
      } else {
        set({ user: null, role: null, modules: [], ready: true })
      }
    })
    return unsub
  },

  // Connexion par identifiant + mot de passe.
  login: async (loginId, pass) => {
    set({ isLoading: true, error: null })
    const id = (loginId || '').trim()
    if (!id || !pass) {
      set({ isLoading: false, error: 'Remplissez les deux champs' })
      return false
    }

    // ── Mode DÉMO ──
    if (!isFirebaseConfigured) {
      const users = loadDemoUsers()
      const found = users.find((u) => u.login === id && u.pass === pass)
      if (!found) {
        set({ isLoading: false, error: 'Identifiant ou mot de passe incorrect' })
        return false
      }
      if (found.actif === false) {
        set({ isLoading: false, error: 'Compte désactivé' })
        return false
      }
      const u = {
        uid: 'demo_' + found.login,
        login: found.login,
        nom: found.nom,
        role: found.role,
        modules: found.modules || [],
        secteur: found.secteur || '',
        actif: true
      }
      localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(u))
      set({ user: u, role: u.role, modules: u.modules, isLoading: false })
      return true
    }

    // ── Mode Firebase ──
    try {
      const cred = await signInWithEmailAndPassword(auth, loginToEmail(id), pass)
      // Met à jour lastLogin (best effort)
      try {
        await setDoc(
          doc(db, 'users', cred.user.uid),
          { lastLogin: serverTimestamp() },
          { merge: true }
        )
      } catch (e) { /* règles peuvent bloquer, non critique */ }
      set({ isLoading: false })
      return true // onAuthStateChanged remplit le profil
    } catch (e) {
      let msg = 'Identifiant ou mot de passe incorrect'
      if (e.code === 'auth/too-many-requests') msg = 'Trop de tentatives — réessayez plus tard'
      if (e.code === 'auth/network-request-failed') msg = 'Pas de connexion réseau'
      set({ isLoading: false, error: msg })
      return false
    }
  },

  logout: async () => {
    if (!isFirebaseConfigured) {
      localStorage.removeItem(DEMO_SESSION_KEY)
      set({ user: null, role: null, modules: [] })
      return
    }
    try { await signOut(auth) } catch (e) { /* ignore */ }
    set({ user: null, role: null, modules: [] })
  },

  // Helpers de contrôle d'accès
  hasModule: (mod) => {
    const { role, modules } = get()
    if (role === 'admin') return true
    return (modules || []).includes(mod)
  },
  isAdmin: () => get().role === 'admin',
  canManage: () => ['admin', 'controleur'].includes(get().role),

  clearError: () => set({ error: null })
}))

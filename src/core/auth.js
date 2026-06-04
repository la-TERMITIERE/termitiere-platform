// Store d'authentification global (Zustand).
//
// Deux modes :
//  1. Base cloud configurée (Realtime Database) → authentification APPLICATIVE :
//     les comptes vivent dans la collection `users` (synchronisée en temps réel
//     entre tous les appareils), les mots de passe sont stockés HACHÉS (SHA-256).
//     L'administrateur gère les comptes/droits depuis le portail → propagation
//     immédiate partout. La session reste locale à chaque appareil.
//  2. Mode DÉMO (aucune base) → auth locale contre DEFAULT_USERS (localStorage).
import { create } from 'zustand'
import { isFirebaseConfigured } from './firebase'
import { getAll, getOne, setItem, addItem } from './db'

// Comptes par défaut (amorçage au premier lancement / mode démo)
export const DEFAULT_USERS = [
  { login: 'admin', pass: 'admin123', nom: 'Administrateur', role: 'admin', modules: ['agro', 'logistique', 'evenementiel', 'rh'], secteur: 'Direction', actif: true },
  { login: 'controleur', pass: 'ctrl123', nom: 'Contrôleur', role: 'controleur', modules: ['agro', 'logistique'], secteur: 'Contrôle', actif: true },
  { login: 'agent', pass: 'agent123', nom: 'Agent Edah Josué', role: 'agent', modules: ['agro'], secteur: 'Élevage', actif: true },
  { login: 'agent_log', pass: 'log123', nom: 'Agent Logistique', role: 'agent', modules: ['logistique'], secteur: 'Transport', actif: true }
]

const DEMO_SESSION_KEY = 'termitiere_demo_session'
const DEMO_USERS_KEY = 'termitiere_demo_users'

// Hachage SHA-256 (avec sel) du mot de passe — évite tout stockage en clair.
export async function hashPassword(pass) {
  const data = new TextEncoder().encode(`termitiere::${pass}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function loadDemoUsers() {
  try {
    const raw = localStorage.getItem(DEMO_USERS_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(DEFAULT_USERS))
  return DEFAULT_USERS
}

// Amorce les comptes par défaut dans la base cloud si la collection est vide.
// Idempotent (clé = login). Renvoie la liste des utilisateurs après amorçage.
let _seeding = null
async function ensureSeed() {
  if (_seeding) return _seeding
  _seeding = (async () => {
    const existing = await getAll('users')
    if (existing.length > 0) return existing
    await Promise.all(
      DEFAULT_USERS.map(async (u) =>
        setItem('users', u.login, {
          uid: u.login,
          login: u.login,
          nom: u.nom,
          role: u.role,
          modules: u.modules,
          secteur: u.secteur,
          actif: true,
          passHash: await hashPassword(u.pass)
        })
      )
    )
    return getAll('users')
  })()
  try { return await _seeding } finally { _seeding = null }
}

function sessionFromProfile(p) {
  return {
    uid: p.uid || p.login,
    login: p.login,
    nom: p.nom || 'Utilisateur',
    role: p.role || 'agent',
    modules: p.role === 'admin' ? ['agro', 'logistique', 'evenementiel', 'rh'] : (p.modules || []),
    secteur: p.secteur || '',
    actif: p.actif !== false
  }
}

export const useAuthStore = create((set, get) => ({
  user: null,
  role: null,
  modules: [],
  isLoading: false,
  ready: false,
  error: null,

  // Restaure la session locale (par appareil) et amorce les comptes si besoin.
  init: () => {
    if (isFirebaseConfigured) {
      // Amorçage des comptes par défaut en tâche de fond (premier déploiement).
      ensureSeed().catch((e) => console.warn('[auth] amorçage :', e?.message))
    }
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
  },

  // Connexion par identifiant + mot de passe.
  login: async (loginId, pass) => {
    set({ isLoading: true, error: null })
    const id = (loginId || '').trim()
    if (!id || !pass) {
      set({ isLoading: false, error: 'Remplissez les deux champs' })
      return false
    }

    // ── Mode DÉMO (aucune base) ──
    if (!isFirebaseConfigured) {
      const users = loadDemoUsers()
      const found = users.find((u) => u.login === id && u.pass === pass)
      if (!found) { set({ isLoading: false, error: 'Identifiant ou mot de passe incorrect' }); return false }
      if (found.actif === false) { set({ isLoading: false, error: 'Compte désactivé' }); return false }
      const u = sessionFromProfile(found)
      localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(u))
      set({ user: u, role: u.role, modules: u.modules, isLoading: false })
      return true
    }

    // ── Mode cloud (Realtime Database) ──
    try {
      let profile = await getOne('users', id)
      if (!profile) {
        // Collection vide au tout premier login → amorçage puis nouvel essai.
        await ensureSeed()
        profile = await getOne('users', id)
      }
      if (!profile) { set({ isLoading: false, error: 'Identifiant ou mot de passe incorrect' }); return false }
      if (profile.actif === false) { set({ isLoading: false, error: 'Compte désactivé par l\'administrateur' }); return false }
      const hash = await hashPassword(pass)
      if (profile.passHash !== hash) {
        set({ isLoading: false, error: 'Identifiant ou mot de passe incorrect' })
        return false
      }
      const u = sessionFromProfile(profile)
      localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(u))
      set({ user: u, role: u.role, modules: u.modules, isLoading: false })
      // Trace de dernière connexion + entrée au journal d'activité (non bloquant).
      setItem('users', id, { lastLogin: Date.now() }).catch(() => {})
      addItem('audit_global', {
        userId: u.uid, userNom: u.nom, module: 'portail',
        action: 'CONNEXION', details: '', timestamp: Date.now()
      }).catch(() => {})
      return true
    } catch (e) {
      set({ isLoading: false, error: 'Connexion impossible — vérifiez le réseau' })
      return false
    }
  },

  logout: async () => {
    localStorage.removeItem(DEMO_SESSION_KEY)
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

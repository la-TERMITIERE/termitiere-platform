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
import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  signOut as fbSignOut
} from 'firebase/auth'
import { isFirebaseConfigured, auth, loginToEmail } from './firebase'
import { getAll, getOne, setItem, addItem } from './db'
import { isFullAccessRole, isViewAllRole, isApproverRole, isCertifierRole } from './roles'
import { supabase, loginToEmail as loginToEmailSupabase } from './supabaseClient'

// Cible auto-hébergée : authentification via Supabase Auth (identités réelles + RLS).
const USE_SUPABASE_AUTH = import.meta.env.VITE_USE_SUPABASE === 'true'

// Liste de référence de tous les modules de la plateforme.
const ALL_MODULES = ['agro', 'logistique', 'evenementiel', 'foncier', 'rh']

// Recherche un profil par son identifiant de connexion (champ `login`).
// Robuste aux identifiants contenant des caractères interdits comme clé RTDB.
async function findByLogin(login) {
  const rows = await getAll('users')
  return rows.find((u) => u.login === login) || null
}

// Comptes par défaut (amorçage au premier lancement / mode démo).
// ⚠️ Ces mots de passe ne servent qu'à amorcer une base VIDE (premier
// déploiement) ou le mode démo local — ils doivent être changés immédiatement
// depuis Utilisateurs / Mon compte une fois le premier accès obtenu.
export const DEFAULT_USERS = [
  { login: 'superadmin', pass: 'Sup3r-Adm1n-2026!', nom: 'Super-administrateur', role: 'super_admin', modules: ALL_MODULES, secteur: 'Conception', actif: true },
  { login: 'pau', pass: 'Pau-Direction-2026!', nom: 'PAU', role: 'pau', modules: ALL_MODULES, secteur: 'Direction', actif: true },
  { login: 'ge', pass: 'Ge-Executif-2026!', nom: 'Gérante exécutive', role: 'ge', modules: ALL_MODULES, secteur: 'Direction exécutive', actif: true },
  { login: 'superviseur', pass: 'Superviseur-2026!', nom: 'Superviseur', role: 'superviseur', modules: ALL_MODULES, secteur: 'Supervision', actif: true },
  { login: 'admin', pass: 'Admin-Termitiere-2026!', nom: 'Administrateur', role: 'admin', modules: ALL_MODULES, secteur: 'Direction', actif: true },
  { login: 'gerant', pass: 'Gerant-2026!', nom: 'Gérant', role: 'gerant', modules: ['agro', 'logistique', 'evenementiel', 'foncier'], secteur: 'Gérance', actif: true },
  { login: 'controleur', pass: 'Controleur-2026!', nom: 'Contrôleur', role: 'controleur', modules: ['agro', 'logistique', 'evenementiel', 'foncier'], secteur: 'Contrôle', actif: true },
  { login: 'agent', pass: 'Agent-Elevage-2026!', nom: 'Agent Edah Josué', role: 'agent', modules: ['agro'], secteur: 'Élevage', actif: true },
  { login: 'agent_log', pass: 'Agent-Log-2026!', nom: 'Agent Logistique', role: 'agent', modules: ['logistique'], secteur: 'Transport', actif: true },
  { login: 'agent_briq', pass: 'Agent-Briq-2026!', nom: 'Agent Briqueterie', role: 'agent', modules: ['evenementiel'], secteur: 'Briqueterie', actif: true },
  { login: 'agent_foncier', pass: 'Agent-Foncier-2026!', nom: 'Agent Foncier', role: 'agent', modules: ['foncier'], secteur: 'Foncier', actif: true }
]

const DEMO_SESSION_KEY = 'termitiere_demo_session'
const DEMO_USERS_KEY = 'termitiere_demo_users'

const PBKDF2_ITER = 100000

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16)
  return arr
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Sel aléatoire (hex) à générer une fois par utilisateur, stocké à côté du hash.
export function newSalt() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
}

// Hachage salé PBKDF2-SHA256 (100 000 itérations) — remplace l'ancien SHA-256 à
// sel unique global (trop rapide à casser hors-ligne). Le hash + le sel sont
// stockés dans la collection SÉPARÉE `users_secret` (jamais dans `users`, qui
// reste lisible par tout utilisateur connecté pour l'annuaire de l'app).
export async function hashPassword(pass, salt) {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(salt), iterations: PBKDF2_ITER, hash: 'SHA-256' },
    keyMaterial, 256
  )
  return bytesToHex(new Uint8Array(bits))
}

// Ancien schéma (sel unique global) — conservé UNIQUEMENT pour vérifier les
// comptes pas encore migrés vers le hachage salé (repli côté MonCompte.jsx ;
// la migration principale se fait côté serveur, voir netlify/functions/login.js).
export async function legacyHashPassword(pass) {
  const data = new TextEncoder().encode(`termitiere::${pass}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(buf))
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
      DEFAULT_USERS.map(async (u) => {
        const salt = newSalt()
        await setItem('users', u.login, {
          uid: u.login,
          login: u.login,
          nom: u.nom,
          role: u.role,
          modules: u.modules,
          secteur: u.secteur,
          actif: true
        })
        await setItem('users_secret', u.login, { salt, passHash: await hashPassword(u.pass, salt) })
      })
    )
    return getAll('users')
  })()
  try { return await _seeding } finally { _seeding = null }
}

function sessionFromProfile(p) {
  const role = p.role || 'agent'
  return {
    uid: p.uid || p.login,
    login: p.login,
    nom: p.nom || 'Utilisateur',
    role,
    // Les rôles « voit tout » (accès total + superviseur) reçoivent tous les modules.
    modules: isViewAllRole(role) ? ALL_MODULES : (p.modules || []),
    // Droits de saisie par catégorie d'animaux (Maxi-Agro). null = aucune restriction
    // (comptes hérités) ; tableau (même vide) = restriction explicite.
    agroCategories: Array.isArray(p.agroCategories) ? p.agroCategories : null,
    // Sites Maxi Logistique autorisés (Lomé / Kara). null = aucune restriction
    // (comptes hérités = les deux) ; tableau (même vide) = restriction explicite.
    logistiqueSites: Array.isArray(p.logistiqueSites) ? p.logistiqueSites : null,
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
    if (isFirebaseConfigured && !USE_SUPABASE_AUTH) {
      // Amorçage des comptes par défaut en tâche de fond (premier déploiement Firebase).
      ensureSeed().catch((e) => console.warn('[auth] amorçage :', e?.message))
    }
    // Cible auto-hébergée : sans session Supabase valide, on déconnecte (base fermée par RLS).
    if (USE_SUPABASE_AUTH && supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (!data?.session) {
          localStorage.removeItem(DEMO_SESSION_KEY)
          set({ user: null, role: null, modules: [] })
        }
      }).catch(() => {})
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

    // ── Cible AUTO-HÉBERGÉE : authentification Supabase Auth (identités réelles + RLS) ──
    if (USE_SUPABASE_AUTH && supabase) {
      try {
        const email = loginToEmailSupabase(id)
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error || !data?.user) {
          set({ isLoading: false, error: 'Identifiant ou mot de passe incorrect' })
          return false
        }
        // Profil complet depuis tp_users (lecture autorisée car désormais authentifié).
        let profile = await findByLogin(id)
        if (!profile) {
          profile = { login: id, nom: data.user.user_metadata?.nom || id, role: data.user.user_metadata?.role || 'agent', modules: [] }
        }
        if (profile.actif === false) {
          await supabase.auth.signOut()
          set({ isLoading: false, error: 'Compte désactivé par l\'administrateur' })
          return false
        }
        const u = sessionFromProfile(profile)
        localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(u))
        set({ user: u, role: u.role, modules: u.modules, isLoading: false })
        addItem('audit_global', {
          userId: u.uid, userNom: u.nom, module: 'portail', action: 'CONNEXION', details: '', timestamp: Date.now()
        }).catch(() => {})
        return true
      } catch (e) {
        set({ isLoading: false, error: 'Connexion impossible — vérifiez le réseau' })
        return false
      }
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
    // Stratégie « connexion serveur d'abord » :
    //  1) on demande à la fonction serveur netlify/functions/login.js de vérifier
    //     l'identifiant + le mot de passe (le hash ne quitte JAMAIS le navigateur)
    //     et de délivrer un jeton Firebase Auth personnalisé ;
    //  2) tant que cette fonction n'est pas configurée (FIREBASE_SERVICE_ACCOUNT
    //     absent), on retombe sur l'ancien circuit applicatif ci-dessous — utile
    //     le temps de la mise en place, mais qui ne fonctionne QUE si les règles
    //     RTDB autorisent encore la lecture non authentifiée de `users`.
    try {
      const loginRes = await fetch('/.netlify/functions/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: id, pass })
      }).then((r) => r.json()).catch(() => null)

      if (loginRes?.ok && loginRes.token) {
        await signInWithCustomToken(auth, loginRes.token)
        const profile = await findByLogin(id)
        if (!profile) {
          set({ isLoading: false, error: 'Identifiant ou mot de passe incorrect' })
          return false
        }
        const u = sessionFromProfile(profile)
        localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(u))
        set({ user: u, role: u.role, modules: u.modules, isLoading: false })
        setItem('users', profile.uid || profile.id || u.uid, { lastLogin: Date.now() }).catch(() => {})
        addItem('audit_global', {
          userId: u.uid, userNom: u.nom, module: 'portail',
          action: 'CONNEXION', details: '', timestamp: Date.now()
        }).catch(() => {})
        return true
      }
      if (loginRes && loginRes.error !== 'not_configured') {
        set({ isLoading: false, error: loginRes.error || 'Identifiant ou mot de passe incorrect' })
        return false
      }
      // loginRes absent (réseau) ou 'not_configured' → repli sur l'ancien circuit.
    } catch (e) { /* repli sur l'ancien circuit applicatif ci-dessous */ }

    try {
      const email = loginToEmail(id)

      // 1) Tentative d'authentification Firebase.
      let authed = false
      if (auth) {
        try { await signInWithEmailAndPassword(auth, email, pass); authed = true }
        catch (e) { /* non migré / mauvais mdp / provider désactivé → voie applicative */ }
      }

      // 2) Lecture du profil (autorisée si déjà authentifié, ou si règles ouvertes).
      //    Recherche par CHAMP `login` (un identifiant peut contenir des caractères
      //    interdits dans une clé RTDB : e-mail, point…).
      let profile = await findByLogin(id)
      if (!profile && !authed) {
        // Collection vide au tout premier login → amorçage puis nouvel essai.
        await ensureSeed()
        profile = await findByLogin(id)
      }
      if (!profile) {
        if (authed && auth) { try { await fbSignOut(auth) } catch (e) { /* ignore */ } }
        set({ isLoading: false, error: 'Identifiant ou mot de passe incorrect' })
        return false
      }
      if (profile.actif === false) {
        if (authed && auth) { try { await fbSignOut(auth) } catch (e) { /* ignore */ } }
        set({ isLoading: false, error: 'Compte désactivé par l\'administrateur' })
        return false
      }

      // 3) Si pas (encore) authentifié Firebase : on vérifie le mot de passe en
      //    repli — nouveau schéma salé (users_secret) en priorité, ancien schéma
      //    hérité (profile.passHash) sinon. La voie normale passe désormais par
      //    netlify/functions/login.js ci-dessus ; ce repli reste nécessaire tant
      //    que cette fonction n'est pas configurée (FIREBASE_SERVICE_ACCOUNT).
      if (!authed) {
        const secret = await getOne('users_secret', profile.uid || profile.id || id).catch(() => null)
        let ok = false
        if (secret?.salt && secret?.passHash) {
          ok = (await hashPassword(pass, secret.salt)) === secret.passHash
        } else {
          const legacy = secret?.passHash || profile.passHash
          ok = Boolean(legacy) && (await legacyHashPassword(pass)) === legacy
        }
        if (!ok) {
          set({ isLoading: false, error: 'Identifiant ou mot de passe incorrect' })
          return false
        }
        // …puis on crée le compte Firebase Auth pour les prochaines fois (migration).
        if (auth) {
          try { await createUserWithEmailAndPassword(auth, email, pass); authed = true }
          catch (e2) { console.warn('[auth] Firebase Auth — migration différée :', e2?.code || e2?.message) }
        }
      }

      const u = sessionFromProfile(profile)
      localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(u))
      set({ user: u, role: u.role, modules: u.modules, isLoading: false })
      // Trace de dernière connexion + entrée au journal d'activité (non bloquant).
      // On écrit avec la CLÉ technique du profil (jamais l'identifiant brut).
      setItem('users', profile.uid || profile.id || u.uid, { lastLogin: Date.now() }).catch(() => {})
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
    // Ferme aussi la session du service d'auth (sinon le jeton resterait valide
    // après déconnexion → accès possible aux données sous règles verrouillées / RLS).
    if (USE_SUPABASE_AUTH && supabase) { try { await supabase.auth.signOut() } catch (e) { /* ignore */ } }
    if (auth) { try { await fbSignOut(auth) } catch (e) { /* ignore */ } }
    localStorage.removeItem(DEMO_SESSION_KEY)
    set({ user: null, role: null, modules: [] })
  },

  // Met à jour la session locale après modification du profil (nom, etc.).
  updateSession: (patch) => {
    const cur = get().user
    if (!cur) return
    const u = { ...cur, ...patch }
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(u))
    set({ user: u, role: u.role, modules: u.modules || [] })
  },

  // Helpers de contrôle d'accès
  hasModule: (mod) => {
    const { role, modules } = get()
    if (isViewAllRole(role)) return true
    return (modules || []).includes(mod)
  },
  // Accès total : super-admin, PDG, GE (+ admin hérité). Donne droit aux pages
  // Paramètres et à la gestion des utilisateurs.
  isAdmin: () => isFullAccessRole(get().role),
  // Super-admin uniquement (actions techniques sensibles).
  isSuperAdmin: () => get().role === 'super_admin',
  // 1er niveau d'approbation d'une demande de sortie.
  canManage: () => isApproverRole(get().role),
  // 2e niveau : certification définitive (déclenche l'effet métier).
  canCertify: () => isCertifierRole(get().role),

  clearError: () => set({ error: null })
}))

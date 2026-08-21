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
  onAuthStateChanged,
  signOut as fbSignOut
} from 'firebase/auth'
import { isFirebaseConfigured, auth, loginToEmail } from './firebase'
import { getAll, getOne, setItem, addItem, subscribeCollection, _brancherRoleCourant } from './db'
import { isFullAccessRole, isViewAllRole, isApproverRole, isCertifierRole, isReadOnlyRole } from './roles'
import { supabase, loginToEmail as loginToEmailSupabase } from './supabaseClient'
import { oublierAbonnementPush } from './push'
import { MODULES } from '../shared/modules'

// Cible auto-hébergée : authentification via Supabase Auth (identités réelles + RLS).
const USE_SUPABASE_AUTH = import.meta.env.VITE_USE_SUPABASE === 'true'

// Liste de référence de tous les modules de la plateforme — dérivée de la source
// unique (shared/modules.js) pour ne jamais rester en retard sur un nouveau module.
const ALL_MODULES = MODULES.map((m) => m.id)

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
    // Droit de gérer l'onglet « Partenaires » (contacts externes) sur les plateformes.
    gerePartenaires: p.gerePartenaires === true,
    secteur: p.secteur || '',
    actif: p.actif !== false
  }
}

// Suivi en temps réel du profil DE L'UTILISATEUR CONNECTÉ (rôle, modules, actif).
// Sans ça, un changement fait par un administrateur (retrait d'un module,
// désactivation du compte…) ne prenait effet qu'à la prochaine connexion : la
// session en mémoire/localStorage restait celle chargée au login, jamais
// resynchronisée. `set`/`get` sont liés à la valeur passée par useAuthStore.create,
// capturés via les closures ci-dessous au lieu d'être passés en paramètre.
let _unsubOwnProfile = null
function watchOwnProfile(uid, set, get) {
  _unsubOwnProfile?.()
  _unsubOwnProfile = subscribeCollection('users', (rows) => {
    const cur = get().user
    if (!cur || cur.uid !== uid) return // session changée/fermée entre-temps
    const fresh = rows.find((r) => (r.uid || r.login) === uid)
    if (!fresh) return
    if (fresh.actif === false) {
      // Compte désactivé par l'administrateur pendant que la session était ouverte.
      localStorage.removeItem(DEMO_SESSION_KEY)
      _unsubOwnProfile?.(); _unsubOwnProfile = null
      set({ user: null, role: null, modules: [] })
      return
    }
    const u = sessionFromProfile(fresh)
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(u))
    set({ user: u, role: u.role, modules: u.modules })
  })
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

    // MÊME EXIGENCE POUR FIREBASE (corrigé le 2026-08-05).
    // La session locale était restaurée SANS vérifier qu'une session Firebase
    // existe. Tant que la base était ouverte, cela passait inaperçu. Depuis son
    // verrouillage, l'utilisateur se voyait « connecté » alors que la base
    // refusait toutes ses lectures : l'application s'ouvrait avec des compteurs
    // à zéro partout, sans le moindre message d'erreur.
    // On force donc la reconnexion, qui crée (ou réutilise) le compte Firebase.
    if (isFirebaseConfigured && !USE_SUPABASE_AUTH && auth) {
      onAuthStateChanged(auth, (fbUser) => {
        if (fbUser) return // session Firebase valide : rien à faire
        if (!localStorage.getItem(DEMO_SESSION_KEY)) return // déjà déconnecté
        console.warn('[auth] session locale sans session Firebase — reconnexion requise')
        localStorage.removeItem(DEMO_SESSION_KEY)
        _unsubOwnProfile?.(); _unsubOwnProfile = null
        set({ user: null, role: null, modules: [], ready: true, error: 'Votre session a expiré — reconnectez-vous.' })
      })
    }
    try {
      const raw = localStorage.getItem(DEMO_SESSION_KEY)
      if (raw) {
        const u = JSON.parse(raw)
        set({ user: u, role: u.role, modules: u.modules || [], ready: true })
        watchOwnProfile(u.uid, set, get)
        return () => _unsubOwnProfile?.()
      }
    } catch (e) { /* ignore */ }
    set({ ready: true })
    return () => _unsubOwnProfile?.()
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
        watchOwnProfile(u.uid, set, get)
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
      watchOwnProfile(u.uid, set, get)
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
        watchOwnProfile(u.uid, set, get)
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
      watchOwnProfile(u.uid, set, get)
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
    _unsubOwnProfile?.(); _unsubOwnProfile = null

    // POSTE PARTAGÉ : la déconnexion ne vidait rien. Le cache du service worker
    // (réponses Firebase = factures, salaires, dossiers d'enfants…) et l'abonnement
    // aux notifications survivaient à la déconnexion : l'utilisateur suivant pouvait
    // lire les données du précédent et recevait ses notifications. (Audit 2026-08-04)
    try {
      // ⚠️ `serviceWorker.ready` NE SE RÉSOUT JAMAIS si aucun service worker n'est
      // enregistré (mode développement, navigateur sans PWA, enregistrement échoué).
      // Sans ce délai de garde, la déconnexion restait bloquée indéfiniment.
      const reg = await Promise.race([
        navigator.serviceWorker?.ready ?? Promise.resolve(null),
        new Promise((r) => setTimeout(() => r(null), 1500))
      ])
      const sub = await reg?.pushManager?.getSubscription?.()
      if (sub) {
        const endpoint = sub.toJSON()?.endpoint
        await sub.unsubscribe().catch(() => {})
        if (endpoint) await oublierAbonnementPush(endpoint)
      }
    } catch (e) { /* best effort — ne doit jamais empêcher la déconnexion */ }
    try {
      if (typeof caches !== 'undefined') {
        const noms = await caches.keys()
        await Promise.all(noms.filter((n) => /firebase|rtdb/i.test(n)).map((n) => caches.delete(n)))
      }
    } catch (e) { /* best effort */ }
    try {
      // Données métier du mode démo, écrites en clair dans le navigateur.
      Object.keys(localStorage)
        .filter((k) => k.startsWith('termitiere_col_') || k.startsWith('termitiere_demo_'))
        .forEach((k) => localStorage.removeItem(k))
    } catch (e) { /* best effort */ }

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
  // Lecture seule stricte (superviseur interne / partenaire externe sectorisé) :
  // consulte tout ce que ses modules lui donnent, ne crée / modifie / supprime RIEN.
  isReadOnly: () => isReadOnlyRole(get().role),

  clearError: () => set({ error: null })
}))

// Branche le verrou « lecture seule » de la couche de données sur le rôle courant.
// Fait ici (et non par un import direct dans db.js) pour éviter un cycle
// d'importation : auth.js dépend déjà de db.js.
_brancherRoleCourant(() => useAuthStore.getState().role)

// Gestion globale des utilisateurs de la plateforme (store Zustand).
// Les droits d'accès aux modules sont GLOBAUX (non liés à un module) :
// la gestion se fait depuis le portail (Accueil), réservée à l'administrateur.
//
// Mode DÉMO   → liste persistée dans localStorage (termitiere_demo_users).
// Mode Firebase → collection `users` (profils). La création d'un compte Auth
//   réel se fait via la console Firebase ; ici on gère les profils/droits.
import { create } from 'zustand'
import { isFirebaseConfigured } from './firebase'
import { DEFAULT_USERS, hashPassword, newSalt } from './auth'
import { getAll, setItem, removeItem } from './db'
import { audit } from './audit'
import { genId } from '../utils/formatters'

// Une clé Realtime Database ne peut PAS contenir . # $ [ ] / ni d'espace ou de
// caractère de contrôle. Or un identifiant peut être un e-mail (ex.
// jean.paul@gmail.com) → on DISSOCIE la clé technique (assainie) de l'identifiant
// de connexion (champ `login`, conservé tel quel). Sans ça, setItem échoue et
// l'enregistrement du compte échoue silencieusement.
const RTDB_BAD = new RegExp('[.#$\\[\\]/\\s]', 'g')
export const safeKey = (s) => (s || '').toString().replace(RTDB_BAD, '_') || ('u_' + genId().toLowerCase())

// Sépare le profil (public, lisible par tout utilisateur connecté — annuaire de
// l'app) du secret d'authentification (hash + sel salé, collection à part
// `users_secret`, lisible uniquement par son propriétaire — cf. database.rules.json).
// Si `pass` est vide (édition sans changement de mot de passe), aucun secret
// n'est renvoyé → l'existant est conservé tel quel.
async function toProfile(u) {
  const { pass, passHash, salt, ...rest } = u
  const profile = { ...rest }
  let secret = null
  if (pass) {
    const s = newSalt()
    secret = { salt: s, passHash: await hashPassword(pass, s) }
  }
  return { profile, secret }
}

// Un refus d'écriture sur `users` / `users_secret` vient TOUJOURS des règles de la
// base, et presque toujours de l'une de ces deux causes — toutes deux invisibles
// derrière le « PERMISSION_DENIED » brut de Firebase. On les explicite pour que
// l'administrateur sache quoi faire au lieu de buter sur un message opaque.
function messageErreurEcriture(e) {
  const brut = e?.message || String(e)
  if (!/permission[_ ]denied/i.test(brut)) return brut
  return "Refusé par les règles de la base. Deux causes possibles : "
    + "(1) les règles de sécurité n'ont pas encore été déployées "
    + "(firebase deploy --only database) ; "
    + "(2) la variable FIREBASE_SERVICE_ACCOUNT n'est pas configurée côté serveur — "
    + "sans elle la connexion bascule sur un circuit de repli où votre identité ne "
    + "correspond plus à votre profil, et aucune action d'administration n'est autorisée."
}

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

  // Crée ou met à jour un utilisateur. Le mot de passe est haché.
  // La clé de stockage (uid) est ASSAINIE et stable ; le login reste libre.
  // Lève l'erreur en cas d'échec → l'UI peut l'afficher (plus d'échec silencieux).
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
    // Clé technique : réutilise l'uid existant (édition) sinon dérive du login.
    let id = u.uid || u.id
    if (!id) {
      id = safeKey(u.login)
      // Garantit l'unicité si deux logins différents s'assainissent en la même clé.
      if (get().users.some((x) => (x.uid || x.login) === id && x.login !== u.login)) {
        id = id + '_' + genId().slice(0, 4).toLowerCase()
      }
    }
    const existed = get().users.some((x) => (x.uid || x.login) === id || x.login === u.login)
    const { profile, secret } = await toProfile({ ...u, uid: id })
    // Le SECRET s'écrit AVANT le profil : c'est l'écriture la plus susceptible
    // d'être refusée par les règles de la base (elle vise `users_secret`, plus
    // restreint que `users`). Dans l'ancien ordre, un refus laissait un profil
    // déjà créé mais SANS mot de passe — un compte visible dans la liste et
    // impossible à utiliser. Ici l'échec survient avant, donc rien n'est créé.
    try {
      if (secret) await setItem('users_secret', id, secret)
      await setItem('users', id, profile)
    } catch (e) {
      throw new Error(messageErreurEcriture(e))
    }
    await audit('portail', existed ? 'USER_EDIT' : 'USER_CREATE', `${u.login} — ${u.role}`)
    await get().load()
  },

  removeUser: async (u) => {
    if (!isFirebaseConfigured) {
      const list = get().users.filter((x) => x.login !== u.login)
      persistDemo(list)
      set({ users: list })
      return
    }
    const id = u.uid || u.id || safeKey(u.login)
    try {
      await removeItem('users', id)
      // Le secret (hash + sel) vit dans une collection SÉPARÉE : sans cette
      // seconde suppression, le mot de passe du compte supprimé restait en base
      // et était réattribué à tout nouveau compte recréé sous la même clé.
      await removeItem('users_secret', id).catch(() => {})
    } catch (e) {
      throw new Error(messageErreurEcriture(e))
    }
    await audit('portail', 'USER_DELETE', `${u.login} — ${u.nom || ''}`)
    await get().load()
  }
}))

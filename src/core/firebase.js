// Initialisation Firebase (v10 modular) — config via variables d'environnement Vite.
// JAMAIS de clés en dur ici : tout passe par import.meta.env (.env / Netlify).
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

// Indique si la config Firebase est présente. Sinon, l'app bascule en mode
// démonstration local (auth + données mockées) pour rester utilisable sans backend.
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
)

let app = null
let auth = null
let db = null
let storage = null

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  // Firestore avec cache hors-ligne persistant (IndexedDB) — indispensable pour
  // l'usage mobile à Lomé (réseau instable) : lecture/écriture continue hors-ligne,
  // synchronisation automatique au retour du réseau.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  })
  storage = getStorage(app)
  // Session persistante (reste connecté après rechargement)
  setPersistence(auth, browserLocalPersistence).catch((e) =>
    console.warn('Persistence Firebase non disponible :', e)
  )
} else {
  console.warn(
    '[TERMITIÈRE] Firebase non configuré — mode DÉMO local activé. ' +
      'Renseignez .env pour activer la synchronisation cloud.'
  )
}

export { app, auth, db, storage }

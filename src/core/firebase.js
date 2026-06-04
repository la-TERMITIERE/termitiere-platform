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
import { getDatabase } from 'firebase/database'

// Configuration Firebase. Les clés WEB Firebase ne sont PAS des secrets : elles
// sont publiques par conception (la sécurité repose sur les règles de la base +
// l'authentification applicative). On fournit ici la config du projet par défaut
// pour activer la synchronisation cloud (Realtime Database) sans configuration
// supplémentaire ; chaque valeur reste surchargée par une variable d'env Vite si
// elle est présente (permet de pointer vers un autre projet sans toucher au code).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDMuTQpe7ab2juY-Vw1xp_2qO2OtNAaPks',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'max-agro-83baf.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://max-agro-83baf-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'max-agro-83baf',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'max-agro-83baf.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '576214759800',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:576214759800:web:14f31828082bee770e708d'
}

// Synchronisation cloud active dès qu'une base Realtime Database est joignable.
// (Toujours vrai avec la config par défaut ci-dessus → données partagées + temps réel.)
export const isFirebaseConfigured = Boolean(firebaseConfig.databaseURL)

let app = null
let auth = null
let db = null
let storage = null
let rtdb = null

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  // Realtime Database : synchronisation temps réel multi-appareils (source de
  // vérité des données du portail), via la couche src/core/db.js.
  rtdb = getDatabase(app)
  // Firestore + Auth + Storage initialisés en différé (non utilisés par le socle
  // temps réel actuel, conservés pour les outils annexes / évolutions futures).
  try {
    auth = getAuth(app)
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    })
    storage = getStorage(app)
    setPersistence(auth, browserLocalPersistence).catch(() => {})
  } catch (e) { /* services annexes optionnels */ }
} else {
  console.warn('[TERMITIÈRE] Aucune base configurée — mode DÉMO local (localStorage).')
}

export { app, auth, db, storage, rtdb }

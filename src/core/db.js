// Couche de données de la plateforme → Firebase Realtime Database (db.firebase.js).
//
// L'API publique (subscribeCollection, getAll, getOne, addItem, setItem, updateItem,
// removeItem, ts) est volontairement isolée ici : aucun autre fichier de l'application
// n'a besoin de connaître le backend. Les écritures sont assainies (sanitize.js) et
// limitées en débit (rateLimit.js) au niveau de db.firebase.js.
import * as firebaseImpl from './db.firebase'

const impl = firebaseImpl

export const subscribeCollection = impl.subscribeCollection
export const getAll = impl.getAll
export const getOne = impl.getOne
export const addItem = impl.addItem
export const setItem = impl.setItem
export const updateItem = impl.updateItem
export const removeItem = impl.removeItem
export const ts = impl.ts

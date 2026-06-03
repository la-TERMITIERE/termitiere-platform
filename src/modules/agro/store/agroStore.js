// Store MAXI-AGRO (Zustand) : référentiel des espèces et aliments.
//
// Le référentiel est désormais stocké dans la collection Firestore `agro_referentiel`
// (un document par article, champ `type` = 'espece' | 'aliment'), via la couche db.js.
// → Synchronisation TEMPS RÉEL entre tous les appareils (ajout d'une catégorie sur
//   un téléphone visible immédiatement partout). En mode démo, db.js bascule
//   automatiquement sur localStorage : même code, même comportement.
//
// Les getters restent synchrones (especes / aliments en state) pour ne rien casser
// dans les composants ; ils sont alimentés par une souscription init().
import { create } from 'zustand'
import { ESPECES, ALIMENTS } from '../data'
import { subscribeCollection, setItem, removeItem } from '../../../core/db'

const COL = 'agro_referentiel'
let _unsub = null
let _seeding = false

export const useAgroStore = create((set, get) => ({
  // Valeurs par défaut affichées immédiatement (remplacées par les données Firestore au boot).
  especes: ESPECES,
  aliments: ALIMENTS,
  ready: false,

  // Démarre la souscription temps réel au référentiel. Idempotent.
  init: () => {
    if (_unsub) return _unsub
    _unsub = subscribeCollection(COL, async (rows) => {
      // Première utilisation : collection vide → on amorce avec les valeurs d'usine.
      if (rows.length === 0 && !_seeding) {
        _seeding = true
        await seedDefaults()
        _seeding = false
        return // la souscription se redéclenchera avec les données amorcées
      }
      const especes = rows.filter((r) => r.type === 'espece').map(stripMeta)
      const aliments = rows.filter((r) => r.type === 'aliment').map(stripMeta)
      set({
        especes: especes.length ? especes : ESPECES,
        aliments: aliments.length ? aliments : ALIMENTS,
        ready: true
      })
    })
    return _unsub
  },

  getEspece: (id) => get().especes.find((e) => e.id === id),
  getAliment: (id) => get().aliments.find((a) => a.id === id),
  getArticle: (id) =>
    get().especes.find((e) => e.id === id) || get().aliments.find((a) => a.id === id),

  // ── Espèces ──
  saveEspece: (esp) => setItem(COL, esp.id, { ...esp, type: 'espece' }),
  removeEspece: (id) => removeItem(COL, id),

  // ── Aliments ──
  saveAliment: (ali) => setItem(COL, ali.id, { ...ali, type: 'aliment' }),
  removeAliment: (id) => removeItem(COL, id),

  // Réinitialise le référentiel aux valeurs d'usine (écrase les ajouts).
  resetReferentiel: async () => {
    await seedDefaults()
  }
}))

// Retire les champs techniques (type, createdAt) pour ne garder que { id, nom, cat, prix }.
function stripMeta({ type, createdAt, ...rest }) {
  return rest
}

// Écrit les espèces + aliments par défaut (id = identifiant stable → idempotent).
async function seedDefaults() {
  await Promise.all([
    ...ESPECES.map((e) => setItem(COL, e.id, { ...e, type: 'espece' })),
    ...ALIMENTS.map((a) => setItem(COL, a.id, { ...a, type: 'aliment' }))
  ])
}

// Référentiel matériel logistique (Zustand + Firestore temps réel).
import { create } from 'zustand'
import { MATERIEL } from '../data'
import { subscribeCollection, getAll, setItem, removeItem } from '../../../core/db'

const COL = 'logistique_referentiel'
let _unsub = null
let _seeding = false

export const useLogistiqueStore = create((set, get) => ({
  materiel: MATERIEL,
  ready: false,

  init: () => {
    if (_unsub) return _unsub
    _unsub = subscribeCollection(COL, async (rows) => {
      if (rows.length === 0 && !_seeding) {
        _seeding = true
        await seedDefaults()
        _seeding = false
        return
      }
      const materiel = rows.filter((r) => r.type === 'materiel').map(({ type, createdAt, ...rest }) => rest)
      set({ materiel: materiel.length ? materiel : MATERIEL, ready: true })
    })
    return _unsub
  },

  getMateriel: (id) => get().materiel.find((m) => m.id === id),
  saveMateriel: (m) => setItem(COL, m.id, { ...m, type: 'materiel' }),
  removeMateriel: (id) => removeItem(COL, id)
}))

async function seedDefaults() {
  await Promise.all(MATERIEL.map((m) => setItem(COL, m.id, { ...m, type: 'materiel' })))
}

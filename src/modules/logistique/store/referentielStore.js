// Référentiel matériel logistique (Zustand + Firestore temps réel).
import { create } from 'zustand'
import { MATERIEL, EVENEMENTS } from '../data'
import { subscribeCollection, getAll, setItem, removeItem } from '../../../core/db'

const COL = 'logistique_referentiel'
let _unsub = null
let _seeding = false

export const useLogistiqueStore = create((set, get) => ({
  materiel: MATERIEL,
  evenements: EVENEMENTS,
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
      const evRow = rows.find((r) => r.type === 'evenements')
      set({
        materiel: materiel.length ? materiel : MATERIEL,
        evenements: Array.isArray(evRow?.liste) && evRow.liste.length ? evRow.liste : EVENEMENTS,
        ready: true
      })
    })
    return _unsub
  },

  getMateriel: (id) => get().materiel.find((m) => m.id === id),
  saveMateriel: (m) => setItem(COL, m.id, { ...m, type: 'materiel' }),
  removeMateriel: (id) => removeItem(COL, id),
  saveEvenements: (liste) => setItem(COL, 'evenements', { type: 'evenements', liste })
}))

async function seedDefaults() {
  await Promise.all([
    ...MATERIEL.map((m) => setItem(COL, m.id, { ...m, type: 'materiel' })),
    setItem(COL, 'evenements', { type: 'evenements', liste: EVENEMENTS })
  ])
}

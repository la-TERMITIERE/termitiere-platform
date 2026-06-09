// Référentiel briqueterie (Zustand + RTDB).
import { create } from 'zustand'
import { MATIERES, BRIQUES, RECETTES_DEFAULT } from '../data'
import { subscribeCollection, setItem, removeItem } from '../../../core/db'

const COL = 'evenementiel_referentiel'
let _unsub = null
let _seeding = false

export const useBriqueterieStore = create((set, get) => ({
  matieres: MATIERES,
  briques: BRIQUES,
  recettes: RECETTES_DEFAULT,
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
      const matieres = rows.filter((r) => r.type === 'matiere').map(({ type, createdAt, ...rest }) => rest)
      const briques = rows.filter((r) => r.type === 'brique').map(({ type, createdAt, ...rest }) => rest)
      const recRow = rows.find((r) => r.type === 'recettes')
      set({
        matieres: matieres.length ? matieres : MATIERES,
        briques: briques.length ? briques : BRIQUES,
        recettes: recRow?.data || RECETTES_DEFAULT,
        ready: true
      })
    })
    return _unsub
  },

  saveMatiere: (m) => setItem(COL, m.id, { ...m, type: 'matiere' }),
  saveBrique: (b) => setItem(COL, b.id, { ...b, type: 'brique' }),
  saveRecettes: (data) => setItem(COL, 'recettes', { type: 'recettes', data }),
  removeBrique: (id) => removeItem(COL, id),
  getBrique: (id) => get().briques.find((b) => b.id === id)
}))

async function seedDefaults() {
  await Promise.all([
    ...MATIERES.map((m) => setItem(COL, m.id, { ...m, type: 'matiere' })),
    ...BRIQUES.map((b) => setItem(COL, b.id, { ...b, type: 'brique' })),
    setItem(COL, 'recettes', { type: 'recettes', data: RECETTES_DEFAULT })
  ])
}

// Store Zustand — paramètres personnalisables de la garderie.
import { create } from 'zustand'
import { subscribeCollection, setItem, removeItem } from '../../../core/db'

const COL = 'garderie_params'
let _unsub = null

export const useGarderieStore = create((set) => ({
  params: {
    nom: 'Garderie La Termitière',
    tarifMensuel: 15000,
    tarifInscription: 5000,
    heureOuverture: '07:00',
    heureFermeture: '18:00',
    capaciteMax: 40
  },
  ready: false,

  init: () => {
    if (_unsub) return _unsub
    _unsub = subscribeCollection(COL, (rows) => {
      const cfg = rows.find((r) => r.id === 'config')
      if (cfg) {
        const { id, createdAt, updatedAt, ...rest } = cfg
        set((s) => ({ params: { ...s.params, ...rest }, ready: true }))
      } else {
        set({ ready: true })
      }
    })
    return _unsub
  },

  saveParams: (data) => setItem(COL, 'config', data)
}))

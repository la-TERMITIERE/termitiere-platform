import { create } from 'zustand'
import { subscribeCollection } from '../../../core/db'

let _unsub = null

export const useProjetStore = create((set) => ({
  projets: [],
  ready: false,

  init: () => {
    if (_unsub) return _unsub
    _unsub = subscribeCollection('projets', (rows) => {
      set({ projets: rows, ready: true })
    })
    return _unsub
  }
}))

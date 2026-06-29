// Store Zustand — paramètres et état partagé de la garderie.
import { create } from 'zustand'
import { subscribeCollection, setItem, removeItem } from '../../../core/db'

const COL = 'garderie_params'
let _unsub = null

const GRILLE_DEFAUT = [
  { id: 'tranche1', label: '6 mois – 1 an',  minMois: 6,  maxMois: 12, tarif: 35000 },
  { id: 'tranche2', label: '1 an – 3 ans',   minMois: 12, maxMois: 36, tarif: 45000 },
  { id: 'tranche3', label: '3 ans – 5 ans',  minMois: 36, maxMois: 60, tarif: 65000 },
]

export const useGarderieStore = create((set, get) => ({
  params: {
    nom: 'Garderie La Termitière',
    tarifMensuel: 15000,
    tarifInscription: 5000,
    heureOuverture: '07:00',
    heureFermeture: '18:00',
    capaciteMax: 40
  },
  grilleTarifaire: GRILLE_DEFAUT,
  ready: false,

  // IDs d'enfants supprimés — partagé entre tous les volets
  deletedEnfantIds: new Set(),

  markEnfantDeleted: (id) =>
    set((s) => ({ deletedEnfantIds: new Set([...s.deletedEnfantIds, id]) })),

  unmarkEnfantDeleted: (id) =>
    set((s) => {
      const next = new Set(s.deletedEnfantIds)
      next.delete(id)
      return { deletedEnfantIds: next }
    }),

  init: () => {
    if (_unsub) return _unsub
    _unsub = subscribeCollection(COL, (rows) => {
      const cfg = rows.find((r) => r.id === 'config')
      const grille = rows.find((r) => r.id === 'grille')
      if (cfg) {
        const { id, createdAt, updatedAt, ...rest } = cfg
        set((s) => ({ params: { ...s.params, ...rest }, ready: true }))
      } else {
        set({ ready: true })
      }
      if (grille?.tranches) {
        set({ grilleTarifaire: grille.tranches })
      }
    })
    return _unsub
  },

  saveParams: (data) => setItem(COL, 'config', data),
  saveGrille: (tranches) => setItem(COL, 'grille', { id: 'grille', tranches })
}))

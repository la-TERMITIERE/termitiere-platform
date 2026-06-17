// Référentiel foncier (Zustand + RTDB) — types de dossiers PERSONNALISÉS.
//
// Les types par défaut restent dans data.js (TYPES_DOSSIER). Ce store ajoute la
// possibilité de créer des types sur mesure (un secteur peut avoir ses propres
// procédures). Chaque type personnalisé référence un « modèle » d'étapes existant
// (cf. etapesPourType dans data.js) pour réutiliser un enchaînement administratif.
import { create } from 'zustand'
import { subscribeCollection, setItem, removeItem } from '../../../core/db'

const COL = 'foncier_referentiel'
let _unsub = null

export const useFoncierStore = create((set, get) => ({
  customTypes: [],
  ready: false,

  init: () => {
    if (_unsub) return _unsub
    _unsub = subscribeCollection(COL, (rows) => {
      const customTypes = rows
        .filter((r) => r.type === 'type_dossier')
        .map(({ type, createdAt, ...rest }) => rest)
      set({ customTypes, ready: true })
    })
    return _unsub
  },

  saveType: (t) => setItem(COL, t.id, { ...t, type: 'type_dossier' }),
  removeType: (id) => removeItem(COL, id)
}))

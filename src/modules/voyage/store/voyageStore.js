// Référentiel VOYAGES (Zustand + RTDB) : devises et leurs taux vers le FCFA.
// Synchronisé en temps réel entre tous les appareils (comme les autres modules).
import { create } from 'zustand'
import { DEVISES } from '../data'
import { subscribeCollection, setItem, removeItem } from '../../../core/db'
import { fetchTauxFCFA } from '../logic'

const COL = 'voyage_referentiel'
let _unsub = null
let _seeding = false

export const useVoyageStore = create((set, get) => ({
  devises: DEVISES,
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
      const devises = rows.filter((r) => r.type === 'devise').map(({ type, createdAt, ...rest }) => rest)
      set({ devises: devises.length ? devises : DEVISES, ready: true })
    })
    return _unsub
  },

  getDevise: (code) => get().devises.find((d) => d.code === code),
  tauxDe: (code) => {
    const d = get().devises.find((x) => x.code === code)
    return d ? (parseFloat(d.tauxFCFA) || 0) : 0
  },

  saveDevise: (d) => setItem(COL, d.code, { ...d, id: d.code, type: 'devise', updatedAt: Date.now() }),
  removeDevise: (code) => removeItem(COL, code),

  // Actualisation EN DIRECT des taux (best-effort) : récupère les taux de marché et
  // met à jour `tauxFCFA` de chaque devise connue. Retourne { ok, maj, erreur }.
  refreshTaux: async () => {
    const devises = get().devises
    const codes = devises.map((d) => d.code)
    const taux = await fetchTauxFCFA(codes)
    if (!taux) return { ok: false, erreur: 'Taux indisponibles (hors ligne ou service injoignable).' }
    let maj = 0
    await Promise.all(devises.map((d) => {
      const t = taux[d.code]
      if (t && Number.isFinite(t) && d.code !== 'XOF') {
        maj++
        return setItem(COL, d.code, { ...d, id: d.code, type: 'devise', tauxFCFA: Math.round(t * 100) / 100, updatedAt: Date.now(), source: 'live' })
      }
      return null
    }))
    return { ok: true, maj }
  }
}))

async function seedDefaults() {
  await Promise.all(DEVISES.map((d) => setItem(COL, d.code, { ...d, id: d.code, type: 'devise', updatedAt: Date.now() })))
}

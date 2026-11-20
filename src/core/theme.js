// Store du thème clair/sombre (Zustand) — persisté localement, appliqué en
// posant/retirant la classe `dark` sur <html> (Tailwind darkMode: 'class').
// Trois choix : « light », « dark » et « auto » (suit le réglage de l'appareil, y compris quand il change dans la journée).
// `theme` reste l'apparence réellement affichée ('light' ou 'dark') : le reste de l'application ne lit que lui.
import { create } from 'zustand'

const STORAGE_KEY = 'termitiere_theme'
const sombreAppareil = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches

function appliquer(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}
const effectif = (mode) => (mode === 'auto' ? (sombreAppareil() ? 'dark' : 'light') : mode)

let enregistre = null
try { enregistre = localStorage.getItem(STORAGE_KEY) } catch { /* stockage indisponible */ }
const modeInitial = enregistre === 'dark' || enregistre === 'auto' ? enregistre : 'light'
const initial = effectif(modeInitial)
if (typeof document !== 'undefined') appliquer(initial)

export const useThemeStore = create((set, get) => ({
  mode: modeInitial,
  theme: initial,
  // Choisit clair, sombre ou automatique.
  setMode: (mode) => {
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* ignoré */ }
    const theme = effectif(mode)
    appliquer(theme)
    set({ mode, theme })
  },
  toggle: () => get().setMode(get().theme === 'dark' ? 'light' : 'dark')
}))

// En mode automatique, l'apparence suit l'appareil dès qu'il change (coucher du soleil, réglage du système).
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    const { mode } = useThemeStore.getState()
    if (mode !== 'auto') return
    const theme = effectif('auto')
    appliquer(theme)
    useThemeStore.setState({ theme })
  })
}

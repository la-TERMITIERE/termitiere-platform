// Store du thème clair/sombre (Zustand) — persisté localement, appliqué en
// posant/retirant la classe `dark` sur <html> (Tailwind darkMode: 'class').
import { create } from 'zustand'

const STORAGE_KEY = 'termitiere_theme'

function appliquer(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

const initial = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'dark') ? 'dark' : 'light'
if (typeof document !== 'undefined') appliquer(initial)

export const useThemeStore = create((set, get) => ({
  theme: initial,
  toggle: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(STORAGE_KEY, next)
    appliquer(next)
    set({ theme: next })
  }
}))

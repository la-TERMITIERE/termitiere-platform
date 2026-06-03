// Système de notifications in-app (toasts) — store Zustand global.
// Utilisé partout via le hook useToast() (voir shared/ui/Toast.jsx).
import { create } from 'zustand'

let _id = 0

export const useNotifStore = create((set, get) => ({
  toasts: [], // { id, type, message }

  push: (message, type = 'info', duration = 4000) => {
    const id = ++_id
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }))
    if (duration > 0) {
      setTimeout(() => get().dismiss(id), duration)
    }
    return id
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

// Helpers pratiques (utilisables hors composant React)
export const toast = {
  success: (m) => useNotifStore.getState().push(m, 'success'),
  error: (m) => useNotifStore.getState().push(m, 'error'),
  warning: (m) => useNotifStore.getState().push(m, 'warning'),
  info: (m) => useNotifStore.getState().push(m, 'info')
}

// Alertes « heads-up » façon WhatsApp : à chaque nouvelle notification, une carte
// glisse depuis le haut de l'écran (téléphone ET PC), avec son + vibration, et
// s'ouvre au clic sur la page concernée.
//
// Ce fichier ne contient que l'état + les effets sonores ; le rendu vit dans
// src/shared/Layout/AlertesHeadsUp.jsx (monté une seule fois dans AppShell).
import { create } from 'zustand'

// ── Préférences locales (par appareil) ────────────────────────────────────────
const CLE_SON = 'termitiere_notif_son'
export const sonActif = () => {
  try { return localStorage.getItem(CLE_SON) !== '0' } catch { return true }
}
export const setSonActif = (v) => {
  try { localStorage.setItem(CLE_SON, v ? '1' : '0') } catch { /* ignore */ }
}

// ── Son : petit « ding » synthétisé (aucun fichier audio à charger) ───────────
// Les navigateurs bloquent l'audio tant que l'utilisateur n'a pas interagi avec
// la page : on crée le contexte à la 1re interaction et on le réveille ensuite.
let ctx = null
function audioCtx() {
  if (ctx) return ctx
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return null
  try { ctx = new AC() } catch { ctx = null }
  return ctx
}

// Débloque l'audio dès le premier geste de l'utilisateur (clic, touche, tap).
if (typeof window !== 'undefined') {
  const debloquer = () => {
    const c = audioCtx()
    if (c && c.state === 'suspended') c.resume().catch(() => {})
  }
  window.addEventListener('pointerdown', debloquer, { once: false, passive: true })
  window.addEventListener('keydown', debloquer, { once: false, passive: true })
}

// Deux notes courtes, montantes — reconnaissable sans être agressif.
export function jouerDing(urgent = false) {
  if (!sonActif()) return
  const c = audioCtx()
  if (!c) return
  try {
    if (c.state === 'suspended') c.resume().catch(() => {})
    const t0 = c.currentTime
    const notes = urgent ? [880, 1174, 880] : [784, 1046]
    notes.forEach((freq, i) => {
      const osc = c.createOscillator()
      const gain = c.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, t0 + i * 0.13)
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.13)
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + i * 0.13 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.13 + 0.22)
      osc.connect(gain).connect(c.destination)
      osc.start(t0 + i * 0.13)
      osc.stop(t0 + i * 0.13 + 0.24)
    })
  } catch { /* le son ne doit jamais casser l'app */ }
}

export function vibrer(urgent = false) {
  try { navigator.vibrate?.(urgent ? [90, 60, 90, 60, 140] : [70, 45, 70]) } catch { /* ignore */ }
}

// ── Pastille sur l'icône de l'application (Android / Windows, PWA installée) ──
export function setBadgeApp(n) {
  try {
    if (n > 0) navigator.setAppBadge?.(n)
    else navigator.clearAppBadge?.()
  } catch { /* non supporté */ }
}

// ── File des alertes affichées ───────────────────────────────────────────────
const MAX_VISIBLES = 3
const DUREE_MS = 9000        // disparition automatique (reste dans la cloche)
const DUREE_URGENTE_MS = 20000 // demandes d'autorisation : on laisse plus longtemps

export const useAlertesStore = create((set, get) => ({
  alertes: [], // { id, type, title, body, module, link, urgent, createdAt }

  montrer: (a) => {
    if (!a?.id) return
    const { alertes } = get()
    if (alertes.some((x) => x.id === a.id)) return
    const suite = [...alertes, a].slice(-MAX_VISIBLES)
    set({ alertes: suite })
    jouerDing(a.urgent)
    vibrer(a.urgent)
    setTimeout(() => get().fermer(a.id), a.urgent ? DUREE_URGENTE_MS : DUREE_MS)
  },

  fermer: (id) => set((s) => ({ alertes: s.alertes.filter((a) => a.id !== id) })),

  toutFermer: () => set({ alertes: [] })
}))

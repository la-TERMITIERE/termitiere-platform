// Envoi d'alertes WhatsApp (app fermée) via l'API WhatsApp Business Cloud, côté
// serveur (netlify/functions/whatsapp-notify.js). Voir NOTIFICATIONS_WHATSAPP.md.
import { auth } from './firebase'

async function authHeader() {
  try {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

// Envoie un message WhatsApp aux numéros fournis (format international, avec ou
// sans caractères de mise en forme — nettoyés côté serveur). Best-effort : ne
// bloque et ne fait jamais échouer l'appelant (mêmes garanties que pushToUsers).
export async function sendWhatsApp(numbers, payload) {
  try {
    const wanted = [...new Set((numbers || []).filter(Boolean))]
    if (!wanted.length) return
    const res = await fetch('/.netlify/functions/whatsapp-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ numbers: wanted, payload })
    })
    const info = await res.json().catch(() => null)
    if (info && info.skipped) {
      console.warn('[whatsapp] ignoré :', info.skipped)
    } else if (info && info.total > 0 && info.sent === 0) {
      console.warn('[whatsapp] aucun envoi abouti :', info.erreurs)
    }
  } catch (e) { /* best effort */ }
}

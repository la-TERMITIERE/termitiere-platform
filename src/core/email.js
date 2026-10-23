// Envoi d'e-mails d'alerte (via Resend), côté serveur (netlify/functions/send-email.js).
import { auth } from './firebase'

async function authHeader() {
  try {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

// Envoie un e-mail aux adresses fournies. Best-effort : ne bloque jamais l'appelant et ne fait jamais échouer l'action en cours.
// Ignoré sans bruit tant que RESEND_API_KEY n'est pas configurée côté serveur.
export async function sendEmail(adresses, { subject, text, link }) {
  try {
    const to = [...new Set((adresses || []).map((a) => String(a || '').trim()).filter(Boolean))]
    if (!to.length || !subject) return
    const res = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ to, subject, text, link })
    })
    const info = await res.json().catch(() => null)
    if (info && info.skipped) console.warn('[email] ignoré :', info.skipped)
    else if (info && info.ok === false) console.warn('[email] échec :', info.error)
  } catch (e) { /* best effort */ }
}

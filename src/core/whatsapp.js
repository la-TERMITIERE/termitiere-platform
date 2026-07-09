// Envoi de notifications WhatsApp via la fonction serveur Netlify (best effort).
// N'interrompt jamais le flux métier : en cas d'erreur ou de configuration
// absente, on ignore silencieusement.
import { auth } from './firebase'

async function authHeader() {
  try {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

export async function sendWhatsApp({ phones = [], text = '', templateParams = null }) {
  const nums = (phones || []).map((p) => String(p || '').trim()).filter(Boolean)
  if (!nums.length || (!text && !templateParams)) return { ok: false, skipped: 'rien à envoyer' }
  try {
    const res = await fetch('/.netlify/functions/whatsapp-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ phones: nums, text, templateParams })
    })
    return await res.json().catch(() => ({ ok: false }))
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

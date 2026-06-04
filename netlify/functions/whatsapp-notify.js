// Fonction serveur Netlify : envoi de notifications WhatsApp via l'API
// WhatsApp Business Cloud (Meta / Graph API).
//
// Configuration (Netlify → Site settings → Environment variables) :
//   WHATSAPP_TOKEN     = jeton d'accès permanent de l'app WhatsApp Business
//   WHATSAPP_PHONE_ID  = identifiant du numéro expéditeur (Phone number ID)
//   WHATSAPP_TEMPLATE  = (optionnel) nom d'un template approuvé pour les messages
//                        hors fenêtre de 24 h ; à défaut, message texte simple.
//   WHATSAPP_LANG      = (optionnel) langue du template, défaut "fr"
//
// Tant que le token n'est pas renseigné, la fonction répond proprement (no-op)
// pour ne rien casser côté application.
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method Not Allowed' }) }
  }

  let payload = {}
  try { payload = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) } }

  const { phones = [], text = '', templateParams = null } = payload
  const TOKEN = process.env.WHATSAPP_TOKEN
  const PHONE_ID = process.env.WHATSAPP_PHONE_ID
  const TEMPLATE = process.env.WHATSAPP_TEMPLATE
  const LANG = process.env.WHATSAPP_LANG || 'fr'

  if (!TOKEN || !PHONE_ID) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, skipped: 'WhatsApp non configuré (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID manquants)' }) }
  }

  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`
  const results = []

  for (const raw of Array.isArray(phones) ? phones : [phones]) {
    const to = String(raw || '').replace(/[^0-9]/g, '') // format international, chiffres uniquement
    if (!to) continue

    // Si un template est défini, on l'utilise (requis pour les messages
    // business-initiés hors fenêtre de 24 h) ; sinon message texte simple.
    const message = TEMPLATE
      ? {
          messaging_product: 'whatsapp', to, type: 'template',
          template: {
            name: TEMPLATE,
            language: { code: LANG },
            components: templateParams
              ? [{ type: 'body', parameters: templateParams.map((t) => ({ type: 'text', text: String(t) })) }]
              : undefined
          }
        }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body: text } }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      })
      const data = await res.json().catch(() => ({}))
      results.push({ to, status: res.status, id: data?.messages?.[0]?.id, error: data?.error?.message })
    } catch (e) {
      results.push({ to, error: String(e) })
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, results }) }
}

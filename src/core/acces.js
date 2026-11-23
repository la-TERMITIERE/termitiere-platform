// Demandes d'accès : appels à la fonction serveur netlify/functions/acces.js.
// Un visiteur non connecté ne peut rien écrire dans la base : tout passe par le serveur.
import { auth } from './firebase'

async function appeler(corps, jeton) {
  let res
  try {
    res = await fetch('/.netlify/functions/acces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
      body: JSON.stringify(corps)
    })
  } catch {
    return { ok: false, error: "Impossible de joindre le serveur : vérifiez votre connexion et réessayez." }
  }
  let data = null
  try { data = await res.json() } catch { /* réponse vide */ }
  if (!data) return { ok: false, error: 'Service indisponible pour le moment : réessayez plus tard.' }
  if (data.error === 'not_configured') return { ok: false, error: "Les demandes d'accès ne sont pas encore activées sur ce site : contactez la RH." }
  return data
}

// Le visiteur demande un compte (rôle agent, accès E-TACHES seulement une fois la demande approuvée).
export const soumettreDemandeAcces = (champs) => appeler({ action: 'soumettre', ...champs })

// La RH ou Info décide : decision = 'approuver' | 'refuser'.
export async function deciderDemandeAcces(id, decision, motif = '') {
  let jeton = ''
  try { jeton = (await auth?.currentUser?.getIdToken()) || '' } catch { /* pas de session serveur */ }
  if (!jeton) return { ok: false, error: 'Session serveur introuvable : reconnectez-vous puis réessayez.' }
  return appeler({ action: 'decider', id, decision, motif }, jeton)
}

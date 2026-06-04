// Journalisation des actions importantes dans la collection audit_global.
import { addItem, ts } from './db'
import { useAuthStore } from './auth'

// `meta` (optionnel) : objet de détails structurés affiché de façon dépliable
// dans le Journal — pour voir précisément QUI a fait QUOI (ex. ventilation des
// mouvements d'une saisie, contenu d'une fiche santé, etc.).
export async function audit(module, action, details = '', meta = null) {
  const u = useAuthStore.getState().user
  try {
    await addItem('audit_global', {
      userId: u?.uid || 'anonyme',
      userNom: u?.nom || 'Anonyme',
      userRole: u?.role || '',
      module,
      action,
      details,
      meta: meta || null,
      timestamp: ts()
    })
  } catch (e) {
    // Non bloquant : l'audit ne doit jamais interrompre l'action métier.
    console.warn('[audit] échec :', e)
  }
}

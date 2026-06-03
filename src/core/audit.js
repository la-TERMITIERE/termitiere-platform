// Journalisation des actions importantes dans la collection audit_global.
import { addItem, ts } from './db'
import { useAuthStore } from './auth'

export async function audit(module, action, details = '') {
  const u = useAuthStore.getState().user
  try {
    await addItem('audit_global', {
      userId: u?.uid || 'anonyme',
      userNom: u?.nom || 'Anonyme',
      module,
      action,
      details,
      timestamp: ts()
    })
  } catch (e) {
    // Non bloquant : l'audit ne doit jamais interrompre l'action métier.
    console.warn('[audit] échec :', e)
  }
}

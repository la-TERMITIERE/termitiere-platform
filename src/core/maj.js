// Mises à jour de l'application et installation sur l'appareil (Zustand).
// - La vérification compare la version de CETTE page (__BUILD_ID__, figé à la construction) avec le fichier /version.json publié avec l'application :
//   si les deux diffèrent, une nouvelle version est disponible. Elle demande aussi au service worker de se mettre à jour.
// - L'application d'une mise à jour passe par le service worker quand il a déjà la nouvelle version prête ; sinon on vide les caches
//   de l'application et on recharge, ce qui récupère la version publiée à coup sûr.
// - UpdateManager (monté une fois dans App) branche ici l'enregistrement du service worker ; ce module garde aussi la proposition
//   d'installation du navigateur, qui n'est émise qu'une fois, très tôt.
import { create } from 'zustand'

// Valeurs figées à la construction (cf. vite.config.js) ; absentes si le fichier est chargé hors de Vite.
export const VERSION_APP = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'
export const ID_CONSTRUCTION = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : ''
export const DATE_CONSTRUCTION = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''

export const useMajStore = create((set) => ({
  enregistrement: null,   // enregistrement du service worker (branché par UpdateManager)
  appliquerSW: null,      // updateServiceWorker(true) de vite-plugin-pwa
  swPret: false,          // le service worker a déjà téléchargé la nouvelle version
  disponible: false,      // une nouvelle version existe
  verification: false,    // vérification en cours
  derniereVerif: 0,       // date de la dernière vérification réussie
  distante: null,         // contenu de /version.json (version publiée)
  erreur: false,          // la dernière vérification a échoué
  installPrompt: null     // proposition d'installation (beforeinstallprompt)
}))

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); useMajStore.setState({ installPrompt: e }) })
  window.addEventListener('appinstalled', () => useMajStore.setState({ installPrompt: null }))
}

// Cherche une nouvelle version. Renvoie { disponible, erreur }.
export async function verifierMiseAJour() {
  const { enregistrement } = useMajStore.getState()
  useMajStore.setState({ verification: true, erreur: false })
  try {
    // 1) le service worker va chercher la sienne (son état arrive plus tard par UpdateManager)
    const reg = enregistrement || (await navigator.serviceWorker?.getRegistration?.())
    if (reg) await reg.update().catch(() => {})
    // 2) la version publiée avec l'application, jamais lue depuis un cache
    let distante = null
    try {
      const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) distante = await r.json()
    } catch { /* hors ligne : on garde ce qu'on sait */ }
    if (!distante && !navigator.onLine) throw new Error('hors ligne')
    const nouvelle = !!distante && !!ID_CONSTRUCTION && String(distante.id) !== String(ID_CONSTRUCTION)
    useMajStore.setState((s) => ({ distante, derniereVerif: Date.now(), disponible: s.disponible || nouvelle }))
    return { disponible: useMajStore.getState().disponible, erreur: false }
  } catch {
    useMajStore.setState({ erreur: true })
    return { disponible: useMajStore.getState().disponible, erreur: true }
  } finally {
    useMajStore.setState({ verification: false })
  }
}

// Vide les caches de l'application (fichiers gardés pour le hors-ligne) et le service worker, sans toucher à la connexion ni aux préférences.
export async function viderCaches() {
  try { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister() } catch { /* ignoré */ }
  try { for (const k of (await window.caches?.keys?.()) || []) await window.caches.delete(k) } catch { /* ignoré */ }
}

// Applique la mise à jour : via le service worker s'il est prêt, sinon en vidant les caches puis en rechargeant.
export async function appliquerMiseAJour() {
  const { swPret, appliquerSW } = useMajStore.getState()
  if (swPret && appliquerSW) { try { await appliquerSW(true); return } catch { /* on retombe sur le rechargement forcé */ } }
  await viderCaches()
  window.location.reload()
}

// Propose l'installation de l'application (bouton « Installer »). Renvoie true si l'utilisateur accepte.
export async function installerApplication() {
  const { installPrompt } = useMajStore.getState()
  if (!installPrompt) return false
  installPrompt.prompt()
  const choix = await installPrompt.userChoice.catch(() => null)
  useMajStore.setState({ installPrompt: null })
  return choix?.outcome === 'accepted'
}

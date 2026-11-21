// Point d'entrée React.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './core/preferences' // applique tout de suite la taille du texte et les animations réduites choisies sur cet appareil
import { toast } from './core/notifications'
import './utils/chartSetup' // enregistre Chart.js une seule fois

// Suppression abandonnée dans la fenêtre « Motif » : pas une erreur à remonter.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.code === 'SUPPRESSION_ANNULEE') e.preventDefault()
  // Un agent a tenté une suppression (écran sans garde) : refus central de db.js, expliqué à l'écran.
  if (e.reason?.code === 'SUPPRESSION_INTERDITE') { e.preventDefault(); toast.error(e.reason.message) }
  // Filet commun à tous les modules : une suppression ou une correction refusée (droit du module, profil en lecture seule, règle de la base)
  // ou qui échoue (réseau) doit se voir à l'écran, au lieu de ne rien faire. Les écrans qui gèrent déjà leur erreur ne sont pas concernés.
  const r = e.reason
  const refusBase = r?.code === 'PERMISSION_DENIED' || /permission[_ ]denied/i.test(String(r?.message || ''))
  if (r?.code === 'LECTURE_SEULE') { e.preventDefault(); toast.error(r.message) }
  else if (refusBase) { e.preventDefault(); toast.error("Modification refusée : votre compte n'a pas le droit de faire cette action. Demandez à l'administration.") }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

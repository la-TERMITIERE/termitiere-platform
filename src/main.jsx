// Point d'entrée React.
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { toast } from './core/notifications'
import './utils/chartSetup' // enregistre Chart.js une seule fois

// Suppression abandonnée dans la fenêtre « Motif » : pas une erreur à remonter.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.code === 'SUPPRESSION_ANNULEE') e.preventDefault()
  // Un agent a tenté une suppression (écran sans garde) : refus central de db.js, expliqué à l'écran.
  if (e.reason?.code === 'SUPPRESSION_INTERDITE') { e.preventDefault(); toast.error(e.reason.message) }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

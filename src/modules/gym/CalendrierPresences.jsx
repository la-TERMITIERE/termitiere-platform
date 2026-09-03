// MAXI-GYM — Calendrier mensuel des présences (jours cochés). Composant partagé :
// utilisé côté réception (ClientDetailModal, bouton calendrier) et côté client
// (page publique du carnet, cf. carnet/CarnetPresence.jsx) — même rendu des deux
// côtés, pour que la réceptionniste voie exactement ce que voit le client.
import { Check } from 'lucide-react'
import { MOIS_LABELS_GYM } from './data'

const JOURS_ENTETE = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

// `details` (optionnel) : { 'YYYY-MM-DD': "17:05" } — un renseignement (heure
// d'arrivée…) affiché SOUS le numéro, pour les jours où le client est venu.
export default function CalendrierPresences({ mois, joursPresents = [], details = {}, accent = '#E8850F' }) {
  const [annee, moisNum] = mois.split('-').map(Number)
  const premierJour = new Date(annee, moisNum - 1, 1)
  const nbJours = new Date(annee, moisNum, 0).getDate()
  // Lundi = 0 … Dimanche = 6 (getDay() renvoie Dimanche = 0 par défaut).
  const decalage = (premierJour.getDay() + 6) % 7
  const presentSet = new Set(joursPresents)
  const aujourdhui = new Date().toISOString().slice(0, 10)

  const cellules = []
  for (let i = 0; i < decalage; i++) cellules.push(null)
  for (let j = 1; j <= nbJours; j++) cellules.push(j)

  return (
    // Fond opaque propre au calendrier (pas seulement le halo translucide de la
    // modale) : sur un panneau glassmorphism, le gris clair des jours vides
    // devenait quasi illisible — ici le contraste est garanti quel que soit le
    // fond derrière.
    <div className="rounded-2xl bg-white p-3 shadow-[0_8px_20px_-10px_rgba(26,26,26,0.25)] dark:bg-[#20262b]">
      <p className="mb-2 text-center text-sm font-bold text-gray-800 dark:text-gray-100">{MOIS_LABELS_GYM[moisNum - 1]} {annee}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {JOURS_ENTETE.map((j, i) => <span key={i}>{j}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cellules.map((jour, i) => {
          if (jour == null) return <span key={i} />
          const dateStr = `${annee}-${String(moisNum).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
          const present = presentSet.has(dateStr)
          const estAujourdhui = dateStr === aujourdhui
          const info = details[dateStr]
          return (
            <div key={i} title={info ? `Arrivé à ${info}` : undefined}
              className={`relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-bold transition-colors ${
                present ? 'text-white' : estAujourdhui ? 'text-gray-800 ring-1 ring-inset ring-gray-300 dark:text-gray-100' : 'text-gray-500 dark:text-gray-500'
              }`}
              style={present ? { background: accent } : undefined}>
              <span className="leading-none">{jour}</span>
              {present && (info
                ? <span className="text-[8px] font-semibold leading-none opacity-90">{info}</span>
                : <Check size={9} className="opacity-80" strokeWidth={3} />)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

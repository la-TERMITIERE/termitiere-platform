// MAXI-GYM — Carnet de présence PUBLIC (sans connexion). Ouvert en scannant le
// QR de sa fiche client (cf. QrCarnetModal.jsx) : /gym/carnet/<jeton>. Le jeton
// est alors mémorisé sur l'appareil (localStorage) — un raccourci écran d'accueil
// pointant vers /gym/carnet (sans jeton) rouvre donc toujours le bon carnet.
//
// Toute donnée transite par une fonction serveur (netlify/functions/gym-carnet*.js) :
// cette page n'a pas de session Firebase, la base étant verrouillée à `auth != null`.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { User, CheckCircle2, Loader2, ScanLine } from 'lucide-react'
import CalendrierPresences from '../CalendrierPresences'
import { avatarGradient } from '../../../utils/color'
import { formatDateShort } from '../../../utils/formatters'

const STOCKAGE_JETON = 'gym_carnet_token'
const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'

// Bascule le manifest + les balises iOS de la page vers l'identité du carnet
// (icône MAXI-GYM, nom « MAXI GYM Carnet-présence ») — pour que « Ajouter à
// l'écran d'accueil » installe un raccourci correctement nommé, sur Android
// comme sur iOS. Restauré au démontage (retour dans l'appli principale).
function useIdentiteCarnet() {
  useEffect(() => {
    const manifestLink = document.querySelector('link[rel="manifest"]')
    const manifestOriginal = manifestLink?.getAttribute('href')
    if (manifestLink) manifestLink.setAttribute('href', '/carnet-manifest.json')

    const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]')
      || Object.assign(document.head.appendChild(document.createElement('meta')), { name: 'apple-mobile-web-app-title' })
    const appleTitleOriginal = appleTitleMeta.getAttribute('content')
    appleTitleMeta.setAttribute('content', 'MAXI GYM Carnet-présence')

    const appleCapableMeta = document.querySelector('meta[name="apple-mobile-web-app-capable"]')
      || Object.assign(document.head.appendChild(document.createElement('meta')), { name: 'apple-mobile-web-app-capable' })
    appleCapableMeta.setAttribute('content', 'yes')

    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]')
    const appleTouchIconOriginal = appleTouchIcon?.getAttribute('href')
    if (appleTouchIcon) appleTouchIcon.setAttribute('href', '/Maxi_Gym.png')

    const titreOriginal = document.title
    document.title = 'MAXI GYM Carnet-présence'

    return () => {
      if (manifestLink && manifestOriginal) manifestLink.setAttribute('href', manifestOriginal)
      if (appleTitleOriginal != null) appleTitleMeta.setAttribute('content', appleTitleOriginal)
      if (appleTouchIcon && appleTouchIconOriginal) appleTouchIcon.setAttribute('href', appleTouchIconOriginal)
      document.title = titreOriginal
    }
  }, [])
}

export default function CarnetPresence() {
  const { token: tokenUrl } = useParams()
  useIdentiteCarnet()

  const [token, setToken] = useState(null)
  const [etat, setEtat] = useState('chargement') // chargement | ok | erreur | non_apparie
  const [donnees, setDonnees] = useState(null)
  const [erreur, setErreur] = useState('')
  const [pointageBusy, setPointageBusy] = useState(false)

  // Détermine le jeton actif : celui de l'URL (scan) prime et est mémorisé ;
  // sinon on retombe sur celui mémorisé lors d'un scan précédent sur cet appareil.
  useEffect(() => {
    if (tokenUrl) {
      localStorage.setItem(STOCKAGE_JETON, tokenUrl)
      setToken(tokenUrl)
    } else {
      const memorise = localStorage.getItem(STOCKAGE_JETON)
      if (memorise) setToken(memorise)
      else setEtat('non_apparie')
    }
  }, [tokenUrl])

  useEffect(() => {
    if (!token) return
    setEtat('chargement')
    fetch(`/.netlify/functions/gym-carnet?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) { setDonnees(json); setEtat('ok') }
        else { setErreur(json.error || 'Lien invalide.'); setEtat('erreur') }
      })
      .catch(() => { setErreur('Connexion impossible — réessayez.'); setEtat('erreur') })
  }, [token])

  async function pointerArrivee() {
    setPointageBusy(true)
    try {
      const res = await fetch('/.netlify/functions/gym-carnet-pointer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
      })
      const json = await res.json()
      if (json.ok) setDonnees((d) => ({ ...d, pointeAujourdhui: true, joursPresents: json.joursPresents }))
    } finally {
      setPointageBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-sm space-y-4">
        <div className="flex flex-col items-center gap-2">
          <img src="/Maxi_Gym.png" alt="MAXI-GYM" className="h-16 w-16 rounded-full border-4 border-white object-cover shadow-lg" />
          <p className="text-lg font-extrabold text-gray-800">MAXI-GYM</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Carnet de présence</p>
        </div>

        {etat === 'chargement' && (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm">Chargement…</p>
          </div>
        )}

        {etat === 'non_apparie' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
            <ScanLine size={28} className="mx-auto mb-2 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">Aucun carnet lié à cet appareil.</p>
            <p className="mt-1 text-xs text-amber-700">Demandez à la réception de vous faire scanner votre QR code pour ouvrir votre carnet.</p>
          </div>
        )}

        {etat === 'erreur' && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
            <p className="text-sm font-semibold text-red-700">{erreur}</p>
          </div>
        )}

        {etat === 'ok' && donnees && (
          <>
            <div className="rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
              style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-sm" style={{ background: avatarGradient(donnees.nom) }}>
                  <User size={22} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold leading-tight">{donnees.nom}</p>
                  <p className="text-xs text-white/80">
                    {donnees.abonnementActif ? `Abonnement actif — jusqu'au ${formatDateShort(donnees.abonnementDateFin)}` : 'Pas d\'abonnement actif'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <CalendrierPresences mois={donnees.mois} joursPresents={donnees.joursPresents} accent={COULEUR} />
            </div>

            <button onClick={pointerArrivee} disabled={pointageBusy || donnees.pointeAujourdhui}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold shadow-sm transition-colors ${
                donnees.pointeAujourdhui ? 'bg-green-100 text-green-700' : 'bg-green-500 text-white hover:bg-green-600 disabled:opacity-60'
              }`}>
              <CheckCircle2 size={18} />
              {donnees.pointeAujourdhui ? 'Vous êtes pointé aujourd\'hui ✓' : pointageBusy ? 'Enregistrement…' : 'Je suis arrivé'}
            </button>

            <p className="px-2 text-center text-[11px] text-gray-400">
              Astuce : ajoutez cette page à votre écran d'accueil pour y revenir comme une application.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

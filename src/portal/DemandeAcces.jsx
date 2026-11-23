// Fenêtre « Demander un accès » de la page de connexion : un employé sans compte envoie sa demande à la RH et à Info.
// Le compte n'existe qu'après leur approbation : rôle Agent, accès E-TACHES seulement.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, Loader2, CheckCircle2, TriangleAlert, UserPlus } from 'lucide-react'
import { soumettreDemandeAcces } from '../core/acces'

const ROUGE = '#BC3C31'
const CHAMP = 'input-base !rounded-2xl !border-white/80 !bg-white/80 !py-2.5 font-semibold focus:!bg-white'
const LIBELLE = 'mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-gray-500'

export default function DemandeAcces({ onClose }) {
  const [f, setF] = useState({ nom: '', login: '', telephone: '', poste: '', pass: '', confirmation: '', site: '' })
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const [fait, setFait] = useState(false)
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function envoyer(e) {
    e.preventDefault()
    setErreur('')
    if (f.nom.trim().length < 2) return setErreur('Indiquez votre nom et prénom.')
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(f.login.trim())) return setErreur("L'identifiant doit faire 3 à 40 caractères : lettres, chiffres, point ou tiret, sans espace.")
    if (f.pass.length < 6) return setErreur('Le mot de passe doit faire au moins 6 caractères.')
    if (f.pass !== f.confirmation) return setErreur('Les deux mots de passe ne sont pas identiques.')
    setEnvoi(true)
    const res = await soumettreDemandeAcces({ nom: f.nom, login: f.login.trim(), telephone: f.telephone, poste: f.poste, pass: f.pass, site: f.site })
    setEnvoi(false)
    if (res?.ok) setFait(true)
    else setErreur(res?.error || "L'envoi a échoué : réessayez.")
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="da-titre" onMouseDown={(e) => { if (e.target === e.currentTarget && !envoi) onClose() }}>
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_70px_-24px_rgba(120,30,20,0.55)] backdrop-blur-2xl">
        <button type="button" onClick={onClose} aria-label="Fermer" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-white hover:text-gray-700">
          <X size={18} aria-hidden="true" />
        </button>

        {fait ? (
          <div className="py-6 text-center">
            <CheckCircle2 size={44} className="mx-auto text-emerald-500" aria-hidden="true" />
            <h2 id="da-titre" className="mt-3 text-lg font-black text-gray-800">Demande envoyée</h2>
            <p className="mt-2 text-sm text-gray-600">La RH et l'administration ont reçu votre demande. Dès qu'elle sera approuvée, vous pourrez vous connecter avec l'identifiant et le mot de passe que vous venez de choisir.</p>
            <button type="button" onClick={onClose} className="mt-5 rounded-2xl px-6 py-2.5 text-sm font-extrabold text-white" style={{ background: ROUGE }}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={envoyer} noValidate className="space-y-3">
            <div className="flex items-center gap-3 pr-8">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: ROUGE }}><UserPlus size={20} aria-hidden="true" /></span>
              <div>
                <h2 id="da-titre" className="text-lg font-black text-gray-800">Demander un accès</h2>
                <p className="text-xs text-gray-500">Votre demande est examinée par la RH. Vous aurez accès à E-TACHES.</p>
              </div>
            </div>

            <div><label htmlFor="da-nom" className={LIBELLE}>Nom et prénom</label><input id="da-nom" className={CHAMP} value={f.nom} onChange={maj('nom')} autoComplete="name" /></div>
            <div><label htmlFor="da-login" className={LIBELLE}>Identifiant souhaité</label><input id="da-login" className={CHAMP} value={f.login} onChange={maj('login')} placeholder="ex : prenom.nom" autoComplete="username" autoCapitalize="none" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="da-tel" className={LIBELLE}>Téléphone</label><input id="da-tel" className={CHAMP} value={f.telephone} onChange={maj('telephone')} inputMode="tel" autoComplete="tel" /></div>
              <div><label htmlFor="da-poste" className={LIBELLE}>Poste</label><input id="da-poste" className={CHAMP} value={f.poste} onChange={maj('poste')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="da-pass" className={LIBELLE}>Mot de passe</label><input id="da-pass" type="password" className={CHAMP} value={f.pass} onChange={maj('pass')} autoComplete="new-password" /></div>
              <div><label htmlFor="da-conf" className={LIBELLE}>Confirmation</label><input id="da-conf" type="password" className={CHAMP} value={f.confirmation} onChange={maj('confirmation')} autoComplete="new-password" /></div>
            </div>
            {/* Champ piège pour les robots : invisible, jamais rempli par une personne. */}
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.site} onChange={maj('site')} className="absolute -left-[9999px] h-0 w-0 opacity-0" />

            {erreur && (
              <div role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700">
                <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{erreur}</span>
              </div>
            )}

            <button type="submit" disabled={envoi} className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-base font-extrabold text-white shadow-[0_14px_26px_-12px_rgba(188,60,49,0.8)] disabled:opacity-60" style={{ background: ROUGE }}>
              {envoi ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
              {envoi ? 'Envoi en cours' : 'Envoyer la demande'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}

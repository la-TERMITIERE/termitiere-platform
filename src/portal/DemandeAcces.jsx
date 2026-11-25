// Fenêtre « Demander un accès » de la page de connexion : un employé sans compte envoie sa demande à la RH, qui la valide (Info peut aussi la voir
// et la valider). Tant que la RH n'a pas validé, la personne n'a aucun accès ; une fois validée, son compte existe (rôle Agent, E-TACHES) et
// un message de bienvenue l'attend. Présentation en tuiles de verre (bento) ; à l'envoi, l'enveloppe se plie en avion de papier et s'envole.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Mail, Send, Loader2, CheckCircle2, TriangleAlert, UserPlus, User, LockKeyhole, AtSign, Phone, Briefcase, Lock, Eye, EyeOff, StickyNote } from 'lucide-react'
import { soumettreDemandeAcces } from '../core/acces'

const ROUGE = '#BC3C31'
const TUILE = 'group relative rounded-3xl border border-white/80 bg-white/55 p-3 shadow-[0_10px_22px_-16px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition-shadow focus-within:shadow-[0_14px_26px_-14px_rgba(188,60,49,0.45),inset_0_1px_0_rgba(255,255,255,0.95)]'
const CHAMP = 'input-base !rounded-2xl !border-white/80 !bg-white/80 !py-2.5 !pl-10 font-semibold shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:!bg-white'
const LIBELLE = 'mb-1.5 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wide text-gray-500'
const ICONE = 'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 transition-all duration-200 group-focus-within:scale-110 group-focus-within:text-[#BC3C31]'
const VIDE = { nom: '', prenom: '', login: '', telephone: '', poste: '', pass: '', confirmation: '', note: '', site: '' }

// Les animations sont coupées si l'appareil le demande ou si la préférence « sans animations » de l'application est activée.
const animationsCoupees = () => {
  try { return document.documentElement.classList.contains('sans-animations') || window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

function Champ({ id, label, icone: Icone, obligatoire = true, large = false, children }) {
  return (
    <div className={`${TUILE} ${large ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={id} className={LIBELLE}>{label}{obligatoire ? <span className="text-[#BC3C31]" aria-hidden="true">*</span> : <span className="font-bold normal-case tracking-normal text-gray-400">(facultatif)</span>}</label>
      <div className="relative">
        <Icone size={17} aria-hidden="true" className={large ? `${ICONE} !top-4 !translate-y-0` : ICONE} />
        {children}
      </div>
    </div>
  )
}

export default function DemandeAcces({ onClose }) {
  const [f, setF] = useState(VIDE)
  const [voir, setVoir] = useState(false)
  const [phase, setPhase] = useState('saisie') // 'saisie' | 'envoi' (enveloppe qui se plie) | 'vol' (l'avion part) | 'fait'
  const [erreur, setErreur] = useState('')
  const maj = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const occupe = phase === 'envoi' || phase === 'vol'

  function verifier() {
    if (f.nom.trim().length < 2) return 'Indiquez votre nom.'
    if (f.prenom.trim().length < 2) return 'Indiquez votre prénom.'
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(f.login.trim())) return "L'identifiant doit faire 3 à 40 caractères : lettres, chiffres, point ou tiret, sans espace."
    if (f.telephone.replace(/\D/g, '').length < 8) return 'Indiquez un numéro de téléphone valide.'
    if (f.poste.trim().length < 2) return 'Indiquez votre poste.'
    if (f.pass.length < 6) return 'Le mot de passe doit faire au moins 6 caractères.'
    if (f.pass !== f.confirmation) return 'Les deux mots de passe ne sont pas identiques.'
    return ''
  }

  async function envoyer(e) {
    e.preventDefault()
    if (occupe) return
    const probleme = verifier()
    setErreur(probleme)
    if (probleme) return
    setPhase('envoi')
    const res = await soumettreDemandeAcces({ nom: f.nom, prenom: f.prenom, login: f.login.trim(), telephone: f.telephone, poste: f.poste, note: f.note, pass: f.pass, site: f.site })
    if (!res?.ok) { setPhase('saisie'); setErreur(res?.error || "L'envoi a échoué : réessayez."); return }
    if (animationsCoupees()) { setPhase('fait'); return }
    setPhase('vol')
    setTimeout(() => setPhase('fait'), 1150) // le temps que l'avion quitte l'écran
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gradient-to-br from-[#1A1A1A]/55 via-[#6B1A10]/35 to-[#BC3C31]/35 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="da-titre"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !occupe) onClose() }}>
      <style>{`
        @keyframes da-entree { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }
        @keyframes da-tuile { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        /* L'enveloppe se plie (elle se tasse et pivote) pendant l'envoi */
        @keyframes da-plie { 0%, 100% { transform: scale(1) rotate(0); } 50% { transform: scale(.82) rotate(-12deg); } }
        /* L'enveloppe disparaît en se pliant, l'avion de papier naît à sa place */
        @keyframes da-env-sort { to { opacity: 0; transform: scale(.4) rotate(-35deg); } }
        @keyframes da-avion { 0% { opacity: 0; transform: scale(.4) rotate(-30deg); } 22% { opacity: 1; transform: scale(1.15) rotate(0); }
          38% { transform: translate(-8px, 5px) rotate(-8deg); } 100% { opacity: 0; transform: translate(340px, -240px) rotate(18deg) scale(.55); } }
        @keyframes da-sillage { 0% { opacity: 0; transform: scaleX(0); } 40% { opacity: .9; } 100% { opacity: 0; transform: scaleX(1); } }
        @keyframes da-coche { 0% { transform: scale(0) rotate(-30deg); opacity: 0; } 60% { transform: scale(1.15) rotate(6deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }
        .da-panneau { animation: da-entree .35s cubic-bezier(.2,.8,.2,1) both; }
        .da-tuile { animation: da-tuile .4s ease-out both; }
        .da-plie { animation: da-plie .7s ease-in-out infinite; }
        .da-env-sort { animation: da-env-sort .28s ease-in forwards; }
        .da-avion { animation: da-avion 1.1s cubic-bezier(.45,0,.4,1) forwards; }
        .da-sillage { position: absolute; left: 50%; top: 50%; height: 2px; width: 220px; transform-origin: left center; rotate: -35deg; border-radius: 9999px;
          background: linear-gradient(90deg, rgba(255,255,255,.9), rgba(255,255,255,0)); animation: da-sillage 1s ease-out .2s forwards; opacity: 0; }
        .da-coche { animation: da-coche .5s cubic-bezier(.34,1.56,.64,1) both; }
        html.sans-animations .da-panneau, html.sans-animations .da-tuile { animation: none; }
        @media (prefers-reduced-motion: reduce) { .da-panneau, .da-tuile, .da-plie, .da-coche { animation: none; } }
      `}</style>

      <div className="da-panneau relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border border-white/70 bg-white/65 p-4 shadow-[0_30px_70px_-24px_rgba(120,30,20,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl backdrop-saturate-150 sm:p-5">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl" style={{ background: ROUGE }} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/70 to-transparent" />
        <button type="button" onClick={onClose} disabled={occupe} aria-label="Fermer" className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white hover:text-gray-700 disabled:opacity-40">
          <X size={18} aria-hidden="true" />
        </button>

        {phase === 'fait' ? (
          <div className="relative px-2 py-8 text-center">
            <span className="da-coche mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-[0_14px_28px_-10px_rgba(16,185,129,0.7),inset_0_2px_2px_rgba(255,255,255,0.5)]" style={{ background: 'linear-gradient(145deg, #34d399, #059669)' }}>
              <CheckCircle2 size={34} aria-hidden="true" />
            </span>
            <h2 id="da-titre" className="mt-4 text-xl font-black text-gray-800">Demande envoyée</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-gray-600">Votre demande est partie à la RH. Tant qu'elle n'est pas validée, vous n'avez pas encore accès à la plateforme. Dès sa validation, connectez-vous avec l'identifiant <strong>{f.login.trim()}</strong> et votre mot de passe : un message de bienvenue vous attend.</p>
            <button type="button" onClick={onClose} className="mt-6 rounded-2xl px-7 py-2.5 text-sm font-extrabold text-white shadow-[0_14px_26px_-12px_rgba(188,60,49,0.8),inset_0_1px_0_rgba(255,255,255,0.45)]" style={{ background: `linear-gradient(135deg, #d4574b 0%, ${ROUGE} 50%, #8f2a21 100%)` }}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={envoyer} noValidate className="relative">
            {/* En-tête : tuile pleine largeur */}
            <div className="da-tuile mb-3 flex items-center gap-3 rounded-3xl border border-white/40 p-3.5 pr-10 text-white shadow-[0_16px_30px_-14px_rgba(188,60,49,0.65),inset_0_1px_0_rgba(255,255,255,0.45)]"
              style={{ background: `linear-gradient(135deg, #d4574b 0%, ${ROUGE} 55%, #6b1a10 100%)` }}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md"><UserPlus size={22} aria-hidden="true" /></span>
              <div className="min-w-0">
                <h2 id="da-titre" className="text-lg font-black leading-tight">Demander un accès</h2>
                <p className="text-xs text-white/85">La RH examine votre demande. Une fois validée, vous aurez accès à E-TACHES.</p>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {[
                ['da-nom', 'Nom', User, <input key="i" id="da-nom" className={CHAMP} value={f.nom} onChange={maj('nom')} autoComplete="family-name" placeholder="ex : EDAH" />],
                ['da-prenom', 'Prénom', User, <input key="i" id="da-prenom" className={CHAMP} value={f.prenom} onChange={maj('prenom')} autoComplete="given-name" placeholder="ex : Josué" />],
                ['da-login', 'Identifiant souhaité', AtSign, <input key="i" id="da-login" className={CHAMP} value={f.login} onChange={maj('login')} autoComplete="username" autoCapitalize="none" placeholder="ex : prenom.nom" />],
                ['da-tel', 'Téléphone', Phone, <input key="i" id="da-tel" className={CHAMP} value={f.telephone} onChange={maj('telephone')} inputMode="tel" autoComplete="tel" placeholder="ex : 90 00 00 00" />],
                ['da-poste', 'Poste', Briefcase, <input key="i" id="da-poste" className={CHAMP} value={f.poste} onChange={maj('poste')} placeholder="ex : Agent de terrain" />]
              ].map(([id, label, icone, champ], i) => (
                <div key={id} className={`da-tuile ${id === 'da-poste' ? 'sm:col-span-2' : ''}`} style={{ animationDelay: `${60 + i * 45}ms` }}>
                  <Champ id={id} label={label} icone={icone}>{champ}</Champ>
                </div>
              ))}
              <div className="da-tuile" style={{ animationDelay: '290ms' }}>
                <Champ id="da-pass" label="Mot de passe" icone={Lock}>
                  <input id="da-pass" type={voir ? 'text' : 'password'} className={`${CHAMP} !pr-11`} value={f.pass} onChange={maj('pass')} autoComplete="new-password" placeholder="6 caractères au moins" />
                  <button type="button" onClick={() => setVoir((v) => !v)} aria-label={voir ? 'Masquer les mots de passe' : 'Afficher les mots de passe'} aria-pressed={voir}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-gray-400 hover:bg-white/80 hover:text-gray-700">
                    {voir ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </Champ>
              </div>
              <div className="da-tuile" style={{ animationDelay: '335ms' }}>
                <Champ id="da-conf" label="Confirmer le mot de passe" icone={LockKeyhole}>
                  <input id="da-conf" type={voir ? 'text' : 'password'} className={CHAMP} value={f.confirmation} onChange={maj('confirmation')} autoComplete="new-password" placeholder="Retapez le mot de passe" />
                </Champ>
              </div>
              <div className="da-tuile sm:col-span-2" style={{ animationDelay: '380ms' }}>
                <Champ id="da-note" label="Note" icone={StickyNote} obligatoire={false} large>
                  <textarea id="da-note" rows={2} maxLength={300} className={`${CHAMP} resize-none`} value={f.note} onChange={maj('note')} placeholder="Un mot pour la RH : votre service, votre responsable…" />
                </Champ>
              </div>
            </div>
            {/* Champ piège pour les robots : invisible, jamais rempli par une personne. */}
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.site} onChange={maj('site')} className="absolute -left-[9999px] h-0 w-0 opacity-0" />
            <p className="mt-2 px-1 text-[11px] font-semibold text-gray-500"><span className="text-[#BC3C31]">*</span> Champs obligatoires.</p>

            {erreur && (
              <div role="alert" className="mt-2 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-sm font-semibold text-red-700 backdrop-blur-md">
                <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{erreur}</span>
              </div>
            )}

            {/* Bouton d'envoi : verre rouge en relief ; à l'envoi, l'enveloppe se plie en avion de papier qui s'envole */}
            <button type="submit" disabled={occupe}
              className="group relative mt-3 flex w-full items-center justify-center gap-2.5 overflow-visible rounded-2xl border border-white/40 py-3.5 text-base font-extrabold text-white shadow-[0_16px_30px_-12px_rgba(188,60,49,0.8),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-2px_0_rgba(0,0,0,0.15)] transition-all enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 enabled:active:scale-[0.99] disabled:cursor-default focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#BC3C31]/30"
              style={{ background: `linear-gradient(135deg, #d4574b 0%, ${ROUGE} 50%, #8f2a21 100%)` }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/30 to-transparent" />
              <span className="relative flex h-7 w-7 items-center justify-center" aria-hidden="true">
                {phase === 'saisie' && <Mail size={20} className="transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110" />}
                {phase === 'envoi' && <Mail size={20} className="da-plie" />}
                {phase === 'vol' && (<>
                  <Mail size={20} className="da-env-sort absolute" />
                  <span className="da-sillage" />
                  <Send size={20} className="da-avion absolute" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.35))' }} />
                </>)}
              </span>
              <span className="relative">{phase === 'envoi' ? 'Envoi en cours' : phase === 'vol' ? 'Demande envoyée' : 'Envoyer la demande'}</span>
              {phase === 'envoi' && <Loader2 size={16} className="relative animate-spin" aria-hidden="true" />}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}

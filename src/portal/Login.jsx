// Page de connexion unifiée de la plateforme. Mise en page d'origine (une colonne centrée : logo, nom, slogan, carte de connexion, adresse) :
// seul le DESIGN change : verre dépoli, champs en tuiles « bento », icônes légères, animations, police Book Antiqua, salutation d'accueil.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, User, Lock, Eye, EyeOff, MapPin, Phone, ArrowRight, TriangleAlert, LogIn, Sparkles, HeartHandshake, Star, Heart, Smile, Sun, Flower2, Gem, Handshake, Sprout } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { DEFAULT_USERS } from '../core/auth'
import { icone3D } from '../utils/color'
import DemandeAcces from './DemandeAcces'

const ROUGE = '#BC3C31'
const POLICE = "'Book Antiqua', 'Palatino Linotype', Palatino, 'URW Palladio L', Georgia, serif"

// Mots d'accueil qui défilent en bas de page : français, langues du Togo (orthographe donnée par le user) et anglais.
const ACCUEILS = ['Bienvenue', 'Wézon', 'Nodé', 'Ètalidéou', 'Welcome']

// Tuile de verre : fond translucide flouté, liseré clair, reflet en haut.
const VERRE = 'relative overflow-hidden border border-white/70 bg-white/55 shadow-[0_24px_60px_-28px_rgba(120,30,20,0.45),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_24px_60px_-28px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)]'
const Reflet = () => <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/60 to-transparent dark:from-white/[0.06]" />

// Petites icônes décoratives qui dérivent doucement dans le fond (très discrètes, sans rapport avec un secteur).
const DECOR = [
  { I: Sparkles, x: '6%', y: '14%', t: 34, d: '0s', r: 18 }, { I: Star, x: '88%', y: '10%', t: 36, d: '-3s', r: -12 }, { I: Heart, x: '93%', y: '48%', t: 30, d: '-6s', r: 10 },
  { I: Smile, x: '4%', y: '56%', t: 36, d: '-9s', r: -16 }, { I: Sun, x: '80%', y: '86%', t: 38, d: '-2s', r: 14 }, { I: Flower2, x: '14%', y: '88%', t: 32, d: '-7s', r: -8 },
  { I: Gem, x: '48%', y: '4%', t: 28, d: '-5s', r: 12 }, { I: Handshake, x: '52%', y: '94%', t: 30, d: '-11s', r: -10 }, { I: Sprout, x: '70%', y: '30%', t: 26, d: '-8s', r: 8 }
]

// Champ en tuile de verre (bento) : libellé, icône qui réagit au focus, champ arrondi.
const TUILE = 'group rounded-3xl border border-white/80 bg-white/55 p-3 shadow-[0_10px_22px_-16px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition-shadow focus-within:shadow-[0_14px_26px_-14px_rgba(188,60,49,0.45),inset_0_1px_0_rgba(255,255,255,0.95)] dark:border-white/10 dark:bg-white/5'
const CHAMP = 'input-base !rounded-2xl !border-white/80 !bg-white/80 !py-2.5 !pl-10 font-semibold shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:!bg-white dark:!border-white/10 dark:!bg-white/5'
const ICONE_CHAMP = 'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 transition-all duration-200 group-focus-within:scale-110 group-focus-within:text-[#BC3C31]'

export default function Login() {
  const navigate = useNavigate()
  const { login, isLoading, error, clearError } = useAuth()
  const [loginId, setLoginId] = useState('')
  const [pass, setPass] = useState('')
  const [voir, setVoir] = useState(false)
  const [accueil, setAccueil] = useState(0)
  const [demande, setDemande] = useState(false)
  useEffect(() => { const t = setInterval(() => setAccueil((i) => (i + 1) % ACCUEILS.length), 3200); return () => clearInterval(t) }, [])

  const onSubmit = async (e) => {
    e.preventDefault()
    clearError()
    const ok = await login(loginId, pass)
    if (ok) navigate('/', { replace: true })
  }

  return (
    <div className="lg-racine relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#faf6f5] via-[#f7e6e2] to-[#efcfc9] p-4 dark:from-[#15191c] dark:via-[#1c1618] dark:to-[#2b1613]">
      <style>{`
        .lg-racine, .lg-racine input, .lg-racine button, .lg-racine summary { font-family: ${POLICE}; }
        @keyframes lg-flotte { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 50% { transform: translate3d(28px, -30px, 0) scale(1.08); } }
        @keyframes lg-entree { from { opacity: 0; transform: translateY(14px) scale(0.985); } to { opacity: 1; transform: none; } }
        @keyframes lg-brille { 0% { transform: translateX(-130%) skewX(-20deg); } 60%, 100% { transform: translateX(260%) skewX(-20deg); } }
        @keyframes lg-derive { 0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--r)); } 50% { transform: translate3d(10px, -22px, 0) rotate(calc(var(--r) * -1)); } }
        @keyframes lg-leger { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes lg-scintille { 0%, 100% { opacity: 0.45; transform: scale(0.85) rotate(0); } 50% { opacity: 1; transform: scale(1.15) rotate(20deg); } }
        @keyframes lg-secoue { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
        @keyframes lg-fleche { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(3px); } }
        @keyframes lg-bienvenue { 0% { opacity: 0; transform: scale(0.25) rotate(-28deg); } 55% { opacity: 1; transform: scale(1.16) rotate(7deg); } 78% { transform: scale(0.96) rotate(-3deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
        @keyframes lg-badge { from { opacity: 0; transform: scale(0) translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes lg-mot { from { opacity: 0; transform: translateY(8px); filter: blur(3px); } to { opacity: 1; transform: none; filter: none; } }
        .lg-blob { animation: lg-flotte 14s ease-in-out infinite; }
        .lg-entree { animation: lg-entree 0.6s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .lg-brille { animation: lg-brille 4s ease-in-out infinite; }
        .lg-deco { animation: lg-derive 16s ease-in-out infinite; }
        .lg-leger { animation: lg-leger 5s ease-in-out infinite; }
        .lg-scintille { animation: lg-scintille 2.6s ease-in-out infinite; }
        .lg-secoue { animation: lg-secoue 0.45s ease-in-out; }
        .lg-fleche { animation: lg-fleche 1.8s ease-in-out infinite; }
        .lg-bienvenue { animation: lg-bienvenue 1.1s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both; }
        /* La termite qui fait le tour du logo : le conteneur tourne, la termite reste à son bord, la tête dans le sens de la marche. */
        @keyframes lg-orbite { to { transform: rotate(360deg); } }
        @keyframes lg-trotte { 0%, 100% { transform: translateX(-50%) rotate(90deg) translateY(0); } 25% { transform: translateX(-50%) rotate(92deg) translateY(-1.2px); } 75% { transform: translateX(-50%) rotate(88deg) translateY(1.2px); } }
        @keyframes lg-patte-a { 0%, 100% { transform: rotate(-14deg); } 50% { transform: rotate(14deg); } }
        @keyframes lg-patte-b { 0%, 100% { transform: rotate(14deg); } 50% { transform: rotate(-14deg); } }
        .lg-termite-orbite { animation: lg-orbite 11s linear 1.2s infinite both; }
        /* Éclats : trois petites étoiles qui clignotent doucement derrière la termite (l'animation est légère et discrète). */
        @keyframes lg-clignote { 0%, 100% { opacity: 0.18; transform: scale(0.65) rotate(0deg); } 50% { opacity: 1; transform: scale(1.15) rotate(45deg); } }
        .lg-eclat { position: absolute; left: 50%; top: 4px; width: 0; height: 0; }
        .lg-eclat svg { position: absolute; overflow: visible; opacity: 0.18; filter: drop-shadow(0 0 3px rgba(251, 191, 36, 0.95)) drop-shadow(0 0 1px #f59e0b); animation: lg-clignote 1.9s ease-in-out infinite; }
        /* Sillage : un arc qui s'estompe derrière la termite (il tourne avec elle). */
        .lg-sillage { position: absolute; inset: 0; border-radius: 9999px;
          background: conic-gradient(from 0deg, transparent 0deg 292deg, rgba(139, 58, 43, 0) 292deg, rgba(139, 58, 43, 0.75) 357deg, transparent 357deg);
          -webkit-mask: radial-gradient(circle, transparent 61px, #000 62.5px, #000 69.5px, transparent 71px); mask: radial-gradient(circle, transparent 61px, #000 62.5px, #000 69.5px, transparent 71px); }
        /* Piste : le tunnel que la termite emprunte, en pointillés très discrets. */
        .lg-piste { position: absolute; inset: -4px; border-radius: 9999px; border: 1px dashed rgba(139, 58, 43, 0.28); }
        /* Traces de pas : chaque trace apparaît au passage de la termite, puis s'efface avant son retour. */
        @keyframes lg-trace { 0% { opacity: 0.85; } 100% { opacity: 0; } }
        .lg-trace { position: absolute; left: 50%; top: 50%; width: 3px; height: 3px; margin: -1.5px 0 0 -1.5px; border-radius: 9999px; background: #8b3a2b; opacity: 0; animation: lg-trace 11s linear infinite; }
        .lg-termite { position: absolute; left: 50%; top: -8px; width: 15px; height: 24px; transform: translateX(-50%) rotate(90deg); animation: lg-trotte 0.55s ease-in-out infinite; filter: drop-shadow(0 2px 2px rgba(60, 20, 10, 0.35)); overflow: visible; }
        .lg-patte-a { transform-origin: 12px 17px; animation: lg-patte-a 0.275s ease-in-out infinite; }
        .lg-patte-b { transform-origin: 12px 17px; animation: lg-patte-b 0.275s ease-in-out infinite; }
        .lg-badge { animation: lg-badge 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 1.2s both; }
        .lg-mot { animation: lg-mot 0.6s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .lg-blob, .lg-entree, .lg-brille, .lg-deco, .lg-leger, .lg-scintille, .lg-secoue, .lg-fleche, .lg-bienvenue, .lg-badge, .lg-mot { animation: none; } }
      `}</style>
      {/* Logo de La Termitière en filigrane : très pâle pour ne pas gêner la lecture. */}
      <img src="/termitiere-logo.png" alt="" aria-hidden="true" onError={(e) => { e.target.src = '/logo-full.png' }} draggable={false}
        className="pointer-events-none absolute left-1/2 top-1/2 w-[min(130vmin,980px)] -translate-x-1/2 -translate-y-1/2 select-none rounded-full opacity-[0.09] dark:opacity-[0.07]" />

      {/* Fond : grosses taches de couleur floutées et petites icônes qui dérivent, derrière le verre */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="lg-blob absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-60 blur-3xl" style={{ background: `radial-gradient(circle, ${ROUGE}, transparent 70%)` }} />
        <span className="lg-blob absolute -bottom-32 right-[-6rem] h-[28rem] w-[28rem] rounded-full opacity-50 blur-3xl" style={{ background: 'radial-gradient(circle, #f59e0b, transparent 70%)', animationDelay: '-5s' }} />
        <span className="lg-blob absolute left-1/3 top-1/2 h-80 w-80 rounded-full opacity-35 blur-3xl" style={{ background: 'radial-gradient(circle, #7c3aed, transparent 70%)', animationDelay: '-9s' }} />
        <span className="lg-blob absolute right-1/4 top-0 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: 'radial-gradient(circle, #0284c7, transparent 70%)', animationDelay: '-2s' }} />
        {DECOR.map(({ I, x, y, t, d, r }, i) => (
          <I key={i} size={t} strokeWidth={1.6} className="lg-deco absolute text-[#BC3C31]/[0.14] dark:text-white/[0.08]" style={{ left: x, top: y, '--r': `${r}deg`, animationDelay: d }} />
        ))}
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo + marque */}
        <div className={`${VERRE} lg-entree mb-4 rounded-[2rem] px-6 pb-6 pt-8`}>
          <Reflet />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-10 left-1/2 h-24 w-3/4 -translate-x-1/2 rounded-full bg-[#BC3C31]/10 blur-2xl" />
          <div className="relative flex flex-col items-center">
          {/* Logo : arrivée en rebond, ondes qui rayonnent, petite main qui salue */}
          <div className="lg-bienvenue relative mb-4">
            <div className="relative flex items-center justify-center rounded-full" style={{ width: 112, height: 112, boxShadow: `0 0 0 4px #ffffff88, 0 14px 30px -10px ${ROUGE}88`, background: `linear-gradient(135deg, #ffffff 0%, #fde8e4 50%, ${ROUGE} 100%)`, padding: 4 }}>
              <div className="flex h-full w-full items-center justify-center rounded-full bg-white">
                <img src="/termitiere-logo.png" alt="LA TERMITIÈRE" onError={(e) => { e.target.src = '/logo-full.png' }} className="h-24 w-24 rounded-full object-cover" />
              </div>
            </div>
            <span aria-hidden="true" className="pointer-events-none absolute" style={{ inset: -14 }}>
              <span className="lg-piste" />
              {Array.from({ length: 30 }, (_, i) => {
                const a = i * 12
                const dec = ((a % 24) === 0 ? 2.2 : -2.2) // pas alternés : un côté, puis l'autre, comme des empreintes
                return <span key={i} className="lg-trace" style={{ transform: `rotate(${a}deg) translateY(${-66 + dec}px)`, animationDelay: `${(1.2 + (a / 360) * 11).toFixed(2)}s` }} />
              })}
            </span>
            <span aria-hidden="true" className="lg-termite-orbite pointer-events-none absolute" style={{ inset: -14 }}>
              <span className="lg-sillage" />
              <svg className="lg-termite" viewBox="0 0 24 40" fill="none" strokeLinecap="round" strokeLinejoin="round">
                {/* pattes : trois de chaque côté, deux groupes qui alternent */}
                <g className="lg-patte-a" stroke="#6b2b1a" strokeWidth="1.3">
                  <path d="M8 15 L2 11" /><path d="M8 18 L1 19" /><path d="M16 20 L23 23" />
                </g>
                <g className="lg-patte-b" stroke="#6b2b1a" strokeWidth="1.3">
                  <path d="M16 15 L22 11" /><path d="M16 18 L23 19" /><path d="M8 20 L1 23" />
                </g>
                {/* antennes */}
                <path d="M10.2 5 Q7.5 1.5 5 2" stroke="#6b2b1a" strokeWidth="1" /><path d="M13.8 5 Q16.5 1.5 19 2" stroke="#6b2b1a" strokeWidth="1" />
                {/* abdomen */}
                <ellipse cx="12" cy="29" rx="6.6" ry="9.2" fill="#F3D6A4" stroke="#6b2b1a" strokeWidth="1" />
                <path d="M6.2 26 Q12 28 17.8 26 M5.9 30 Q12 32 18.1 30 M6.6 34 Q12 36 17.4 34" stroke="#c9975a" strokeWidth="0.9" />
                {/* thorax */}
                <ellipse cx="12" cy="17.5" rx="4.6" ry="5" fill="#E2A86B" stroke="#6b2b1a" strokeWidth="1" />
                {/* tête et mandibules */}
                <ellipse cx="12" cy="8.6" rx="4.2" ry="4.4" fill="#BC3C31" stroke="#6b2b1a" strokeWidth="1" />
                <path d="M10.4 4.6 L9.4 3 M13.6 4.6 L14.6 3" stroke="#6b2b1a" strokeWidth="1.1" />
                <circle cx="10.4" cy="8" r="0.9" fill="#3b1209" /><circle cx="13.6" cy="8" r="0.9" fill="#3b1209" />
              </svg>
              {/* Trois petits éclats suivent la termite et clignotent doucement, en décalé. */}
              {[[-68, 0], [-84, 0.45], [-100, 0.9]].map(([angle, retard], i) => (
                <span key={angle} className="lg-eclat" style={{ transform: `rotate(${angle}deg)` }}>
                  <svg viewBox="0 0 24 24" style={{ animationDelay: `${(1.2 + retard).toFixed(2)}s`, width: [11, 14, 9][i], height: [11, 14, 9][i], left: -[11, 14, 9][i] / 2, top: -[11, 14, 9][i] / 2 }} aria-hidden="true">
                    <path d="M12 0 L14.2 9.8 L24 12 L14.2 14.2 L12 24 L9.8 14.2 L0 12 L9.8 9.8 Z" fill="#fff7d1" />
                  </svg>
                </span>
              ))}
            </span>
          </div>

          <h1 className="text-xl font-black tracking-wide" style={{ background: `linear-gradient(90deg, ${ROUGE} 0%, #1A1A1A 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>LA TERMITIÈRE</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400"><Sparkles size={13} aria-hidden="true" className="lg-scintille text-amber-500" />Toujours dans l'action</p>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate className={`${VERRE} lg-entree rounded-[2rem] p-6`} style={{ animationDelay: '120ms' }}>
          <Reflet />
          <div className="relative space-y-3">
            <div className="mb-1 flex items-center gap-3">
              <span className="lg-leger flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={icone3D(ROUGE)}><LogIn size={20} aria-hidden="true" /></span>
              <div>
                <h2 className="text-lg font-black text-gray-800 dark:text-gray-100">Connexion</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Entrez vos identifiants pour accéder à votre espace.</p>
              </div>
            </div>

            <div className={TUILE}>
              <label htmlFor="lg-id" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-gray-500 dark:text-gray-400">Identifiant</label>
              <div className="relative">
                <User size={18} aria-hidden="true" className={ICONE_CHAMP} />
                <input id="lg-id" className={CHAMP} value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="ex : admin" autoComplete="username" autoFocus={typeof window !== 'undefined' && window.innerWidth >= 1024} />
              </div>
            </div>

            <div className={TUILE}>
              <label htmlFor="lg-pass" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-gray-500 dark:text-gray-400">Mot de passe</label>
              <div className="relative">
                <Lock size={18} aria-hidden="true" className={ICONE_CHAMP} />
                <input id="lg-pass" type={voir ? 'text' : 'password'} className={`${CHAMP} !pr-12`} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                <button type="button" onClick={() => setVoir((v) => !v)} aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={voir}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-white/80 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BC3C31]/50">
                  {voir ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" key={error} className="lg-secoue flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50/80 px-3.5 py-2.5 text-sm font-semibold text-red-700 backdrop-blur-md">
                <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" /><span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={isLoading}
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl border border-white/40 py-3 text-base font-extrabold text-white shadow-[0_16px_30px_-12px_rgba(188,60,49,0.8),inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-2px_0_rgba(0,0,0,0.15)] transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#BC3C31]/30"
              style={{ background: `linear-gradient(135deg, #d4574b 0%, ${ROUGE} 50%, #8f2a21 100%)` }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
              <span aria-hidden="true" className="lg-brille pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              <span className="relative inline-flex items-center gap-2">
                {isLoading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
                {isLoading ? 'Connexion en cours' : 'Se connecter'}
                {!isLoading && <ArrowRight size={18} aria-hidden="true" className="lg-fleche" />}
              </span>
            </button>

            <button type="button" onClick={() => setDemande(true)} className="w-full rounded-2xl border border-white/80 bg-white/50 py-2.5 text-sm font-extrabold text-gray-700 backdrop-blur-md transition-colors hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BC3C31]/40">
              Pas encore de compte ? <span style={{ color: ROUGE }}>Demander un accès</span>
            </button>

            {/* Comptes de démonstration : visibles uniquement en développement local, jamais sur le site déployé (production). */}
            {import.meta.env.DEV && (
              <details className="rounded-2xl border border-white/70 bg-white/50 p-3 text-xs text-gray-600 backdrop-blur-md">
                <summary className="cursor-pointer font-bold text-gray-700">Comptes de démonstration (développement)</summary>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {DEFAULT_USERS.map((u) => (
                    <button key={u.login} type="button" onClick={() => { setLoginId(u.login); setPass(u.pass) }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/80">
                      <span className="truncate font-mono">{u.login} / {u.pass}</span>
                      <span className="shrink-0 capitalize text-gray-400">{u.role}</span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        </form>
        {demande && <DemandeAcces onClose={() => setDemande(false)} />}

        {/* Salutation d'accueil */}
        <div className="lg-entree mt-4 flex items-center gap-3 rounded-full border border-white/70 bg-white/55 py-2 pl-2 pr-4 shadow-[0_14px_30px_-18px_rgba(120,30,20,0.5),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.06]" style={{ animationDelay: '700ms' }}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={icone3D(ROUGE)}><HeartHandshake size={17} aria-hidden="true" className="lg-leger" /></span>
          <p className="min-w-0 text-left text-sm text-gray-700 dark:text-gray-200" aria-live="polite">
            <span key={accueil} className="lg-mot inline-block text-base font-bold italic" style={{ color: ROUGE }}>{ACCUEILS[accueil]},</span>
            <span className="text-gray-500 dark:text-gray-400"> à La Termitière. Ici, chacun est chez soi : prenez place, nous sommes heureux de vous accueillir.</span>
          </p>
        </div>

        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1.5"><MapPin size={13} aria-hidden="true" />Agoe Daliko, Lomé : Togo</span>
          <span className="inline-flex items-center gap-1.5"><Phone size={13} aria-hidden="true" />00228 96 09 49 49</span>
        </p>
      </div>
    </div>
  )
}

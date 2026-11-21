// Page de connexion unifiée de la plateforme. Mise en page d'origine (une colonne centrée : logo, nom, slogan, carte de connexion, adresse) :
// seul le DESIGN change : verre dépoli, champs en tuiles « bento », icônes légères, animations, police Book Antiqua, salutation d'accueil.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, User, Lock, Eye, EyeOff, MapPin, Phone, ArrowRight, TriangleAlert, LogIn, Sparkles, HandHeart, HeartHandshake, Star, Heart, Smile, Sun, Flower2, Gem, Handshake, Sprout } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { DEFAULT_USERS } from '../core/auth'
import { icone3D } from '../utils/color'

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
        @keyframes lg-pouls { 0% { box-shadow: 0 0 0 0 ${ROUGE}cc, 0 0 0 4px #ffffff88; } 50% { box-shadow: 0 0 0 8px ${ROUGE}44, 0 0 0 14px #ffffff22; } 100% { box-shadow: 0 0 0 0 ${ROUGE}cc, 0 0 0 4px #ffffff88; } }
        @keyframes lg-flotte { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 50% { transform: translate3d(28px, -30px, 0) scale(1.08); } }
        @keyframes lg-entree { from { opacity: 0; transform: translateY(14px) scale(0.985); } to { opacity: 1; transform: none; } }
        @keyframes lg-brille { 0% { transform: translateX(-130%) skewX(-20deg); } 60%, 100% { transform: translateX(260%) skewX(-20deg); } }
        @keyframes lg-derive { 0%, 100% { transform: translate3d(0, 0, 0) rotate(var(--r)); } 50% { transform: translate3d(10px, -22px, 0) rotate(calc(var(--r) * -1)); } }
        @keyframes lg-leger { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes lg-scintille { 0%, 100% { opacity: 0.45; transform: scale(0.85) rotate(0); } 50% { opacity: 1; transform: scale(1.15) rotate(20deg); } }
        @keyframes lg-secoue { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
        @keyframes lg-fleche { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(3px); } }
        @keyframes lg-bienvenue { 0% { opacity: 0; transform: scale(0.25) rotate(-28deg); } 55% { opacity: 1; transform: scale(1.16) rotate(7deg); } 78% { transform: scale(0.96) rotate(-3deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
        @keyframes lg-onde { 0% { opacity: 0.7; transform: scale(1); } 100% { opacity: 0; transform: scale(1.9); } }
        @keyframes lg-salue { 0%, 100% { transform: rotate(0); } 15% { transform: rotate(16deg); } 30% { transform: rotate(-10deg); } 45% { transform: rotate(14deg); } 60% { transform: rotate(-6deg); } 75% { transform: rotate(0); } }
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
        .lg-pouls { animation: lg-pouls 2.4s ease-in-out infinite; }
        .lg-pouls.lg-leger { animation: lg-pouls 2.4s ease-in-out infinite, lg-leger 5s ease-in-out infinite; }
        .lg-bienvenue { animation: lg-bienvenue 1.1s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both; }
        .lg-onde { animation: lg-onde 2.2s ease-out 1.1s 3 both; }
        .lg-salue { animation: lg-salue 1.8s ease-in-out 1.4s 2; transform-origin: 70% 80%; }
        .lg-badge { animation: lg-badge 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 1.2s both; }
        .lg-mot { animation: lg-mot 0.6s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .lg-blob, .lg-entree, .lg-brille, .lg-deco, .lg-leger, .lg-scintille, .lg-secoue, .lg-fleche, .lg-pouls, .lg-bienvenue, .lg-onde, .lg-salue, .lg-badge, .lg-mot { animation: none; } }
      `}</style>

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
            <span aria-hidden="true" className="lg-onde pointer-events-none absolute inset-0 rounded-full border-2 border-[#BC3C31]/50" />
            <span aria-hidden="true" className="lg-onde pointer-events-none absolute inset-0 rounded-full border-2 border-[#BC3C31]/35" style={{ animationDelay: '1.7s' }} />
            <div className="lg-pouls lg-leger relative flex items-center justify-center rounded-full" style={{ width: 112, height: 112, background: `linear-gradient(135deg, #ffffff 0%, #fde8e4 50%, ${ROUGE} 100%)`, padding: 4 }}>
              <div className="flex h-full w-full items-center justify-center rounded-full bg-white">
                <img src="/termitiere-logo.png" alt="LA TERMITIÈRE" onError={(e) => { e.target.src = '/logo-full.png' }} className="h-24 w-24 rounded-full object-cover" />
              </div>
            </div>
            <span aria-hidden="true" className="lg-badge absolute -right-1 top-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-lg"><HandHeart size={17} className="lg-salue" /></span>
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

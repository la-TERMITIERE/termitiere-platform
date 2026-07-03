// Page de connexion unifiée de la plateforme.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, User, Lock } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { DEFAULT_USERS } from '../core/auth'

export default function Login() {
  const navigate = useNavigate()
  const { login, isLoading, error, clearError } = useAuth()
  const [loginId, setLoginId] = useState('')
  const [pass, setPass] = useState('')

  const onSubmit = async (e) => {
    e.preventDefault()
    clearError()
    const ok = await login(loginId, pass)
    if (ok) navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#faf6f5] to-[#f1d9d4] p-4">
      <div className="w-full max-w-md">
        {/* Logo + marque */}
        <div className="mb-6 flex flex-col items-center">
          <style>{`
            @keyframes pulse-ring {
              0%   { box-shadow: 0 0 0 0px #BC3C31cc, 0 0 0 4px #ffffff88; }
              50%  { box-shadow: 0 0 0 8px #BC3C3144, 0 0 0 14px #ffffff22; }
              100% { box-shadow: 0 0 0 0px #BC3C31cc, 0 0 0 4px #ffffff88; }
            }
            .logo-pulse {
              animation: pulse-ring 2s ease-in-out infinite;
            }
          `}</style>

          {/* Cercle dégradé rouge→blanc avec logo */}
          <div
            className="logo-pulse relative mb-4 flex items-center justify-center rounded-full bg-white"
            style={{
              width: 112, height: 112,
              background: 'linear-gradient(135deg, #ffffff 0%, #fde8e4 50%, #BC3C31 100%)',
              padding: 4
            }}
          >
            <div className="flex h-full w-full items-center justify-center rounded-full bg-white">
              <img
                src="/termitiere-logo.png"
                alt="LA TERMITIÈRE"
                onError={(e) => { e.target.src = '/logo-full.png' }}
                className="h-24 w-24 rounded-full object-cover"
              />
            </div>
          </div>

          <p
            className="text-base font-extrabold tracking-wide"
            style={{ background: 'linear-gradient(90deg, #BC3C31 0%, #1A1A1A 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            LA TERMITIÈRE
          </p>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-0.5">
            Toujours dans l'action
          </p>
        </div>

        <form onSubmit={onSubmit} className="card p-6">
          <h2 className="mb-4 text-lg font-bold text-gray-800">Connexion</h2>

          <label className="mb-1 block text-sm font-semibold text-gray-700">Identifiant</label>
          <div className="relative mb-3">
            <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input-base pl-10"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="ex : admin"
              autoComplete="username"
              autoFocus
            />
          </div>

          <label className="mb-1 block text-sm font-semibold text-gray-700">Mot de passe</label>
          <div className="relative mb-4">
            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="password"
              className="input-base pl-10"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              ❌ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {isLoading && <Loader2 size={18} className="animate-spin" />}
            Se connecter
          </button>

          {/* Comptes de démonstration : visibles uniquement en développement local,
              jamais sur le site déployé (production). */}
          {import.meta.env.DEV && (
            <div className="mt-5 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <p className="mb-2 font-semibold text-gray-700">Comptes de démonstration :</p>
              <div className="space-y-1">
                {DEFAULT_USERS.map((u) => (
                  <button
                    key={u.login}
                    type="button"
                    onClick={() => { setLoginId(u.login); setPass(u.pass) }}
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-gray-100"
                  >
                    <span className="font-mono">{u.login} / {u.pass}</span>
                    <span className="capitalize text-gray-400">{u.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          Agoe Daliko, Lomé — Togo · 00228 96 09 49 49
        </p>
      </div>
    </div>
  )
}

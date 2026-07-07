// Page d'accueil Maxi Logistique — choix de la sous-application (Lomé ou Kara).
// Chaque site possède son propre stock, ses prestations, factures, autorisations
// et retours : le même workflow, cloisonné par site pour la traçabilité.
import { Link, Navigate } from 'react-router-dom'
import { ChevronRight, Truck } from 'lucide-react'
import { SITES, useAllowedSites } from './site/useSite'

export default function SiteChooser() {
  const allowed = useAllowedSites()
  const sites = SITES.filter((s) => allowed.includes(s.id))

  // Un seul site autorisé → on y entre directement (pas de choix à faire).
  if (sites.length === 1) return <Navigate to={`/logistique/${sites[0].id}`} replace />

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.9) 0%, rgba(26,26,26,0.85) 100%)' }}>
        <div style={{ position: 'relative', flexShrink: 0, width: 56, height: 56 }}>
          <img src="/logo_maxi_logistique.png" alt="Maxi Logistique"
            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', background: 'white', padding: 4, boxShadow: '0 0 0 3px #ffffff' }} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Maxi Logistique</h2>
          <p className="text-sm text-white/80">Choisissez votre site pour accéder à son application</p>
        </div>
      </div>

      {sites.length === 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Aucun site Maxi Logistique ne vous est attribué. Contactez un administrateur pour obtenir l'accès à Lomé et/ou Kara.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {sites.map((s) => (
          <Link key={s.id} to={`/logistique/${s.id}`}
            className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: s.accent }} />
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl"
              style={{ background: `${s.accent}18` }}>{s.emoji}</span>
            <div className="flex-1">
              <p className="flex items-center gap-2 text-lg font-extrabold text-gray-900">
                <Truck size={18} style={{ color: s.accent }} /> Maxi Logistique {s.label}
              </p>
              <p className="text-sm text-gray-500">Stock, prestations, factures & autorisations — {s.label}</p>
            </div>
            <ChevronRight size={22} className="text-gray-300 transition-transform group-hover:translate-x-1" />
          </Link>
        ))}
      </div>
    </div>
  )
}

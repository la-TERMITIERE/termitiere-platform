// Page d'accueil Maxi Logistique — choix de la sous-application (Lomé ou Kara).
// Chaque site possède son propre stock, ses prestations, factures, autorisations
// et retours : le même workflow, cloisonné par site pour la traçabilité.
import { Link, Navigate } from 'react-router-dom'
import { ChevronRight, Building2, Mountain } from 'lucide-react'
import { SITES, useAllowedSites } from './site/useSite'
import { teinterHex, shadeHex } from '../../utils/color'

// Icône distinctive par site — la skyline côtière de Lomé, les massifs de la Kara —
// plutôt qu'un même camion générique répété deux fois.
const ICONE_SITE = { lome: Building2, kara: Mountain }

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
        {sites.map((s) => {
          const Icone = ICONE_SITE[s.id] || Building2
          const fonce = shadeHex(s.accent, -35)
          return (
            <Link key={s.id} to={`/logistique/${s.id}`}
              className="group relative flex flex-col gap-5 overflow-hidden rounded-3xl p-5 text-white shadow-[0_14px_28px_-14px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.25)] backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 hover:-translate-y-1"
              style={{ background: `linear-gradient(150deg, ${teinterHex(s.accent, 0.94)} 0%, ${teinterHex(fonce, 0.96)} 100%)`, boxShadow: `0 14px 28px -14px ${s.accent}88, inset 0 1px 0 0 rgba(255,255,255,0.25)` }}>
              {/* Icône géante en filigrane — le repère géographique du site, discret en fond */}
              <Icone size={128} strokeWidth={1} className="pointer-events-none absolute -right-6 -bottom-8 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:text-white/15" />

              <div className="relative flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)] backdrop-blur-sm">
                  <Icone size={22} />
                </span>
                <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 backdrop-blur-sm">
                  Site {s.label}
                </span>
              </div>

              <div className="relative">
                <p className="text-xl font-extrabold leading-tight">Maxi Logistique</p>
                <p className="text-2xl font-black leading-tight">{s.label}</p>
                <p className="mt-1.5 text-sm text-white/75">Stock, prestations, factures & autorisations</p>
              </div>

              <div className="relative flex items-center gap-1.5 text-sm font-bold text-white/90 transition-transform duration-300 group-hover:translate-x-1">
                Entrer <ChevronRight size={17} />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// Page d'accueil MAXI-GYM — choix de la salle (Lomé ou Kara). Chaque site
// possède ses propres séances, abonnements, présences, factures et clients : le
// même workflow, cloisonné par site — seuls forfaits et paramètres sont partagés.
import { useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ChevronRight, Building2, Mountain, Ticket, CreditCard, Users } from 'lucide-react'
import { SITES, useAllowedSites, matchSite } from './useSite'
import { useCollection } from '../../../hooks/useFirestore'
import { todayStr } from '../../../utils/formatters'
import { teinterHex, shadeHex } from '../../../utils/color'

const ICONE_SITE = { lome: Building2, kara: Mountain }

export default function GymSiteChooser() {
  const allowed = useAllowedSites()
  const sites = SITES.filter((s) => allowed.includes(s.id))

  const { data: seances } = useCollection('gym_seances')
  const { data: abonnements } = useCollection('gym_abonnements')
  const { data: clients } = useCollection('gym_clients')

  const moisEnCours = todayStr().slice(0, 7)
  const statsParSite = useMemo(() => {
    const m = {}
    for (const s of SITES) {
      const seancesSite = seances.filter((x) => matchSite(x, s.id))
      const abonnementsSite = abonnements.filter((x) => matchSite(x, s.id))
      m[s.id] = {
        seancesMois: seancesSite.filter((x) => (x.date || '').startsWith(moisEnCours)).length,
        abonnementsMois: abonnementsSite.filter((x) => (x.date || '').startsWith(moisEnCours)).length,
        clients: clients.filter((c) => matchSite(c, s.id)).length
      }
    }
    return m
  }, [seances, abonnements, clients, moisEnCours])

  if (sites.length === 1) return <Navigate to={`/gym/${sites[0].id}`} replace />

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: 'linear-gradient(135deg, #E8850Fe6 0%, #A6342Ae6 100%)' }}>
        <div style={{ position: 'relative', width: 60, height: 60, flexShrink: 0 }}>
          <style>{`@keyframes gym-chooser-spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            background: 'conic-gradient(from 0deg, #ffffff00, #ffffffe6 35%, #ffffff00 70%)',
            animation: 'gym-chooser-spin 2.4s linear infinite'
          }} />
          <img src="/Maxi_Gym.png" alt="MAXI-GYM"
            style={{ position: 'relative', width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', background: 'white', padding: 4, boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }} />
        </div>
        <div>
          <h2 className="text-lg font-extrabold sm:text-xl">MAXI-GYM</h2>
          <p className="text-sm text-white/80">Choisissez votre salle pour accéder à son application</p>
        </div>
      </div>

      {sites.length === 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Aucune salle MAXI-GYM ne vous est attribuée. Contactez un administrateur pour obtenir l'accès à Lomé et/ou Kara.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {sites.map((s) => {
          const Icone = ICONE_SITE[s.id] || Building2
          const fonce = shadeHex(s.accent, -35)
          const stats = statsParSite[s.id] || { seancesMois: 0, abonnementsMois: 0, clients: 0 }
          return (
            <Link key={s.id} to={`/gym/${s.id}`}
              className="group relative flex flex-col gap-4 overflow-hidden rounded-3xl p-5 text-white shadow-[0_14px_28px_-14px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.25)] backdrop-blur-xl backdrop-saturate-150 transition-all duration-300 hover:-translate-y-1"
              style={{ background: `linear-gradient(150deg, ${teinterHex(s.accent, 0.94)} 0%, ${teinterHex(fonce, 0.96)} 100%)`, boxShadow: `0 14px 28px -14px ${s.accent}88, inset 0 1px 0 0 rgba(255,255,255,0.25)` }}>
              <Icone size={128} strokeWidth={1} className="pointer-events-none absolute -right-6 -bottom-8 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:text-white/15" />

              <div className="relative flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)] backdrop-blur-sm">
                  <Icone size={22} />
                </span>
                <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 backdrop-blur-sm">
                  Salle {s.label}
                </span>
              </div>

              <div className="relative">
                <p className="text-xl font-extrabold leading-tight">MAXI-GYM</p>
                <p className="text-2xl font-black leading-tight">{s.label}</p>
                <p className="mt-1.5 text-sm text-white/75">Séances, abonnements, présences & facturation</p>
              </div>

              {/* Aperçu chiffré — rend la carte vivante, pas juste un simple bouton. */}
              <div className="relative grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-black/10 p-2.5 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-1 text-center">
                  <Ticket size={14} className="text-white/70" />
                  <span className="text-base font-extrabold leading-none">{stats.seancesMois}</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-white/60">Séances/mois</span>
                </div>
                <div className="flex flex-col items-center gap-1 border-x border-white/15 text-center">
                  <CreditCard size={14} className="text-white/70" />
                  <span className="text-base font-extrabold leading-none">{stats.abonnementsMois}</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-white/60">Abo./mois</span>
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                  <Users size={14} className="text-white/70" />
                  <span className="text-base font-extrabold leading-none">{stats.clients}</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-white/60">Clients</span>
                </div>
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

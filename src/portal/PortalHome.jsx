// Page d'accueil du portail : grille de cartes de modules cliquables.
import { useNavigate } from 'react-router-dom'
import { Lock, ShieldCheck, ChevronRight } from 'lucide-react'
import { MODULES } from '../shared/modules'
import { useAuth } from '../hooks/useAuth'
import { useCollection } from '../hooks/useFirestore'
import { todayStr } from '../utils/formatters'
import { estActif } from '../shared/workflow'

export default function PortalHome() {
  const navigate = useNavigate()
  const { user, hasModule, isAdmin } = useAuth()

  // Petits KPI résumés par module
  const { data: inventaires } = useCollection('agro_inventaires')
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: demandesLog } = useCollection('logistique_demandes')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: demandesBriq } = useCollection('evenementiel_demandes')
  const { data: dossiersFoncier } = useCollection('foncier_dossiers')

  const dernier = [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const totalAnimaux = dernier
    ? Object.values(dernier.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)
    : 0
  const prestationsMois = prestations.filter((p) => (p.date || '').startsWith(todayStr().slice(0, 7))).length
  const autorisationsAttente = demandesLog.filter((d) => estActif(d.statut)).length
  const prodMois = productions.filter((p) => (p.date || '').startsWith(todayStr().slice(0, 7))).reduce((s, p) => s + (p.totalBriques || 0), 0)
  const autorisationsBriq = demandesBriq.filter((d) => estActif(d.statut)).length
  const dossiersActifs = dossiersFoncier.filter((d) => !['cloture', 'suspendu'].includes(d.statut)).length

  const { data: garderieEnfants } = useCollection('garderie_enfants')
  const enfantsActifs = garderieEnfants.filter((e) => e.statut === 'actif').length

  const kpi = {
    agro: `${totalAnimaux} têtes`,
    logistique: autorisationsAttente ? `${autorisationsAttente} autorisation(s) en attente` : `${prestationsMois} prestation(s) ce mois`,
    evenementiel: autorisationsBriq ? `${autorisationsBriq} autorisation(s) en attente` : `${prodMois} briques produites ce mois`,
    foncier: dossiersActifs ? `${dossiersActifs} dossier(s) actif(s)` : 'Aucun dossier',
    rh: 'En développement',
    garderie: enfantsActifs ? `${enfantsActifs} enfant(s) inscrit(s)` : 'Aucun enfant inscrit'
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900">
          Bonjour, {user?.nom?.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-500">Sélectionnez un module pour commencer.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {MODULES.map((m) => {
          const allowed = hasModule(m.id)
          const bientot = m.statut === 'bientot'
          const clickable = allowed && !bientot
          return (
            <button
              key={m.id}
              disabled={!clickable}
              onClick={() => clickable && navigate(m.path)}
              className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all
                ${clickable ? 'cursor-pointer bg-white shadow-sm hover:-translate-y-0.5 hover:shadow-md' : 'cursor-not-allowed bg-gray-50 opacity-70'}`}
              style={{ borderColor: clickable ? m.color + '40' : undefined }}
            >
              <div
                className="absolute right-0 top-0 h-24 w-24 rounded-bl-full opacity-10"
                style={{ background: m.color }}
              />
              <div className="flex items-start gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl overflow-hidden"
                  style={{ background: m.logo ? 'transparent' : m.color + '1a', color: m.color }}
                >
                  {m.logo
                    ? <img src={m.logo} alt={m.nom} className="h-14 w-14 object-contain" />
                    : <m.icon size={28} />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-extrabold text-gray-900">{m.nom}</h3>
                    {bientot ? (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                        Bientôt
                      </span>
                    ) : allowed ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                        Actif
                      </span>
                    ) : (
                      <Lock size={14} className="text-gray-400" />
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{m.description}</p>
                  <p className="mt-2 text-sm font-semibold" style={{ color: m.color }}>
                    {allowed ? kpi[m.id] : 'Accès non autorisé'}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Administration : gestion des utilisateurs (admin uniquement) */}
      {isAdmin() && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">Administration</p>
          <button
            onClick={() => navigate('/utilisateurs')}
            className="flex w-full items-center gap-4 rounded-2xl border border-primary/30 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck size={26} />
            </div>
            <div className="flex-1">
              <h3 className="font-extrabold text-gray-900">Gestion des utilisateurs</h3>
              <p className="text-sm text-gray-500">Rôles et droits d'accès aux modules</p>
            </div>
            <ChevronRight className="text-gray-400" />
          </button>
        </div>
      )}
    </div>
  )
}

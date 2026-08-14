// Page d'accueil du portail : grille de cartes de modules cliquables.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, ChevronRight, CheckCircle2 } from 'lucide-react'
import { MODULES } from '../shared/modules'
import { useAuth } from '../hooks/useAuth'
import { useCollection } from '../hooks/useFirestore'
import { updateItem } from '../core/db'
import { audit } from '../core/audit'
import { notify } from '../core/notify'
import { toast } from '../core/notifications'
import { VIEW_ALL_ROLES, roleLabel } from '../core/roles'
import Button from '../shared/ui/Button'
import { todayStr } from '../utils/formatters'
import { estActif } from '../shared/workflow'

// Certains logos ont beaucoup de marge transparente autour du symbole utile — on les
// agrandit et on les recadre au centre (via un overflow-hidden sur le badge parent) au
// lieu de les faire tenir en entier, pour qu'ils restent lisibles dans un petit badge.
const LOGOS_ZOOM = {
  garderie: 'h-24 w-24 object-contain',
  agro:     'h-20 w-20 object-contain'
}

export default function PortalHome() {
  const navigate = useNavigate()
  const { user, role, hasModule, isAdmin } = useAuth()

  // Paiements décaissés dont je suis le bénéficiaire, pas encore confirmés — visible
  // quel que soit l'accès au module Dépenses (le bénéficiaire n'y a pas forcément accès).
  const { data: depensesTous } = useCollection('depense_depenses')
  const paiementsAConfirmer = useMemo(
    () => depensesTous.filter((d) => d.beneficiaireUid === user?.uid && d.statut === 'decaissee' && !d.recuConfirme),
    [depensesTous, user]
  )
  const [confirmingId, setConfirmingId] = useState(null)

  async function confirmerReception(d) {
    setConfirmingId(d.id)
    try {
      await updateItem('depense_depenses', d.id, { recuConfirme: true, recuConfirmeLe: Date.now(), recuConfirmePar: user?.nom || '—' })
      await audit('depense', 'RECEPTION_CONFIRMEE', `${Number(d.montant).toLocaleString('fr-FR')} FCFA confirmé reçu par ${user?.nom || '—'}`)
      await notify({
        type: 'success',
        title: '✅ Réception confirmée',
        body: `${user?.nom || 'Un bénéficiaire'} a confirmé avoir reçu ${Number(d.montant).toLocaleString('fr-FR')} FCFA.`,
        module: 'depense', forRoles: VIEW_ALL_ROLES, excludeUid: user?.uid, link: '/depense'
      })
      toast.success('Réception confirmée ✓')
    } finally {
      setConfirmingId(null)
    }
  }

  // KPI résumés — chaque collection n'est chargée que si l'utilisateur a le module
  const { data: inventaires }   = useCollection(hasModule('agro')        ? 'agro_inventaires'        : null)
  const { data: prestations }   = useCollection(hasModule('logistique')  ? 'logistique_prestations'  : null)
  const { data: demandesLog }   = useCollection(hasModule('logistique')  ? 'logistique_demandes'     : null)
  const { data: productions }   = useCollection(hasModule('evenementiel')? 'evenementiel_productions': null)
  const { data: demandesBriq }  = useCollection(hasModule('evenementiel')? 'evenementiel_demandes'   : null)
  const { data: dossiersFoncier}= useCollection(hasModule('foncier')     ? 'foncier_dossiers'        : null)
  const { data: garderieEnfants}= useCollection(hasModule('garderie')    ? 'garderie_enfants'        : null)

  const dernier = [...(inventaires||[])].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const totalAnimaux = dernier ? Object.values(dernier.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0) : 0
  const prestationsMois = (prestations||[]).filter((p) => (p.date || '').startsWith(todayStr().slice(0, 7))).length
  const autorisationsAttente = (demandesLog||[]).filter((d) => estActif(d.statut)).length
  const prodMois = (productions||[]).filter((p) => (p.date || '').startsWith(todayStr().slice(0, 7))).reduce((s, p) => s + (p.totalBriques || 0), 0)
  const autorisationsBriq = (demandesBriq||[]).filter((d) => estActif(d.statut)).length
  const dossiersActifs = (dossiersFoncier||[]).filter((d) => !['cloture', 'suspendu'].includes(d.statut)).length
  const enfantsActifs = (garderieEnfants||[]).filter((e) => e.statut === 'actif').length

  const kpi = {
    agro: `${totalAnimaux} têtes`,
    logistique: autorisationsAttente ? `${autorisationsAttente} autorisation(s) en attente` : `${prestationsMois} prestation(s) ce mois`,
    evenementiel: autorisationsBriq ? `${autorisationsBriq} autorisation(s) en attente` : `${prodMois} briques produites ce mois`,
    foncier: dossiersActifs ? `${dossiersActifs} dossier(s) actif(s)` : 'Aucun dossier',
    rh: 'En développement',
    garderie: enfantsActifs ? `${enfantsActifs} enfant(s) inscrit(s)` : 'Aucun enfant inscrit'
  }

  const heure = new Date().getHours()
  const salutation = heure < 5 ? 'Bonne nuit' : heure < 18 ? 'Bonjour' : 'Bonsoir'
  const dateLongue = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-5xl">
      <div className="relative mb-6 overflow-hidden rounded-3xl p-4 text-white shadow-[0_20px_40px_-16px_rgba(0,0,0,0.5),0_36px_72px_-20px_rgba(188,60,49,0.4),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150 sm:p-6 lg:p-8"
        style={{ background: 'linear-gradient(135deg, rgba(188,60,49,0.92) 0%, rgba(90,20,16,0.92) 100%)' }}>
        {/* Halos décoratifs — même motif que les cartes de module juste en dessous */}
        <div className="pointer-events-none absolute -right-10 -top-14 h-56 w-56 rounded-full opacity-[0.15]" style={{ background: '#ffffff' }} />
        <div className="pointer-events-none absolute -bottom-16 left-1/4 h-40 w-40 rounded-full opacity-[0.08]" style={{ background: '#ffffff' }} />

        <div className="relative flex flex-wrap items-center gap-3 sm:gap-5">
          {/* Anneau qui clignote doucement — même animation que le logo de la barre latérale */}
          <style>{`
            @keyframes portal-logo-glow {
              0%   { box-shadow: 0 0 0 2px #ffffffaa, 0 0 8px 2px #ffffff55; }
              50%  { box-shadow: 0 0 0 4px #ffffff,   0 0 22px 8px #ffffffb0; }
              100% { box-shadow: 0 0 0 2px #ffffffaa, 0 0 8px 2px #ffffff55; }
            }
          `}</style>
          <img src="/termitiere-logo.png" alt="La Termitière"
            onError={(e) => { e.target.src = '/logo-mark.png' }}
            className="h-12 w-12 shrink-0 rounded-full bg-white object-cover p-2 sm:h-20 sm:w-20 sm:p-3"
            style={{ animation: 'portal-logo-glow 2.5s ease-in-out infinite' }} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60 sm:text-xs sm:tracking-[0.2em]">{dateLongue}</p>
            <h1 className="mt-0.5 truncate text-xl font-extrabold leading-tight sm:mt-1 sm:text-3xl lg:text-4xl">
              {salutation}, {user?.nom?.split(' ')[0]} 👋
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-2.5">
              {role && (
                <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm sm:px-3 sm:py-1 sm:text-xs">
                  {roleLabel(role)}
                </span>
              )}
              <span className="text-xs text-white/75 sm:text-sm">Sélectionnez un module pour commencer</span>
            </div>
          </div>
        </div>
      </div>

      {paiementsAConfirmer.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">💸 Paiements à confirmer</p>
          {paiementsAConfirmer.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-3xl border border-indigo-200/60 bg-indigo-50/60 p-4 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-indigo-900">{Number(d.montant).toLocaleString('fr-FR')} FCFA</p>
                <p className="text-xs text-indigo-600">{d.description || 'Paiement décaissé'}</p>
              </div>
              <Button onClick={() => confirmerReception(d)} loading={confirmingId === d.id}>
                <CheckCircle2 size={16} /> J'ai bien reçu
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {MODULES.filter((m) => hasModule(m.id)).map((m) => {
          const bientot = m.statut === 'bientot'
          const clickable = !bientot
          return (
            <button
              key={m.id}
              disabled={!clickable}
              onClick={() => clickable && navigate(m.path)}
              className={`group relative overflow-hidden rounded-3xl border p-5 text-left backdrop-blur-xl backdrop-saturate-150 transition-all
                ${clickable
                  ? 'cursor-pointer bg-white/40 shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] hover:-translate-y-1 hover:shadow-[0_32px_60px_-16px_rgba(26,26,26,0.22),0_10px_20px_-6px_rgba(26,26,26,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]'
                  : 'cursor-not-allowed bg-white/20 opacity-70 shadow-[0_12px_24px_-12px_rgba(26,26,26,0.1)]'}`}
              style={{ borderColor: clickable ? m.color + '40' : undefined }}
            >
              <div
                className="absolute right-0 top-0 h-24 w-24 rounded-bl-full opacity-10"
                style={{ background: m.color }}
              />
              <div className="flex items-start gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl overflow-hidden"
                  style={{ background: m.color + '1a', color: m.color }}
                >
                  {/* Ces logos ont beaucoup de marge transparente autour du symbole utile
                      (texte ou icône) — les agrandir et les recadrer au centre (au lieu de
                      les faire tenir en entier) garde ce symbole bien plus lisible. */}
                  {m.logo
                    ? <img src={m.logo} alt={m.nom} className={LOGOS_ZOOM[m.id] || 'h-9 w-9 object-contain'} />
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
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                        Actif
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{m.description}</p>
                  <p className="mt-2 text-sm font-semibold" style={{ color: m.color }}>
                    {kpi[m.id]}
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
            className="flex w-full items-center gap-4 rounded-3xl border border-primary/30 bg-white/40 p-4 text-left shadow-[0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07),inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:-translate-y-1 hover:shadow-[0_32px_60px_-16px_rgba(26,26,26,0.22),0_10px_20px_-6px_rgba(26,26,26,0.1),inset_0_1px_0_0_rgba(255,255,255,0.5)]"
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

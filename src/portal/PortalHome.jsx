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
  const { data: seancesGym }    = useCollection(hasModule('gym')         ? 'gym_seances'             : null)
  const { data: abonnementsGym }= useCollection(hasModule('gym')         ? 'gym_abonnements'         : null)

  const dernier = [...(inventaires||[])].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const totalAnimaux = dernier ? Object.values(dernier.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0) : 0
  const prestationsMois = (prestations||[]).filter((p) => (p.date || '').startsWith(todayStr().slice(0, 7))).length
  const autorisationsAttente = (demandesLog||[]).filter((d) => estActif(d.statut)).length
  const prodMois = (productions||[]).filter((p) => (p.date || '').startsWith(todayStr().slice(0, 7))).reduce((s, p) => s + (p.totalBriques || 0), 0)
  const autorisationsBriq = (demandesBriq||[]).filter((d) => estActif(d.statut)).length
  const dossiersActifs = (dossiersFoncier||[]).filter((d) => !['cloture', 'suspendu'].includes(d.statut)).length
  const enfantsActifs = (garderieEnfants||[]).filter((e) => e.statut === 'actif').length
  const moisEnCours = todayStr().slice(0, 7)
  const seancesGymMois = (seancesGym||[]).filter((s) => (s.date || '').startsWith(moisEnCours)).length
  const abonnementsGymMois = (abonnementsGym||[]).filter((a) => (a.date || '').startsWith(moisEnCours)).length

  const kpi = {
    agro: `${totalAnimaux} têtes`,
    logistique: autorisationsAttente ? `${autorisationsAttente} autorisation(s) en attente` : `${prestationsMois} prestation(s) ce mois`,
    evenementiel: autorisationsBriq ? `${autorisationsBriq} autorisation(s) en attente` : `${prodMois} briques produites ce mois`,
    foncier: dossiersActifs ? `${dossiersActifs} dossier(s) actif(s)` : 'Aucun dossier',
    rh: 'En développement',
    garderie: enfantsActifs ? `${enfantsActifs} enfant(s) inscrit(s)` : 'Aucun enfant inscrit',
    gym: (seancesGymMois || abonnementsGymMois) ? `${seancesGymMois} séance(s) · ${abonnementsGymMois} abonnement(s) ce mois` : 'Aucune activité ce mois'
  }

  const heure = new Date().getHours()
  const salutation = heure < 5 ? 'Bonne nuit' : heure < 18 ? 'Bonjour' : 'Bonsoir'
  const dateLongue = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-5xl">
      <div className="relative mb-6 overflow-hidden rounded-[2rem] p-4 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25),inset_0_1px_0_0_rgba(255,255,255,0.35),0_20px_40px_-16px_rgba(0,0,0,0.5),0_36px_72px_-20px_rgba(188,60,49,0.4)] backdrop-blur-2xl backdrop-saturate-200 sm:p-6 lg:p-8"
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
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">💸 Paiements à confirmer</p>
          {paiementsAConfirmer.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-3xl border border-indigo-200/60 bg-indigo-50/60 p-4 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150 dark:border-indigo-400/20 dark:bg-indigo-500/10">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-indigo-900 dark:text-indigo-300">{Number(d.montant).toLocaleString('fr-FR')} FCFA</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400">{d.description || 'Paiement décaissé'}</p>
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
          const enPreparation = m.statut === 'bientot' || m.statut === 'en_developpement'
          // Le développeur (rôle `info`) peut entrer dans un module pas encore ouvert
          // pour continuer à le construire — tout le monde d'autre le voit non
          // cliquable, comme aujourd'hui pour Comptabilité.
          const clickable = !enPreparation || role === 'info'
          return (
            <button
              key={m.id}
              disabled={!clickable}
              onClick={() => clickable && navigate(m.path)}
              className={`group relative overflow-hidden rounded-3xl border p-5 text-left backdrop-blur-2xl backdrop-saturate-200 transition-all
                ${clickable
                  ? 'cursor-pointer bg-white/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5),inset_0_1px_0_0_rgba(255,255,255,0.7),inset_0_-14px_20px_-16px_rgba(26,26,26,0.12),0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07)] hover:-translate-y-1 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6),inset_0_1px_0_0_rgba(255,255,255,0.7),inset_0_-14px_20px_-16px_rgba(26,26,26,0.14),0_32px_60px_-16px_rgba(26,26,26,0.22),0_10px_20px_-6px_rgba(26,26,26,0.1)] dark:bg-white/[0.05] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_1px_0_0_rgba(255,255,255,0.15),0_24px_48px_-16px_rgba(0,0,0,0.5)] dark:hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_1px_0_0_rgba(255,255,255,0.15),0_32px_60px_-16px_rgba(0,0,0,0.6)]'
                  : 'cursor-not-allowed bg-white/20 opacity-70 shadow-[0_12px_24px_-12px_rgba(26,26,26,0.1)] dark:bg-white/[0.02]'}`}
              style={{ borderColor: clickable ? m.color + '40' : undefined }}
            >
              {/* Teinte douce sur tout le fond — le verre porte la couleur du module, pas juste le coin */}
              {clickable && (
                <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ background: `radial-gradient(circle at 15% 100%, ${m.color}, transparent 70%)` }} />
              )}
              {/* Reflet diagonal — lumière qui balaie la carte, comme un vrai verre incliné */}
              <div className="pointer-events-none absolute -inset-x-6 -top-10 h-20 rotate-[-8deg] bg-gradient-to-b from-white/40 via-white/10 to-transparent dark:from-white/10" />
              {/* Halo teinté de la couleur du module — adouci pour se fondre dans le verre */}
              <div
                className="absolute -right-4 -top-4 h-28 w-28 rounded-full opacity-20 blur-2xl"
                style={{ background: m.color }}
              />
              <div className="flex items-start gap-4">
                <div
                  className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_2px_6px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:border-white/10"
                  style={{ background: `linear-gradient(160deg, ${m.color}33, ${m.color}14)`, color: m.color }}
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
                    <h3 className="text-lg font-extrabold text-gray-900 dark:text-gray-100">{m.nom}</h3>
                    {m.statut === 'en_developpement' ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
                        En développement
                      </span>
                    ) : m.statut === 'bientot' ? (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-white/10 dark:text-gray-400">
                        Bientôt
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-500/15 dark:text-green-400">
                        Actif
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{m.description}</p>
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
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Administration</p>
          <button
            onClick={() => navigate('/utilisateurs')}
            className="group relative flex w-full items-center gap-4 overflow-hidden rounded-3xl border bg-white/40 p-4 text-left backdrop-blur-2xl backdrop-saturate-200 transition-all
              shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5),inset_0_1px_0_0_rgba(255,255,255,0.7),0_24px_48px_-16px_rgba(26,26,26,0.16),0_6px_16px_-6px_rgba(26,26,26,0.07)]
              hover:-translate-y-1 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6),inset_0_1px_0_0_rgba(255,255,255,0.7),0_32px_60px_-16px_rgba(26,26,26,0.22),0_10px_20px_-6px_rgba(26,26,26,0.1)]
              dark:bg-white/[0.05] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_1px_0_0_rgba(255,255,255,0.15),0_24px_48px_-16px_rgba(0,0,0,0.5)]"
            style={{ borderColor: '#BC3C3140' }}
          >
            {/* Teinte douce sur tout le fond, cohérente avec les cartes de modules */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ background: 'radial-gradient(circle at 15% 100%, #BC3C31, transparent 70%)' }} />
            {/* Halo adouci dans le coin */}
            <div className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 rounded-full bg-primary opacity-20 blur-2xl" />
            {/* Reflet diagonal — cohérent avec les cartes de modules */}
            <div className="pointer-events-none absolute -inset-x-6 -top-8 h-16 rotate-[-8deg] bg-gradient-to-b from-white/40 via-white/10 to-transparent dark:from-white/10" />
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/50 bg-primary/10 text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)] backdrop-blur-sm dark:border-white/10 dark:bg-primary/20">
              <ShieldCheck size={26} />
            </div>
            <div className="relative flex-1">
              <h3 className="font-extrabold text-gray-900 dark:text-gray-100">Gestion des utilisateurs</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Rôles et droits d'accès aux modules</p>
            </div>
            <ChevronRight className="relative text-gray-400" />
          </button>
        </div>
      )}
    </div>
  )
}

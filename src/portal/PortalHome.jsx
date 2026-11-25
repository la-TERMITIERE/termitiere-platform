// Page d'accueil du portail : grille de cartes de modules cliquables.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, ChevronRight, ChevronDown, CheckCircle2, CalendarDays, Sun, Sunset, Moon, Wallet, Plane, HandCoins, Gift, KeyRound, PartyPopper, ListChecks } from 'lucide-react'
import { MODULES } from '../shared/modules'
import { useAuth } from '../hooks/useAuth'
import { useCollection } from '../hooks/useFirestore'
import { updateItem, setItem } from '../core/db'
import { audit } from '../core/audit'
import { notify } from '../core/notify'
import { toast } from '../core/notifications'
import { VIEW_ALL_ROLES, roleLabel, peutGererUtilisateurs } from '../core/roles'
import Button from '../shared/ui/Button'
import { todayStr } from '../utils/formatters'
import { estActif } from '../shared/workflow'
import { projetsVisibles } from '../modules/projet/logic'
import { COL as COL_TACHES, estDestinataire, estMembre, estArchivee, enRetard } from '../modules/taches/data'
import AlertesAccueil from './AlertesAccueil'
import { useAnnoncesAccueil } from '../modules/rh/AnnoncesAccueil'
import EtudeDemandeAcces from './EtudeDemandeAcces'
import { getOne } from '../core/db'
import { useDecaissementsRh } from '../modules/depense/decaissementsRh'
import { useEcheancesRh, ROLES_ECHEANCES_RH } from '../modules/rh/echeances'
import DetailPrime from '../modules/rh/DetailPrime'
import { peutTraiterPrime, etapeCourante as etapePrime, cibleLibelle as cibleLibellePrime, valeurLibelle as valeurLibellePrime } from '../modules/rh/primesCircuit'
import DetailMission from '../modules/rh/DetailMission'
import { ROLES_APPROBATION, peutApprouverMission } from '../modules/rh/missionsCircuit'
import DetailAvance from '../modules/rh/DetailAvance'
import { peutApprouverAvance, libelleType as libelleTypeAvance } from '../modules/rh/avancesCircuit'
import DetailAutorisationSalaire, { ROLES_RECEPTEURS, peutDeciderAutorisation, etapeCourante, moisLabel as moisAutorisation } from '../modules/rh/DetailAutorisationSalaire'

// Certains logos ont beaucoup de marge transparente autour du symbole utile — on les
// agrandit et on les recadre au centre (via un overflow-hidden sur le badge parent) au
// lieu de les faire tenir en entier, pour qu'ils restent lisibles dans un petit badge.
const LOGOS_ZOOM = {
  garderie: 'h-24 w-24 object-contain',
  agro:     'h-20 w-20 object-contain'
}

export default function PortalHome() {
  const navigate = useNavigate()
  const { user, role, roleReel, hasModule, isAdmin } = useAuth()
  const [maintenant, setMaintenant] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setMaintenant(new Date()), 20000); return () => clearInterval(t) }, [])

  // Paiements décaissés dont je suis le bénéficiaire, pas encore confirmés — visible
  // quel que soit l'accès au module Dépenses (le bénéficiaire n'y a pas forcément accès).
  const { data: depensesTous } = useCollection('depense_depenses')
  const paiementsAConfirmer = useMemo(
    () => depensesTous.filter((d) => d.beneficiaireUid === user?.uid && d.statut === 'decaissee' && !d.recuConfirme),
    [depensesTous, user]
  )
  const [confirmingId, setConfirmingId] = useState(null)

  // Autorisations de salaire demandées par la RH : le destinataire (PAU, GE, DF, direction) les voit ici dès l'accueil, puis ouvre le détail pour autoriser ou refuser.
  const recoitAutorisations = ROLES_RECEPTEURS.includes(role)
  const { data: autorisationsSalaire } = useCollection(recoitAutorisations ? 'rh_autorisations_salaire' : null)
  const autorisationsATraiter = useMemo(
    () => (autorisationsSalaire || []).filter((d) => peutDeciderAutorisation(d, user, role)).sort((a, b) => ((a.creeLe || '') < (b.creeLe || '') ? -1 : 1)),
    [autorisationsSalaire, user, role]
  )
  const [autorisationOuverte, setAutorisationOuverte] = useState(null)

  // Ordres de mission à approuver : la GE (et l'Info) les voit ici dès l'accueil, puis ouvre le détail pour approuver ou refuser (motif obligatoire).
  const recoitMissions = ROLES_APPROBATION.includes(role)
  const { data: missionsRh } = useCollection(recoitMissions ? 'rh_missions' : null)
  const { data: employesRh2 } = useCollection(recoitMissions || recoitAutorisations ? 'rh_employes' : null)
  const missionsAApprouver = useMemo(
    () => (missionsRh || []).filter((m) => peutApprouverMission(m, role)).sort((a, b) => ((a.creeLe || '') < (b.creeLe || '') ? -1 : 1)),
    [missionsRh, role]
  )
  const [missionOuverte, setMissionOuverte] = useState(null)

  // Avances sur salaire et prêts à approuver : même circuit que les missions.
  const { data: avancesRh } = useCollection(recoitMissions ? 'rh_avances' : null)
  const avancesAApprouver = useMemo(
    () => (avancesRh || []).filter((a) => peutApprouverAvance(a, role)).sort((a, b) => ((a.creeLe || '') < (b.creeLe || '') ? -1 : 1)),
    [avancesRh, role]
  )
  const [avanceOuverte, setAvanceOuverte] = useState(null)

  // Primes à traiter : le même circuit que les salaires (RH, DF, GE, PAU), chacun voit celles de son étape.
  const { data: primesRh } = useCollection(recoitAutorisations ? 'rh_primes' : null)
  const primesAApprouver = useMemo(
    () => (primesRh || []).filter((p) => peutTraiterPrime(p, user, role)).sort((a, b) => ((a.creeLe || '') < (b.creeLe || '') ? -1 : 1)),
    [primesRh, user, role]
  )
  const [primeOuverte, setPrimeOuverte] = useState(null)

  // Demandes d'accès à la plateforme : la RH les valide ; Info les voit et peut aussi décider (sans être dans le circuit).
  const voitAcces = role === 'rh' || role === 'info'
  const { data: demandesAcces } = useCollection(voitAcces ? 'demandes_acces' : null)
  const accesAEtudier = useMemo(() => (demandesAcces || []).filter((d) => d.statut === 'en_attente').sort((a, b) => (a.creeLe || 0) - (b.creeLe || 0)), [demandesAcces])
  const [accesOuvert, setAccesOuvert] = useState(null)

  // Annonces non lues : réunies au même bandeau.
  const annoncesAccueil = useAnnoncesAccueil()

  // Message de bienvenue du compte créé par une demande d'accès validée : affiché une fois, à la première connexion.
  const [bienvenue, setBienvenue] = useState(false)
  useEffect(() => {
    if (!user?.uid) return
    getOne('users', user.uid).then((p) => setBienvenue(p?.bienvenue === true)).catch(() => {})
  }, [user?.uid])
  async function fermerBienvenue() {
    setBienvenue(false)
    try { await updateItem('users', user.uid, { bienvenue: false }) } catch { /* sans gravité : le message reviendra à la prochaine connexion */ }
  }

  // Missions et avances approuvées à décaisser (finance) : boutons « Décaisser de la caisse » et « Non » directement sur la ligne.
  const decaissements = useDecaissementsRh()

  // Échéances RH (contrats, essais, évaluations, formations) : une ligne par catégorie pour l'administration RH.
  const echeancesRh = useEcheancesRh()
  // Alertes d'échéance que la RH a marquées « effectuées » : elles ne sont plus rappelées (une nouvelle composition de la même alerte, elle, revient).
  const peutMarquerEcheance = ROLES_ECHEANCES_RH.includes(role) && hasModule('rh')
  const { data: echeancesFaites } = useCollection(peutMarquerEcheance ? 'rh_alertes_faites' : null)
  const signatureEcheance = (e) => `${e.id}|${e.titre}|${e.sous}`
  const cleFaite = (e) => signatureEcheance(e).replace(/[.#$/\[\]]/g, '_').slice(0, 180)
  const faitesSet = new Set((echeancesFaites || []).map((f) => f.id))

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
  const { data: projets }       = useCollection(hasModule('projet')      ? 'projets'                 : null)
  const { data: comptes }       = useCollection(peutGererUtilisateurs(role) ? 'users' : null)
  const { data: employesRh }    = useCollection(hasModule('rh')          ? 'rh_employes'             : null)
  const { data: seancesGym }    = useCollection(hasModule('gym')         ? 'gym_seances'             : null)
  const { data: abonnementsGym }= useCollection(hasModule('gym')         ? 'gym_abonnements'         : null)
  const { data: tachesTous }    = useCollection(hasModule('taches')      ? COL_TACHES.taches         : null)

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

  // E-TACHES : mes tâches en cours (confiées à moi ou à mon équipe), dont celles en retard.
  const moiTaches = user?.uid || user?.login || null
  const mesTaches = (tachesTous || []).filter((x) => (estDestinataire(x, moiTaches) || estMembre(x, moiTaches)) && x.statut !== 'Terminé' && !estArchivee(x))
  const mesTachesEnRetard = mesTaches.filter((x) => enRetard(x)).length

  const depensesEnAttente = depensesTous.filter((d) => d.statut === 'en_attente' || d.statut === 'approuvee').length
  const projetsEnCours = projetsVisibles(projets || [], user, role).filter((p) => p.statut === 'en_cours').length

  const kpi = {
    depense: depensesEnAttente ? `${depensesEnAttente} dépense(s) en attente` : 'Aucune dépense en attente',
    projet: projetsEnCours ? `${projetsEnCours} projet(s) en cours` : 'Aucun projet en cours',
    agro: `${totalAnimaux} têtes`,
    logistique: autorisationsAttente ? `${autorisationsAttente} autorisation(s) en attente` : `${prestationsMois} prestation(s) ce mois`,
    evenementiel: autorisationsBriq ? `${autorisationsBriq} autorisation(s) en attente` : `${prodMois} briques produites ce mois`,
    foncier: dossiersActifs ? `${dossiersActifs} dossier(s) actif(s)` : 'Aucun dossier',
    rh: (autorisationsATraiter.length + missionsAApprouver.length + avancesAApprouver.length + primesAApprouver.length) ? `${autorisationsATraiter.length + missionsAApprouver.length + avancesAApprouver.length + primesAApprouver.length} demande(s) RH à traiter` : (employesRh || []).length ? `${employesRh.length} employé(s)` : 'Aucun employé',
    garderie: enfantsActifs ? `${enfantsActifs} enfant(s) inscrit(s)` : 'Aucun enfant inscrit',
    gym: (seancesGymMois || abonnementsGymMois) ? `${seancesGymMois} séance(s) · ${abonnementsGymMois} abonnement(s) ce mois` : 'Aucune activité ce mois',
    taches: mesTaches.length ? `${mesTaches.length} tâche(s) en cours${mesTachesEnRetard ? ` · ${mesTachesEnRetard} en retard` : ''}` : 'Aucune tâche en cours'
  }

  const mots = (user?.nom || '').trim().split(/\s+/).filter(Boolean)
  const prenom = mots.length > 1 && (mots[0].length <= 3 || mots[0].endsWith('.')) ? `${mots[0]} ${mots[1]}` : (mots[0] || '')
  const heure = maintenant.getHours()
  const IconeMoment = heure < 5 || heure >= 20 ? Moon : heure >= 17 ? Sunset : Sun
  const heureTxt = maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const salutation = heure < 5 ? 'Bonne nuit' : heure < 18 ? 'Bonjour' : 'Bonsoir'
  const dateLongue = maintenant.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-5xl">
      {/* Bandeau d'accueil : verre rouge profond en couches (lumières, points, reflet), logo à double anneau,
          salutation avec le moment de la journée, horloge vivante et accès rapide au rôle. */}
      <div className="ed-entree relative mb-6 overflow-hidden rounded-[2rem] p-4 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28),inset_0_1px_0_0_rgba(255,255,255,0.45),inset_0_-24px_40px_-24px_rgba(0,0,0,0.45),0_24px_44px_-18px_rgba(0,0,0,0.55),0_40px_80px_-24px_rgba(188,60,49,0.5)] sm:p-6 lg:p-7"
        style={{ background: 'radial-gradient(120% 140% at 0% 0%, #D9574B 0%, rgba(217,87,75,0) 55%), linear-gradient(135deg, #B93A2F 0%, #7E241D 52%, #3F0E0A 100%)' }}>
        <style>{`
          @keyframes portal-balaye { 0% { transform: translateX(-120%) rotate(18deg); } 55%, 100% { transform: translateX(560%) rotate(18deg); } }
          @keyframes portal-onde { 0% { transform: scale(1); opacity: 0.55; } 100% { transform: scale(1.55); opacity: 0; } }
          @keyframes portal-pouls { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.7); opacity: 0.35; } }
          @keyframes portal-descend { 0%, 100% { transform: translateY(-1px); } 50% { transform: translateY(2px); } }
          @media (prefers-reduced-motion: reduce) { .portal-anim { animation: none !important; } }
        `}</style>
        {/* Matière : halo clair en haut à droite, points fins qui s'estompent, reflet du haut et balayage lent */}
        <span aria-hidden="true" className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full bg-white/20 blur-2xl" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/4 h-48 w-48 rounded-full bg-[#FF8A7A]/20 blur-3xl" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-60"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.28) 1px, transparent 1.4px)', backgroundSize: '16px 16px', WebkitMaskImage: 'linear-gradient(100deg, transparent 25%, #000 100%)', maskImage: 'linear-gradient(100deg, transparent 25%, #000 100%)' }} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
        <span aria-hidden="true" className="portal-anim pointer-events-none absolute inset-y-0 -left-1/4 w-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
          style={{ animation: 'portal-balaye 8s ease-in-out infinite' }} />

        <div className="relative flex items-center gap-3.5 sm:gap-6">
          {/* Logo : disque blanc, anneau translucide et onde qui s'étend doucement */}
          <span className="relative shrink-0">
            <span aria-hidden="true" className="portal-anim absolute inset-0 rounded-full border-2 border-white/60" style={{ animation: 'portal-onde 2.8s ease-out infinite' }} />
            <span className="relative flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-white/25 p-1.5 ring-1 ring-white/50 backdrop-blur-sm sm:h-24 sm:w-24 sm:p-2">
              <img src="/termitiere-logo.png" alt="La Termitière"
                onError={(e) => { e.target.src = '/logo-mark.png' }}
                className="h-full w-full rounded-full bg-white object-cover p-2 shadow-[0_8px_18px_-6px_rgba(0,0,0,0.5)] sm:p-3" />
            </span>
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/80 sm:text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/20 px-2.5 py-1">
                <CalendarDays size={12} aria-hidden="true" />{dateLongue}<span className="tabular-nums sm:hidden">· {heureTxt}</span>
              </span>
            </p>
            <h1 className="mt-1.5 flex items-center gap-2 truncate text-[1.7rem] font-extrabold leading-none sm:text-3xl lg:text-4xl" style={{ textShadow: '0 2px 14px rgba(0,0,0,0.3)' }}>
              <span className="truncate">{salutation}, {prenom}</span>
              <IconeMoment aria-hidden="true" className="shrink-0 text-amber-200" size={28} strokeWidth={2.2} />
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {role && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-2 pr-3 text-[11px] font-extrabold text-[#7E241D] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.5)] sm:text-xs">
                  <ShieldCheck size={14} aria-hidden="true" />{roleLabel(roleReel || role)}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs text-white/85 sm:text-sm">
                Sélectionnez un module
                <ChevronDown size={15} aria-hidden="true" className="portal-anim" style={{ animation: 'portal-descend 1.8s ease-in-out infinite' }} />
              </span>
            </div>
          </div>

          {/* Horloge : visible dès la tablette, avec un point « en ligne » qui pulse */}
          <div className="hidden shrink-0 flex-col items-end rounded-2xl border border-white/25 bg-black/20 px-3.5 py-2.5 sm:flex">
            <span className="text-3xl font-extrabold leading-none tabular-nums lg:text-4xl">{heureTxt}</span>
            <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/80">
              <span aria-hidden="true" className="portal-anim h-2 w-2 rounded-full bg-green-300" style={{ animation: 'portal-pouls 2s ease-in-out infinite' }} />En ligne
            </span>
          </div>
        </div>
      </div>

      {/* À traiter : UN SEUL bandeau qui résume tout (salaires, accès, missions, avances, primes, décaissements, échéances, annonces…) ;
          un clic ouvre la liste, chaque demande a son bouton « Étudier ». */}
      <AlertesAccueil items={[
        ...accesAEtudier.map((d) => ({
          id: `acces_${d.id}`, categorie: 'acces', icone: KeyRound, couleur: '#BC3C31',
          titre: `${d.nom} demande un accès`,
          sous: `Identifiant « ${d.login} »${d.poste ? ` · ${d.poste}` : ''}${d.telephone ? ` · ${d.telephone}` : ''}`,
          action: { label: 'Étudier', onClick: () => setAccesOuvert(d.id) }
        })),
        ...autorisationsATraiter.map((d) => ({
          id: `salaire_${d.id}`, categorie: 'salaire', icone: Wallet, couleur: '#0284c7',
          titre: `${d.employeNom} : ${Number(d.montant).toLocaleString('fr-FR')} FCFA`,
          sous: `Salaire de ${moisAutorisation(d.mois)} · ${etapeCourante(d)?.label} (${etapeCourante(d)?.sigle}) · par ${d.creePar || 'la RH'}`,
          action: { label: 'Étudier', onClick: () => setAutorisationOuverte(d.id) }
        })),
        ...missionsAApprouver.map((m) => ({
          id: `mission_${m.id}`, categorie: 'mission', icone: Plane, couleur: '#7c3aed',
          titre: `${m.employeNom} : ${m.objet}`,
          sous: `Ordre de mission${m.destination ? ` à ${m.destination}` : ''}${Number(m.montantFrais) > 0 ? ` · frais ${Number(m.montantFrais).toLocaleString('fr-FR')} FCFA` : ''} · par ${m.creePar || 'la RH'}`,
          action: { label: 'Étudier', onClick: () => setMissionOuverte(m.id) }
        })),
        ...avancesAApprouver.map((a) => ({
          id: `avance_${a.id}`, categorie: 'avance', icone: HandCoins, couleur: '#0d9488',
          titre: `${a.employeNom} : ${libelleTypeAvance(a.type).toLowerCase()} de ${Number(a.montant).toLocaleString('fr-FR')} FCFA`,
          sous: `${a.nbMensualites > 1 ? `${a.nbMensualites} mensualités` : 'Retenue en une fois'}${a.motif ? ` · ${a.motif}` : ''} · par ${a.creePar || 'la RH'}`,
          action: { label: 'Étudier', onClick: () => setAvanceOuverte(a.id) }
        })),
        ...primesAApprouver.map((p) => ({
          id: `prime_${p.id}`, categorie: 'prime', icone: Gift, couleur: '#be185d',
          titre: `${p.typeNom} : ${cibleLibellePrime(p)}`,
          sous: `${valeurLibellePrime(p)}${p.periodicite === 'ponctuelle' ? '' : ' par mois'} · ${etapePrime(p)?.label} (${etapePrime(p)?.sigle}) · par ${p.creePar || 'la RH'}`,
          action: { label: 'Étudier', onClick: () => setPrimeOuverte(p.id) }
        })),
        ...decaissements.items.map((it) => ({ ...it, categorie: 'decaisse' })),
        ...echeancesRh.filter((e) => !faitesSet.has(cleFaite(e))).map((e) => ({
          id: e.id, categorie: 'echeance', icone: e.icone, couleur: e.couleur, titre: e.titre, sous: e.sous, action: { label: 'Voir', onClick: () => navigate(e.lien) },
          fait: peutMarquerEcheance ? { label: 'Effectué', onClick: () => setItem('rh_alertes_faites', cleFaite(e), { signature: signatureEcheance(e), parNom: user?.nom || '', ts: Date.now() }).catch(() => {}) } : undefined
        })),
        ...paiementsAConfirmer.map((d) => ({
          id: `paiement_${d.id}`, categorie: 'paiement', icone: CheckCircle2, couleur: '#4f46e5',
          titre: `${Number(d.montant).toLocaleString('fr-FR')} FCFA reçus ?`,
          sous: d.description || 'Paiement décaissé : confirmez la réception',
          action: { label: "J'ai reçu", onClick: () => confirmerReception(d), loading: confirmingId === d.id }
        })),
        // Annonces de la RH et de la direction adressées à cette personne, tant qu'elle ne les a pas lues.
        ...annoncesAccueil.items
      ]} />
      {annoncesAccueil.modal}
      {accesOuvert && <EtudeDemandeAcces demande={(demandesAcces || []).find((d) => d.id === accesOuvert)} onClose={() => setAccesOuvert(null)} />}
      {bienvenue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#1A1A1A]/55 via-[#6B1A10]/35 to-[#BC3C31]/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="bienvenue-titre">
          <div className="ed-entree relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/70 bg-white/70 p-6 text-center shadow-[0_30px_70px_-24px_rgba(120,30,20,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl">
            <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#BC3C31] opacity-30 blur-3xl" />
            <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-[0_14px_28px_-10px_rgba(188,60,49,0.7),inset_0_2px_2px_rgba(255,255,255,0.5)]" style={{ background: 'linear-gradient(145deg, #d4574b, #8f2a21)' }}>
              <PartyPopper size={32} aria-hidden="true" />
            </span>
            <h2 id="bienvenue-titre" className="relative mt-4 text-2xl font-black text-gray-800">Bienvenue, {prenom} !</h2>
            <p className="relative mt-2 text-sm text-gray-600">Votre accès à la plateforme <strong>LA TERMITIÈRE</strong> est validé. Vous pouvez dès maintenant utiliser <strong>E-TACHES</strong> : vos tâches, votre routine et vos objectifs.</p>
            <div className="relative mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => { fermerBienvenue(); navigate('/taches') }} className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_14px_26px_-12px_rgba(188,60,49,0.8),inset_0_1px_0_rgba(255,255,255,0.45)]" style={{ background: 'linear-gradient(135deg, #d4574b 0%, #BC3C31 50%, #8f2a21 100%)' }}>
                <ListChecks size={17} aria-hidden="true" />Ouvrir E-TACHES
              </button>
              <button type="button" onClick={fermerBienvenue} className="rounded-2xl border border-white/80 bg-white/70 px-5 py-2.5 text-sm font-extrabold text-gray-700 backdrop-blur-md hover:bg-white">Plus tard</button>
            </div>
          </div>
        </div>
      )}
      <DetailAutorisationSalaire demande={(autorisationsSalaire || []).find((d) => d.id === autorisationOuverte)} onClose={() => setAutorisationOuverte(null)} />
      <DetailPrime prime={(primesRh || []).find((p) => p.id === primeOuverte)} employes={employesRh2 || []} onClose={() => setPrimeOuverte(null)} />
      {decaissements.modal}
      <DetailAvance avance={(avancesRh || []).find((a) => a.id === avanceOuverte)} employes={employesRh2 || []} onClose={() => setAvanceOuverte(null)} />
      <DetailMission mission={(missionsRh || []).find((m) => m.id === missionOuverte)} employes={employesRh2 || []} onClose={() => setMissionOuverte(null)} />

      {/* Modules en tuiles pleines : chaque module porte sa couleur, le logo repose sur un badge blanc,
          le nom et l'indicateur du moment sont en bas, sur la partie la plus sombre du dégradé (lisible en blanc). */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {MODULES.filter((m) => hasModule(m.id)).map((m, i) => {
          const enPreparation = m.statut === 'bientot' || m.statut === 'en_developpement'
          // Le développeur (rôle `info`) peut entrer dans un module pas encore ouvert
          // pour continuer à le construire : tout le monde d'autre le voit non cliquable.
          const clickable = !enPreparation || role === 'info'
          const Filigrane = m.icon
          return (
            <button
              key={m.id}
              disabled={!clickable}
              onClick={() => clickable && navigate(m.path)}
              className={`ed-entree group relative flex min-h-[10.5rem] flex-col justify-between overflow-hidden rounded-[1.75rem] p-4 text-left text-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 sm:min-h-[12rem] sm:p-5
                ${clickable ? 'cursor-pointer hover:-translate-y-1 active:scale-[0.98]' : 'cursor-not-allowed opacity-60 saturate-50'}`}
              style={{
                background: `linear-gradient(155deg, ${m.color} 0%, color-mix(in srgb, ${m.color} 62%, #000) 100%)`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 0 1px rgba(255,255,255,0.14), 0 22px 36px -20px ${m.color}`,
                animationDelay: `${Math.min(i, 10) * 45}ms`
              }}
            >
              {/* Filigrane : l'icône du module en grand, coupée par le coin, pour donner de la matière sans bruit */}
              <Filigrane aria-hidden="true" size={150} strokeWidth={1.25}
                className="pointer-events-none absolute -bottom-6 -right-6 rotate-[-12deg] text-white opacity-[0.13] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]" />
              {/* Reflet : lumière qui tombe du haut, comme sur du verre */}
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />

              <div className="relative flex items-start justify-between gap-2">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_8px_16px_-8px_rgba(0,0,0,0.5)] sm:h-14 sm:w-14" style={{ color: m.color }}>
                  {/* Certains logos ont beaucoup de marge transparente : on les agrandit et on les recadre au centre. */}
                  {m.logo
                    ? <img src={m.logo} alt="" className={LOGOS_ZOOM[m.id] || 'h-9 w-9 object-contain'} />
                    : <m.icon size={26} />}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-black/15 px-2 py-0.5 text-[10px] font-bold">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${m.statut === 'actif' ? 'bg-green-300' : 'bg-white/70'}`} />
                  {m.statut === 'en_developpement' ? 'En développement' : m.statut === 'bientot' ? 'Bientôt' : 'Actif'}
                </span>
              </div>

              <div className="relative mt-4">
                <h3 className="break-words text-[15px] font-extrabold leading-tight sm:text-lg" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.25)' }}>{m.nom}</h3>
                <p className={`mt-0.5 text-xs text-white/85 ${kpi[m.id] ? 'line-clamp-1' : 'line-clamp-2'}`}>{m.description}</p>
                <div className="mt-2.5 flex items-end justify-between gap-2">
                  {kpi[m.id]
                    ? <span className="line-clamp-2 rounded-xl border border-white/25 bg-black/15 px-2.5 py-1 text-[11px] font-bold leading-snug">{kpi[m.id]}</span>
                    : <span />}
                  <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/25 transition-all duration-200 group-hover:translate-x-0.5 group-hover:bg-white group-hover:text-gray-900">
                    <ChevronRight size={16} />
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Administration : gestion des utilisateurs (admin uniquement), dans le langage des tuiles de modules, largeur limitée */}
      {peutGererUtilisateurs(role) && (
        <div className="mt-7">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
            <span aria-hidden="true" className="h-px w-6 bg-gray-300 dark:bg-white/20" />Administration
          </p>
          <button type="button" onClick={() => navigate('/utilisateurs')}
            className="group relative flex w-full max-w-sm items-center gap-4 overflow-hidden rounded-[1.75rem] p-4 text-left text-white transition-all duration-200 hover:-translate-y-1 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 sm:p-5"
            style={{
              background: 'linear-gradient(135deg, #CF4A3F 0%, #A13026 45%, #4A100C 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 0 1px rgba(255,255,255,0.14), 0 22px 36px -20px #BC3C31'
            }}>
            <ShieldCheck aria-hidden="true" size={140} strokeWidth={1.2}
              className="pointer-events-none absolute -bottom-8 right-6 rotate-[-10deg] text-white opacity-[0.12] transition-transform duration-300 group-hover:scale-110" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-[#A13026] shadow-[0_8px_16px_-8px_rgba(0,0,0,0.5)]">
              <ShieldCheck size={28} />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block text-base font-extrabold leading-tight sm:text-lg" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.25)' }}>Gestion des utilisateurs</span>
              <span className="mt-0.5 block text-xs text-white/85 sm:text-sm">Rôles et droits d'accès aux modules</span>
              {(comptes || []).length > 0 && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/15 px-2.5 py-1 text-[11px] font-bold">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-green-300" />{comptes.length} compte{comptes.length > 1 ? 's' : ''}
                </span>
              )}
            </span>
            <span aria-hidden="true" className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/25 transition-all duration-200 group-hover:translate-x-0.5 group-hover:bg-white group-hover:text-gray-900">
              <ChevronRight size={18} />
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

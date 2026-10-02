// MAXI-GYM — Dashboard : KPI du mois — cliquer sur un KPI affiche le détail classé
// par catégorie (Simple/Classique/VIP), sans quitter la page.
import '../../utils/chartSetup'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import { Ticket, CreditCard, Wallet, Users, User, Flame, AlertTriangle, BellRing, UserCog, X, Clock } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { updateItem } from '../../core/db'
import { sendWhatsApp } from '../../core/whatsapp'
import { notify } from '../../core/notify'
import { ROLES } from '../../core/roles'
import { todayStr, formatMoney, formatDateShort, addDays } from '../../utils/formatters'
import { SEXES, indexSexeClients, sexeDe, statsSexe, CATEGORIES_GYM, categorieLabel, categorieTone, abonnementActif, joursDepuis, SEUIL_RELANCE_JOURS, creneauCoach } from './data'
import ClientDetailModal from './ClientDetailModal'
import { SexeDonut, SexeBadge } from './SexeUI'
import { glassModalProps, COULEUR_MODULE, avatarGradient, teinterHex } from '../../utils/color'
import { useSite, matchSite, siteLabel } from './site/useSite'
import { useGymParams } from './useGymParams'

const COULEUR_BARRE = { simple: '#94a3b8', classique: '#0ea5e9', vip: '#d97706' }

const COULEUR = '#E8850F'
const COULEUR2 = '#A6342A'

// Podium — médaille + fond dégradé pour les 3 premiers d'un classement (clients les
// plus fréquents, top séances/abonnements) ; au-delà, simple numéro gris.
const RANG_PODIUM = [
  { medaille: '🥇', label: '1er', bg: 'bg-gradient-to-r from-amber-50 to-yellow-50', ring: 'ring-1 ring-amber-200' },
  { medaille: '🥈', label: '2e',  bg: 'bg-gradient-to-r from-slate-100 to-gray-50',  ring: 'ring-1 ring-slate-200' },
  { medaille: '🥉', label: '3e',  bg: 'bg-gradient-to-r from-orange-50 to-amber-50', ring: 'ring-1 ring-orange-200' }
]

// Regroupe une liste de séances/abonnements (ou de factures) par catégorie
// (Simple/Classique/VIP), avec le sous-total de chaque groupe — sert au détail
// affiché en cliquant un KPI.
function groupesParCategorie(liste) {
  return CATEGORIES_GYM.map((c) => {
    const lignes = liste.filter((x) => x.categorie === c.id).sort((a, b) => (a.date < b.date ? 1 : -1))
    // Sous-groupes séances/abonnements : une facture porte `sourceType`
    // ('seance'/'abonnement') ; à défaut (séance/abonnement bruts), un abonnement
    // porte un `dateFin`, pas une séance — sert à ne jamais mélanger les deux
    // types dans la vue « Total ».
    const estAbonnement = (x) => (x.sourceType ? x.sourceType === 'abonnement' : !!x.dateFin)
    const seancesLignes = lignes.filter((x) => !estAbonnement(x))
    const abonnementsLignes = lignes.filter(estAbonnement)
    return { ...c, lignes, seancesLignes, abonnementsLignes, total: lignes.reduce((s, x) => s + (Number(x.montant) || 0), 0) }
  })
}

const DETAIL_INFO = {
  seances:     { titre: 'Séances ce mois', icon: Ticket },
  abonnements: { titre: 'Abonnements ce mois', icon: CreditCard },
  total:       { titre: 'Total encaissé ce mois', icon: Wallet },
  clients:     { titre: 'Clients', icon: Users }
}

// Fermeture temporaire (par appareil) d'un rappel « à renouveler » — même recette
// que ActiverAlertes.jsx (report en localStorage). Revient plus vite à mesure que
// l'échéance approche : 3h dans les 3 derniers jours avant expiration (pour ne pas
// rater le renouvellement), 24h au-delà (le temps qu'une action soit prise, sans
// harceler). Se réévalue automatiquement grâce à l'horloge du bandeau (tick 60s).
const CLE_DISMISS_RENOUVELLEMENT = 'termitiere_gym_renouvellement_dismiss_'
const dismissedUntil = (id) => {
  try { return Number(localStorage.getItem(CLE_DISMISS_RENOUVELLEMENT + id) || 0) } catch { return 0 }
}
const dismissRenouvellement = (id, joursRestants) => {
  const duree = joursRestants <= 3 ? 3 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  try { localStorage.setItem(CLE_DISMISS_RENOUVELLEMENT + id, String(Date.now() + duree)) } catch { /* ignore */ }
}

// Même recette pour les rappels « abonné inactif » — clé par nom de client (pas
// d'id stable sur ces entrées, dérivées à la volée). Report fixe de 24h : le temps
// qu'une relance soit traitée, sans harceler à chaque rechargement du dashboard.
const CLE_DISMISS_INACTIF = 'termitiere_gym_inactif_dismiss_'
const dismissedUntilInactif = (cle) => {
  try { return Number(localStorage.getItem(CLE_DISMISS_INACTIF + cle) || 0) } catch { return 0 }
}
const dismissInactif = (cle) => {
  try { localStorage.setItem(CLE_DISMISS_INACTIF + cle, String(Date.now() + 24 * 60 * 60 * 1000)) } catch { /* ignore */ }
}

// Salutation selon l'heure du moment — relit l'horloge à chaque montage du
// Dashboard (pas besoin de la tenir à jour en temps réel pour ce simple message).
function salutation() {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Horloge en direct affichée dans le bandeau — mise à jour chaque minute (pas
  // besoin de la seconde près pour ce simple repère visuel).
  const [heureActuelle, setHeureActuelle] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setHeureActuelle(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  const site = useSite()
  const params = useGymParams(site)
  const { data: allSeances }     = useCollection('gym_seances')
  const { data: allAbonnements } = useCollection('gym_abonnements')
  const { data: allFactures }    = useCollection('gym_factures')
  const { data: allClients }     = useCollection('gym_clients')
  const { data: allPresences }   = useCollection('gym_presences')
  const { data: allCoachs }        = useCollection('gym_coachs')
  const { data: allPointagesCoach } = useCollection('gym_pointages_coach')
  // Tout est cloisonné par salle, y compris la clientèle : les clients de Lomé
  // ne sont pas ceux de Kara.
  const seances     = useMemo(() => allSeances.filter((s) => matchSite(s, site)), [allSeances, site])
  const abonnements = useMemo(() => allAbonnements.filter((a) => matchSite(a, site)), [allAbonnements, site])
  const factures    = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const clients     = useMemo(() => allClients.filter((c) => matchSite(c, site)), [allClients, site])
  const presences   = useMemo(() => allPresences.filter((p) => matchSite(p, site)), [allPresences, site])
  const coachs         = useMemo(() => allCoachs.filter((c) => matchSite(c, site)), [allCoachs, site])
  const pointagesCoach = useMemo(() => allPointagesCoach.filter((p) => matchSite(p, site)), [allPointagesCoach, site])
  // Jour courant recalculé à partir du tick d'horloge (60 s) plutôt que capturé une
  // seule fois : sans ça, un dashboard resté ouvert (poste d'accueil) garderait le
  // « coach du jour » — et son pointage — de la veille après minuit.
  const aujStr = heureActuelle.toISOString().split('T')[0]

  // Coach(s) programmé(s) aujourd'hui, avec leur statut de pointage du jour — cf.
  // le volet « Coachs » pour le planning complet et le pointage lui-même. Le pointage
  // affiché est STRICTEMENT celui du jour même : une arrivée d'un jour précédent ne
  // doit jamais faire croire que le coach est déjà là aujourd'hui.
  const coachsAujourdhui = useMemo(() => {
    return coachs
      .map((c) => ({ ...c, creneau: creneauCoach(c, aujStr) }))
      .filter((c) => c.creneau)
      .map((c) => ({ ...c, pointage: pointagesCoach.find((p) => p.coachId === c.id && p.date === aujStr) }))
  }, [coachs, pointagesCoach, aujStr])

  // Minutes de retard d'un coach pas encore pointé, par rapport à son heure prévue
  // (négatif tant que l'heure n'est pas encore passée). Se recalcule tout seul via
  // `heureActuelle` (tick 60s du bandeau) — pas besoin de minuteur dédié.
  const SEUIL_RETARD_COACH_MIN = 20
  function minutesRetard(c) {
    const [h, m] = c.creneau.heure.split(':').map(Number)
    const prevu = new Date(heureActuelle)
    prevu.setHours(h, m, 0, 0)
    return Math.floor((heureActuelle - prevu) / 60000)
  }
  const coachsEnRetard = useMemo(
    () => coachsAujourdhui.filter((c) => !c.pointage && minutesRetard(c) >= SEUIL_RETARD_COACH_MIN),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coachsAujourdhui, heureActuelle]
  )

  // Alarme coach en retard — même recette que l'alarme abonné inactif ci-dessous :
  // alerte l'équipe une seule fois par jour et par coach (dédoublonnée via
  // `derniereAlerteRetardDate` sur sa fiche), dès qu'il dépasse le seuil de retard.
  useEffect(() => {
    for (const c of coachsEnRetard) {
      const auj = todayStr()
      if (c.derniereAlerteRetardDate === auj) continue
      notify({
        type: 'alerte',
        title: `🔔 Coach en retard : MAXI-GYM ${siteLabel(site)}`,
        body: `${c.nom} n'a pas encore pointé son arrivée, prévue à ${c.creneau.heure} (${minutesRetard(c)} min de retard).`,
        module: 'gym', site, forRoles: ROLES.map((r) => r.value), link: `/gym/${site}/coachs`
      }).catch(() => {})
      updateItem('gym_coachs', c.id, { derniereAlerteRetardDate: auj })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachsEnRetard])
  const [detailModal, setDetailModal] = useState(null) // null | 'seances' | 'abonnements' | 'total' | 'clients'
  const [clientDetail, setClientDetail] = useState(null) // nom du client dont on affiche la fiche complète
  // Force une réévaluation immédiate des rappels fermés (cf. dismissRenouvellement)
  // au clic — la réévaluation « au fil du temps » vient gratuitement du tick heureActuelle.
  const [dismissTick, setDismissTick] = useState(0)
  // Liste des renouvellements repliée par défaut (trop longue affichée en entier) —
  // on ne montre que les plus urgents (déjà triés par échéance croissante), avec
  // un bouton pour dérouler le reste au besoin.
  const [voirTousRenouvellements, setVoirTousRenouvellements] = useState(false)
  const LIMITE_RENOUVELLEMENTS = 5
  const [voirToutActivite, setVoirToutActivite] = useState(false)
  const LIMITE_ACTIVITE = 5
  const [voirTousClients, setVoirTousClients] = useState(false)
  const [modeFideles, setModeFideles] = useState('tous') // 'tous' | 'seances' | 'abonnements'
  const LIMITE_CLIENTS = 5
  // Ombre « 3D » partagée par les badges/avatars de ce dashboard — liseré clair en
  // haut + ombre interne sombre en bas + ombre portée, pour un rendu bombé/glossy
  // plutôt que plat.
  const OMBRE_3D = '0 6px 14px -4px rgba(0,0,0,0.35), inset 0 2px 2px rgba(255,255,255,0.55), inset 0 -3px 5px rgba(0,0,0,0.25)'
  // Nom (clé) de la ligne « Abonnés à relancer » en plein signal lumineux — la ligne
  // flashe un court instant avant de disparaître, pour un retour visuel immédiat au clic.
  const [flashInactif, setFlashInactif] = useState(null)
  function handleDismissInactif(cle) {
    setFlashInactif(cle)
    setTimeout(() => {
      dismissInactif(cle)
      setDismissTick((t) => t + 1)
      setFlashInactif(null)
    }, 350)
  }

  // Sélecteur de période — même format Jour/Mois/Année/Plage que les autres volets
  // de MAXI-GYM (Facturation/Séances/Abonnements/Coachs), posé dans le bandeau héro.
  const [modePeriode, setModePeriode] = useState('mois')
  const [filtreJour, setFiltreJour] = useState('')
  const [filtreMois, setFiltreMois] = useState(todayStr().slice(0, 7))
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin] = useState('')
  const { start, end } = useMemo(() => {
    const auj = todayStr()
    if (modePeriode === 'jour') {
      const j = filtreJour || auj
      return { start: j, end: j }
    }
    if (modePeriode === 'annee') {
      const an = filtreAnnee || auj.slice(0, 4)
      return { start: `${an}-01-01`, end: an === auj.slice(0, 4) ? auj : `${an}-12-31` }
    }
    if (modePeriode === 'plage') {
      return { start: filtreDebut || auj, end: filtreFin || auj }
    }
    const mois = filtreMois || auj.slice(0, 7)
    const finMois = new Date(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0).toISOString().slice(0, 10)
    return { start: `${mois}-01`, end: mois === auj.slice(0, 7) ? auj : finMois }
  }, [modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin])
  const dansPeriode = (d) => (d || '') >= start && (d || '') <= end
  // Chaque mode (jour/mois/année/plage) a toujours une période précédente bien
  // définie (plus de preset « Tout l'historique ») — la comparaison reste donc
  // systématiquement pertinente.
  const comparable = true
  const dayCount = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(dayCount - 1))
  const dansPeriodePrecedente = (d) => (d || '') >= prevStart && (d || '') <= prevEnd

  const seancesMois     = useMemo(() => seances.filter((s) => dansPeriode(s.date)), [seances, start, end])
  const abonnementsMois = useMemo(() => abonnements.filter((a) => dansPeriode(a.date)), [abonnements, start, end])
  // « Total encaissé » — calqué EXACTEMENT sur la Facturation (somme de
  // `gym_factures`, pas des séances/abonnements bruts) pour que les deux chiffres
  // soient toujours identiques sur une même période. Tant qu'une séance/un
  // abonnement n'a pas de facture générée (cf. bouton « Générer la facture
  // manquante » dans Séances/Abonnements), il ne compte pas ici — c'est voulu :
  // ce KPI représente ce qui est réellement facturé, pas l'activité brute.
  const facturesMois = useMemo(() => factures.filter((f) => dansPeriode(f.date)), [factures, start, end])
  const totalEncaisseMois = useMemo(
    () => facturesMois.reduce((s, x) => s + (Number(x.montant) || 0), 0),
    [facturesMois]
  )
  // Progression vs objectif du mois (Paramètres) — n'a de sens que sur « Mois en
  // cours » : comparer un quota mensuel à une période perso ou « Tout » serait trompeur.
  const objectif = params.objectifMensuel
  const pctObjectif = objectif > 0 ? Math.round((totalEncaisseMois / objectif) * 100) : null
  const afficherObjectif = modePeriode === 'mois' && filtreMois === todayStr().slice(0, 7) && objectif > 0

  const seancesMoisPrecedent     = useMemo(() => seances.filter((s) => dansPeriodePrecedente(s.date)), [seances, prevStart, prevEnd, comparable])
  const abonnementsMoisPrecedent = useMemo(() => abonnements.filter((a) => dansPeriodePrecedente(a.date)), [abonnements, prevStart, prevEnd, comparable])
  const facturesMoisPrecedent = useMemo(() => factures.filter((f) => dansPeriodePrecedente(f.date)), [factures, prevStart, prevEnd, comparable])
  const totalEncaisseMoisPrecedent = useMemo(
    () => facturesMoisPrecedent.reduce((s, x) => s + (Number(x.montant) || 0), 0),
    [facturesMoisPrecedent]
  )
  const nouveauxClientsMois = useMemo(
    () => clients.filter((c) => c.createdAt && dansPeriode(new Date(c.createdAt).toISOString().slice(0, 10))).length,
    [clients, start, end]
  )

  // Répartition séances/abonnements CLASSÉE SÉPARÉMENT (deux diagrammes en bande
  // distincts, jamais mélangés) — chaque catégorie garde sa couleur (COULEUR_BARRE).
  const parCategorieFn = (liste, total) => CATEGORIES_GYM.map((c) => {
    const lignes = liste.filter((x) => x.categorie === c.id)
    const montant = lignes.reduce((s, x) => s + (Number(x.montant) || 0), 0)
    return { ...c, nb: lignes.length, montant, pct: total > 0 ? Math.round((montant / total) * 100) : 0 }
  })
  const totalSeancesMois = useMemo(() => seancesMois.reduce((s, x) => s + (Number(x.montant) || 0), 0), [seancesMois])
  const totalAbonnementsMois = useMemo(() => abonnementsMois.reduce((s, x) => s + (Number(x.montant) || 0), 0), [abonnementsMois])
  // Proportion femmes / hommes sur la période (personnes distinctes) — mini donut.
  const sexeStats = useMemo(
    () => statsSexe([seancesMois, abonnementsMois], indexSexeClients(clients)),
    [seancesMois, abonnementsMois, clients]
  )
  const seancesParCategorie = useMemo(() => parCategorieFn(seancesMois, totalSeancesMois), [seancesMois, totalSeancesMois])
  const abonnementsParCategorie = useMemo(() => parCategorieFn(abonnementsMois, totalAbonnementsMois), [abonnementsMois, totalAbonnementsMois])

  // Activité récente (séances + abonnements confondus) — les derniers enregistrements,
  // toujours utile même avec peu de données (contrairement à un graphique sur 7 jours,
  // vide et peu parlant tant qu'il n'y a pas assez d'historique).
  const idxSexeDash = useMemo(() => indexSexeClients(clients), [clients])
  const activiteRecente = useMemo(() => {
    const s = seances.map((x) => ({ ...x, type: 'seance' }))
    const a = abonnements.map((x) => ({ ...x, type: 'abonnement' }))
    return [...s, ...a].sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)).slice(0, 20)
  }, [seances, abonnements])

  // Dégradé vertical (clair → couleur pleine) par barre, calculé sur le canvas —
  // plus esthétique qu'un aplat uni, tout en gardant la couleur propre à chaque
  // catégorie (cf. COULEUR_BARRE). `chartArea` n'existe qu'une fois le premier
  // rendu fait ; on retombe sur la couleur pleine avant ça (évite un crash).
  // Dégradé vertical (clair → couleur pleine) par barre, calculé sur le canvas —
  // plus esthétique qu'un aplat uni, tout en gardant la couleur propre à chaque
  // catégorie (cf. COULEUR_BARRE). `chartArea` n'existe qu'une fois le premier
  // rendu fait ; on retombe sur la couleur pleine avant ça (évite un crash).
  const barData = (groupes) => ({
    labels: groupes.map((g) => g.label),
    datasets: [{
      data: groupes.map((g) => g.montant),
      backgroundColor: (ctx) => {
        const couleur = COULEUR_BARRE[groupes[ctx.dataIndex]?.id] || '#94a3b8'
        const { chartArea, ctx: c } = ctx.chart
        if (!chartArea) return couleur
        const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
        gradient.addColorStop(0, couleur)
        gradient.addColorStop(1, couleur + '99')
        return gradient
      },
      hoverBackgroundColor: groupes.map((g) => COULEUR_BARRE[g.id]),
      borderRadius: 10, borderSkipped: false, maxBarThickness: 56
    }]
  })
  const barOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(30,30,30,0.9)', padding: 10, cornerRadius: 10, displayColors: false,
        titleFont: { weight: 'bold' },
        callbacks: { label: (ctx) => ` ${formatMoney(ctx.parsed.y)}` }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { weight: 'bold' } } },
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: (v) => formatMoney(v) } }
    }
  }

  // Clients les plus fréquents (toutes périodes confondues), selon le bouton choisi :
  //  - Tous        : nombre de passages (séances + abonnements) ;
  //  - Séances     : nombre de séances ponctuelles ;
  //  - Abonnements : JOURS de présence pointés des abonnés (un jour compté une fois).
  // Chaque ligne porte aussi le type (abonné / séances) et le sexe du client.
  const clientsFideles = useMemo(() => {
    const idx = indexSexeClients(clients)
    const parClient = new Map()
    const get = (nom) => {
      const cle = nom.toLowerCase()
      if (!parClient.has(cle)) parClient.set(cle, { nom, cle, nbS: 0, nbA: 0, montantS: 0, montantA: 0, jours: new Set() })
      return parClient.get(cle)
    }
    for (const x of seances) {
      const nom = (x.clientNom || '').trim(); if (!nom) continue
      const c = get(nom); c.nbS += 1; c.montantS += Number(x.montant) || 0
    }
    for (const x of abonnements) {
      const nom = (x.clientNom || '').trim(); if (!nom) continue
      const c = get(nom); c.nbA += 1; c.montantA += Number(x.montant) || 0
    }
    for (const pr of presences) {
      const nom = (pr.clientNom || '').trim(); if (!nom) continue
      const c = parClient.get(nom.toLowerCase())
      if (c) c.jours.add(pr.date)
    }
    const lignes = [...parClient.values()].map((c) => {
      const sexe = idx.get(c.cle) || ''
      if (modeFideles === 'seances') return { ...c, sexe, nb: c.nbS, montant: c.montantS, libelle: (n) => `${n} séance${n > 1 ? 's' : ''}` }
      if (modeFideles === 'abonnements') return { ...c, sexe, nb: c.jours.size, montant: c.montantA, libelle: (n) => `${n} jour${n > 1 ? 's' : ''} présent${n > 1 ? 's' : ''}` }
      return { ...c, sexe, nb: c.nbS + c.nbA, montant: c.montantS + c.montantA, libelle: (n) => `${n} passage${n > 1 ? 's' : ''}` }
    })
    return lignes
      .filter((c) => (modeFideles === 'seances' ? c.nbS > 0 : modeFideles === 'abonnements' ? c.nbA > 0 : true))
      .sort((a, b) => b.nb - a.nb || (modeFideles === 'abonnements' ? b.nbA - a.nbA : 0))
      .slice(0, 10)
  }, [seances, abonnements, presences, clients, modeFideles])

  // Abonnements arrivant à échéance dans les 7 prochains jours — pour relancer les
  // clients avant l'expiration plutôt que de les perdre silencieusement.
  const abonnementsExpirentBientot = useMemo(() => {
    const aujourdhui = todayStr()
    const limite = new Date()
    limite.setDate(limite.getDate() + 7)
    const limiteStr = limite.toISOString().slice(0, 10)
    return abonnements
      .filter((a) => a.dateFin && a.dateFin >= aujourdhui && a.dateFin <= limiteStr)
      .sort((a, b) => (a.dateFin < b.dateFin ? -1 : 1))
      .map((a) => ({ ...a, joursRestants: Math.ceil((new Date(a.dateFin) - new Date(aujourdhui)) / 86400000) }))
  }, [abonnements])
  // Retire ceux fermés récemment (cf. dismissRenouvellement) — se réévalue tout
  // seul au fil du temps via `heureActuelle` (tick 60s du bandeau), donc un rappel
  // fermé revient automatiquement dès l'expiration de son délai, sans recharger la page.
  const abonnementsARelancer = useMemo(
    () => abonnementsExpirentBientot.filter((a) => Date.now() >= dismissedUntil(a.id)),
    [abonnementsExpirentBientot, dismissTick, heureActuelle]
  )

  // Abonnés actifs qui ne sont pas venus depuis SEUIL_RELANCE_JOURS (7 j) — dernière
  // arrivée pointée dans gym_presences (Abonnements.jsx), ou date de souscription si
  // jamais pointée. Un seul abonné par nom, même s'il a plusieurs abonnements actifs.
  const abonnesInactifs = useMemo(() => {
    const dernierePresenceParClient = new Map()
    for (const p of presences) {
      const cle = (p.clientNom || '').trim().toLowerCase()
      if (!cle) continue
      if (!dernierePresenceParClient.has(cle) || p.date > dernierePresenceParClient.get(cle)) dernierePresenceParClient.set(cle, p.date)
    }
    const vus = new Set()
    const resultats = []
    for (const a of abonnements) {
      if (!abonnementActif(a.dateFin, a.dateDebut)) continue
      const cle = (a.clientNom || '').trim().toLowerCase()
      if (!cle || vus.has(cle)) continue
      vus.add(cle)
      const derniere = dernierePresenceParClient.get(cle) || a.date
      const jours = joursDepuis(derniere)
      if (jours != null && jours >= SEUIL_RELANCE_JOURS) {
        resultats.push({ clientNom: a.clientNom, jours, derniere })
      }
    }
    return resultats.sort((x, y) => y.jours - x.jours)
  }, [abonnements, presences])
  // Retire ceux fermés récemment (cf. dismissInactif) — même mécanique que
  // abonnementsARelancer ci-dessus (se réévalue seule via heureActuelle/dismissTick).
  const abonnesInactifsAffiches = useMemo(
    () => abonnesInactifs.filter((a) => Date.now() >= dismissedUntilInactif(a.clientNom.trim().toLowerCase())),
    [abonnesInactifs, dismissTick, heureActuelle]
  )

  // Alarme abonné inactif — best-effort : se déclenche quand cet écran est ouvert et
  // détecte un abonné fraîchement passé sous le seuil d'inactivité (une seule fois
  // par période d'inactivité, via `derniereRelanceLe` sur la fiche client).
  //  1. Alerte l'ÉQUIPE (cloche + push, tous les comptes ayant accès à MAXI-GYM) —
  //     fonctionne dès maintenant, sans configuration supplémentaire.
  //  2. Relance le CLIENT par WhatsApp si son numéro est connu — n'aura vraiment
  //     d'effet qu'une fois WHATSAPP_TOKEN/WHATSAPP_PHONE_ID configurés (cf.
  //     NOTIFICATIONS_WHATSAPP.md) ; ignoré silencieusement en attendant.
  useEffect(() => {
    for (const ab of abonnesInactifs) {
      const client = clients.find((c) => (c.nom || '').trim().toLowerCase() === ab.clientNom.trim().toLowerCase())
      if (!client) continue
      const dejaAlerte = client.derniereRelanceLe && client.derniereRelanceLe > new Date(ab.derniere).getTime()
      if (dejaAlerte) continue
      notify({
        type: 'alerte',
        title: `🔔 Abonné à relancer : MAXI-GYM ${siteLabel(site)}`,
        body: `${ab.clientNom} n'est pas venu depuis ${ab.jours} jours alors que son abonnement est toujours actif.`,
        module: 'gym', site, forRoles: ROLES.map((r) => r.value), link: `/gym/${site}`
      }).catch(() => {})
      if (client.telephone) {
        sendWhatsApp([client.telephone], {
          title: '👋 MAXI-GYM',
          body: `Bonjour ${ab.clientNom}, ça fait ${ab.jours} jours qu'on ne vous a pas vu à MAXI-GYM ! Votre abonnement est toujours actif : on vous attend pour votre prochaine séance. 💪`
        })
      }
      updateItem('gym_clients', client.id, { derniereRelanceLe: Date.now() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abonnesInactifs, clients])

  const groupesModal = useMemo(() => {
    if (detailModal === 'seances')     return groupesParCategorie(seancesMois)
    if (detailModal === 'abonnements') return groupesParCategorie(abonnementsMois)
    // Vue « Total » : reprend les FACTURES du mois (cf. totalEncaisseMois), pas les
    // séances/abonnements bruts — pour que le détail affiché somme exactement au
    // même montant que le KPI cliqué.
    if (detailModal === 'total')       return groupesParCategorie(facturesMois)
    return []
  }, [detailModal, seancesMois, abonnementsMois, facturesMois])

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
        <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
          {/* Anneau tournant — le logo reste fixe et net, seul le halo dégradé tourne
              autour, comme un contour lumineux qui balaye le badge en continu. */}
          <style>{`
            @keyframes gym-ring-spin { to { transform: rotate(360deg); } }
          `}</style>
          <div style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            background: 'conic-gradient(from 0deg, #ffffff00, #ffffffe6 35%, #ffffff00 70%)',
            animation: 'gym-ring-spin 2.2s linear infinite'
          }} />
          <img src="/Maxi_Gym.png" alt="MAXI-GYM"
            style={{
              position: 'relative', width: 64, height: 64, borderRadius: '50%', objectFit: 'cover',
              background: 'white', padding: 4, boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
            }} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold sm:text-xl">{salutation()}, {user?.nom || user?.login || ''} 👋</h2>
          <p className="whitespace-nowrap text-sm text-white/80">
            MAXI-GYM {siteLabel(site)} · {heureActuelle.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <FiltrePeriode variant="glass" label="" mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
      </div>

      {coachsAujourdhui.length > 0 && (
        <div className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-2xl border border-white/60 p-3 shadow-[0_16px_36px_-18px_rgba(26,26,26,0.22)] backdrop-blur-xl backdrop-saturate-150"
          style={{ background: `linear-gradient(135deg, ${teinterHex('#ffffff', 0.55)}, ${teinterHex(COULEUR, 0.14)})` }}>
          {/* Reflet — fine lueur en haut, même recette que la nav mobile en verre. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/40 to-transparent" />
          <div className="relative flex shrink-0 items-center gap-2">
            <style>{`
              @keyframes gym-coach-attente {
                0%, 100% { box-shadow: ${OMBRE_3D}, 0 0 0 0 rgba(252,211,77,0.55); }
                50% { box-shadow: ${OMBRE_3D}, 0 0 12px 5px rgba(252,211,77,0.55); }
              }
            `}</style>
            {/* Halo respirant — ne s'anime que tant qu'au moins un coach du jour
                n'est ni arrivé ni en retard (état « Prévu »), pour signaler qu'on
                l'attend ; s'arrête dès qu'il pointe (ou passe en retard). Lueur douce
                qui gonfle/dégonfle (box-shadow), distincte du animate-ping déjà
                utilisé ailleurs sur ce dashboard (badges d'alerte). Icône en relief
                « 3D » (ombre interne claire/sombre + ombre portée). */}
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white"
              style={{
                background: `linear-gradient(135deg, ${COULEUR}, ${COULEUR2})`,
                animation: coachsAujourdhui.some((c) => !c.pointage && !coachsEnRetard.some((x) => x.id === c.id))
                  ? 'gym-coach-attente 2s ease-in-out infinite'
                  : undefined,
                boxShadow: OMBRE_3D
              }}>
              <UserCog size={15} className="relative" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wide text-gray-600">
              Coach{coachsAujourdhui.length > 1 ? 's' : ''} du jour
            </span>
          </div>
          <div className="relative flex flex-1 flex-wrap gap-2">
            {coachsAujourdhui.map((c) => {
              const arrive = !!c.pointage
              const pointageRetard = arrive && c.pointage.statut === 'retard'
              // Pas encore pointé ET au-delà du seuil de retard (cf. coachsEnRetard) :
              // état ROUGE, plus visible que le simple « Prévu » ambre — c'est l'alerte.
              const absent = !arrive && coachsEnRetard.some((x) => x.id === c.id)
              return (
                <div key={c.id} className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 shadow-sm backdrop-blur-sm ${
                  absent ? 'border-red-300 bg-red-50/90' : 'border-white/70 bg-white/80'
                }`}>
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
                    style={{ background: avatarGradient(c.nom) }}>
                    {(c.nom || '?').trim().charAt(0).toUpperCase() || '?'}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                      absent ? 'bg-red-500' : arrive ? (pointageRetard ? 'bg-amber-500' : 'bg-green-500') : 'animate-pulse bg-amber-400'
                    }`} />
                  </span>
                  <span className="text-sm font-semibold text-gray-700">{c.nom}</span>
                  <span className={`text-xs font-semibold ${
                    absent ? 'text-red-600' : arrive ? (pointageRetard ? 'text-amber-600' : 'text-green-600') : 'text-gray-400'
                  }`}>
                    · {absent ? `${minutesRetard(c)} min de retard` : arrive ? `Arrivé ${c.pointage.heureArrivee}` : `Prévu ${c.creneau.heure}`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard glass title="Séances" value={seancesMois.length} icon={Ticket} accent={COULEUR} onClick={() => setDetailModal('seances')}
          variation={comparable ? seancesMois.length - seancesMoisPrecedent.length : undefined} variationLabel="période préc. · cliquer" />
        <StatCard glass title="Abonnements" value={abonnementsMois.length} icon={CreditCard} accent={COULEUR2} onClick={() => setDetailModal('abonnements')}
          variation={comparable ? abonnementsMois.length - abonnementsMoisPrecedent.length : undefined} variationLabel="période préc. · cliquer" />
        <StatCard glass title="Total encaissé" value={formatMoney(totalEncaisseMois)} icon={Wallet} accent={COULEUR} onClick={() => setDetailModal('total')}
          variation={comparable ? totalEncaisseMois - totalEncaisseMoisPrecedent : undefined}
          variationLabel={afficherObjectif
            ? <>🎯 {formatMoney(objectif)} · <strong style={{ color: pctObjectif >= 100 ? '#16a34a' : COULEUR }}>{pctObjectif}%</strong></>
            : (comparable ? `${formatMoney(totalEncaisseMoisPrecedent)} · période préc.` : undefined)} />
        <StatCard glass title="Clients" value={clients.length} icon={Users} accent={COULEUR2} onClick={() => setDetailModal('clients')}
          sub={nouveauxClientsMois > 0 ? `+${nouveauxClientsMois} nouveau${nouveauxClientsMois > 1 ? 'x' : ''} sur la période` : undefined} />
      </div>


      {abonnementsARelancer.length > 0 && (
        <Card title="⏰ Abonnements à renouveler bientôt"
          className="overflow-hidden border-amber-50 bg-gradient-to-br from-amber-50/25 via-white to-white">
          <div className="space-y-2">
            {(voirTousRenouvellements ? abonnementsARelancer : abonnementsARelancer.slice(0, LIMITE_RENOUVELLEMENTS)).map((a) => {
              const urgent = a.joursRestants <= 1
              return (
                <div key={a.id}
                  className="group relative flex w-full items-center gap-1 overflow-hidden rounded-2xl border border-amber-100/50 bg-white/55 pr-1 shadow-sm backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <span aria-hidden="true" className="pointer-events-none absolute -inset-x-4 -top-6 h-10 -rotate-6 bg-gradient-to-b from-white/70 to-transparent" />
                  <button onClick={() => setClientDetail(a.clientNom)}
                    className="relative flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left">
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                      {urgent && <span className="absolute inset-0 animate-ping rounded-full bg-amber-300 opacity-40" />}
                      <AlertTriangle size={16} className="relative" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-800">{a.clientNom}</p>
                      <p className="text-xs text-gray-500">
                        <Badge tone={categorieTone(a.categorie)}>{categorieLabel(a.categorie)}</Badge>
                        {' '}expire le {formatDateShort(a.dateFin)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${urgent ? 'bg-amber-400 text-white' : 'bg-amber-50 text-amber-600'}`}>
                      {a.joursRestants <= 0 ? "Aujourd'hui" : a.joursRestants === 1 ? 'Demain' : `Dans ${a.joursRestants} jours`}
                    </span>
                  </button>
                  <button
                    onClick={() => { dismissRenouvellement(a.id, a.joursRestants); setDismissTick((t) => t + 1) }}
                    title={a.joursRestants <= 3 ? 'Fermer : reviendra dans 3h' : 'Fermer : reviendra demain'}
                    className="relative shrink-0 rounded-full p-1.5 text-amber-300 hover:bg-amber-50 hover:text-amber-600">
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>
          {abonnementsARelancer.length > LIMITE_RENOUVELLEMENTS && (
            <button onClick={() => setVoirTousRenouvellements((v) => !v)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-50">
              {voirTousRenouvellements ? 'Réduire' : `Voir les ${abonnementsARelancer.length - LIMITE_RENOUVELLEMENTS} autres`}
            </button>
          )}
        </Card>
      )}

      {abonnesInactifsAffiches.length > 0 && (
        <Card title="🔔 Abonnés à relancer : inactifs depuis 7 jours ou plus">
          <style>{`
            @keyframes gym-signal-lumineux {
              0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
              50% { box-shadow: 0 0 0 6px rgba(239,68,68,0.45), 0 0 24px 6px rgba(239,68,68,0.5); }
            }
          `}</style>
          <div className="space-y-2">
            {abonnesInactifsAffiches.map((a) => {
              const tresInactif = a.jours >= 14
              const cle = a.clientNom.trim().toLowerCase()
              const flashe = flashInactif === cle
              return (
                <div key={a.clientNom}
                  className={`group flex w-full items-center gap-1 rounded-2xl border border-red-100 bg-gradient-to-r from-red-50 to-white pr-1 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${flashe ? 'animate-[gym-signal-lumineux_0.35s_ease-out]' : ''}`}>
                  <button onClick={() => setClientDetail(a.clientNom)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left">
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                      {tresInactif && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-50" />}
                      <BellRing size={16} className="relative" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-800">{a.clientNom}</p>
                      <p className="text-xs text-gray-500">Dernière arrivée : {formatDateShort(a.derniere)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${tresInactif ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700'}`}>
                      Il y a {a.jours} jours
                    </span>
                  </button>
                  <button
                    onClick={() => handleDismissInactif(cle)}
                    title="Fermer : reviendra demain"
                    className="shrink-0 rounded-full p-1.5 text-red-400 hover:bg-red-200 hover:text-red-700">
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="🕒 Activité récente" className="overflow-hidden border-orange-100/60 bg-gradient-to-br from-orange-50/60 via-white to-white">
          {activiteRecente.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100/70 text-orange-300">
                <Clock size={22} />
              </span>
              <p className="text-sm text-gray-400">Aucune activité pour l'instant.</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                {(voirToutActivite ? activiteRecente : activiteRecente.slice(0, LIMITE_ACTIVITE)).map((x) => (
                  <button key={x.id} onClick={() => setClientDetail(x.clientNom)}
                    className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-white/60 bg-white/65 px-3 py-2 text-left shadow-sm backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: avatarGradient(x.clientNom), boxShadow: OMBRE_3D }}>
                      <User size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-semibold text-gray-800"><span className="truncate">{x.clientNom}</span> <SexeBadge sexe={sexeDe(x, idxSexeDash)} /></p>
                      <p className="text-[11px] text-gray-400">
                        <Badge tone={x.type === 'abonnement' ? 'purple' : 'info'}>{x.type === 'abonnement' ? 'Abonnement' : 'Séance'}</Badge>
                        {' '}{categorieLabel(x.categorie)} · {formatDateShort(x.date)}
                      </p>
                    </div>
                    <span className="shrink-0 font-bold text-gray-700">{formatMoney(x.montant)}</span>
                  </button>
                ))}
              </div>
              {activiteRecente.length > LIMITE_ACTIVITE && (
                <button onClick={() => setVoirToutActivite((v) => !v)}
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-50">
                  {voirToutActivite ? 'Réduire' : `Voir les ${activiteRecente.length - LIMITE_ACTIVITE} autres`}
                </button>
              )}
            </>
          )}
        </Card>

        <Card title="Clients les plus fréquents" className="overflow-hidden border-amber-100/60 bg-gradient-to-br from-amber-50/60 via-white to-white">
          {/* Boutons : ce qui compte pour le classement (tous / séances / abonnements). */}
          <div className="mb-3 flex gap-1 rounded-2xl border border-amber-100 bg-white/70 p-1">
            {[['tous', 'Tous'], ['seances', '🎫 Séances'], ['abonnements', '💳 Abonnements']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => { setModeFideles(v); setVoirTousClients(false) }}
                className={`flex-1 rounded-xl px-2 py-1.5 text-xs font-bold transition-colors ${modeFideles === v ? 'text-white shadow-sm' : 'text-gray-500 hover:bg-amber-50'}`}
                style={modeFideles === v ? { background: `linear-gradient(135deg, ${COULEUR}, ${COULEUR2})` } : undefined}>
                {l}
              </button>
            ))}
          </div>
          {clientsFideles.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100/70 text-amber-300">
                <Flame size={22} />
              </span>
              <p className="text-sm text-gray-400">Aucun client pour l'instant.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {(voirTousClients ? clientsFideles : clientsFideles.slice(0, LIMITE_CLIENTS)).map((c, i) => {
                  const podium = RANG_PODIUM[i]
                  return (
                    <button key={c.nom} onClick={() => setClientDetail(c.nom)}
                      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${podium ? `${podium.bg} ${podium.ring}` : 'border border-white/60 bg-white/65'}`}>
                      <div className="relative shrink-0">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: avatarGradient(c.nom), boxShadow: OMBRE_3D }}>
                          <User size={16} />
                        </span>
                        {podium ? (
                          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs leading-none shadow ring-1 ring-gray-200" title={podium.label}>
                            {podium.medaille}
                          </span>
                        ) : (
                          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-400 text-[10px] font-extrabold text-white shadow ring-1 ring-white">
                            {i + 1}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 font-bold text-gray-800"><span className="truncate">{c.nom}</span> <SexeBadge sexe={c.sexe} /></p>
                        <p className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
                          {formatMoney(c.montant)}
                          {modeFideles === 'tous' && c.nbA > 0 && <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">💳 Abonné</span>}
                          {modeFideles === 'tous' && c.nbS > 0 && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">🎫 {c.nbS} séance{c.nbS > 1 ? 's' : ''}</span>}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 text-sm font-bold" style={{ color: COULEUR }}>
                        <Flame size={14} /> {c.libelle(c.nb)}
                      </span>
                    </button>
                  )
                })}
              </div>
              {clientsFideles.length > LIMITE_CLIENTS && (
                <button onClick={() => setVoirTousClients((v) => !v)}
                  className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-50">
                  {voirTousClients ? 'Réduire' : `Voir les ${clientsFideles.length - LIMITE_CLIENTS} autres`}
                </button>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Bento : deux diagrammes EN BANDE classés (séances / abonnements), jamais
          mélangés — chaque catégorie garde sa couleur (cf. COULEUR_BARRE) dans les deux. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="🎫 Séances par catégorie" className="overflow-hidden border-orange-100/60 bg-gradient-to-br from-orange-50/50 via-white to-white">
          {totalSeancesMois === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100/70 text-orange-300">
                <Ticket size={22} />
              </span>
              <p className="text-sm text-gray-400">Aucune séance sur cette période.</p>
            </div>
          ) : (
            <div style={{ height: 220 }}>
              <Bar data={barData(seancesParCategorie)} options={barOptions} />
            </div>
          )}
        </Card>

        <Card title="💳 Abonnements par catégorie" className="overflow-hidden border-red-100/60 bg-gradient-to-br from-red-50/50 via-white to-white">
          {totalAbonnementsMois === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100/70 text-red-300">
                <CreditCard size={22} />
              </span>
              <p className="text-sm text-gray-400">Aucun abonnement sur cette période.</p>
            </div>
          ) : (
            <div style={{ height: 220 }}>
              <Bar data={barData(abonnementsParCategorie)} options={barOptions} />
            </div>
          )}
        </Card>

        {/* Mini donut femmes / hommes — aperçu rapide ; le détail est dans Pilotage & Analyses. */}
        <Card title="⚥ Femmes / Hommes" className="overflow-hidden border-pink-100/60 bg-gradient-to-br from-pink-50/40 via-white to-sky-50/40">
          {sexeStats.connus === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100/70 text-pink-300">
                <Users size={22} />
              </span>
              <p className="text-sm text-gray-400">Sexe non renseigné sur cette période.</p>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-4 py-2">
              <SexeDonut stats={sexeStats} mini />
              <div className="space-y-1.5">
                {SEXES.map((sx) => (
                  <p key={sx.id} className="flex items-center gap-2 text-sm">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs text-white" style={{ background: sx.couleur }}>{sx.symbole}</span>
                    <strong className="text-gray-800">{sx.id === 'F' ? sexeStats.pctF : sexeStats.pctH}%</strong>
                    <span className="text-xs text-gray-400">{sexeStats[sx.id].personnes}</span>
                  </p>
                ))}
                {sexeStats.inconnu.personnes > 0 && (
                  <p className="text-[10px] text-gray-400">+{sexeStats.inconnu.personnes} non précisé{sexeStats.inconnu.personnes > 1 ? 's' : ''}</p>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title={detailModal ? DETAIL_INFO[detailModal].titre : ''}
        {...glassModalProps(COULEUR_MODULE.gym)}
        footer={<>
          <Button variant="ghost" onClick={() => setDetailModal(null)}>Fermer</Button>
          {detailModal === 'clients' && <Button onClick={() => navigate(`/gym/${site}/clients`)}>Gérer les clients</Button>}
        </>}>
        {detailModal && (() => {
          const Icon = DETAIL_INFO[detailModal].icon
          return (
            <div className="space-y-4">
              {/* Bandeau héro — même dégradé/badge lumineux que l'en-tête du volet. */}
              <div className="relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(232,133,15,0.35),0_8px_20px_-8px_rgba(232,133,15,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
                style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, ${COULEUR2}e6 100%)` }}>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/80 bg-white/20 shadow-lg backdrop-blur-sm">
                  <Icon size={22} color="white" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold leading-tight">{DETAIL_INFO[detailModal].titre}</p>
                  <p className="text-sm text-white/80">Cliquer un client pour voir sa fiche complète</p>
                </div>
              </div>

              {detailModal === 'clients' ? (
                <div className="space-y-2">
                  {clients.length === 0 && (
                    <p className="py-4 text-center text-sm text-gray-400">Aucun client enregistré pour l'instant.</p>
                  )}
                  {[...clients].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')).map((c) => (
                    <button key={c.id} onClick={() => { setDetailModal(null); setClientDetail(c.nom) }}
                      className="w-full rounded-lg bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100">
                      <p className="font-semibold text-gray-800">{c.nom}</p>
                      <p className="text-sm text-gray-600">📞 {c.telephone || '—'}</p>
                      {c.notes && <p className="mt-1 text-xs text-gray-500">📝 {c.notes}</p>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {groupesModal.every((g) => g.lignes.length === 0) && (
                    <p className="py-4 text-center text-sm text-gray-400">Rien à afficher pour l'instant.</p>
                  )}
                  {groupesModal.filter((g) => g.lignes.length > 0).map((g) => {
                    const ligneBtn = (l) => (
                      <button key={l.id} onClick={() => { setDetailModal(null); setClientDetail(l.clientNom) }}
                        className="flex w-full items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-left text-sm shadow-sm transition-colors hover:bg-orange-50">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-800">{l.clientNom}</p>
                          <p className="text-[11px] text-gray-400">
                            {formatDateShort(l.date)}
                            {l.dateFin && <> · jusqu'au {formatDateShort(l.dateFin)}</>}
                          </p>
                        </div>
                        <span className="shrink-0 font-bold text-gray-700">{formatMoney(l.montant)}</span>
                      </button>
                    )
                    return (
                      <div key={g.id} className="overflow-hidden rounded-2xl border-l-4 bg-gray-50 p-3" style={{ borderColor: COULEUR_BARRE[g.id] }}>
                        <div className="mb-2 flex items-center justify-between">
                          <Badge tone={g.tone}>{g.label}</Badge>
                          <span className="text-sm font-bold text-gray-700">{formatMoney(g.total)}</span>
                        </div>
                        {/* Vue « Total » : séances et abonnements classés séparément, jamais mélangés. */}
                        {detailModal === 'total' ? (
                          <div className="space-y-2.5">
                            {g.seancesLignes.length > 0 && (
                              <div>
                                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">🎫 Séances</p>
                                <div className="space-y-1">{g.seancesLignes.map(ligneBtn)}</div>
                              </div>
                            )}
                            {g.abonnementsLignes.length > 0 && (
                              <div>
                                <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">💳 Abonnements</p>
                                <div className="space-y-1">{g.abonnementsLignes.map(ligneBtn)}</div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">{g.lignes.map(ligneBtn)}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      <ClientDetailModal clientNom={clientDetail} onClose={() => setClientDetail(null)}
        clients={clients} seances={seances} abonnements={abonnements} presences={presences} />
    </div>
  )
}

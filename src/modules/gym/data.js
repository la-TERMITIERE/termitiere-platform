// MAXI-GYM — données de référence.
// Catégorie d'une séance ou d'un abonnement — détermine le niveau d'accès/tarif.
// « Classique » n'existe que pour les abonnements (durée et tarif libres) — pas de
// séance classique (cf. CATEGORIES_SEANCE, sous-ensemble utilisé par Seances.jsx).
export const CATEGORIES_GYM = [
  { id: 'simple',    label: 'Simple',    tone: 'neutral', desc: 'Accès salle — sans tapis roulant ni escalator' },
  { id: 'classique', label: 'Classique', tone: 'info',    desc: 'Durée et tarif définis à la saisie (abonnement uniquement)' },
  { id: 'vip',       label: 'VIP',       tone: 'warning', desc: 'Accès complet, avec tapis roulant et escalator' }
]

// Catégories disponibles pour une séance ponctuelle — Classique exclu (réservé aux abonnements).
export const CATEGORIES_SEANCE = CATEGORIES_GYM.filter((c) => c.id !== 'classique')

export const categorieLabel = (id) => CATEGORIES_GYM.find((c) => c.id === id)?.label || id
export const categorieTone  = (id) => CATEGORIES_GYM.find((c) => c.id === id)?.tone || 'neutral'
export const categorieDesc  = (id) => CATEGORIES_GYM.find((c) => c.id === id)?.desc || ''

// Valeurs PAR DÉFAUT — utilisées tant qu'aucun réglage n'a été enregistré depuis le
// volet Paramètres (cf. useGymParams.js, qui les surcharge avec la config réelle en
// base, PAR SALLE). Gardées ici pour ne jamais laisser l'app sans valeur de repli.
// 7 jours (1 semaine) — il existe bien une offre Classique d'1 semaine, en plus de
// celle de 2 semaines (14 jours) ; le champ reste un nombre de jours libre au-delà,
// ce plancher n'empêche que de descendre sous une semaine.
export const DUREE_CLASSIQUE_MIN_JOURS_DEFAUT = 7
export const TARIFS_SEANCE_DEFAUT     = { simple: 1000,  vip: 1500 }
export const TARIFS_ABONNEMENT_DEFAUT = { simple: 10000, vip: 15000 }
export const VALIDITE_SEANCE_HEURES_DEFAUT = 5

// Tarifs Kara (distincts de Lomé ci-dessus, décision explicite du 01/09/2026) —
// abonnement Classique à prix FIXE (10 000f, durée fixe 1 mois comme Simple/VIP),
// contrairement à Lomé où Classique reste prix/durée libres (cf. dateFinAbonnement).
export const TARIFS_SEANCE_DEFAUT_KARA     = { simple: 1000, vip: 1500 }
export const TARIFS_ABONNEMENT_DEFAUT_KARA = { simple: 7000, classique: 10000, vip: 15000 }

export function finValiditeSeance(createdAt, validiteHeures = VALIDITE_SEANCE_HEURES_DEFAUT) {
  return new Date((createdAt || Date.now()) + validiteHeures * 60 * 60 * 1000)
}

export function seanceValide(createdAt, validiteHeures = VALIDITE_SEANCE_HEURES_DEFAUT) {
  return Date.now() < finValiditeSeance(createdAt, validiteHeures).getTime()
}

// Date de fin d'un abonnement :
//  - Simple / VIP : durée FIXE, 1 mois calendaire depuis la date de souscription.
//  - Classique : durée LIBRE, définie par l'utilisateur en jours — minimum réglable
//    depuis Paramètres (14 jours/2 semaines par défaut) ; pas d'offre « 1 semaine ».
//    SAUF si `classiqueFixe` (Kara, cf. tarifAbonnementClassique dans useGymParams) :
//    Classique se comporte alors comme Simple/VIP — durée fixe 1 mois.
export function dateFinAbonnement(dateDebut, categorie, dureeJours, classiqueFixe = false) {
  const d = new Date(dateDebut || Date.now())
  if (categorie === 'classique' && !classiqueFixe) {
    d.setDate(d.getDate() + (parseInt(dureeJours) || 0))
  } else {
    d.setMonth(d.getMonth() + 1)
  }
  return d.toISOString().slice(0, 10)
}

export function abonnementActif(dateFin) {
  if (!dateFin) return true
  return dateFin >= new Date().toISOString().slice(0, 10)
}

// Nombre de jours écoulés depuis une date (YYYY-MM-DD) jusqu'à aujourd'hui.
export function joursDepuis(dateStr) {
  if (!dateStr) return null
  const jour = new Date(dateStr + 'T00:00:00')
  const aujourdhui = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')
  return Math.round((aujourdhui - jour) / 86400000)
}

// Seuil (en jours) sans passage d'un abonné actif avant de le signaler comme
// « à relancer » — cf. Dashboard.jsx (alerte) et pointageArrivee (relance WhatsApp).
export const SEUIL_RELANCE_JOURS = 7

export const MOIS_LABELS_GYM = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

// Les n derniers mois se terminant à `ancre` (aujourd'hui par défaut), le plus
// ancien en premier — pour les tendances Pilotage (filtrables par mois de référence).
export function derniersMoisGym(n, ancre = new Date()) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ancre.getFullYear(), ancre.getMonth() - i, 1)
    const annee = d.getFullYear()
    const mois = d.getMonth() + 1
    out.push({ annee, mois, prefixe: `${annee}-${String(mois).padStart(2, '0')}`, label: `${MOIS_LABELS_GYM[mois - 1].slice(0, 4)} ${String(annee).slice(2)}` })
  }
  return out
}

// Taux de croissance entre deux valeurs (null si non calculable).
export function croissanceGym(actuel, precedent) {
  if (!precedent) return null
  return Math.round(((actuel - precedent) / Math.abs(precedent)) * 100)
}

// Masque temporairement les points d'entrée du QR carnet dans l'UI (bouton « QR
// carnet », fenêtre proposée à la création d'un nouveau client) — la page publique
// et le jeton continuent d'être créés normalement en base, seule l'INTERFACE est
// cachée. En attendant que `FIREBASE_SERVICE_ACCOUNT` soit configuré côté Netlify
// (cf. netlify/functions/gym-carnet*.js, qui répond `not_configured` sans ça — la
// page publique ne fonctionne pas). Remettre à `true` une fois la variable en place.
export const QR_CARNET_ACTIF = false

// Jeton public du carnet de présence (QR code) — suffisamment long pour être
// impossible à deviner ; sert de clé d'accès à la page /gym/carnet/<jeton>,
// qui n'exige pas de connexion (cf. netlify/functions/gym-carnet*.js).
export function genQrToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

// ── Coachs : planning hebdomadaire + pointage ──────────────────────────────
// Un coach (`gym_coachs`) a un `horaires` = { [jourId]: { actif, heure } } —
// programmé ou non chaque jour de la semaine, avec une heure d'arrivée prévue.
// Le pointage réel (`gym_pointages_coach`) est un enregistrement séparé, un par
// jour où le coach est effectivement venu (bouton « Pointer l'arrivée » côté
// réception) — le planning reste la PRÉVISION, le pointage la RÉALITÉ.
export const JOURS_SEMAINE = [
  { id: 'lundi', label: 'Lundi' },
  { id: 'mardi', label: 'Mardi' },
  { id: 'mercredi', label: 'Mercredi' },
  { id: 'jeudi', label: 'Jeudi' },
  { id: 'vendredi', label: 'Vendredi' },
  { id: 'samedi', label: 'Samedi' },
  { id: 'dimanche', label: 'Dimanche' }
]

// Planning vide par défaut (aucun jour programmé) — utilisé à la création d'un coach.
export function horairesVides() {
  return Object.fromEntries(JOURS_SEMAINE.map((j) => [j.id, { actif: false, heure: '08:00' }]))
}

// Id du jour de semaine (cf. JOURS_SEMAINE) d'une date 'YYYY-MM-DD' (aujourd'hui par défaut).
// getDay() renvoie 0=dimanche..6=samedi ; réindexé pour commencer à lundi.
export function jourSemaineId(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  return JOURS_SEMAINE[(d.getDay() + 6) % 7].id
}

// Le coach est-il programmé à la date donnée ? Renvoie son créneau ({ actif, heure })
// ou null si repos ce jour-là.
export function creneauCoach(coach, dateStr) {
  const c = coach?.horaires?.[jourSemaineId(dateStr)]
  return c?.actif ? c : null
}

// À l'heure si arrivé au plus tard 10 min après l'heure programmée — tolérance
// raisonnable pour ne pas marquer « retard » sur un simple décalage d'horloge.
const TOLERANCE_RETARD_MIN = 10
export function statutPointage(heureProgrammee, heureArrivee) {
  if (!heureProgrammee || !heureArrivee) return 'a_lheure'
  const [hp, mp] = heureProgrammee.split(':').map(Number)
  const [ha, ma] = heureArrivee.split(':').map(Number)
  return (ha * 60 + ma) - (hp * 60 + mp) > TOLERANCE_RETARD_MIN ? 'retard' : 'a_lheure'
}

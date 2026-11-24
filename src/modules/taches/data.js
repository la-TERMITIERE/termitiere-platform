// E-TACHES : constantes, niveaux d'accès et petits calculs partagés par tous les écrans du module.
// Repris de l'ancienne application « Gestion des tâches » : mêmes statuts, mêmes priorités, mêmes règles de visibilité,
// mais sur les comptes de la plateforme (plus de lien à jeton) et avec des notifications push (jamais d'e-mail).
import { todayStr, addDays } from '../../utils/formatters'
import { isFullAccessRole } from '../../core/roles'

export const COULEUR = '#7c3aed'

export const COL = {
  taches: 'taches_taches',
  messages: 'taches_messages',
  objectifs: 'taches_objectifs',
  routines: 'taches_routines',
  suivi: 'taches_suivi',
  feries: 'taches_feries',
  rapports: 'taches_rapports'
}

export const STATUTS = ['À faire', 'En cours', 'Terminé']
export const PRIORITES = ['Basse', 'Moyenne', 'Haute']
export const STATUTS_OBJECTIF = ['En cours', 'Atteint', 'Échec', 'Abandonné']

export const COULEUR_STATUT = { 'À faire': '#64748b', 'En cours': '#0284c7', 'Terminé': '#16a34a', 'En retard': '#dc2626' }
export const COULEUR_PRIORITE = { Haute: '#dc2626', Moyenne: '#d97706', Basse: '#16a34a' }
export const TON_STATUT = { 'À faire': 'neutral', 'En cours': 'info', 'Terminé': 'success', 'En retard': 'danger' }
export const TON_PRIORITE = { Haute: 'danger', Moyenne: 'warning', Basse: 'success' }

// ── Qui voit quoi dans E-TACHES ──────────────────────────────────────────────────────────────────────────────────────
// Chaque compte a un NIVEAU. Par défaut, seuls le PAU, la GE, Info, le DF, la RH et l'Assistante GE (et le super administrateur) ont l'accès
// total : toutes les tâches et tous les volets. TOUS LES AUTRES (agents, directeurs, superviseurs, gérants, secrétaires…) ne voient que leurs
// propres tâches et leur propre récapitulatif. Info règle le niveau de chaque compte dans sa fiche d'accès (champ `tachesNiveau` du profil).
export const NIVEAUX_TACHES = {
  chef: { label: 'Accès total', aide: 'Toutes les tâches, tous les volets (pilotage, par employé, par directeur…), modifie tout.' },
  dir:  { label: 'Directeur', aide: 'Toutes les tâches, vues par employé, par directeur et par niveau.' },
  rh:   { label: 'Ressources humaines', aide: 'Toutes les tâches, vues par directeur et par niveau, jours fériés.' },
  resp: { label: 'Responsable', aide: "Objectifs et routines de l'équipe, annuaire ; ses propres tâches." },
  emp:  { label: 'Ses tâches seulement', aide: 'Voit uniquement les tâches qui lui sont confiées ou qu\'il crée, et son récapitulatif.' }
}
const NIVEAU_PAR_ROLE = { super_admin: 'chef', info: 'chef', pau: 'chef', ge: 'chef', df: 'chef', rh: 'chef', assistant_ge: 'chef' }
// Niveau d'un compte : le réglage d'Info s'il existe, sinon celui de son rôle RÉEL (l'Assistante GE se distingue ainsi de la secrétaire).
export const niveauTachesDe = (user) => (NIVEAUX_TACHES[user?.tachesNiveau] ? user.tachesNiveau : NIVEAU_PAR_ROLE[user?.role] || 'emp')
// Niveau du compte connecté, posé une fois par la coque de l'application : tous les écrans d'E-TACHES calculent des droits pour LE compte connecté.
let niveauMoi = null
export const definirNiveauMoi = (n) => { niveauMoi = n || null }
export const niveauTaches = (role) => niveauMoi || NIVEAU_PAR_ROLE[role] || 'emp'
// Voit toutes les tâches de l'entreprise.
export const voitToutesLesTaches = (role) => ['chef', 'dir', 'rh'].includes(niveauTaches(role))
// Confie des tâches à n'importe qui ; les autres ne s'en confient qu'à eux-mêmes.
export const peutAssignerAuxAutres = (role) => niveauTaches(role) !== 'emp'
// Voit les objectifs et les routines de toute l'équipe.
export const voitToutesLesEquipes = (role) => niveauTaches(role) !== 'emp'
// Supprimer pour de bon : l'accès total seulement (jamais un agent). Les autres archivent.
export const peutSupprimerTache = (role) => isFullAccessRole(role)

// ── Autorisations sur une tâche, pour la personne connectée (`moi` = uid) ───────────────────────────────────────
export const estDestinataire = (t, moi) => !!moi && t.destUid === moi
export const estAuteur = (t, moi) => !!moi && t.parUid === moi
export const estMembre = (t, moi) => !!moi && (t.membres || []).some((m) => m.uid === moi)
export const estChefEquipe = (t, moi) => !!moi && (t.membres || []).some((m) => m.uid === moi && m.leader)
export const voitLaTache = (t, moi, role) => voitToutesLesTaches(role) || estDestinataire(t, moi) || estAuteur(t, moi) || estMembre(t, moi)
export const peutModifierLaTache = (t, moi, role) => niveauTaches(role) === 'chef' || estAuteur(t, moi)
export const peutChangerLeStatut = (t, moi, role) => niveauTaches(role) === 'chef' || estAuteur(t, moi) || estDestinataire(t, moi) || estChefEquipe(t, moi)
// Retourner une tâche à quelqu'un d'autre (hors de mes attributions, indisponible…) : son destinataire actuel ou la direction générale, tant qu'elle n'est pas terminée.
export const peutRetournerLaTache = (t, moi, role) => t.statut !== 'Terminé' && !t.archivee && (niveauTaches(role) === 'chef' || estDestinataire(t, moi))
export const peutRenvoyerLaTache = (t, moi, role) => t.statut === 'Terminé' && (niveauTaches(role) === 'chef' || estAuteur(t, moi)) && !estDestinataire(t, moi)

// ── États dérivés ───────────────────────────────────────────────────────────────────────────────────────────────
export const enRetard = (t, jour = todayStr()) => t.statut !== 'Terminé' && !!t.dateLimite && t.dateLimite < jour
export const statutAffiche = (t, jour) => (enRetard(t, jour) ? 'En retard' : t.statut || 'À faire')
export const aDemarrer = (t, jour = todayStr()) => t.statut === 'À faire' && !!t.dateDebut && t.dateDebut <= jour
// Archivée à la main, ou terminée depuis plus d'un mois (archivage automatique de l'ancienne application).
export const estArchivee = (t, jour = todayStr()) => !!t.archivee || (t.statut === 'Terminé' && !!t.dateCloture && t.dateCloture <= addDays(jour, -30))
export const joursAvant = (dateStr, jour = todayStr()) => {
  if (!dateStr) return null
  return Math.round((new Date(dateStr + 'T00:00:00') - new Date(jour + 'T00:00:00')) / 86400000)
}
export const libelleEcheance = (t, jour = todayStr()) => {
  const n = joursAvant(t.dateLimite, jour)
  if (n === null) return 'Sans échéance'
  if (t.statut === 'Terminé') return `Terminée le ${(t.dateCloture || t.dateLimite).split('-').reverse().join('/')}`
  if (n < 0) return `En retard de ${-n} jour${-n > 1 ? 's' : ''}`
  if (n === 0) return "Échéance aujourd'hui"
  if (n === 1) return 'Échéance demain'
  return `Dans ${n} jours`
}

// Participants à une tâche (hors la personne donnée) : destinataire, auteur et membres de l'équipe.
export const participants = (t, sauf = null) => [...new Set([t.destUid, t.parUid, ...(t.membres || []).map((m) => m.uid)].filter((u) => u && u !== sauf))]

// Progression d'une équipe : moyenne des sous-statuts (À faire 0, En cours 50, Terminé 100).
export const progressionEquipe = (membres = []) => {
  if (!membres.length) return 0
  const pts = { 'À faire': 0, 'En cours': 50, 'Terminé': 100 }
  return Math.round(membres.reduce((s, m) => s + (pts[m.sousStatut] ?? 0), 0) / membres.length)
}

export const trierParEcheance = (a, b) => (a.dateLimite || '9999') < (b.dateLimite || '9999') ? -1 : (a.dateLimite || '9999') > (b.dateLimite || '9999') ? 1 : 0

export const formatJour = (d) => (d ? String(d).split('-').reverse().join('/') : '')

// Niveaux autorisés pour chaque vue d'analyse (menu et garde d'accès).
export const NIVEAUX_VUE = {
  annuaire: ['chef', 'dir', 'rh', 'resp'],
  pilotage: ['chef'],
  parEmploye: ['chef', 'dir'],
  parDirecteur: ['chef', 'dir', 'rh'],
  parNiveau: ['chef', 'dir', 'rh']
}

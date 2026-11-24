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

// ── Droits de l'application source fusionnés avec les rôles de la plateforme ───────────────────────────────────────
// Il n'existe QU'UNE liste de rôles : ceux de la plateforme. Chacun reçoit les droits E-TACHES de son équivalent dans l'application
// d'origine (Gestion-des-t-ches) ; aucun rôle E-TACHES n'est attribué à part.
//   chef : direction générale (voit tout, modifie tout, Pilotage). D'origine : PAU, GE, Chef administrateur ; Info voit tout aussi.
//   dir  : directeurs (d'origine : DF et Directeur). rh : DA-RH. resp : responsables de terrain (d'origine : chef de département).
//   emp  : employés (d'origine : employé, y compris l'Assistante RH) : agents, secrétaires, assistantes, tata, etc.
const NIVEAU_PAR_ROLE = {
  super_admin: 'chef', info: 'chef', assistant_pau: 'chef', pau: 'chef', ge: 'chef',
  df: 'dir', directeur: 'dir',
  rh: 'rh',
  gerant: 'resp', gerante_garderie: 'resp', chef_projet: 'resp',
  superviseur: 'emp', partenaire: 'emp', agent: 'emp', tata: 'emp', secretaire: 'emp', assistant_comptable: 'emp', assistant_ge: 'emp'
}
export const niveauTaches = (role) => NIVEAU_PAR_ROLE[role] || 'emp'
// Direction générale : voit le Pilotage, modifie toutes les tâches.
export const ROLES_PILOTAGE_TACHES = Object.keys(NIVEAU_PAR_ROLE).filter((r) => NIVEAU_PAR_ROLE[r] === 'chef')
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

// Rôles de la plateforme autorisés pour chaque vue d'analyse (menu et garde d'accès), selon l'ancienne application :
//   Par employé : direction générale et directeurs · Par directeur et Par niveau : + RH · Annuaire : tous sauf les employés simples.
const rolesDuNiveau = (...niveaux) => Object.keys(NIVEAU_PAR_ROLE).filter((r) => niveaux.includes(NIVEAU_PAR_ROLE[r]))
export const ROLES_PAR_EMPLOYE = rolesDuNiveau('chef', 'dir')
export const ROLES_PAR_DIRECTEUR = rolesDuNiveau('chef', 'dir', 'rh')
export const ROLES_PAR_NIVEAU = rolesDuNiveau('chef', 'dir', 'rh')
export const ROLES_ANNUAIRE = rolesDuNiveau('chef', 'dir', 'rh', 'resp')

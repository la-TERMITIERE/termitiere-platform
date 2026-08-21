// Gestion de Projet — logique métier.
import { SEUILS_DEFAUT } from './data'
import { formatDateShort } from '../../utils/formatters'
import { PROJET_ROLES_CLOISONNES } from '../../core/roles'
import { SECTEURS as SECTEURS_DEPENSE } from '../depense/data'
import { SECTEUR_PAR_TYPE_PROJET } from '../depense/logic'

// Secteur E-DÉPENSES concerné par un projet — même priorité que la passerelle réelle
// (depensesProjetVersSecteurs) : secteur explicite en premier, sinon déduit du type.
export const secteurEffectif = (p) =>
  SECTEURS_DEPENSE.find((s) => s.id === (p.secteurId || SECTEUR_PAR_TYPE_PROJET[p.type] || 'divers'))

// Cloisonnement par projet : un rôle cloisonné (ex. chef de projet) ne voit que les
// projets dont il est désigné « Responsable » (p.responsableUid) OU ajouté comme
// « Collaborateur » (p.collaborateurs[].uid) — un collaborateur a le même accès
// complet au projet qu'un responsable. Les autres rôles voient tout, comme aujourd'hui.
export function projetsVisibles(projets = [], user, role) {
  if (!PROJET_ROLES_CLOISONNES.includes(role)) return projets
  const uid = user?.uid
  if (!uid) return []
  return projets.filter((p) => p.responsableUid === uid || (p.collaborateurs || []).some((c) => c.uid === uid))
}

// Sous-ensemble d'une collection liée à des projets (tâches, dépenses, documents…)
// via `projetId`, restreint à un ensemble de projets déjà filtré par projetsVisibles().
export function scopeParProjets(items = [], projetsAutorises = []) {
  const ids = new Set(projetsAutorises.map((p) => p.id))
  return items.filter((it) => ids.has(it.projetId))
}

// Comme scopeParProjets, mais garde aussi les éléments SANS projet (`projetId` vide) —
// pour les magasins/matériel « généraux », rattachés à l'entreprise plutôt qu'à un
// chantier précis (cf. Materiel.jsx, sentinelle SANS_PROJET). Un rôle cloisonné (chef
// de projet) voit donc les éléments globaux en plus de ceux de ses propres projets.
export function scopeParProjetsOuGlobal(items = [], projetsAutorises = []) {
  const ids = new Set(projetsAutorises.map((p) => p.id))
  return items.filter((it) => !it.projetId || ids.has(it.projetId))
}

export function avancementProjet(taches = [], projet = null) {
  // Projet AVEC tâches : avancement = tâches terminées / total des tâches.
  if (taches.length) {
    const terminees = taches.filter((t) => t.statut === 'terminee').length
    return Math.round((terminees / taches.length) * 100)
  }
  // Projet SANS tâche : avancement = montant versé / budget arrêté (100% si soldé).
  const budget = Number(projet?.budget) || 0
  const verse  = Number(projet?.depenses) || 0
  if (budget <= 0) return 0
  return Math.min(100, Math.round((verse / budget) * 100))
}

export function tachesEnRetard(taches = []) {
  const now = Date.now()
  return taches.filter(
    (t) => t.statut !== 'terminee' && t.statut !== 'annulee' && t.echeance && t.echeance < now
  )
}

export function projetEnRetard(projet) {
  if (!projet.dateFin) return false
  if (['termine', 'annule'].includes(projet.statut)) return false
  return projet.dateFin < Date.now()
}

export function genererNumProjet(sequence) {
  const pad = String(sequence).padStart(4, '0')
  const annee = new Date().getFullYear()
  return `PRJ-${annee}-${pad}`
}

// En dessous de ce montant, un dépassement est considéré comme un arrondi de saisie, pas un vrai problème.
const SEUIL_MIN_DEPASSEMENT = 1000 // FCFA

// ── Alertes — source unique utilisée par le Dashboard, l'onglet Alertes et le Pilotage ──
export function genererAlertes(projets = [], taches = [], depenses = [], seuils = SEUILS_DEFAUT) {
  const alertes = []
  const restesAPayer = [] // regroupées en une seule alerte à la fin, plutôt qu'une par tâche
  const now = Date.now()
  const SEMAINE = 7 * 24 * 3600 * 1000
  const seuilBudget     = (seuils?.budget     ?? SEUILS_DEFAUT.budget)     / 100
  const seuilInactivite = (seuils?.inactivite ?? SEUILS_DEFAUT.inactivite) * 24 * 3600 * 1000

  projets.forEach((p) => {
    const tachesProjet = taches.filter((t) => t.projetId === p.id)

    // Projet en retard
    if (projetEnRetard(p)) {
      const joursRetard = Math.floor((now - p.dateFin) / (24 * 3600 * 1000))
      alertes.push({
        id: `retard_${p.id}`,
        type: 'projet_retard',
        projetId: p.id,
        projetNom: p.nom,
        cibleType: 'projet', cibleId: p.id,
        message: `Ce projet aurait dû se terminer le ${formatDateShort(p.dateFin)} (${joursRetard} jour${joursRetard > 1 ? 's' : ''} de retard).`,
        date: p.dateFin,
        priorite: p.priorite
      })
    }

    // Budget dépassé — basé sur les dépenses réelles, seuil réglable dans Paramètres
    const totalDepenses = depenses.filter((d) => d.projetId === p.id).reduce((s, d) => s + (Number(d.montant) || 0), 0)
    const budget = Number(p.budget) || 0
    if (budget > 0 && totalDepenses > 0 && totalDepenses >= budget * seuilBudget) {
      const pct = Math.round((totalDepenses / budget) * 100)
      alertes.push({
        id: `budget_${p.id}`,
        type: 'budget_depasse',
        projetId: p.id,
        projetNom: p.nom,
        cibleType: 'projet', cibleId: p.id,
        message: `${pct}% du budget utilisé (${totalDepenses.toLocaleString('fr-FR')} / ${budget.toLocaleString('fr-FR')} FCFA).`,
        date: now,
        priorite: p.priorite
      })
    }

    // Tâches dont le versé dépasse le montant arrêté avec le prestataire
    tachesProjet.forEach((t) => {
      const prevu = Number(t.montantPrevu) || 0
      const verse = depenses.filter((d) => d.tacheId === t.id).reduce((s, d) => s + (Number(d.montant) || 0), 0)
      if (prevu > 0 && (verse - prevu) >= SEUIL_MIN_DEPASSEMENT) {
        alertes.push({
          id: `tache_depassee_${t.id}`,
          type: 'tache_depassee',
          projetId: p.id,
          projetNom: p.nom,
          cibleType: 'tache', cibleId: t.id,
          message: `Tâche "${t.titre}" dépassée de ${(verse - prevu).toLocaleString('fr-FR')} FCFA (arrêté : ${prevu.toLocaleString('fr-FR')}, versé : ${verse.toLocaleString('fr-FR')}).`,
          date: now,
          priorite: t.priorite
        })
      }
    })

    // Tâches avec un reste à payer au prestataire (montant arrêté non encore soldé) —
    // collectées ici, regroupées en une seule alerte après la boucle sur les projets.
    tachesProjet.forEach((t) => {
      const prevu = Number(t.montantPrevu) || 0
      const verse = depenses.filter((d) => d.tacheId === t.id).reduce((s, d) => s + (Number(d.montant) || 0), 0)
      const reste = prevu - verse
      if (t.statut !== 'annulee' && prevu > 0 && reste >= SEUIL_MIN_DEPASSEMENT) {
        restesAPayer.push({
          projetId: p.id, projetNom: p.nom, tacheId: t.id, tacheTitre: t.titre,
          prevu, verse, reste, priorite: t.priorite
        })
      }
    })

    // Projet actif sans avancement depuis le seuil d'inactivité (réglable)
    if (!['termine', 'annule'].includes(p.statut) && p.createdAt && (now - p.createdAt) > seuilInactivite) {
      const avancement = avancementProjet(tachesProjet, p)
      if (avancement === 0 && tachesProjet.length > 0) {
        alertes.push({
          id: `zero_${p.id}`,
          type: 'avancement_zero',
          projetId: p.id,
          projetNom: p.nom,
          cibleType: 'projet', cibleId: p.id,
          message: `Ce projet a ${tachesProjet.length} tâche(s) mais aucune n'est terminée depuis plus d'une semaine.`,
          date: p.createdAt,
          priorite: p.priorite
        })
      }
    }

    // Tâches en retard
    tachesEnRetard(tachesProjet).forEach((t) => {
      const joursRetard = Math.floor((now - t.echeance) / (24 * 3600 * 1000))
      alertes.push({
        id: `tache_${t.id}`,
        type: 'tache_retard',
        projetId: p.id,
        projetNom: p.nom,
        cibleType: 'tache', cibleId: t.id,
        message: `Tâche "${t.titre}" — échéance dépassée de ${joursRetard} jour${joursRetard > 1 ? 's' : ''} (assignée à : ${t.assignee || 'non assignée'}).`,
        date: t.echeance,
        priorite: t.priorite
      })
    })

    // Projet récemment terminé (dans les 7 derniers jours)
    if (p.statut === 'termine' && p.updatedAt && (now - p.updatedAt) < SEMAINE) {
      alertes.push({
        id: `termine_${p.id}`,
        type: 'termine',
        projetId: p.id,
        projetNom: p.nom,
        cibleType: 'projet', cibleId: p.id,
        message: `Projet marqué comme terminé le ${formatDateShort(p.updatedAt)}. Félicitations !`,
        date: p.updatedAt,
        priorite: p.priorite
      })
    }
  })

  // Reste à payer : une seule alerte groupant toutes les tâches concernées (tous projets
  // confondus), au lieu d'une alerte par tâche — trop de doublons sinon dans le bandeau.
  if (restesAPayer.length) {
    const total = restesAPayer.reduce((s, r) => s + r.reste, 0)
    alertes.push({
      id: 'reste_a_payer_global',
      type: 'reste_a_payer',
      cibleType: 'liste',
      message: `${restesAPayer.length} tâche${restesAPayer.length > 1 ? 's' : ''} avec un solde à régler — total ${total.toLocaleString('fr-FR')} FCFA.`,
      details: restesAPayer.sort((a, b) => b.reste - a.reste),
      date: now,
      priorite: 'normale'
    })
  }

  // Trier : retards d'abord, puis budget, puis reste
  const ordre = { projet_retard: 0, budget_depasse: 1, tache_depassee: 2, reste_a_payer: 3, tache_retard: 4, avancement_zero: 5, termine: 6 }
  return alertes.sort((a, b) => (ordre[a.type] ?? 9) - (ordre[b.type] ?? 9))
}

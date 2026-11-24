// E-TACHES : toutes les écritures (création, statuts, renvoi, discussion, objectifs, routines, rapports) et les notifications qui vont avec.
// Les notifications sont des NOTIFICATIONS PUSH (plus la cloche de l'application) : jamais d'e-mail, donc jamais de `emailRoles` ici.
import { addItem, updateItem, setItem, removeItem, getAll } from '../../core/db'
import { notify } from '../../core/notify'
import { todayStr, genNumero } from '../../utils/formatters'
import { COL, participants, progressionEquipe, formatJour } from './data'

const MODULE = 'taches'
export const lienTache = (id) => `/taches/taches?t=${id}`

// Une notification push aux personnes données (l'auteur de l'action est déjà écarté par l'appelant).
async function prevenir(uids, { title, body = '', link = '', type = 'info' }) {
  const vers = [...new Set((uids || []).filter(Boolean))]
  if (!vers.length) return
  try { await notify({ type, title, body, module: MODULE, forUsers: vers, link }) } catch { /* best effort */ }
}

// ── Tâches ──────────────────────────────────────────────────────────────────────────────────────────────────────
export async function creerTache(form, auteur, nbExistantes = 0) {
  const membres = (form.membres || []).map((m) => ({ uid: m.uid, nom: m.nom, leader: !!m.leader, sousStatut: 'À faire', lienRapport: '' }))
  const data = {
    numero: genNumero('TCH', nbExistantes),
    titre: form.titre.trim(), description: (form.description || '').trim(), resultatAttendu: (form.resultatAttendu || '').trim(),
    categorie: (form.categorie || '').trim(), priorite: form.priorite || 'Moyenne',
    dateDebut: form.dateDebut || '', dateLimite: form.dateLimite || '', note: (form.note || '').trim(),
    rapportRequis: !!form.rapportRequis,
    destUid: form.destUid, destNom: form.destNom, parUid: auteur.uid, parNom: auteur.nom,
    statut: 'À faire', progression: 0, dateCloture: '', lienRapport: '', commentaireChef: '',
    membres, pieces: form.pieces || [], archivee: false
  }
  const id = await addItem(COL.taches, data)
  const vers = participants(data, auteur.uid)
  await prevenir(vers, {
    title: `Nouvelle tâche : ${data.titre}`,
    body: `Confiée par ${auteur.nom}${data.dateLimite ? ` · à rendre le ${formatJour(data.dateLimite)}` : ''} · priorité ${data.priorite.toLowerCase()}`,
    link: lienTache(id)
  })
  return id
}

export async function modifierTache(t, patch, auteur) {
  await updateItem(COL.taches, t.id, patch)
  // Changement de destinataire : prévenir le nouveau.
  if (patch.destUid && patch.destUid !== t.destUid && patch.destUid !== auteur.uid) {
    await prevenir([patch.destUid], { title: `Tâche confiée : ${patch.titre || t.titre}`, body: `Confiée par ${auteur.nom}`, link: lienTache(t.id) })
  }
}

// Passe la tâche à un autre statut. `lienRapport` : preuve fournie à la clôture quand elle est exigée.
export async function changerStatut(t, statut, auteur, { lienRapport } = {}) {
  const patch = { statut }
  if (statut === 'Terminé') { patch.progression = 100; patch.dateCloture = todayStr() }
  else { patch.dateCloture = ''; if (statut === 'À faire') patch.progression = 0; else if (!(t.progression > 0 && t.progression < 100)) patch.progression = 10 }
  if (lienRapport !== undefined) patch.lienRapport = lienRapport
  await updateItem(COL.taches, t.id, patch)
  const titre = statut === 'Terminé' ? `Tâche terminée : ${t.titre}` : statut === 'En cours' ? `Tâche démarrée : ${t.titre}` : `Tâche remise à faire : ${t.titre}`
  await prevenir(participants(t, auteur.uid).filter((u) => u === t.parUid || statut === 'À faire'), { title: titre, body: `${auteur.nom} a passé la tâche « ${statut} »`, link: lienTache(t.id) })
}

export async function changerProgression(t, progression) {
  const p = Math.max(0, Math.min(100, Number(progression) || 0))
  const patch = { progression: p }
  if (p >= 100) { patch.statut = 'Terminé'; patch.dateCloture = todayStr() } else if (p > 0 && t.statut === 'À faire') patch.statut = 'En cours'
  await updateItem(COL.taches, t.id, patch)
}

// Équipe : chaque membre avance à son rythme ; la tâche se termine quand tous ont terminé.
export async function changerSousStatut(t, uid, sousStatut, auteur, lienRapport) {
  const membres = (t.membres || []).map((m) => (m.uid === uid ? { ...m, sousStatut, ...(lienRapport !== undefined ? { lienRapport } : {}) } : m))
  const progression = progressionEquipe(membres)
  const tousFinis = membres.length > 0 && membres.every((m) => m.sousStatut === 'Terminé')
  const patch = { membres, progression }
  if (tousFinis) { patch.statut = 'Terminé'; patch.dateCloture = todayStr() }
  else { if (t.statut === 'Terminé') { patch.statut = 'En cours'; patch.dateCloture = '' } else if (t.statut === 'À faire' && progression > 0) patch.statut = 'En cours' }
  await updateItem(COL.taches, t.id, patch)
  const nom = membres.find((m) => m.uid === uid)?.nom || ''
  await prevenir([t.parUid].filter((u) => u !== auteur.uid), {
    title: tousFinis ? `Tâche terminée : ${t.titre}` : `Avancement d'équipe : ${t.titre}`,
    body: `${nom} : ${sousStatut}${tousFinis ? '. Toute l\'équipe a terminé.' : ''}`, link: lienTache(t.id)
  })
}

// La personne qui a confié la tâche (ou la direction) la renvoie pour reprise, avec un motif.
export async function renvoyerTache(t, motif, auteur) {
  await updateItem(COL.taches, t.id, {
    statut: 'À faire', progression: 0, dateCloture: '',
    commentaireChef: `🔄 RENVOYÉE par ${auteur.nom} : ${motif}`,
    membres: (t.membres || []).map((m) => ({ ...m, sousStatut: 'À faire' }))
  })
  await prevenir(participants(t, auteur.uid).filter((u) => u !== t.parUid), { title: `Tâche renvoyée : ${t.titre}`, body: motif, link: lienTache(t.id), type: 'warning' })
}

// Le destinataire (ou la direction) retourne la tâche à une autre personne, avec un motif obligatoire. Comme dans l'ancienne application : elle repasse
// « À faire » à 0 %, sa clôture et le commentaire du destinataire sont effacés. Celui qui l'a confiée et la personne choisie sont prévenus.
export async function retournerTache(t, vers, motif, auteur) {
  const raison = motif.trim()
  const retours = [...(t.retours || []), { de: t.destNom, vers: vers.nom, par: auteur.nom, motif: raison, ts: Date.now() }]
  await updateItem(COL.taches, t.id, {
    destUid: vers.uid, destNom: vers.nom, statut: 'À faire', progression: 0, dateCloture: '', lienRapport: '',
    commentaireChef: `↩ RETOURNÉE par ${auteur.nom} vers ${vers.nom} : ${raison}`, retours,
    membres: (t.membres || []).map((m) => ({ ...m, sousStatut: 'À faire' }))
  })
  const lien = lienTache(t.id)
  // La personne choisie reçoit la tâche ; celui qui l'a confiée apprend le retour et son motif ; l'ancien destinataire est prévenu si c'est la direction qui a retourné.
  await prevenir([vers.uid].filter((u) => u !== auteur.uid), { title: `Tâche transférée à vous : ${t.titre}`, body: `Retournée par ${auteur.nom}. Motif : ${raison}`, link: lien, type: 'warning' })
  await prevenir([t.parUid].filter((u) => u && u !== auteur.uid && u !== vers.uid), { title: `Tâche retournée : ${t.titre}`, body: `${auteur.nom} l'a retournée vers ${vers.nom}. Motif : ${raison}`, link: lien })
  await prevenir([t.destUid].filter((u) => u && u !== auteur.uid && u !== vers.uid && u !== t.parUid), { title: `Tâche retirée de votre liste : ${t.titre}`, body: `${auteur.nom} l'a transférée à ${vers.nom}. Motif : ${raison}`, link: lien })
}

export const archiverTache = (t, archivee = true) => updateItem(COL.taches, t.id, { archivee, archiveeLe: archivee ? todayStr() : '' })

export async function supprimerTache(t) {
  await removeItem(COL.taches, t.id)
  try {
    const msgs = await getAll(COL.messages)
    await Promise.all(msgs.filter((m) => m.tacheId === t.id).map((m) => removeItem(COL.messages, m.id, { sansMotif: true })))
  } catch { /* les messages orphelins ne gênent pas */ }
}

export const ajouterPiece = (t, piece) => updateItem(COL.taches, t.id, { pieces: [...(t.pieces || []), { ...piece, ajouteLe: todayStr() }] })
export const retirerPiece = (t, piece) => updateItem(COL.taches, t.id, { pieces: (t.pieces || []).filter((p) => p !== piece) })

// ── Discussion de la tâche ─────────────────────────────────────────────────────────────────────────────────────
export async function envoyerMessage(t, texte, auteur) {
  const corps = texte.trim()
  if (!corps) return
  await addItem(COL.messages, { tacheId: t.id, uid: auteur.uid, nom: auteur.nom, texte: corps, ts: Date.now() })
  await prevenir(participants(t, auteur.uid), { title: `Message : ${t.titre}`, body: `${auteur.nom} : ${corps.length > 110 ? corps.slice(0, 110) + '…' : corps}`, link: lienTache(t.id) })
}
export const supprimerMessage = (m) => removeItem(COL.messages, m.id, { sansMotif: true })

// ── Objectifs ───────────────────────────────────────────────────────────────────────────────────────────────────
export async function enregistrerObjectif(form, auteur) {
  const data = {
    type: form.type, cibleUid: form.type === 'perso' ? form.cibleUid : '', cibleNom: form.cibleNom,
    titre: form.titre.trim(), description: (form.description || '').trim(),
    dateDebut: form.dateDebut || '', dateFin: form.dateFin || '', progression: Number(form.progression) || 0, statut: form.statut || 'En cours'
  }
  if (form.id) { await updateItem(COL.objectifs, form.id, data); return form.id }
  const id = await addItem(COL.objectifs, { ...data, parUid: auteur.uid, parNom: auteur.nom, commentaires: [] })
  if (data.type === 'perso' && data.cibleUid && data.cibleUid !== auteur.uid) {
    await prevenir([data.cibleUid], { title: `Nouvel objectif : ${data.titre}`, body: `Fixé par ${auteur.nom}${data.dateFin ? ` · jusqu'au ${formatJour(data.dateFin)}` : ''}`, link: '/taches/objectifs' })
  }
  return id
}
export async function majObjectif(o, patch) {
  const p = { ...patch }
  if (p.progression !== undefined) { p.progression = Math.max(0, Math.min(100, Number(p.progression) || 0)); if (p.progression >= 100 && !p.statut) p.statut = 'Atteint' }
  await updateItem(COL.objectifs, o.id, p)
}
export async function commenterObjectif(o, texte, auteur) {
  const corps = texte.trim()
  if (!corps) return
  await updateItem(COL.objectifs, o.id, { commentaires: [...(o.commentaires || []), { uid: auteur.uid, nom: auteur.nom, texte: corps, ts: Date.now() }] })
  await prevenir([o.cibleUid, o.parUid].filter((u) => u && u !== auteur.uid), { title: `Commentaire sur l'objectif : ${o.titre}`, body: `${auteur.nom} : ${corps.length > 110 ? corps.slice(0, 110) + '…' : corps}`, link: '/taches/objectifs' })
}
export const supprimerObjectif = (o) => removeItem(COL.objectifs, o.id)

// ── Routine journalière ────────────────────────────────────────────────────────────────────────────────────────
export const ajouterRoutine = (libelle, personne, description = '') => addItem(COL.routines, { libelle: libelle.trim(), description: description.trim(), uid: personne.uid, nom: personne.nom, actif: true })
export const retirerRoutine = (r) => updateItem(COL.routines, r.id, { actif: false })
export const cocherRoutine = (r, jour, fait, auteur) => setItem(COL.suivi, `${r.id}_${jour}`, { routineId: r.id, uid: r.uid, jour, fait, heure: fait ? new Date().toTimeString().slice(0, 5) : '', parUid: auteur.uid })
export const modifierRoutine = (r, patch) => updateItem(COL.routines, r.id, patch)
// Jours fériés (ne comptent pas dans le suivi de la routine) : un document par date.
export const ajouterFerie = (date, nom) => setItem(COL.feries, date, { date, nom: (nom || '').trim() })
export const retirerFerie = (f) => removeItem(COL.feries, f.id, { sansMotif: true })

// ── Rapports ────────────────────────────────────────────────────────────────────────────────────────────────────
export async function envoyerRapport(form, auteur) {
  const id = await addItem(COL.rapports, {
    titre: form.titre.trim(), description: (form.description || '').trim(),
    parUid: auteur.uid, parNom: auteur.nom, destinataires: form.destinataires || [], piece: form.piece || null, ts: Date.now()
  })
  await prevenir((form.destinataires || []).filter((u) => u !== auteur.uid), { title: `Nouveau rapport : ${form.titre.trim()}`, body: `Partagé par ${auteur.nom}`, link: '/taches/rapports' })
  return id
}
export const supprimerRapport = (r) => removeItem(COL.rapports, r.id)

// ── Appréciation (donnée par celui qui a confié la tâche, ou par la direction générale) ───────────────────────
export async function apprecierTache(t, texte, auteur) {
  const corps = texte.trim()
  await updateItem(COL.taches, t.id, { appreciation: corps, apprecieePar: corps ? auteur.nom : '' })
  if (corps) await prevenir([t.destUid].filter((u) => u && u !== auteur.uid), { title: `Appréciation sur votre tâche : ${t.titre}`, body: `${auteur.nom} : ${corps.length > 110 ? corps.slice(0, 110) + '…' : corps}`, link: lienTache(t.id) })
}

// Commentaire du destinataire sur sa tâche (ancien champ « commentaire » de l'application : point d'avancement, difficulté rencontrée, clôture).
export const commenterSaTache = (t, texte) => updateItem(COL.taches, t.id, { commentaireDest: texte.trim() })

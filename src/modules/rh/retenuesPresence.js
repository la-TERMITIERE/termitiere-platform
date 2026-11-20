// RH : retenue sur salaire pour les absences non justifiées et les retards.
// Le salaire d'une journée = salaire de base du mois / nombre de jours travaillés du mois (la semaine de travail est réglée dans Paramètres, Présences).
// Chaque absence non justifiée retient `pctAbsence` % d'une journée, chaque retard `pctRetard` % d'une journée. Une absence justifiée,
// un congé ou une mission ne retiennent rien. Les absences enregistrées avant l'ajout de la justification (champ `justifie` absent) comptent comme justifiées.

export const dateIso = (annee, mois, jour) => `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
export const jourSemaine = (iso) => new Date(`${iso}T12:00:00`).getDay()
export const nbJoursDuMois = (mois) => { const [a, m] = mois.split('-').map(Number); return new Date(a, m, 0).getDate() }

// Nombre de jours travaillés dans le mois (selon la semaine de travail réglée).
export function joursTravaillesDuMois(mois, joursSemaine) {
  const [a, m] = mois.split('-').map(Number)
  let n = 0
  for (let j = 1; j <= nbJoursDuMois(mois); j++) if (joursSemaine.includes(jourSemaine(dateIso(a, m, j)))) n++
  return n
}

export const estAbsenceNonJustifiee = (p) => p.statut === 'absent' && p.justifie === false

// Retourne { absencesNonJustifiees, retards, salaireJournalier, retenueAbsences, retenueRetards, total, joursTravailles }.
export function calculerRetenuePresence({ presences, employe, mois, regles }) {
  const rien = { absencesNonJustifiees: 0, retards: 0, salaireJournalier: 0, retenueAbsences: 0, retenueRetards: 0, total: 0, joursTravailles: 0 }
  if (!employe || employe.pointe === false) return rien
  const joursTravailles = joursTravaillesDuMois(mois, regles.jours)
  const salaire = Number(employe.salaire) || 0
  const salaireJournalier = joursTravailles ? salaire / joursTravailles : 0
  const miennes = presences.filter((p) => p.employeId === employe.id && String(p.date || '').startsWith(mois))
  const absencesNonJustifiees = miennes.filter(estAbsenceNonJustifiee).length
  const retards = miennes.filter((p) => p.statut === 'retard').length
  const retenueAbsences = Math.round(salaireJournalier * absencesNonJustifiees * (regles.pctAbsence / 100))
  const retenueRetards = Math.round(salaireJournalier * retards * (regles.pctRetard / 100))
  return { absencesNonJustifiees, retards, salaireJournalier: Math.round(salaireJournalier), retenueAbsences, retenueRetards, total: retenueAbsences + retenueRetards, joursTravailles }
}

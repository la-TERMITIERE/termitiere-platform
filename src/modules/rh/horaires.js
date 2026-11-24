// Horaires de présence : valeurs par défaut et lecture depuis rh_config (document « presences », réglé dans RH, Paramètres, Présences).
// Deux profils : les employés et les directeurs (la direction arrive à une autre heure). Sans heure propre à la direction, ce sont celles des employés.
export const HORAIRES_DEFAUT = { heureArrivee: '08:00', heureDepart: '17:00', heureArriveeDirection: '', heureDepartDirection: '', tolerance: 0 }

export function lireHoraires(configs = []) {
  const c = configs.find((x) => x.id === 'presences') || {}
  const heureArrivee = c.heureArrivee || HORAIRES_DEFAUT.heureArrivee
  const heureDepart = c.heureDepart || HORAIRES_DEFAUT.heureDepart
  return {
    heureArrivee, heureDepart,
    heureArriveeDirection: c.heureArriveeDirection || heureArrivee,
    heureDepartDirection: c.heureDepartDirection || heureDepart,
    tolerance: Number.isFinite(Number(c.tolerance)) ? Number(c.tolerance) : HORAIRES_DEFAUT.tolerance,
    // Chaque groupe a-t-il ses propres heures, programmées dans Paramètres ? (sinon on applique 08:00-17:00 par défaut, ou celles des employés pour la direction)
    employesProgrammes: !!(c.heureArrivee && c.heureDepart),
    directionProgrammee: !!(c.heureArriveeDirection && c.heureDepartDirection)
  }
}

// Règles de retenue sur salaire (réglées dans RH, Paramètres, Présences, même document « presences ») :
//  - pctAbsence : part du salaire d'une journée retenue pour chaque absence NON justifiée ;
//  - pctRetard : part du salaire d'une journée retenue pour chaque retard ;
//  - jours : les jours travaillés de la semaine (0 = dimanche … 6 = samedi). Ils servent à calculer le salaire d'une journée
//    (salaire du mois divisé par le nombre de jours travaillés du mois) et à repérer les jours « non pointés » du calendrier.
// Stockés en texte (« 123456 ») : Firebase transforme mal les tableaux à trous.
export const REGLES_DEFAUT = { pctAbsence: 100, pctRetard: 10, jours: '123456' }
export function lireRegles(configs = []) {
  const c = configs.find((x) => x.id === 'presences') || {}
  const pct = (v, defaut) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Math.min(100, Math.max(0, Number(v))) : defaut)
  const brut = typeof c.joursTravailles === 'string' && c.joursTravailles ? c.joursTravailles : REGLES_DEFAUT.jours
  return {
    pctAbsence: pct(c.retenueAbsencePct, REGLES_DEFAUT.pctAbsence),
    pctRetard: pct(c.retenueRetardPct, REGLES_DEFAUT.pctRetard),
    jours: [...new Set(brut.split('').map(Number).filter((n) => n >= 0 && n <= 6))]
  }
}

export const enMinutes =(hm) => { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
export const heureTexte = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const norme = (t) => String(t || '').trim().toLowerCase()

// Profil d'un employé : choisi à la main sur la fiche de présence, sinon « direction » quand son poste est de direction
// (intitulé contenant « directeur », « DS »…, ou classification « Direction »), sinon « employe ».
export function profilHoraire(emp, postes = []) {
  if (emp?.profilHoraire === 'direction' || emp?.profilHoraire === 'employe') return emp.profilHoraire
  const poste = postes.find((p) => norme(p.intitule) === norme(emp?.poste))
  return /direct|\bds\b/i.test(emp?.poste || '') || poste?.classification === 'Direction' ? 'direction' : 'employe'
}

// Heures d'arrivée et de départ applicables à un employé.
export function horairesDe(emp, horaires, postes = []) {
  const profil = profilHoraire(emp, postes)
  return profil === 'direction'
    ? { profil, arrivee: horaires.heureArriveeDirection, depart: horaires.heureDepartDirection }
    : { profil, arrivee: horaires.heureArrivee, depart: horaires.heureDepart }
}

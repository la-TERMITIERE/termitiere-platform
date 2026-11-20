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
    tolerance: Number.isFinite(Number(c.tolerance)) ? Number(c.tolerance) : HORAIRES_DEFAUT.tolerance
  }
}

export const enMinutes = (hm) => { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
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

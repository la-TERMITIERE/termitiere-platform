// MAXI-GYM : actions de pointage d'un coach, PARTAGÉES entre le bandeau « Coach du jour »
// du Dashboard et le volet Coachs. Un pointage = un enregistrement de
// `gym_pointages_coach` ; une ABSENCE est le même enregistrement avec
// `statut: 'absent'` + `motif` (jamais d'heure d'arrivée) : un seul enregistrement
// par coach et par jour, qu'il soit venu ou absent.
import { addItem, getAll } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { nowHM } from '../../utils/formatters'
import { statutPointage } from './data'
import { siteLabel } from './site/useSite'

export const estAbsent = (p) => p?.statut === 'absent'

// Un seul enregistrement par coach et par jour : deux personnes à l'accueil (ou un double clic) ne doivent pas
// créer deux pointages, ni marquer absent un coach déjà arrivé. Relit la base juste avant d'écrire.
async function dejaEnregistre(coach, date) {
  const tous = await getAll('gym_pointages_coach').catch(() => [])
  return tous.find((p) => p.coachId === coach.id && p.date === date) || null
}

export async function pointerCoach({ coach, creneau, site, date, user }) {
  const existant = await dejaEnregistre(coach, date)
  if (existant) {
    toast.error(estAbsent(existant) ? `${coach.nom} est déjà marqué absent aujourd'hui` : `${coach.nom} est déjà pointé (${existant.heureArrivee || 'arrivée enregistrée'})`)
    return false
  }
  const heureArrivee = nowHM()
  const statut = statutPointage(creneau.heure, heureArrivee)
  await addItem('gym_pointages_coach', {
    coachId: coach.id, coachNom: coach.nom, site, date,
    heureProgrammee: creneau.heure, heureArrivee, statut,
    par: user?.nom || user?.login || '—'
  })
  await audit('gym', 'COACH_POINTAGE', `${coach.nom} : arrivé à ${heureArrivee} (prévu ${creneau.heure}) : ${siteLabel(site)}`)
  toast.success(`${coach.nom} pointé à ${heureArrivee} ✓`)
  return true
}

export async function marquerCoachAbsent({ coach, creneau, motif, site, date, user }) {
  const existant = await dejaEnregistre(coach, date)
  if (existant) {
    toast.error(estAbsent(existant) ? `${coach.nom} est déjà marqué absent aujourd'hui` : `${coach.nom} est déjà arrivé (${existant.heureArrivee || 'pointé'}) : impossible de le marquer absent`)
    return false
  }
  await addItem('gym_pointages_coach', {
    coachId: coach.id, coachNom: coach.nom, site, date,
    heureProgrammee: creneau?.heure || '', heureArrivee: '', statut: 'absent', motif: motif.trim(),
    par: user?.nom || user?.login || '—'
  })
  await audit('gym', 'COACH_ABSENT', `${coach.nom} : absent le ${date} (prévu ${creneau?.heure || '—'}), motif : ${motif.trim()} : ${siteLabel(site)}`)
  toast.success(`${coach.nom} marqué absent ✓`)
  return true
}

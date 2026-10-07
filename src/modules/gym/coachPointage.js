// MAXI-GYM : actions de pointage d'un coach, PARTAGÉES entre le bandeau « Coach du jour »
// du Dashboard et le volet Coachs. Un pointage = un enregistrement de
// `gym_pointages_coach` ; une ABSENCE est le même enregistrement avec
// `statut: 'absent'` + `motif` (jamais d'heure d'arrivée) : un seul enregistrement
// par coach et par jour, qu'il soit venu ou absent.
import { addItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { nowHM } from '../../utils/formatters'
import { statutPointage } from './data'
import { siteLabel } from './site/useSite'

export const estAbsent = (p) => p?.statut === 'absent'

export async function pointerCoach({ coach, creneau, site, date, user }) {
  const heureArrivee = nowHM()
  const statut = statutPointage(creneau.heure, heureArrivee)
  await addItem('gym_pointages_coach', {
    coachId: coach.id, coachNom: coach.nom, site, date,
    heureProgrammee: creneau.heure, heureArrivee, statut,
    par: user?.nom || user?.login || '—'
  })
  await audit('gym', 'COACH_POINTAGE', `${coach.nom} : arrivé à ${heureArrivee} (prévu ${creneau.heure}) : ${siteLabel(site)}`)
  toast.success(`${coach.nom} pointé à ${heureArrivee} ✓`)
}

export async function marquerCoachAbsent({ coach, creneau, motif, site, date, user }) {
  await addItem('gym_pointages_coach', {
    coachId: coach.id, coachNom: coach.nom, site, date,
    heureProgrammee: creneau?.heure || '', heureArrivee: '', statut: 'absent', motif: motif.trim(),
    par: user?.nom || user?.login || '—'
  })
  await audit('gym', 'COACH_ABSENT', `${coach.nom} : absent le ${date} (prévu ${creneau?.heure || '—'}), motif : ${motif.trim()} : ${siteLabel(site)}`)
  toast.success(`${coach.nom} marqué absent ✓`)
}

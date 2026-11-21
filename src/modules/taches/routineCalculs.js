// E-TACHES, routine journalière : jours travaillés et taux de réalisation (mêmes règles que l'ancienne application : les dimanches et les jours fériés ne comptent pas).
import { todayStr } from '../../utils/formatters'

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Tous les jours de [from, to] (bornés à aujourd'hui) avec leur nature : 'travail', 'dimanche' ou 'ferie'.
export function joursDeLaPeriode(from, to, feries = [], jour = todayStr()) {
  const fin = to && to < jour ? to : jour
  if (!from || from > fin) return []
  const nomFerie = Object.fromEntries(feries.map((f) => [f.date || f.id, f.nom || '']))
  const out = []
  for (let d = new Date(from + 'T00:00:00'); ymd(d) <= fin; d.setDate(d.getDate() + 1)) {
    const date = ymd(d)
    const type = d.getDay() === 0 ? 'dimanche' : date in nomFerie ? 'ferie' : 'travail'
    out.push({ date, type, nomFerie: nomFerie[date] || '', jourSemaine: JOURS[d.getDay()], aujourdhui: date === jour })
  }
  return out
}

// Taux de réalisation de chaque collaborateur : aujourd'hui et sur la période.
//   routines : documents { id, uid, nom, libelle, actif } ; suivi : documents { routineId, uid, jour, fait }
export function suiviEquipe({ personnel, routines, suivi, from, to, feries, jour = todayStr() }) {
  const jours = joursDeLaPeriode(from, to, feries, jour)
  const travailles = jours.filter((j) => j.type === 'travail')
  const faits = new Set(suivi.filter((s) => s.fait).map((s) => `${s.routineId}_${s.jour}`))
  const lignes = personnel.map((p) => {
    const actives = routines.filter((r) => r.actif !== false && r.uid === p.uid)
    const faitsAujourdhui = actives.filter((r) => faits.has(`${r.id}_${jour}`)).length
    const attendu = actives.length * travailles.length
    const fait = actives.reduce((s, r) => s + travailles.filter((j) => faits.has(`${r.id}_${j.date}`)).length, 0)
    return {
      ...p, nbRoutines: actives.length, faitAujourdhui: faitsAujourdhui, tauxAujourdhui: actives.length ? Math.round((faitsAujourdhui * 100) / actives.length) : null,
      fait, attendu, tauxPeriode: attendu ? Math.round((fait * 100) / attendu) : null
    }
  })
  return { lignes, joursTravailles: travailles.length }
}

// Détail jour par jour d'un collaborateur.
export function detailPersonne({ uid, routines, suivi, from, to, feries, jour = todayStr() }) {
  const actives = routines.filter((r) => r.actif !== false && r.uid === uid)
  const faits = new Set(suivi.filter((s) => s.fait).map((s) => `${s.routineId}_${s.jour}`))
  const jours = joursDeLaPeriode(from, to, feries, jour).map((j) => {
    if (j.type !== 'travail') return j
    const faites = actives.filter((r) => faits.has(`${r.id}_${j.date}`))
    return { ...j, total: actives.length, faites: faites.length, idsFaits: new Set(faites.map((r) => r.id)), pct: actives.length ? Math.round((faites.length * 100) / actives.length) : 0 }
  })
  const attendu = jours.filter((j) => j.type === 'travail').reduce((s, j) => s + j.total, 0)
  const fait = jours.filter((j) => j.type === 'travail').reduce((s, j) => s + j.faites, 0)
  return { actives, jours: jours.reverse(), attendu, fait, taux: attendu ? Math.round((fait * 100) / attendu) : null }
}

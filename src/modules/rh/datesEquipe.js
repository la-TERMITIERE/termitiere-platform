// RH : anniversaires de naissance et d'embauche. Une date « AAAA-MM-JJ » revient chaque année au même jour ; le 29 février est fêté le 28 les années non bissextiles.

const bissextile = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
const iso = (a, m, j) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`
const ecart = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 864e5)

// Prochaine occurrence (aujourd'hui compris) d'une date de naissance ou d'embauche : { date, jours, nombre } où `nombre` est l'âge ou le nombre d'années.
export function prochaineOccurrence(dateOrigine, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOrigine || ''))
  if (!m) return null
  const [, y0, mm, dd] = m.map(Number)
  const ty = Number(today.slice(0, 4))
  for (const annee of [ty, ty + 1]) {
    const jour = mm === 2 && dd === 29 && !bissextile(annee) ? 28 : dd
    const date = iso(annee, mm, jour)
    if (date >= today) return { date, jours: ecart(date, today), nombre: annee - y0 }
  }
  return null
}

// Événements à venir des employés en poste : anniversaires de naissance et d'embauche (à partir de 1 an), triés par date.
// Retourne [{ cle, type: 'naissance' | 'embauche', employe, date, jours, nombre }].
export function evenementsEmployes(employes, today, joursMax = 365) {
  const sortie = []
  employes.filter((e) => (e.statut || 'actif') !== 'sorti').forEach((e) => {
    const n = prochaineOccurrence(e.dateNaissance, today)
    if (n && n.jours <= joursMax && n.nombre >= 1) sortie.push({ cle: `naissance_${e.id}`, type: 'naissance', employe: e, ...n })
    const h = prochaineOccurrence(e.dateEmbauche, today)
    if (h && h.jours <= joursMax && h.nombre >= 1) sortie.push({ cle: `embauche_${e.id}`, type: 'embauche', employe: e, ...h })
  })
  return sortie.sort((a, b) => a.jours - b.jours || String(a.employe.nom).localeCompare(String(b.employe.nom), 'fr'))
}

// Employés en poste dont la date de naissance ou d'embauche n'est pas renseignée.
export const datesManquantes = (employes) => employes
  .filter((e) => (e.statut || 'actif') !== 'sorti' && (!e.dateNaissance || !e.dateEmbauche))
  .map((e) => ({ employe: e, naissance: !e.dateNaissance, embauche: !e.dateEmbauche }))

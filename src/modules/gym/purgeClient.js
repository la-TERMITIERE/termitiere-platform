// MAXI-GYM : suppression TOTALE d'un client dont l'abonnement (ou la séance) est terminé, pour libérer la base.
// On retire sa fiche, ses abonnements, ses séances et ses arrivées pointées. Les FACTURES restent : elles portent le
// chiffre d'affaires et la comptabilité. Réservé aux agents et à Info (cf. peutPurgerClientGym). Sert au bouton manuel et à
// la suppression automatique réglée dans Paramètres (délais en jours après la fin).
import { removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { peutPurgerClientGym } from '../../core/roles'
import { todayStr } from '../../utils/formatters'
import { abonnementActif, seanceValide, finValiditeSeance } from './data'

const cle = (n) => (n || '').trim().toLowerCase()
const siteDe = (x) => x?.site || 'lome'
const jourISO = (ms) => new Date(ms).toISOString().slice(0, 10)

// Tout ce que la base contient sur un client d'une salle (rapprochement par nom, comme partout dans le module).
export function dossierClient({ nom, site, clients = [], abonnements = [], seances = [], presences = [] }) {
  const k = cle(nom)
  const memeClient = (x) => cle(x.clientNom ?? x.nom) === k && siteDe(x) === site
  return {
    nom, site,
    fiches: clients.filter(memeClient),
    abonnements: abonnements.filter(memeClient),
    seances: seances.filter(memeClient),
    presences: presences.filter(memeClient)
  }
}

// Terminé = aucun abonnement en cours ou à venir, aucune séance encore valide.
export function dossierTermine(d, validiteHeures) {
  const auj = todayStr()
  const abonnementEnCours = d.abonnements.some((a) => abonnementActif(a.dateFin, a.dateDebut) || (a.dateDebut && a.dateDebut > auj))
  const seanceEnCours = d.seances.some((s) => seanceValide(s.createdAt, validiteHeures, s.date))
  return !abonnementEnCours && !seanceEnCours
}

// Dernier jour d'activité du dossier : fin d'abonnement, fin de validité d'une séance, dernière arrivée, ou création de la fiche.
export function finDossier(d, validiteHeures) {
  const dates = []
  d.abonnements.forEach((a) => { if (a.dateFin) dates.push(a.dateFin) })
  d.seances.forEach((s) => dates.push(jourISO(finValiditeSeance(s.createdAt, validiteHeures, s.date).getTime())))
  d.presences.forEach((p) => { if (p.date) dates.push(p.date) })
  d.fiches.forEach((c) => { if (c.createdAt) dates.push(jourISO(c.createdAt)) })
  return dates.sort().pop() || null
}

const joursEntre = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000)

// Clients dont le délai de conservation est dépassé selon les réglages de la salle.
export function candidatsAutoSuppression({ clients, abonnements, seances, presences, params, site, aujourdhui = todayStr() }) {
  const vus = new Set()
  const out = []
  for (const c of clients) {
    const k = cle(c.nom)
    if (!k || vus.has(k)) continue
    vus.add(k)
    const d = dossierClient({ nom: c.nom, site, clients, abonnements, seances, presences })
    if (!dossierTermine(d, params.validiteSeanceHeures)) continue
    const fin = finDossier(d, params.validiteSeanceHeures)
    if (!fin) continue
    const delai = d.abonnements.length ? params.delaiSuppressionAbonneJours : params.delaiSuppressionSeanceJours
    if (joursEntre(fin, aujourdhui) >= delai) out.push({ dossier: d, fin, delai })
  }
  return out
}

export const resumeDossier = (d) => ({
  fiches: d.fiches.length, abonnements: d.abonnements.length, seances: d.seances.length, presences: d.presences.length,
  total: d.fiches.length + d.abonnements.length + d.seances.length + d.presences.length
})

export async function purgerDossier(d, role, { auto = false } = {}) {
  if (!peutPurgerClientGym(role)) throw new Error("La suppression d'un client est réservée aux agents, à Info et à Assistant PAU")
  const jeux = [['gym_abonnements', d.abonnements], ['gym_seances', d.seances], ['gym_presences', d.presences], ['gym_clients', d.fiches]]
  for (const [collection, lignes] of jeux) {
    for (const l of lignes) await removeItem(collection, l.id, { sansMotif: true })
  }
  const r = resumeDossier(d)
  await audit('gym', auto ? 'CLIENT_PURGE_AUTO' : 'CLIENT_PURGE',
    `${d.nom} (${d.site === 'kara' ? 'Kara' : 'Lomé'}) : supprimé totalement de la base${auto ? ' (suppression automatique)' : ''} : ${r.abonnements} abonnement(s), ${r.seances} séance(s), ${r.presences} arrivée(s), ${r.fiches} fiche(s)`)
  return r
}

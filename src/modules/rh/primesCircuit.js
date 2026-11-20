// RH : primes. Un TYPE de prime (réglé dans Paramètres, Primes) : un nom, un mode (montant fixe ou pourcentage du salaire de base), une périodicité
// (chaque mois ou ponctuelle) et un plafond facultatif en % du salaire. Une PRIME est l'attribution d'un type à un employé, à un secteur ou à toute l'équipe.
// Circuit : le MÊME que les autorisations de salaire (cf. DetailAutorisationSalaire) : 1 Demande (RH) → 2 Validation (DF) → 3 Approbation (GE) → 4 Autorisation (PAU).
//   statut : en_attente → autorise (fin du circuit) ; refuse à n'importe quelle étape (motif obligatoire, puis corrigée et renvoyée).
// Une fois la prime autorisée, elle s'ajoute au salaire : au brut des bulletins générés ensuite, et aux bulletins du mois encore en brouillon (tout de suite).
import { updateItem, getAll } from '../../core/db'
import { notify } from '../../core/notify'
import { formatMoney } from '../../utils/formatters'
import { COL, PAIE_CONFIG_DEFAUT, calculerBulletin } from './store/rhStore'
import { ETAPES, etapeCourante, peutDeciderAutorisation } from './DetailAutorisationSalaire'

export const MODES_PRIME = [{ value: 'fixe', label: 'Montant fixe (FCFA)' }, { value: 'pourcent', label: '% du salaire de base' }]
export const PERIODICITES_PRIME = [{ value: 'mensuelle', label: 'Chaque mois' }, { value: 'ponctuelle', label: 'Une seule fois' }]
export const CIBLES_PRIME = [{ value: 'employe', label: 'Un employé' }, { value: 'secteur', label: 'Un secteur' }, { value: 'equipe', label: "Toute l'équipe" }]

export const TYPES_PRIME_COURANTS = [
  { nom: 'Prime de transport', mode: 'fixe', valeur: 15000, periodicite: 'mensuelle', plafondPct: 0 },
  { nom: 'Prime de rendement', mode: 'pourcent', valeur: 10, periodicite: 'ponctuelle', plafondPct: 30 },
  { nom: "Prime d'ancienneté", mode: 'pourcent', valeur: 5, periodicite: 'mensuelle', plafondPct: 25 },
  { nom: '13e mois', mode: 'pourcent', valeur: 100, periodicite: 'ponctuelle', plafondPct: 100 },
  { nom: 'Prime exceptionnelle', mode: 'fixe', valeur: 0, periodicite: 'ponctuelle', plafondPct: 0 }
]

// Qui traite la prime maintenant : le rôle de l'étape en cours (DF, GE ou PAU), ou l'Info.
export const peutTraiterPrime = (p, user, role) => peutDeciderAutorisation(p, user, role)
export { etapeCourante }

const nombre = (v) => Number(v) || 0
const moisCourant = () => new Date().toISOString().slice(0, 7)

// Montant d'une prime pour un employé : fixe, ou pourcentage de son salaire de base.
export const montantPourEmploye = (p, employe) => (p.mode === 'pourcent' ? Math.round((nombre(employe?.salaire) * nombre(p.valeur)) / 100) : Math.round(nombre(p.valeur)))

// La prime concerne-t-elle cet employé ? (employé visé, employé du secteur visé, ou toute l'équipe active)
export function concerne(p, employe) {
  if (!employe || (employe.statut || 'actif') === 'sorti') return false
  if (p.cibleType === 'equipe') return true
  if (p.cibleType === 'secteur') return String(employe.departement || '').trim().toLowerCase() === String(p.departement || '').trim().toLowerCase()
  return p.employeId === employe.id
}
export const employesConcernes = (p, employes) => (employes || []).filter((e) => concerne(p, e))

// Dernier mois couvert : une prime ponctuelle ne couvre que son mois ; une prime mensuelle dure jusqu'à son arrêt (moisFin) ou sans fin.
export const moisFinPrime = (p) => (p.periodicite === 'ponctuelle' ? p.moisDebut : p.moisFin || '9999-12')
export const couvreMois = (p, mois) => p.statut === 'autorise' && !!p.moisDebut && p.moisDebut <= mois && mois <= moisFinPrime(p)

// Primes d'un employé sur le bulletin d'un mois : { total, details: [{ id, nom, montant }] }. `details` est gardé dans le bulletin.
export function primesDuMois(primes, employe, mois) {
  const details = (primes || []).filter((p) => couvreMois(p, mois) && concerne(p, employe))
    .map((p) => ({ id: p.id, nom: p.typeNom || 'Prime', montant: montantPourEmploye(p, employe) })).filter((d) => d.montant > 0)
  return { total: details.reduce((s, d) => s + d.montant, 0), details }
}

// Une prime dépasse-t-elle le plafond du type pour certains employés ? Renvoie leurs noms.
export function depassements(prime, plafondPct, employes) {
  if (!(nombre(plafondPct) > 0)) return []
  return employesConcernes(prime, employes).filter((e) => nombre(e.salaire) > 0 && montantPourEmploye(prime, e) > (nombre(e.salaire) * nombre(plafondPct)) / 100).map((e) => e.nom)
}

export const cibleLibelle = (p) => (p.cibleType === 'equipe' ? "Toute l'équipe" : p.cibleType === 'secteur' ? `Secteur : ${p.departement || '?'}` : p.employeNom || 'Employé')
export const valeurLibelle = (p) => (p.mode === 'pourcent' ? `${nombre(p.valeur)} % du salaire` : formatMoney(nombre(p.valeur)))
export const resumePrime = (p) => `${p.typeNom || 'Prime'} : ${cibleLibelle(p)}, ${valeurLibelle(p)}${p.periodicite === 'ponctuelle' ? '' : ' par mois'}`

// Total mensuel estimé d'une prime sur l'ensemble des employés concernés.
export const totalEstime = (p, employes) => employesConcernes(p, employes).reduce((s, e) => s + montantPourEmploye(p, e), 0)

// ── Circuit et notifications ──
const LIEN = '/rh/primes'
const ETAPES_A_TRAITER = ETAPES.filter((e) => e.role)
const maintenant = () => new Date().toISOString()
// La RH qui a fait la demande suit le circuit. Sans auteur connu, on n'envoie rien : une notification sans destinataire serait vue par tout le monde.
const prevenirRh = (p, user, champs) => (p.creeParUid ? notify({ module: 'rh', forUsers: [p.creeParUid], excludeUid: user?.uid, link: LIEN, ...champs }).catch(() => {}) : Promise.resolve())

// Première étape à traiter : la Validation par le DF.
export const demanderValidationPrime = (p, user) => notify({
  type: 'demande', title: '🎁 Prime à valider', body: `${resumePrime(p)}. Demande de ${user?.nom || p.creePar || 'la RH'}.`,
  module: 'rh', forRoles: [ETAPES_A_TRAITER[0].role], excludeUid: user?.uid, link: LIEN
}).catch(() => {})

// Ajoute la prime autorisée aux bulletins du mois encore en brouillon (les bulletins validés ou payés ne sont jamais modifiés).
// Renvoie { ajoutes, verrouilles } : bulletins mis à jour, et bulletins déjà validés qui n'ont pas la prime.
export async function ajouterAuxBulletins(p) {
  const [bulletins, employes, configs] = await Promise.all([getAll(COL.bulletins), getAll(COL.employes), getAll(COL.config)])
  const conf = configs.find((c) => c.id === 'paie') || PAIE_CONFIG_DEFAUT
  let ajoutes = 0, verrouilles = 0
  for (const b of bulletins.filter((x) => couvreMois(p, x.mois))) {
    const emp = employes.find((e) => e.id === b.employeId)
    if (!concerne(p, emp) || (b.primesDetail || []).some((d) => d.id === p.id)) continue
    const montant = montantPourEmploye(p, emp)
    if (!(montant > 0)) continue
    if ((b.statut || 'brouillon') !== 'brouillon') { verrouilles++; continue }
    const primesDetail = [...(b.primesDetail || []), { id: p.id, nom: p.typeNom || 'Prime', montant }]
    const primes = nombre(b.primes) + montant
    const calc = calculerBulletin(b.salaireBase, primes, conf, b.retenueAvances, b.retenuePresence)
    await updateItem(COL.bulletins, b.id, { primes, primesDetail, ...calc })
    ajoutes++
  }
  return { ajoutes, verrouilles }
}

// Valide l'étape en cours. Retourne { fin, ajoutes, verrouilles, suivante }.
export async function validerEtapePrime(p, user) {
  const etape = etapeCourante(p)
  const suivante = ETAPES_A_TRAITER[ETAPES_A_TRAITER.indexOf(etape) + 1]
  const validations = { ...(p.validations || {}), [etape.cle]: { par: user?.nom || '', parUid: user?.uid || '', le: maintenant() } }
  const champs = { validations }
  if (!suivante) Object.assign(champs, { statut: 'autorise', decidePar: user?.nom || '', decideLe: maintenant() })
  await updateItem(COL.primes, p.id, champs)
  const resume = resumePrime(p)
  if (suivante) {
    await notify({ type: 'demande', title: '🎁 Prime à traiter', body: `${resume}. ${etape.fait} par ${user?.nom || etape.sigle}, à vous de ${suivante.verbe.toLowerCase()}.`, module: 'rh', forRoles: [suivante.role], excludeUid: user?.uid, link: LIEN }).catch(() => {})
    await prevenirRh(p, user, { type: 'info', title: `Prime ${etape.fait.toLowerCase()} (${etape.sigle})`, body: `${resume}. Transmise à l'étape ${suivante.label} (${suivante.sigle}).` })
    return { fin: false, suivante, etape }
  }
  // Fin du circuit : la prime s'ajoute au salaire (bulletins du mois en brouillon, puis futures générations).
  const r = await ajouterAuxBulletins({ ...p, ...champs })
  await prevenirRh(p, user, { type: 'approuve', title: 'Prime autorisée ✅', body: `${resume} : le circuit est terminé, la prime s'ajoute au salaire${r.ajoutes ? ` (${r.ajoutes} bulletin(s) mis à jour)` : ''}.` })
  return { fin: true, etape, ...r }
}

// Refuse à l'étape en cours (motif obligatoire) : renvoyé à la RH qui a fait la demande.
export async function refuserPrime(p, motif, user) {
  const etape = etapeCourante(p)
  await updateItem(COL.primes, p.id, { statut: 'refuse', motifRefus: motif, refus: { etape: etape?.cle || '', par: user?.nom || '', parUid: user?.uid || '', motif, le: maintenant() }, decidePar: user?.nom || '', decideLe: maintenant() })
  await prevenirRh(p, user, { type: 'refus', title: 'Prime refusée ⛔', body: `${resumePrime(p)}. Refusée${etape ? ` à l'étape ${etape.label} (${etape.sigle})` : ''} : ${motif}` })
}

// Arrête une prime mensuelle à la fin du mois courant (elle ne figure plus sur les bulletins suivants).
export const arreterPrime = (p) => updateItem(COL.primes, p.id, { moisFin: moisCourant() })

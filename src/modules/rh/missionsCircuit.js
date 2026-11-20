// RH : circuit de validation d'un ordre de mission. La RH saisit la demande ; la GE (ou l'Info) l'approuve ou la refuse avec un motif obligatoire ;
// une mission approuvée se termine puis se rembourse. Chaque passage laisse une trace (qui, quand) et prévient les personnes concernées :
// la GE à la demande (cloche, push, alerte sur sa page d'accueil), la RH et l'employé à la décision.
//   statut : demandee → approuvee ;  demandee → refusee (puis, corrigée, retour à demandee). Le circuit s'arrête là.
//   Une fois approuvée, la mission devient une alerte d'E-DÉPENSES : la finance la décaisse de la Caisse courante ou non (cf. decaissementsRh.js,
//   champ `decaissement` : 'fait' ou 'non', jamais renseigné tant que la décision n'est pas prise).
import { updateItem } from '../../core/db'
import { notify } from '../../core/notify'
import { formatMoney } from '../../utils/formatters'
import { COL } from './store/rhStore'

// Qui décide : la Gérante exécutive ; l'Info (rôle universel) peut aussi trancher.
export const ROLES_APPROBATION = ['ge', 'info', 'super_admin']
export const peutApprouverMission = (m, role) => m.statut === 'demandee' && ROLES_APPROBATION.includes(role)

export const ETAPES_MISSION = [
  { cle: 'demande', label: 'Demande', sigle: 'RH', coul: '#1d4ed8', fond: '#dbeafe' },
  { cle: 'approbation', label: 'Approbation', sigle: 'GE', coul: '#7e22ce', fond: '#f3e8ff' }
]
// État de chaque étape selon le statut : faite (cochée), cours (à faire maintenant), refusee, attente.
export function etatsMission(m) {
  const s = m.statut || 'demandee'
  if (s === 'refusee') return ['faite', 'refusee']
  return s === 'demandee' ? ['faite', 'cours'] : ['faite', 'faite']
}

const jours = (m) => (m.dateDebut && m.dateFin ? Math.max(1, Math.round((new Date(m.dateFin) - new Date(m.dateDebut)) / 864e5) + 1) : 0)
export const dureeMission = jours
export const resumeMission = (m) => `${m.employeNom} : ${m.objet}${m.destination ? ` à ${m.destination}` : ''}${Number(m.montantFrais) > 0 ? `, frais ${formatMoney(m.montantFrais)}` : ''}`
const maintenant = () => new Date().toISOString()
const LIEN = '/rh/missions'

// Personnes à prévenir d'une décision : la RH qui a saisi la demande et l'employé s'il a un compte. Jamais de liste vide : une notification
// sans destinataire serait vue par tout le monde.
function destinatairesDecision(m, employes, user) {
  const emp = (employes || []).find((e) => e.id === m.employeId)
  return [...new Set([m.creeParUid, emp?.userId, emp?.userLogin].filter(Boolean))].filter((x) => x !== user?.uid && x !== user?.login)
}

// La GE est avertie d'une nouvelle demande (cloche, push, alerte sur son accueil).
export const demanderApprobation = (m, user) => notify({
  type: 'demande', title: '🧳 Ordre de mission à approuver', body: `${resumeMission(m)}. Demande de ${user?.nom || m.creePar || 'la RH'}.`,
  module: 'rh', forRoles: ['ge'], excludeUid: user?.uid, link: LIEN
}).catch(() => {})

export async function approuverMission(m, user, employes) {
  await updateItem(COL.missions, m.id, { statut: 'approuvee', approuvePar: user?.nom || '', approuveParUid: user?.uid || '', approuveLe: maintenant() })
  const cibles = destinatairesDecision(m, employes, user)
  if (cibles.length) await notify({ type: 'approuve', title: 'Mission approuvée ✅', body: resumeMission(m), module: 'rh', forUsers: cibles, link: LIEN }).catch(() => {})
  // Les frais sont à décaisser : la finance (DF, PAU, Info) est alertée dans E-DÉPENSES (cloche, push, alerte sur l'accueil).
  if (Number(m.montantFrais) > 0) await notify({ type: 'demande', title: '💸 Mission à décaisser', body: `${resumeMission(m)}. À décaisser de la Caisse courante ou non.`, module: 'depense', forRoles: ['df', 'pau', 'info'], excludeUid: user?.uid, link: '/depense' }).catch(() => {})
}

export async function refuserMission(m, motif, user, employes) {
  await updateItem(COL.missions, m.id, { statut: 'refusee', motifRefus: motif, refusePar: user?.nom || '', refuseParUid: user?.uid || '', refuseLe: maintenant() })
  const cibles = destinatairesDecision(m, employes, user)
  if (cibles.length) await notify({ type: 'refus', title: 'Mission refusée ⛔', body: `${resumeMission(m)}. Motif : ${motif}`, module: 'rh', forUsers: cibles, link: LIEN }).catch(() => {})
}

// Suite de la vie d'une mission approuvée : terminée, puis remboursée (traces datées).
export async function avancerMission(m, statut, user, employes) {
  const champs = statut === 'terminee'
    ? { statut, termineePar: user?.nom || '', termineeLe: maintenant() }
    : { statut, rembourseePar: user?.nom || '', rembourseeLe: maintenant() }
  await updateItem(COL.missions, m.id, champs)
  const cibles = destinatairesDecision(m, employes, user)
  if (statut === 'remboursee' && cibles.length) await notify({ type: 'info', title: 'Frais de mission remboursés 💸', body: resumeMission(m), module: 'rh', forUsers: cibles, link: LIEN }).catch(() => {})
}

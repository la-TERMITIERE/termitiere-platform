// RH : avances sur salaire et prêts. Circuit : la RH saisit la demande, la GE (ou l'Info) l'approuve ou la refuse (motif obligatoire), la RH
// verse l'argent, puis les mensualités sont RETENUES AUTOMATIQUEMENT sur les bulletins de paie jusqu'au solde. Chaque étape laisse une trace.
//   statut : demandee → approuvee → versee → remboursee ;  demandee → refusee (puis, corrigée, retour à demandee) ;  approuvee → annulee (non décaissée).
//   Le circuit visible s'arrête à la GE. Une fois approuvée, la demande est une alerte d'E-DÉPENSES : « Décaisser de la caisse » la passe à `versee`
//   (les retenues sur la paie commencent), « Ne pas décaisser » à `annulee` (cf. decaissementsRh.js).
// Une avance se retient en une fois (une mensualité) ; un prêt se retient en plusieurs mensualités. `moisDebut` : mois de la première retenue.
import { updateItem } from '../../core/db'
import { notify } from '../../core/notify'
import { formatMoney } from '../../utils/formatters'
import { COL } from './store/rhStore'
import { ROLES_APPROBATION } from './missionsCircuit'

export const TYPES_AVANCE = [{ value: 'avance', label: 'Avance sur salaire' }, { value: 'pret', label: 'Prêt' }]
export const libelleType = (t) => TYPES_AVANCE.find((x) => x.value === t)?.label || 'Avance'
export const peutApprouverAvance = (a, role) => a.statut === 'demandee' && ROLES_APPROBATION.includes(role)

export const ETAPES_AVANCE = [
  { cle: 'demande', label: 'Demande', sigle: 'RH', coul: '#1d4ed8', fond: '#dbeafe' },
  { cle: 'approbation', label: 'Approbation', sigle: 'GE', coul: '#7e22ce', fond: '#f3e8ff' }
]
export const SIGLES_AVANCE = ['RH', 'GE']
export function etatsAvance(a) {
  const s = a.statut || 'demandee'
  if (s === 'refusee') return ['faite', 'refusee']
  return s === 'demandee' ? ['faite', 'cours'] : ['faite', 'faite']
}
export const nomsAvance = (a, ge) => [a.creePar || 'La RH', a.approuvePar || a.refusePar || ge || 'Gérante exécutive']

// ── Calculs ──
const nombre = (v) => Number(v) || 0
export const totalRembourse = (a) => (a.remboursements || []).reduce((s, r) => s + nombre(r.montant), 0)
export const resteDu = (a) => Math.max(0, nombre(a.montant) - totalRembourse(a))
export const mensualiteAvance = (a) => Math.ceil(nombre(a.montant) / Math.max(1, nombre(a.nbMensualites) || 1))
// Premier mois de retenue proposé : le mois suivant (AAAA-MM).
export const moisSuivant = (depuis = new Date()) => { const d = new Date(depuis.getFullYear(), depuis.getMonth() + 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
export const resumeAvance = (a) => `${a.employeNom} : ${libelleType(a.type).toLowerCase()} de ${formatMoney(a.montant)}${a.nbMensualites > 1 ? ` en ${a.nbMensualites} mensualités` : ''}`

// Retenue d'un employé sur le bulletin d'un mois : mensualité de chaque avance versée dont la retenue a commencé, sans dépasser le reste dû, et jamais
// deux fois pour le même mois. Renvoie { total, details: [{ id, montant }] } ; `details` est gardé dans le bulletin.
export function retenueDuMois(avances, employeId, mois) {
  const details = []
  ;(avances || []).filter((a) => a.employeId === employeId && a.statut === 'versee' && a.moisDebut && a.moisDebut <= mois
    && !(a.remboursements || []).some((r) => r.mois === mois && r.bulletinId)).forEach((a) => {
    const m = Math.min(mensualiteAvance(a), resteDu(a))
    if (m > 0) details.push({ id: a.id, montant: m })
  })
  return { total: details.reduce((s, d) => s + d.montant, 0), details }
}

// Quand un bulletin est validé, ses retenues s'inscrivent sur chaque avance ; l'avance soldée passe à « Remboursée ». Sans effet si déjà inscrites.
export async function appliquerRetenues(bulletin, avances) {
  for (const d of bulletin.avancesRetenues || []) {
    const a = (avances || []).find((x) => x.id === d.id)
    if (!a || (a.remboursements || []).some((r) => r.bulletinId === bulletin.id)) continue
    const remboursements = [...(a.remboursements || []), { mois: bulletin.mois, montant: nombre(d.montant), bulletinId: bulletin.id, le: new Date().toISOString() }]
    const solde = nombre(a.montant) - remboursements.reduce((s, r) => s + nombre(r.montant), 0)
    await updateItem(COL.avances, a.id, { remboursements, ...(solde <= 0 ? { statut: 'remboursee', rembourseeLe: new Date().toISOString() } : {}) })
  }
}

// Remboursement saisi à la main (l'employé rend une partie ou tout, hors bulletin).
export async function enregistrerRemboursement(a, montant, user) {
  const m = Math.min(nombre(montant), resteDu(a))
  if (m <= 0) return
  const remboursements = [...(a.remboursements || []), { mois: 'manuel', montant: m, par: user?.nom || '', le: new Date().toISOString() }]
  const solde = nombre(a.montant) - remboursements.reduce((s, r) => s + nombre(r.montant), 0)
  await updateItem(COL.avances, a.id, { remboursements, ...(solde <= 0 ? { statut: 'remboursee', rembourseeLe: new Date().toISOString() } : {}) })
}

// ── Circuit et notifications (mêmes règles que les ordres de mission) ──
const LIEN = '/rh/avances'
const maintenant = () => new Date().toISOString()
function destinatairesDecision(a, employes, user) {
  const emp = (employes || []).find((e) => e.id === a.employeId)
  return [...new Set([a.creeParUid, emp?.userId, emp?.userLogin].filter(Boolean))].filter((x) => x !== user?.uid && x !== user?.login)
}

export const demanderApprobationAvance = (a, user) => notify({
  type: 'demande', title: `💳 ${libelleType(a.type)} à approuver`, body: `${resumeAvance(a)}. Demande de ${user?.nom || a.creePar || 'la RH'}.`,
  module: 'rh', forRoles: ['ge'], excludeUid: user?.uid, link: LIEN
}).catch(() => {})

export async function approuverAvance(a, user, employes) {
  await updateItem(COL.avances, a.id, { statut: 'approuvee', approuvePar: user?.nom || '', approuveParUid: user?.uid || '', approuveLe: maintenant() })
  const cibles = destinatairesDecision(a, employes, user)
  if (cibles.length) await notify({ type: 'approuve', title: `${libelleType(a.type)} approuvé(e) ✅`, body: resumeAvance(a), module: 'rh', forUsers: cibles, link: LIEN }).catch(() => {})
  // L'argent est à décaisser : la finance (DF, PAU, Info) est alertée dans E-DÉPENSES.
  await notify({ type: 'demande', title: `💸 ${libelleType(a.type)} à décaisser`, body: `${resumeAvance(a)}. À décaisser de la Caisse courante ou non.`, module: 'depense', forRoles: ['df', 'pau', 'info'], excludeUid: user?.uid, link: '/depense' }).catch(() => {})
}
export async function refuserAvance(a, motif, user, employes) {
  await updateItem(COL.avances, a.id, { statut: 'refusee', motifRefus: motif, refusePar: user?.nom || '', refuseParUid: user?.uid || '', refuseLe: maintenant() })
  const cibles = destinatairesDecision(a, employes, user)
  if (cibles.length) await notify({ type: 'refus', title: `${libelleType(a.type)} refusé(e) ⛔`, body: `${resumeAvance(a)}. Motif : ${motif}`, module: 'rh', forUsers: cibles, link: LIEN }).catch(() => {})
}
export async function verserAvance(a, user, employes) {
  await updateItem(COL.avances, a.id, { statut: 'versee', versePar: user?.nom || '', verseLe: maintenant() })
  const cibles = destinatairesDecision(a, employes, user)
  if (cibles.length) await notify({ type: 'info', title: `${libelleType(a.type)} versé(e) 💸`, body: `${resumeAvance(a)}. Retenue à partir de ${a.moisDebut || 'la prochaine paie'}.`, module: 'rh', forUsers: cibles, link: LIEN }).catch(() => {})
}

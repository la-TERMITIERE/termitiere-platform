// E-DÉPENSES : logique des décaissements demandés par les RH (sans composant). Une mission ou une avance sur salaire APPROUVÉE par la GE doit être
// décaissée de la Caisse courante, ou non, par la finance :
//  - Décaisser : une dépense décaissée est créée dans la Caisse courante (le solde baisse tout seul), la mission ou l'avance porte la pastille
//    « Décaissée », et le bénéficiaire (s'il a un compte) est invité à confirmer la réception sur son accueil. Une avance passe alors à « versée » :
//    ses mensualités se retiennent sur les bulletins de paie.
//  - Ne pas décaisser : aucune dépense ; la mission porte la pastille « Non décaissée » ; l'avance passe à « Non décaissée ».
import { setItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { formatMoney, genId, todayStr } from '../../utils/formatters'
import { COL } from '../rh/store/rhStore'
import { libelleType, resumeAvance } from '../rh/avancesCircuit'
import { resumeMission } from '../rh/missionsCircuit'
import { notifierBeneficiaire } from './notifications'

export const montantDecaissement = (type, doc) => Number(type === 'mission' ? doc.montantFrais : doc.montant) || 0

// Qui voit l'alerte et peut décider : la finance, la GE et l'Info.
export const ROLES_DECAISSEMENT = ['pau', 'ge', 'df', 'info', 'super_admin']
export const peutDecaisser = (role) => ROLES_DECAISSEMENT.includes(role)

export const aDecaisser = (type, doc) => doc.statut === 'approuvee' && !doc.decaissement && montantDecaissement(type, doc) > 0

// Décaisse : crée la dépense de la Caisse courante, marque la mission ou l'avance, prévient la RH et le bénéficiaire.
export async function decaisserDepuisCaisse(type, doc, user, employes) {
  const montant = montantDecaissement(type, doc)
  if (!(montant > 0)) throw new Error('Montant à décaisser nul')
  const emp = (employes || []).find((e) => e.id === doc.employeId)
  const id = genId()
  const description = type === 'mission'
    ? `Mission : ${doc.objet}${doc.destination ? ` à ${doc.destination}` : ''} (${doc.employeNom})`
    : `${libelleType(doc.type)} : ${doc.employeNom}${doc.nbMensualites > 1 ? `, remboursé en ${doc.nbMensualites} mensualités` : ', retenu sur la paie'}`
  const depense = {
    id, secteurId: 'divers', financePar: 'caisse_commune', categorie: type === 'mission' ? 'deplacement' : 'salaires', description, montant, date: todayStr(),
    statut: 'decaissee', sourceFinancement: 'entreprise', origineSaisie: 'e_depenses', modePaiement: 'espece',
    beneficiaireType: 'interne', beneficiaireNom: doc.employeNom, beneficiaireUid: emp?.userId || '', rhType: type, rhId: doc.id,
    enregistrePar: user?.nom || '-', enregistreParUid: user?.uid || null, createdAt: Date.now()
  }
  await setItem('depense_depenses', id, depense)
  const maintenant = new Date().toISOString()
  const collection = type === 'mission' ? COL.missions : COL.avances
  await updateItem(collection, doc.id, {
    decaissement: 'fait', depenseId: id, decaissePar: user?.nom || '', decaisseLe: maintenant,
    ...(type === 'avance' ? { statut: 'versee', versePar: user?.nom || '', verseLe: maintenant } : {})
  })
  await audit('depense', 'DECAISSEMENT_RH', `${description} : ${formatMoney(montant)} décaissés de la Caisse courante`, { rhType: type, rhId: doc.id, montant })
  // Le bénéficiaire (s'il a un compte) confirme la réception sur son accueil.
  if (depense.beneficiaireUid) await notifierBeneficiaire(depense, 'CAISSE COURANTE').catch(() => {})
  // La RH qui a fait la demande est prévenue.
  if (doc.creeParUid && doc.creeParUid !== user?.uid) {
    await notify({ type: 'info', title: type === 'mission' ? 'Mission décaissée 💸' : `${libelleType(doc.type)} décaissé(e) 💸`, body: `${type === 'mission' ? resumeMission(doc) : resumeAvance(doc)} : décaissé de la Caisse courante.`, module: 'rh', forUsers: [doc.creeParUid], link: type === 'mission' ? '/rh/missions' : '/rh/avances' }).catch(() => {})
  }
}

export async function nePasDecaisser(type, doc, user) {
  const collection = type === 'mission' ? COL.missions : COL.avances
  await updateItem(collection, doc.id, { decaissement: 'non', decaissePar: user?.nom || '', decaisseLe: new Date().toISOString(), ...(type === 'avance' ? { statut: 'annulee' } : {}) })
  await audit('depense', 'DECAISSEMENT_RH_REFUSE', `${type === 'mission' ? resumeMission(doc) : resumeAvance(doc)} : non décaissé`, { rhType: type, rhId: doc.id })
  if (doc.creeParUid && doc.creeParUid !== user?.uid) {
    await notify({ type: 'warning', title: type === 'mission' ? 'Mission non décaissée' : `${libelleType(doc.type)} non décaissé(e)`, body: type === 'mission' ? resumeMission(doc) : resumeAvance(doc), module: 'rh', forUsers: [doc.creeParUid], link: type === 'mission' ? '/rh/missions' : '/rh/avances' }).catch(() => {})
  }
}


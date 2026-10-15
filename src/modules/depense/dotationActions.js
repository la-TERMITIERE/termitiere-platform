// Nouvelle dotation de caisse : un apport au budget du mois d'un domaine (SIÈGE = caisse commune, ou un secteur),
// enregistré exactement comme l'« ajout de budget » d'E-DÉPENSES (collection `depense_budgets`, une révision de plus
// dans l'historique). La dotation modifie donc le budget alloué dans E-DÉPENSES, et la Caisse la relit depuis là.
//  - SIÈGE (caisse commune) et MAXI BAT : appliquée tout de suite ;
//  - secteurs avec équipe (Agro, Logistique, Briqueterie, Garderie) : « proposée », puis confirmée reçue par le
//    secteur (même circuit qu'E-DÉPENSES, cf. validerReceptionBudget dans RecettesDepenses.jsx).
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { FULL_ACCESS_ROLES } from '../../core/roles'
import { genId } from '../../utils/formatters'
import { SECTEURS, MOIS_LABELS } from './data'
import { budgetDocSecteur, budgetSecteur } from './logic'
import { reportManuelInterdit } from './reportAuto'

// À garder synchronisé avec SECTEURS_AVEC_VALIDATION de RecettesDepenses.jsx.
export const SECTEURS_AVEC_VALIDATION = ['agro', 'logistique', 'evenementiel', 'garderie']

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')

// Identifiant du document de budget du mois : l'existant (y compris l'ancien document Logistique non tagué), sinon un nouveau.
export function idBudget(budgets, secteurId, site, annee, mois) {
  const existant = budgetDocSecteur(budgets, secteurId, annee, mois, site)
  const m = String(mois).padStart(2, '0')
  return existant?.id || (site ? `${secteurId}_${site}_${annee}-${m}` : `${secteurId}_${annee}-${m}`)
}

// Budget actuel du domaine pour le mois de `date` (0 si non défini) : sert à montrer l'effet avant d'enregistrer.
export function budgetDuMois(budgets, secteurId, site, date) {
  const [annee, mois] = String(date || '').split('-').map(Number)
  if (!annee || !mois) return 0
  return budgetSecteur(budgets, secteurId, annee, mois, secteurId === 'logistique' ? site : null)
}

// Crée la dotation. Retourne { statut: 'appliquee' | 'proposee' }. Lève une Error au message prêt à afficher.
export async function creerDotation({ secteurId, site = null, montant, date, motif, user, budgets, users = [] }) {
  const valeur = Number(montant)
  if (!secteurId) throw new Error('Choisissez le domaine')
  if (secteurId === 'logistique' && !site) throw new Error('Choisissez le site de MAXI LOGISTIQUE')
  if (!(valeur > 0)) throw new Error('Montant requis')
  if (!date) throw new Error('Date requise')
  const [annee, mois] = date.split('-').map(Number)
  if (secteurId === 'divers' && reportManuelInterdit(date.slice(0, 7), motif)) throw new Error('Le report du mois précédent est calculé automatiquement : inutile de le saisir')
  const secteur = SECTEURS.find((s) => s.id === secteurId)
  const libelle = (secteurId === 'divers' ? 'SIÈGE' : (secteur?.label || secteurId)) + (secteurId === 'logistique' ? ` : ${site === 'kara' ? 'Kara' : 'Lomé'}` : '')
  const siteDoc = secteurId === 'logistique' ? site : null
  const doc = budgetDocSecteur(budgets, secteurId, annee, mois, siteDoc)
  const id = idBudget(budgets, secteurId, siteDoc, annee, mois)
  const ancien = Number(doc?.montant) || 0
  const nouveau = ancien + valeur
  const texte = (motif || '').trim() || 'Dotation de caisse'
  const revisions = doc?.revisions || []
  const auteur = user?.nom || user?.login || '—'

  // Jour réel de la dotation (modifiable) ; l'heure de saisie départage plusieurs dotations le même jour.
  const jour = new Date(`${date}T00:00:00`)
  jour.setHours(new Date().getHours(), new Date().getMinutes(), new Date().getSeconds())

  if (SECTEURS_AVEC_VALIDATION.includes(secteurId)) {
    if (doc?.statutValidation === 'en_attente') throw new Error(`Une proposition de budget est déjà en attente de confirmation pour ${libelle}`)
    await setItem('depense_budgets', id, {
      id, secteurId, site: siteDoc, annee, mois, montant: ancien, revisions,
      montantPropose: nouveau, motifPropose: texte, statutValidation: 'en_attente',
      proposeParText: auteur, proposeParUid: user?.uid || null, proposeLe: Date.now(), updatedAt: Date.now()
    })
    await audit('depense', 'DOTATION_PROPOSEE', `${libelle} : dotation de ${fmt(valeur)} FCFA proposée, en attente de confirmation`, { secteurId, site: siteDoc, annee, mois, ancien, nouveau })
    const destinataires = users.filter((u) => (u.modules || []).includes(secteurId)).map((u) => u.uid).filter(Boolean)
    if (destinataires.length) {
      await notify({
        type: 'demande', title: `💰 Dotation proposée : ${libelle}`,
        body: `${fmt(valeur)} FCFA pour ${MOIS_LABELS[mois - 1]} ${annee} : confirmez la réception pour l'activer.`,
        module: 'depense', forUsers: destinataires, excludeUid: user?.uid,
        link: secteurId === 'logistique' && siteDoc ? `/logistique/${siteDoc}/finances` : `/${secteurId}/finances`
      }).catch(() => {})
    }
    return { statut: 'proposee', libelle }
  }

  await setItem('depense_budgets', id, {
    id, secteurId, site: siteDoc, annee, mois, montant: nouveau, updatedAt: Date.now(),
    revisions: [...revisions, { id: genId(), ancien, nouveau, motif: texte, date: jour.getTime(), auteur }]
  })
  await audit('depense', 'DOTATION_CAISSE', `${libelle} : +${fmt(valeur)} FCFA de dotation (budget ${fmt(nouveau)} FCFA)`, { secteurId, site: siteDoc, annee, mois, ancien, nouveau })
  await notify({
    type: 'info', title: `➕ Dotation de caisse : ${libelle}`, body: `+${fmt(valeur)} FCFA : nouveau budget ${fmt(nouveau)} FCFA.`,
    module: 'depense', forRoles: FULL_ACCESS_ROLES, excludeUid: user?.uid,
    link: '/depense/recettes-depenses', state: { openSecteurId: siteDoc ? `${secteurId}__${siteDoc}` : secteurId, annee, mois }
  }).catch(() => {})
  return { statut: 'appliquee', libelle }
}

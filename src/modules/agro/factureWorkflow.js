// Transitions du workflow de facturation / sortie de stock (Maxi-Agro), partagées
// entre la page Facturation et la page Demandes de sortie. Chaque fonction effectue
// l'écriture en base + l'audit + les notifications (+ le stock le cas échéant).
// L'UI (confirmations, toasts) reste dans les composants.
import { updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { APPROVER_ROLES } from '../../core/roles'
import { formatMoney, todayStr } from '../../utils/formatters'
import { creerDemandesFacture, ajusterFactureEcart } from './factureStock'
import { appliquerCorrectif, payloadDemandeCorrectif, payloadDecisionCorrectif } from '../../shared/demandes/correctif'

const horo = () => `${todayStr()} ${new Date().toTimeString().slice(0, 5)}`

// Lignes effectives (réelles après écart, sinon facturées) + calcul des totaux.
export const lignesEffectives = (f) => (f.lignesReelles?.length ? f.lignesReelles : f.lignes) || []
export const calcTotaux = (lignes, remise = 0, tva = 0) => {
  const totalHT = (lignes || []).reduce((s, l) => s + (l.total || 0), 0)
  const apresRemise = totalHT * (1 - (remise || 0) / 100)
  const t = apresRemise * ((tva || 0) / 100)
  return { totalHT, totalTTC: Math.round(apresRemise + t) }
}
export const factureTotaux = (f) => calcTotaux(lignesEffectives(f), f.remise, f.tva)

// ① Agent : demande la sortie d'une facture brouillon → en attente d'approbation.
export async function demanderSortie(f, user) {
  await updateItem('agro_factures', f.id, { statut: 'sortie_demandee', sortieDemandeeLe: horo(), sortieDemandeePar: user.nom })
  await audit('agro', 'FACTURE_SORTIE_DEMANDE', `${f.numero} — ${formatMoney(f.totalTTC || 0)}`)
  await notify({ type: 'demande', title: 'Sortie de stock à approuver 📦', body: `Facture ${f.numero} — ${f.client?.nom || ''} (${formatMoney(f.totalTTC || 0)})`, module: 'agro', forRoles: [...APPROVER_ROLES, 'secretaire'], excludeUid: user.uid, link: '/agro/demandes' })
}

// ② Hiérarchie : approuve la sortie → décompte du stock (demandes liées certifiées).
export async function approuverSortie(f, user) {
  await creerDemandesFacture(f, user)
  await updateItem('agro_factures', f.id, { statut: 'sortie_approuvee', sortieApprouveeLe: horo(), sortieApprouveePar: user.nom })
  await audit('agro', 'FACTURE_SORTIE_APPROUVEE', `${f.numero} — sortie autorisée`)
  await notify({ type: 'approuve', title: 'Sortie approuvée ✅', body: `Facture ${f.numero} — vous pouvez certifier ou signaler un écart`, module: 'agro', forUsers: [f.createdByUid], excludeUid: user.uid, link: '/agro/demandes' })
}

// ② bis Hiérarchie : refuse la sortie → retour brouillon (modifiable par l'agent).
export async function refuserSortie(f, user, motif = '') {
  await updateItem('agro_factures', f.id, { statut: 'refusee', refuseLe: horo(), refusePar: user.nom, refusMotif: (motif || '').trim() })
  await audit('agro', 'FACTURE_SORTIE_REFUSEE', `${f.numero}${motif ? ' — ' + motif : ''}`)
  await notify({ type: 'refus', title: 'Sortie refusée ⛔', body: `Facture ${f.numero}${motif ? ' — ' + motif : ''}`, module: 'agro', forUsers: [f.createdByUid], excludeUid: user.uid, link: '/agro/demandes' })
}

// ③ Agent : certifie la facture (CA enregistré, impression). Renvoie le total TTC.
export async function certifier(f, user) {
  const lignes = lignesEffectives(f)
  const { totalHT, totalTTC } = calcTotaux(lignes, f.remise, f.tva)
  await updateItem('agro_factures', f.id, { statut: 'certifiee', lignes, totalHT, totalTTC, certifieeLe: horo(), certifieePar: user.nom })
  await audit('agro', 'FACTURE_CERTIFIEE', `${f.numero} — ${formatMoney(totalTTC)} (CA enregistré)`)
  await notify({ type: 'info', title: 'Facture certifiée ✅', body: `${f.numero} — ${formatMoney(totalTTC)}`, module: 'agro', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/agro/factures' })
  return totalTTC
}

// ③ bis Agent : signale un écart (reliquats / pertes) → la hiérarchie ajustera.
export async function signalerEcart(f, user, motif = '') {
  await updateItem('agro_factures', f.id, { statut: 'modif_demandee', ecartMotif: (motif || '').trim(), ecartSignaleLe: horo(), ecartSignalePar: user.nom })
  await audit('agro', 'FACTURE_ECART_DEMANDE', `${f.numero}${motif ? ' — ' + motif : ''}`)
  await notify({ type: 'demande', title: 'Demande de modification 📝', body: `Facture ${f.numero} — écart à ajuster${motif ? ' : ' + motif : ''}`, module: 'agro', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/agro/demandes' })
}

// ④ Hiérarchie : ajuste les quantités réelles (vendus/morts/retournés) → réajuste le stock.
export async function appliquerAjustement(f, user, ajustements) {
  const lignesReelles = await ajusterFactureEcart(f, ajustements)
  await updateItem('agro_factures', f.id, {
    statut: 'sortie_approuvee', lignesDemandees: f.lignesDemandees || f.lignes,
    lignesReelles, ecartAjuste: true, ecartAjusteLe: horo(), ecartAjustePar: user.nom
  })
  await audit('agro', 'FACTURE_ECART_AJUSTE', `${f.numero} — quantités réelles ajustées`)
  await notify({ type: 'approuve', title: 'Quantités ajustées ✅', body: `Facture ${f.numero} — vous pouvez certifier la facture ajustée`, module: 'agro', forUsers: [f.createdByUid], excludeUid: user.uid, link: '/agro/factures' })
}

export async function rouvrir(f) {
  await updateItem('agro_factures', f.id, { statut: 'brouillon' })
}

// ⑤ Agent : la facture est CERTIFIÉE mais une quantité était fausse — il la
// « relance » avec les quantités voulues. Rien ne bouge tant que la hiérarchie
// n'a pas tranché : le statut reste `certifiee` (le stock ne doit pas se dénouer).
export async function demanderCorrectif(f, user, lignes, motif) {
  await updateItem('agro_factures', f.id, {
    correctif: payloadDemandeCorrectif({ lignes, lignesAvant: lignesEffectives(f), motif, user, horodate: horo() })
  })
  await audit('agro', 'FACTURE_CORRECTIF_DEMANDE', `${f.numero}${motif ? ' — ' + motif : ''}`)
  await notify({
    type: 'demande', title: 'Demande de correctif 🔄',
    body: `Facture ${f.numero} — ${f.client?.nom || ''} : quantités à corriger${motif ? ' — ' + motif : ''}`,
    module: 'agro', forRoles: APPROVER_ROLES, excludeUid: user.uid, link: '/agro/demandes'
  })
}

// ⑥ Hiérarchie : tranche le correctif. Accepté, les demandes de sortie liées sont
// recalées sur les nouvelles quantités : appliquerDemandeAuStock cale `autoSor`
// sur ce nouveau total, donc les anciennes quantités RENTRENT au stock et les
// nouvelles en RESSORTENT. Le CA suit les nouveaux totaux.
export async function trancherCorrectif(f, user, accepte, commentaire = '') {
  const c = f.correctif || {}
  if (accepte) {
    // Article remplacé et/ou quantité corrigée ; le prix suit le nouvel article.
    const lignes = appliquerCorrectif(f.lignes, {
      avant: c.lignesAvant || [], apres: c.lignes || [], key: 'articleId',
      mapper: (x, l) => {
        const qte = parseInt(x.qte) || 0
        const pu = parseFloat(x.prixUnit ?? l.prixUnit ?? l.prix) || 0
        return {
          articleId: x.articleId, article: x.article,
          articleType: x.articleType || l.articleType, articleCat: x.articleCat || l.articleCat,
          qte, prixUnit: pu, total: qte * pu
        }
      }
    })
    const { totalHT, totalTTC } = calcTotaux(lignes, f.remise, f.tva)
    await creerDemandesFacture({ ...f, lignes }, user)
    await updateItem('agro_factures', f.id, {
      lignes, lignesReelles: null, ecartAjuste: false, totalHT, totalTTC,
      correctif: payloadDecisionCorrectif(c, { accepte, user, horodate: horo(), commentaire })
    })
  } else {
    await updateItem('agro_factures', f.id, {
      correctif: payloadDecisionCorrectif(c, { accepte, user, horodate: horo(), commentaire })
    })
  }
  await audit('agro', accepte ? 'FACTURE_CORRECTIF_APPLIQUE' : 'FACTURE_CORRECTIF_REFUSE', f.numero)
  await notify({
    type: accepte ? 'approuve' : 'refus',
    title: accepte ? 'Correctif appliqué ✅' : 'Correctif refusé ⛔',
    body: `Facture ${f.numero} — ${accepte ? 'quantités corrigées, stock et CA réajustés' : 'les quantités certifiées restent inchangées'}`,
    module: 'agro', forUsers: [c.par || f.createdByUid], excludeUid: user.uid, link: '/agro/factures'
  })
}

// Suppression d'une facture avant tout effet sur le stock (brouillon, sortie
// demandée, refusée). Après approbation, le stock est engagé : on passe alors par
// l'écart ou le correctif.
export async function supprimerFacture(f) {
  await removeItem('agro_factures', f.id)
  await audit('agro', 'FACTURE_DELETE', `${f.numero} (${f.statut || 'brouillon'})`)
}

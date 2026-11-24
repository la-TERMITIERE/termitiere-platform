// Actions métier d'une vente de briques, partagées par les écrans Ventes, Autorisations et Factures :
//  - demanderAutorisationVente : envoie l'autorisation de sortie des briques à la hiérarchie
//  - facturerVente : émet la facture d'une vente déjà autorisée, sans ressaisie
import { addItem, updateItem, updateAtomic, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { APPROVER_ROLES } from '../../core/roles'
import { todayStr, nowHM, genNumero, formatMoney } from '../../utils/formatters'
import { dernierStockBriques, inventairesCompletes } from './logic'

const stockDe = (inventaires, briqueId) => dernierStockBriques(inventaires, briqueId, briqueId === 'caillasses' ? 'caillasses' : 'pret')

// Stock insuffisant, vente sans ligne : lève une Error au message prêt à afficher.
export async function demanderAutorisationVente({ vente, user, demandes, inventaires, dateSortie, message }) {
  const lignes = vente.lignes || []
  if (!lignes.length) throw new Error('Cette vente ne contient aucune ligne')
  for (const l of lignes) {
    const stock = stockDe(inventaires, l.briqueId)
    if ((parseInt(l.qte) || 0) > stock) throw new Error(`Stock insuffisant pour ${l.briqueNom} (${stock} disponible)`)
  }
  const totalQte = lignes.reduce((s, l) => s + (parseInt(l.qte) || 0), 0)
  const resume = lignes.length === 1 ? lignes[0].briqueNom : `${lignes.length} types de briques`
  const num = genNumero('AUT-BRIQ', demandes.length)
  await addItem('evenementiel_demandes', {
    num, date: todayStr(), heure: nowHM(),
    demandeur: user.login, demandeurNom: user.nom,
    venteId: vente.id, venteNum: vente.num, clientNom: vente.clientNom,
    briqueId: lignes[0].briqueId, briqueNom: resume,
    qte: totalQte, lignes,
    dateSortie: dateSortie || vente.dateChargement || todayStr(),
    message: (message || '').trim(),
    statut: 'en_attente'
  })
  await updateItem('evenementiel_ventes', vente.id, { statut: 'en_attente' })
  const alerte = await notify({
    type: 'demande',
    title: 'Autorisation sortie briques',
    body: `${totalQte} brique(s) : ${resume} : vente ${vente.num} : par ${user.nom}`,
    module: 'evenementiel',
    forRoles: [...APPROVER_ROLES, 'secretaire'],
    excludeUid: user.uid,
    link: '/evenementiel/demandes'
  })
  await audit('evenementiel', 'DEMANDE_SORTIE', num)
  return { num, destinataires: alerte ? alerte.destinataires : null }
}

// Facture d'une vente autorisée : client et lignes repris de la vente. La vente passe à « chargée ».
export async function facturerVente({ vente, clients, factures, user }) {
  const cle = (v) => (v || '').trim().toLowerCase()
  const cli = clients.find((c) => c.id === vente.clientId) || clients.find((c) => cle(c.nom) === cle(vente.clientNom))
  const lignes = (vente.lignes || []).map((l) => ({
    articleId: l.briqueId, article: l.briqueNom,
    qte: l.qte, prixUnit: l.prixUnitaire,
    total: (parseInt(l.qte) || 0) * (parseFloat(l.prixUnitaire) || 0)
  }))
  const totalHT = lignes.reduce((s, l) => s + (l.total || 0), 0)
  const numero = genNumero('FAC-BRIQ', factures.length)
  await addItem('evenementiel_factures', {
    numero, date: todayStr(),
    client: { nom: vente.clientNom || cli?.nom || '', tel: cli?.telephone || cli?.tel || '', adresse: cli?.adresse || '', email: cli?.email || '' },
    lignes, remise: 0, tva: 0, totalHT, totalTTC: Math.round(totalHT),
    venteId: vente.id, agentNom: user.nom, agentId: user.uid
  })
  await updateItem('evenementiel_ventes', vente.id, { statut: 'chargee' })
  await audit('evenementiel', 'FACTURE', `${numero} : ${formatMoney(Math.round(totalHT))}`)
  return { numero, total: Math.round(totalHT) }
}

// Sort les briques du stock (prêtes, ou caillasses) sur le dernier inventaire connu. L'écriture est ATOMIQUE : elle part
// de la valeur réellement en base, donc une production ou un enregistrement de stock fait au même moment n'est pas écrasé.
// Lève une Error (message prêt à afficher) si aucun stock n'existe ou si l'écriture échoue : l'appelant ne doit alors
// PAS certifier la demande.
export async function sortirDuStock({ inventaires, lignes, user }) {
  const ref = [...inventairesCompletes(inventaires)].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  if (!ref) throw new Error("Aucun stock de briques enregistré : saisissez d'abord le stock")
  const zero = { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
  await updateAtomic('evenementiel_inventaires', ref.date, (cur) => {
    const base = cur || ref
    const briques = { ...(base.briques || {}) }
    ;(lignes || []).forEach((l) => {
      const etat = l.briqueId === 'caillasses' ? 'caillasses' : 'pret'
      const courant = briques[l.briqueId] || ref.briques?.[l.briqueId] || zero
      briques[l.briqueId] = { ...zero, ...courant, [etat]: Math.max(0, (parseInt(courant[etat]) || 0) - (parseInt(l.qte) || 0)) }
    })
    return { ...base, date: ref.date, briques, savedAt: ts(), agentId: user?.uid || null, agentNom: user?.nom || null }
  })
  return ref.date
}

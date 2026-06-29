// Intégration STOCK du workflow de facturation Maxi-Agro.
//
// Principe : pour ne pas réinventer la mécanique de décompte (déjà éprouvée), une
// facture dont la sortie est APPROUVÉE génère une « demande de sortie » certifiée
// PAR LIGNE (collection agro_demandes, source:'facture'). Ces demandes alimentent
// la colonne Sorties de la saisie (autoSorties) et décomptent le stock via
// appliquerDemandeAuStock — exactement comme une demande classique.
//
//  - Approbation  → création des demandes liées (qté = quantité facturée) → stock −qté (ventes).
//  - Écart        → quantité réellement VENDUE ajustée sur la demande liée (le reliquat
//                   retourné revient donc en stock), et les MORTS au marché sont
//                   enregistrés en Décès sur l'inventaire (mortalité). Idempotent.
//
// Les demandes liées (source:'facture') sont masquées de la page Demandes : elles
// sont pilotées entièrement depuis la Facturation.
import { getAll, addItem, updateItem, setItem } from '../../core/db'
import { appliquerDemandeAuStock } from './applyDemande'
import { getInventaire } from './logic'

// Lignes « stockables » d'une facture : article identifié + quantité > 0.
function lignesStockables(facture) {
  return (facture.lignes || []).map((l, i) => ({ ...l, _idx: i }))
    .filter((l) => l.articleId && (parseInt(l.qte) || 0) > 0)
}

// Crée (ou met à jour) les demandes de sortie liées à une facture approuvée,
// puis décompte le stock. Idempotent : une seule demande par (factureId, ligneIdx).
export async function creerDemandesFacture(facture, user) {
  const demandes = await getAll('agro_demandes')
  for (const l of lignesStockables(facture)) {
    const i = l._idx
    const type = l.articleType || 'animal'
    const payload = {
      factureId: facture.id, ligneIdx: i, source: 'facture',
      typeArticle: type, articleId: l.articleId, articleNom: l.article || '', articleCat: l.articleCat || '',
      qte: parseInt(l.qte) || 0, dateSortie: facture.date,
      statut: 'certifie', motif: 'Vente',
      demandeur: user?.login || facture.createdBy || '', demandeurNom: user?.nom || facture.createdBy || '',
      num: facture.numero ? `${facture.numero}-L${i + 1}` : `FAC-L${i + 1}`,
      date: facture.date
    }
    const exists = demandes.find((d) => d.factureId === facture.id && d.ligneIdx === i)
    if (exists) await updateItem('agro_demandes', exists.id, payload)
    else await addItem('agro_demandes', payload)
    await appliquerDemandeAuStock({ ...payload, statut: 'certifie' })
  }
}

// Applique un écart : pour chaque ligne, `sold` = réellement vendu, `dead` = morts au
// marché. Le reliquat (qté − vendu − morts) est implicitement retourné en stock.
// Renvoie les lignes réelles (qté = vendu) pour mise à jour de la facture.
export async function ajusterFactureEcart(facture, ajustements) {
  const demandes = await getAll('agro_demandes')
  const byIdx = Object.fromEntries((ajustements || []).map((a) => [a.ligneIdx, a]))

  for (const l of lignesStockables(facture)) {
    const i = l._idx
    const aj = byIdx[i] || {}
    const sold = Math.max(0, parseInt(aj.sold) || 0)
    const dead = Math.max(0, parseInt(aj.dead) || 0)

    // 1) Ajuster la demande liée (ventes) à la quantité réellement vendue.
    const link = demandes.find((d) => d.factureId === facture.id && d.ligneIdx === i)
    if (link) {
      await updateItem('agro_demandes', link.id, { qte: sold })
      await appliquerDemandeAuStock({ ...link, qte: sold, statut: 'certifie' })
    }
    // 2) Morts au marché → Décès sur l'inventaire (animaux uniquement).
    if ((l.articleType || 'animal') === 'animal') {
      await appliquerDecesFacture(facture, i, l.articleId, dead)
    }
  }

  // Lignes réelles (facturées = vendues) pour le calcul du CA réel.
  return (facture.lignes || []).map((l, i) => {
    const aj = byIdx[i]
    if (!aj || !l.articleId) return l
    const qte = Math.max(0, parseInt(aj.sold) || 0)
    return { ...l, qte, total: qte * (parseFloat(l.prixUnit) || 0) }
  })
}

// Inscrit (idempotemment) une ligne de Décès « marché » sur l'inventaire de la date
// de sortie, tagguée par la facture+ligne. Met à jour les agrégats (dec, fin).
async function appliquerDecesFacture(facture, ligneIdx, articleId, dead) {
  const inventaires = await getAll('agro_inventaires')
  const inv = getInventaire(inventaires, facture.date)
  if (!inv) return // pas de saisie ce jour → la mortalité sera saisie manuellement
  const node = inv.animaux?.[articleId]
  if (!node) return

  const tag = `facture:${facture.id}:${ligneIdx}`
  const sorties = [...(node.sorties || [])]
  const idx = sorties.findIndex((x) => x.agentId === tag && x.type === 'Décès')
  const oldDead = idx >= 0 ? (parseInt(sorties[idx].qte) || 0) : 0
  const delta = dead - oldDead
  if (delta === 0 && idx >= 0) return
  if (dead <= 0 && idx < 0) return

  const line = {
    type: 'Décès', qte: dead, label: `Mortalité au marché — ${facture.numero || 'facture'}`,
    agentId: tag, agentNom: 'Facturation'
  }
  if (idx >= 0) {
    if (dead <= 0) sorties.splice(idx, 1); else sorties[idx] = line
  } else {
    sorties.push(line)
  }
  const newNode = {
    ...node, sorties,
    dec: Math.max(0, (node.dec || 0) + delta),
    fin: Math.max(0, (node.fin || 0) - delta)
  }
  await setItem('agro_inventaires', facture.date, { animaux: { ...(inv.animaux || {}), [articleId]: newNode } })
}

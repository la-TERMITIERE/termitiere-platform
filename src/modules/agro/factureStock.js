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
import { getAll, addItem, updateItem, setItem, removeItem } from '../../core/db'
import { appliquerDemandeAuStock } from './applyDemande'
import { propagerSuite } from './propagation'
import { venteHorsFerme } from './stockLome'
import { getInventaire, autoSorties, mutationsEntrantes, agregerAnimal } from './logic'

// Lignes « stockables » d'une facture : article identifié. Les lignes à quantité
// nulle restent de la partie — un correctif peut ramener une ligne à 0, et sa
// demande liée doit alors être remise à 0 (le stock revient).
function lignesStockables(facture) {
  return (facture.lignes || []).map((l, i) => ({ ...l, _idx: i }))
    .filter((l) => l.articleId)
}

// Crée (ou met à jour) les demandes de sortie liées à une facture approuvée,
// puis décompte le stock. Idempotent : une seule demande par (factureId, ligneIdx).
export async function creerDemandesFacture(facture, user) {
  // Vente hors de la ferme (Lomé ou autre localité) : les bêtes ne sont plus à la ferme. Le stock du point de vente est calculé à partir de la facture (stockLome.js), la ferme ne bouge pas.
  if (venteHorsFerme(facture)) return
  const demandes = await getAll('agro_demandes')
  const echecs = [] // sorties qui n'ont pas pu être décomptées : levées en erreur à la fin (jamais d'échec muet)
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
    // Un correctif a pu REMPLACER l'article de la ligne : l'ancien doit relâcher
    // sa réservation de stock, sinon sa sortie resterait comptée à tort.
    const ancien = exists && exists.articleId !== payload.articleId ? { ...exists } : null
    if (exists) await updateItem('agro_demandes', exists.id, payload)
    else if (payload.qte > 0) await addItem('agro_demandes', payload)
    else continue // ligne vide jamais sortie : rien à décompter
    const r = await appliquerDemandeAuStock({ ...payload, statut: 'certifie' })
    if (!r.ok) echecs.push(`${payload.articleNom || payload.articleId} : ${r.raison}`)
    if (ancien) {
      const r2 = await appliquerDemandeAuStock({ ...ancien, statut: 'certifie' })
      if (!r2.ok) echecs.push(`${ancien.articleNom || ancien.articleId} : ${r2.raison}`)
    }
  }
  if (echecs.length) throw new Error(`Stock NON décompté (${echecs.join(' ; ')}). Corrigez puis recommencez, ou lancez le Contrôle du stock dans les Paramètres.`)
}

// Annule TOUT l'effet d'une facture sur le stock de la ferme (suppression d'une facture certifiée par Info) : les bêtes vendues rentrent
// au stock, et les décès, retours et reliquats de l'écart sont effacés des saisies. Les demandes de sortie liées sont supprimées ; la colonne
// « Sorties » des jours concernés et leurs EF Final sont recalculés, puis les jours suivants repartent du nouvel effectif.
// Une vente à Lomé n'a rien décompté à la ferme : il n'y a rien à rendre (le stock de Lomé se recalcule seul sans la facture).
export async function annulerEffetStockFacture(facture) {
  if (venteHorsFerme(facture)) return
  const demandes = await getAll('agro_demandes')
  const liees = demandes.filter((d) => d.factureId === facture.id)
  const echecs = []
  // 1) On supprime les demandes liées, puis on recale chaque article/jour : le total des sorties approuvées baisse, le stock remonte.
  for (const d of liees) await removeItem('agro_demandes', d.id)
  for (const d of liees) {
    const r = await appliquerDemandeAuStock({ ...d, statut: 'certifie' })
    if (!r.ok) echecs.push(`${d.articleNom || d.articleId} : ${r.raison}`)
  }
  // 2) On efface les lignes de l'écart (décès au marché, retour, reliquat) de chaque animal de la facture.
  // (seulement si la saisie porte des lignes de cette facture : une saisie sans écart n'est pas retouchée)
  const inv = getInventaire(await getAll('agro_inventaires'), facture.date)
  const marque = `:${facture.id}:`
  for (const l of lignesStockables(facture)) {
    if ((l.articleType || 'animal') !== 'animal') continue
    const node = inv?.animaux?.[l.articleId]
    const porteEcart = [...(node?.sorties || []), ...(node?.entrees || [])].some((x) => String(x.agentId || '').includes(marque))
    if (porteEcart) await appliquerEcartInventaire(facture, l._idx, l.articleId, 0, 0)
  }
  if (echecs.length) throw new Error(`Stock NON réintégré (${echecs.join(' ; ')}). Lancez le Contrôle du stock dans les Paramètres.`)
}

// Applique un écart. Pour chaque ligne (sortie de `qte` au marché) :
//   sold  = réellement vendu      → sortie « Ventes »  (compte le CA)
//   dead  = morts au marché       → sortie « Décès »   (mortalité)
//   ret   = qte − sold − dead     → ENTRÉE « Retour du marché » (revient au stock)
//                                   + sortie de reliquat (les 10 sont aussi partis
//                                     avec le lot) pour que les comptes s'équilibrent.
// Résultat net sur le stock : −(sold + dead). Toutes les lignes sont VISIBLES.
// Renvoie les lignes réelles (qté = vendu) pour le calcul du CA.
export async function ajusterFactureEcart(facture, ajustements) {
  if (venteHorsFerme(facture)) {
    // Lomé : seules les lignes changent (quantités vendues). Les morts et retours se déduisent des ajustements enregistrés avec la facture.
    const parLigne = Object.fromEntries((ajustements || []).map((a) => [a.ligneIdx, a]))
    return (facture.lignes || []).map((l, i) => {
      const aj = parLigne[i]
      if (!aj || !l.articleId) return l
      const qte = Math.max(0, parseInt(aj.sold) || 0)
      return { ...l, qte, total: qte * (parseFloat(l.prixUnit) || 0) }
    })
  }
  const demandes = await getAll('agro_demandes')
  const byIdx = Object.fromEntries((ajustements || []).map((a) => [a.ligneIdx, a]))
  const echecs = []

  for (const l of lignesStockables(facture)) {
    const i = l._idx
    const aj = byIdx[i] || {}
    const demande = parseInt(l.qte) || 0
    const sold = Math.max(0, parseInt(aj.sold) || 0)
    const dead = Math.max(0, parseInt(aj.dead) || 0)
    const ret = Math.max(0, demande - sold - dead)

    // 1) La demande liée (Ventes) passe à la quantité réellement VENDUE → CA + stock.
    const link = demandes.find((d) => d.factureId === facture.id && d.ligneIdx === i)
    if (link) {
      await updateItem('agro_demandes', link.id, { qte: sold })
      const r = await appliquerDemandeAuStock({ ...link, qte: sold, statut: 'certifie' })
      if (!r.ok) echecs.push(`${link.articleNom || link.articleId} : ${r.raison}`)
    }
    // 2) Décès + Retour du marché (animaux uniquement) — lignes explicites & tracées.
    if ((l.articleType || 'animal') === 'animal') {
      await appliquerEcartInventaire(facture, i, l.articleId, dead, ret)
    }
  }

  if (echecs.length) throw new Error(`Stock NON réajusté (${echecs.join(' ; ')}). Lancez le Contrôle du stock dans les Paramètres.`)
  return (facture.lignes || []).map((l, i) => {
    const aj = byIdx[i]
    if (!aj || !l.articleId) return l
    const qte = Math.max(0, parseInt(aj.sold) || 0)
    return { ...l, qte, total: qte * (parseFloat(l.prixUnit) || 0) }
  })
}

// Inscrit (idempotemment) les lignes de Décès, de Retour du marché (entrée) et de
// reliquat (sortie d'équilibre) tagguées par facture+ligne, puis RECALCULE
// intégralement les agrégats du nœud à partir de ses listes (exact, sans dérive).
async function appliquerEcartInventaire(facture, ligneIdx, articleId, dead, ret) {
  const inventaires = await getAll('agro_inventaires')
  const inv = getInventaire(inventaires, facture.date)
  if (!inv) return // pas de saisie ce jour → à enregistrer manuellement
  const node = inv.animaux?.[articleId]
  if (!node) return

  const num = facture.numero || 'facture'
  const decTag = `fac-dec:${facture.id}:${ligneIdx}`   // décès
  const relTag = `fac-relq:${facture.id}:${ligneIdx}`  // reliquat sorti (équilibre)
  const retTag = `fac-ret:${facture.id}:${ligneIdx}`   // retour du marché (entrée)

  // Retire les anciennes lignes tagguées de cette facture+ligne, puis réinsère.
  const sorties = (node.sorties || []).filter((x) => x.agentId !== decTag && x.agentId !== relTag)
  const entrees = (node.entrees || []).filter((x) => x.agentId !== retTag)
  if (dead > 0) sorties.push({ type: 'Décès', qte: dead, label: `Mortalité au marché : ${num}`, agentId: decTag, agentNom: 'Facturation' })
  if (ret > 0) {
    sorties.push({ type: 'Autres', qte: ret, label: `Reliquat parti puis retourné : ${num}`, agentId: relTag, agentNom: 'Facturation' })
    entrees.push({ type: 'Retour du marché', qte: ret, label: `Retour du marché : ${num}`, agentId: retTag, agentNom: 'Facturation' })
  }

  // Recalcul exact des agrégats (init + entrées + mutations − sorties − autoSor).
  const demandes = await getAll('agro_demandes')
  const autoSor = autoSorties(demandes, articleId, facture.date, 'animal')
  const mutIn = mutationsEntrantes(inv.animaux)[articleId] || 0
  const agg = agregerAnimal({ init: node.init || 0, entrees, sorties }, autoSor, mutIn)
  const newNode = { ...node, ...agg, entrees, sorties, autoSor }
  await setItem('agro_inventaires', facture.date, { animaux: { ...(inv.animaux || {}), [articleId]: newNode } })
  await propagerSuite(facture.date) // les jours suivants repartent du nouvel EF Final
}

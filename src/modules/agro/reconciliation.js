// Contrôle du stock MAXI-AGRO : vérifie que chaque sortie approuvée (facture ou demande) a bien fait baisser le stock, et répare.
//
// Pourquoi : une sortie approuvée pouvait ne pas décompter le stock (jour sans saisie, échec d'écriture avalé, demande liée jamais créée).
// Les anomalies sont de quatre sortes :
//   - sans_demande  : facture à sortie approuvée dont une ligne n'a jamais généré sa demande de sortie → rien n'a été décompté ;
//   - jour_absent   : aucune saisie ce jour-là → la sortie n'est dans aucun stock ;
//   - noeud_absent / ecart_sortie : la saisie du jour existe mais ne compte pas (ou pas tout) la sortie ;
//   - fin_incoherent : EF Final enregistré différent de init + entrées − sorties ;
//   - continuite    : l'EF Initial d'un jour suivant n'est pas l'EF Final de la veille.
// `analyserStockAgro` est pure (testable) ; `reparerStockAgro` écrit, et n'est appelée que sur demande de l'administration.
import { getAll, addItem, updateAtomic } from '../../core/db'
import { estCertifie } from '../../shared/workflow'
import { factureStatut } from './data'
import { autoSorties, agregerAnimal, agregerAliment, mutationsEntrantes, suiteRecalculee } from './logic'
import { lignesEffectives } from './factureWorkflow'
import { appliquerDemandeAuStock } from './applyDemande'
import { propagerSuite } from './propagation'

const listeDe = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : [])
const STATUTS_SORTIE_APPROUVEE = ['sortie_approuvee', 'certifiee']

// Nom lisible d'un article d'après les demandes ou les factures.
function nomArticle(id, demandes, factures) {
  const d = demandes.find((x) => x.articleId === id && x.articleNom)
  if (d) return d.articleNom
  for (const f of factures) {
    const l = (f.lignes || []).find((x) => x.articleId === id && x.article)
    if (l) return l.article
  }
  return id
}

export function analyserStockAgro({ factures = [], demandes = [], inventaires = [], depuis = '' }) {
  const anomalies = []
  const apresDebut = (date) => !depuis || (date || '') >= depuis

  // 1. Factures dont la sortie est approuvée mais sans demande liée pour une ligne facturée.
  factures.filter((f) => STATUTS_SORTIE_APPROUVEE.includes(factureStatut(f)) && f.statut && apresDebut(f.date)).forEach((f) => {
    lignesEffectives(f).forEach((l, i) => {
      if (!l.articleId || !(parseInt(l.qte) > 0)) return
      const liee = demandes.some((d) => d.factureId === f.id && d.ligneIdx === i)
      if (!liee) {
        anomalies.push({
          type: 'sans_demande', date: f.date, articleId: l.articleId, article: l.article || l.articleId,
          kind: (l.articleType || 'animal') === 'aliment' ? 'aliments' : 'animaux', factureId: f.id, numero: f.numero, ligneIdx: i,
          qte: parseInt(l.qte) || 0, detail: `Facture ${f.numero || ''} (${f.date}) : ${parseInt(l.qte) || 0} × ${l.article || l.articleId}, sortie approuvée mais jamais décomptée`
        })
      }
    })
  })

  // 2. Chaque sortie CERTIFIÉE doit être comptée dans la saisie de son jour.
  const cles = new Map()
  demandes.filter((d) => estCertifie(d.statut) && d.articleId && d.dateSortie && apresDebut(d.dateSortie)).forEach((d) => {
    const type = d.typeArticle === 'aliment' ? 'aliment' : 'animal'
    cles.set(`${type}|${d.articleId}|${d.dateSortie}`, { type, articleId: d.articleId, date: d.dateSortie, kind: type === 'aliment' ? 'aliments' : 'animaux' })
  })
  const parDate = new Map(inventaires.map((i) => [i.date, i]))
  cles.forEach((c) => {
    const attendu = autoSorties(demandes, c.articleId, c.date, c.type)
    const article = nomArticle(c.articleId, demandes, factures)
    const inv = parDate.get(c.date)
    if (!inv) {
      anomalies.push({ ...c, article, type: 'jour_absent', attendu, detail: `${c.date} : aucune saisie, ${attendu} × ${article} sorti(s) non décompté(s)` })
      return
    }
    const node = inv[c.kind]?.[c.articleId]
    if (!node) {
      anomalies.push({ ...c, article, type: 'noeud_absent', attendu, detail: `${c.date} : ${article} absent de la saisie, ${attendu} sorti(s) non décompté(s)` })
    } else if ((parseInt(node.autoSor) || 0) !== attendu) {
      anomalies.push({ ...c, article, type: 'ecart_sortie', attendu, enBase: parseInt(node.autoSor) || 0, detail: `${c.date} : ${article} : sorties certifiées ${attendu}, comptées ${parseInt(node.autoSor) || 0}` })
    }
  })

  // 3. EF Final cohérent avec ses mouvements (nouveau format seulement).
  inventaires.filter((i) => apresDebut(i.date)).forEach((inv) => {
    const mutIn = mutationsEntrantes(inv.animaux)
    ;['animaux', 'aliments'].forEach((kind) => {
      Object.entries(inv[kind] || {}).forEach(([id, n]) => {
        if (!n || (n.entrees === undefined && n.sorties === undefined)) return // ancienne saisie à champs scalaires : on n'y touche pas
        const base = { init: parseInt(n.init) || 0, entrees: listeDe(n.entrees), sorties: listeDe(n.sorties) }
        const fin = kind === 'animaux' ? agregerAnimal(base, n.autoSor || 0, mutIn[id] || 0).fin : agregerAliment(base, n.autoSor || 0).fin
        if (fin !== (parseInt(n.fin) || 0)) {
          anomalies.push({ type: 'fin_incoherent', date: inv.date, kind, articleId: id, article: nomArticle(id, demandes, factures), enBase: parseInt(n.fin) || 0, attendu: fin,
            detail: `${inv.date} : ${nomArticle(id, demandes, factures)} : EF Final ${parseInt(n.fin) || 0} au lieu de ${fin}` })
        }
      })
    })
  })

  // 4. Continuité : l'EF Initial de chaque jour suivant reprend l'EF Final de la veille.
  const datesTriees = inventaires.map((i) => i.date).filter((d) => d && apresDebut(d)).sort()
  const debut = datesTriees[0]
  if (debut) {
    const aCorriger = suiteRecalculee(inventaires, debut)
    if (aCorriger.length) {
      anomalies.push({ type: 'continuite', date: aCorriger[0].date, jours: aCorriger.map((d) => d.date), detail: `${aCorriger.length} jour(s) dont l'EF Initial n'est pas l'EF Final de la veille (dès le ${aCorriger[0].date})` })
    }
  }

  anomalies.sort((a, b) => ((a.date || '') < (b.date || '') ? -1 : 1))
  return { anomalies, nbSorties: cles.size }
}

// Réparation : crée les demandes manquantes, recalcule chaque jour concerné (jour absent créé), recale les EF Final, aligne la suite.
// Renvoie { corriges, echecs: [raison] }.
export async function reparerStockAgro({ user, depuis = '' }) {
  const echecs = []
  let corriges = 0
  const [factures, demandes0] = await Promise.all([getAll('agro_factures'), getAll('agro_demandes')])

  // a) demandes liées manquantes (jamais de remise à zéro d'une demande existante : un écart ajusté reste ajusté)
  for (const f of factures) {
    if (!STATUTS_SORTIE_APPROUVEE.includes(factureStatut(f)) || !f.statut || (depuis && (f.date || '') < depuis)) continue
    const lignes = lignesEffectives(f)
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i]
      if (!l.articleId || !(parseInt(l.qte) > 0)) continue
      if (demandes0.some((d) => d.factureId === f.id && d.ligneIdx === i)) continue
      await addItem('agro_demandes', {
        factureId: f.id, ligneIdx: i, source: 'facture', typeArticle: l.articleType || 'animal', articleId: l.articleId,
        articleNom: l.article || '', articleCat: l.articleCat || '', qte: parseInt(l.qte) || 0, dateSortie: f.date,
        statut: 'certifie', motif: 'Vente (contrôle du stock)', demandeur: user?.login || '', demandeurNom: user?.nom || '',
        num: f.numero ? `${f.numero}-L${i + 1}` : `FAC-L${i + 1}`, date: f.date
      })
      corriges++
    }
  }

  // b) décompte de chaque sortie certifiée dans la saisie de son jour (jour absent créé, idempotent)
  const demandes = await getAll('agro_demandes')
  const vues = new Set()
  for (const d of demandes.filter((x) => estCertifie(x.statut) && x.articleId && x.dateSortie && (!depuis || x.dateSortie >= depuis)).sort((a, b) => (a.dateSortie < b.dateSortie ? -1 : 1))) {
    const cle = `${d.typeArticle}|${d.articleId}|${d.dateSortie}`
    if (vues.has(cle)) continue
    vues.add(cle)
    const r = await appliquerDemandeAuStock(d)
    if (!r.ok) echecs.push(`${d.articleNom || d.articleId} (${d.dateSortie}) : ${r.raison}`)
  }

  // c) EF Final recalculé là où il ne correspond plus à ses mouvements
  const inv1 = await getAll('agro_inventaires')
  const incoherents = analyserStockAgro({ factures, demandes, inventaires: inv1, depuis }).anomalies.filter((a) => a.type === 'fin_incoherent')
  for (const a of incoherents) {
    await updateAtomic('agro_inventaires', a.date, (cur) => {
      const n = cur?.[a.kind]?.[a.articleId]
      if (!n) return undefined
      const base = { init: parseInt(n.init) || 0, entrees: listeDe(n.entrees), sorties: listeDe(n.sorties) }
      const agg = a.kind === 'animaux' ? agregerAnimal(base, n.autoSor || 0, mutationsEntrantes(cur.animaux)[a.articleId] || 0) : agregerAliment(base, n.autoSor || 0)
      return { ...cur, [a.kind]: { ...cur[a.kind], [a.articleId]: { ...n, ...agg } } }
    })
    corriges++
  }

  // d) alignement de toute la suite des jours (EF Initial = EF Final de la veille)
  const inventaires = await getAll('agro_inventaires')
  const premier = inventaires.map((i) => i.date).filter((x) => x && (!depuis || x >= depuis)).sort()[0]
  if (premier) corriges += await propagerSuite(premier)
  return { corriges, echecs }
}

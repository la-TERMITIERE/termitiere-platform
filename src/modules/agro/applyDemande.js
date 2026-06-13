// Applique au stock une demande de sortie APPROUVÉE (manuellement ou automatiquement
// après 10 min). Toute sortie sur demande est une vraie sortie : elle doit être
// décomptée du stock ET comptabilisée dans les sorties/ventes.
//
// Principe : on met à jour le nœud d'article de l'inventaire de `dateSortie` de
// façon INCRÉMENTALE (delta sur `autoSor`), ce qui est :
//   - idempotent (on cale `autoSor` sur le total approuvé, on ne ré-ajoute jamais) ;
//   - sûr pour les anciennes saisies (on ne reconstruit pas les listes de mouvements,
//     on n'écrase ni naissances, ni décès, ni entrées) ;
//   - cohérent : EF Final = EF Final − delta, Sorties = Sorties + delta.
//
// Si aucune saisie n'existe encore pour `dateSortie`, on ne crée pas d'inventaire
// partiel (cela casserait le report des autres articles) : la sortie sera prise en
// compte naturellement lorsque la saisie de ce jour sera enregistrée (la colonne
// Sorties lit déjà les demandes approuvées en direct).
import { getAll, setItem } from '../../core/db'
import { getInventaire, previousInventoryDate, autoSorties } from './logic'

export async function appliquerDemandeAuStock(demande) {
  try {
    if (!demande || demande.statut !== 'approuve') return
    const { typeArticle, articleId, dateSortie } = demande
    if (!articleId || !dateSortie) return
    const kind = typeArticle === 'aliment' ? 'aliments' : 'animaux'

    const [inventaires, demandes] = await Promise.all([
      getAll('agro_inventaires'),
      getAll('agro_demandes')
    ])

    const inv = getInventaire(inventaires, dateSortie)
    if (!inv) return // pas de saisie pour cette date → sera capturé à la saisie

    // Total AUTORITAIRE des demandes approuvées pour cet article/cette date.
    const totalAuto = autoSorties(demandes, articleId, dateSortie, typeArticle)

    const existing = inv[kind]?.[articleId]
    // EF Initial : valeur enregistrée, sinon report de l'EF Final de la veille.
    let init = existing?.init
    if (init === undefined) {
      const prevDate = previousInventoryDate(inventaires, dateSortie)
      const prevInv = prevDate ? getInventaire(inventaires, prevDate) : null
      init = prevInv?.[kind]?.[articleId]?.fin ?? 0
    }

    const base = existing || {
      init, naiss: 0, ent: 0, sor: 0, dec: 0, fin: init, entrees: [], sorties: [], autoSor: 0
    }
    const prevAuto = base.autoSor || 0
    const delta = totalAuto - prevAuto
    if (delta === 0) return // déjà à jour (idempotent)

    const node = {
      ...base,
      sor: (base.sor || 0) + delta,
      fin: Math.max(0, (base.fin ?? init) - delta),
      autoSor: totalAuto
    }

    const collMap = { ...(inv[kind] || {}), [articleId]: node }
    // setItem fusionne au niveau du document : remplace le nœud `kind` (tous les
    // articles préservés), laisse intacts l'autre type, savedAt, agentNom, etc.
    await setItem('agro_inventaires', dateSortie, { [kind]: collMap })
  } catch (e) {
    // best effort : ne jamais bloquer l'approbation à cause du décompte stock.
    console.warn('[applyDemande] échec application au stock :', e)
  }
}

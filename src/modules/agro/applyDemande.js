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
import { getAll, setItem, updateAtomic } from '../../core/db'
import { getInventaire, previousInventoryDate, autoSorties } from './logic'
import { estCertifie } from '../../shared/workflow'
import { propagerSuite } from './propagation'
import { useAgroStore } from './store/agroStore'
import { construireReport } from './AutoCarryForward'
import { todayStr } from '../../utils/formatters'

// Résultat explicite : { ok: true } ou { ok: false, raison }. Une sortie qui n'a pas pu être décomptée ne doit JAMAIS passer
// inaperçue : les appelants affichent la raison (ou la lèvent en erreur) au lieu de laisser la facture « approuvée » sans effet.
const echec = (raison) => ({ ok: false, raison })

// Jour sans saisie (trou entre deux saisies, ou jour qui n'a jamais été ouvert) : on crée le report complet de ce jour
// (EF Initial = dernier EF Final connu, sorties sur demande décomptées) au lieu d'ignorer la sortie.
// Renvoie le document créé, ou null si c'est impossible (référentiel pas prêt, aucune saisie avant cette date).
async function creerJourManquant(inventaires, demandes, date) {
  const { especes, aliments, ready } = useAgroStore.getState()
  if (!ready || (!especes.length && !aliments.length)) return null // jamais de report avec le référentiel par défaut
  const avant = inventaires.filter((i) => i.date && i.date < date).sort((a, b) => (a.date < b.date ? -1 : 1))
  if (!avant.length) return null
  const report = construireReport(avant, date, especes, aliments, demandes)
  await setItem('agro_inventaires', date, report)
  return report
}

export async function appliquerDemandeAuStock(demande) {
  try {
    if (!demande || !estCertifie(demande.statut)) return { ok: true }
    const { typeArticle, articleId, dateSortie } = demande
    if (!articleId || !dateSortie) return echec("article ou date de sortie manquants")
    const kind = typeArticle === 'aliment' ? 'aliments' : 'animaux'

    const [inventaires, demandes] = await Promise.all([
      getAll('agro_inventaires'),
      getAll('agro_demandes')
    ])

    let inv = getInventaire(inventaires, dateSortie)
    if (!inv) {
      // Sortie prévue un jour pas encore ouvert : le report automatique du jour la décomptera.
      if (dateSortie > todayStr()) return { ok: true }
      inv = await creerJourManquant(inventaires, demandes, dateSortie)
      if (!inv) return echec(`aucune saisie le ${dateSortie} et aucun jour précédent pour la reporter`)
    }

    // Total AUTORITAIRE des demandes approuvées pour cet article/cette date.
    const totalAuto = autoSorties(demandes, articleId, dateSortie, typeArticle)

    // EF Initial de repli (report de l'EF Final de la veille) si le nœud n'a pas
    // encore d'init — valeur HISTORIQUE stable, calculée hors transaction.
    let initFallback = inv[kind]?.[articleId]?.init
    if (initFallback === undefined) {
      const prevDate = previousInventoryDate(inventaires, dateSortie)
      const prevInv = prevDate ? getInventaire(inventaires, prevDate) : null
      initFallback = prevInv?.[kind]?.[articleId]?.fin ?? 0
    }

    // ÉCRITURE ATOMIQUE (transaction) : le delta s'applique sur l'état RÉELLEMENT en
    // base au moment de l'écriture (pas sur l'instantané `getAll` potentiellement
    // périmé). Sans cela, deux décomptes concurrents — ou une saisie enregistrée
    // entre le getAll et l'écriture — s'écrasaient (« je saisis et ça ne vient pas »).
    await updateAtomic('agro_inventaires', dateSortie, (cur) => {
      if (!cur) return undefined // le doc a disparu entre-temps → ne rien recréer
      const base = cur[kind]?.[articleId] || {
        init: initFallback, naiss: 0, ent: 0, sor: 0, dec: 0, fin: initFallback, entrees: [], sorties: [], autoSor: 0
      }
      const init = base.init !== undefined ? base.init : initFallback
      const prevAuto = base.autoSor || 0
      const delta = totalAuto - prevAuto
      if (delta === 0) return undefined // déjà à jour (idempotent) → n'écrit pas
      const node = {
        ...base,
        sor: (base.sor || 0) + delta,
        fin: Math.max(0, (base.fin ?? init) - delta),
        autoSor: totalAuto
      }
      return { ...cur, [kind]: { ...(cur[kind] || {}), [articleId]: node } }
    })
    await propagerSuite(dateSortie) // les jours suivants repartent du nouvel EF Final
    return { ok: true }
  } catch (e) {
    console.warn('[applyDemande] échec application au stock :', e)
    return echec(e?.message || String(e))
  }
}

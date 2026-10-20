// MAXI-GYM : fusion de deux fiches client (doublon, nom mal écrit). Tout l'historique de la fiche supprimée (séances,
// abonnements, arrivées pointées, factures) est rattaché à la fiche conservée, puis la fiche en trop est retirée.
// Réservé à Info. Seules les fiches de la MÊME salle se fusionnent (chaque salle a sa propre clientèle).
import { updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'

const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const nomCle = (n) => (n || '').trim().toLowerCase()
const siteDe = (x) => x.site || 'lome'

// Documents d'une fiche : rattachés par identifiant, sinon par nom dans la même salle.
const lui = (x, f) => x.clientId === f.id || (siteDe(x) === siteDe(f) && nomCle(x.clientNom) === nomCle(f.nom))

export function documentsDeLaFiche(fiche, { seances, abonnements, presences, factures }) {
  return {
    gym_seances: seances.filter((x) => lui(x, fiche)),
    gym_abonnements: abonnements.filter((x) => lui(x, fiche)),
    gym_presences: presences.filter((x) => lui(x, fiche)),
    gym_factures: factures.filter((x) => lui(x, fiche))
  }
}

export const nombreDocuments = (docs) => Object.values(docs).reduce((t, l) => t + l.length, 0)

// `onProgress(fait, total)` : suivi pour l'affichage. Les écritures sont espacées pour ne pas dépasser la limite de requêtes.
export async function fusionnerFiches({ source, cible, donnees, onProgress }) {
  if (!source || !cible || source.id === cible.id) throw new Error('Choisissez deux fiches différentes')
  if (siteDe(source) !== siteDe(cible)) throw new Error('Les deux fiches doivent appartenir à la même salle')
  const docs = documentsDeLaFiche(source, donnees)
  const total = nombreDocuments(docs)
  let fait = 0
  for (const [collection, liste] of Object.entries(docs)) {
    for (const d of liste) {
      await updateItem(collection, d.id, { clientNom: cible.nom, clientId: cible.id })
      fait += 1
      onProgress?.(fait, total)
      await pause(260)
    }
  }
  // La fiche conservée récupère ce qui lui manque (téléphone, sexe, partenaire).
  const maj = {}
  if (!cible.telephone && source.telephone) maj.telephone = source.telephone
  if (!cible.sexe && source.sexe) maj.sexe = source.sexe
  if (!cible.partenaire && source.partenaire) { maj.partenaire = true; maj.partenaireStructure = source.partenaireStructure || '' }
  if (Object.keys(maj).length) await updateItem('gym_clients', cible.id, maj)
  await removeItem('gym_clients', source.id, { motif: `Fusion avec la fiche « ${cible.nom} »` })
  await audit('gym', 'CLIENTS_FUSIONNES', `« ${source.nom} » fusionnée dans « ${cible.nom} » (${total} enregistrement${total > 1 ? 's' : ''} rattaché${total > 1 ? 's' : ''})`)
  return total
}

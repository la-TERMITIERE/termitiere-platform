// COMPTABILITÉ : objectifs mensuels de recettes par secteur (pôle). Le code les appelle « quotas ».
// Chaque secteur a un objectif de recettes par mois, fixé dans les Paramètres du module du secteur (ou ceux de la Comptabilité). Le Suivi journalier (volet Recettes) compare
// les recettes réellement encaissées à cet objectif et en tire le pourcentage d'avancement.
// Stockage : voir `COL_OBJECTIFS` ci-dessous. Un pôle sans quota n'a pas d'objectif affiché.
import { useMemo } from 'react'
import { Dumbbell, Truck, Leaf, BrickWall, Baby, Bus, Megaphone, Landmark, Layers } from 'lucide-react'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { todayStr, formatMoney } from '../../utils/formatters'
import { versementsClientVersSecteurs } from '../depense/logic'
import { POLES, couleurDomaine, construireLignes, recapPoles } from './journalCalculs'

// Icône et couleur de chaque pôle (celles de son module).
export const ICONE_POLE = { gym_kara: Dumbbell, gym_lome: Dumbbell, log_kara: Truck, log_lome: Truck, agro: Leaf, briques: BrickWall, garderie: Baby, transport: Bus, com: Megaphone, direction: Landmark }
export const iconePole = (id) => ICONE_POLE[id] || Layers
export const couleurPole = (id) => couleurDomaine({ gym_kara: 'gym', gym_lome: 'gym', log_kara: 'logistique', log_lome: 'logistique', agro: 'agro', briques: 'evenementiel', garderie: 'garderie', transport: 'transport', com: 'communication', direction: 'divers' }[id] || 'divers')

// Secteur et salle/site de chaque pôle (pour afficher une carte de secteur qui n'a pas encore de mouvement dans la période).
export const POLE_SECTEUR = {
  gym_kara: { secteurId: 'gym', site: 'kara' }, gym_lome: { secteurId: 'gym', site: 'lome' }, log_kara: { secteurId: 'logistique', site: 'kara' }, log_lome: { secteurId: 'logistique', site: 'lome' },
  agro: { secteurId: 'agro', site: null }, briques: { secteurId: 'evenementiel', site: null }, garderie: { secteurId: 'garderie', site: null },
  transport: { secteurId: 'transport', site: null }, com: { secteurId: 'communication', site: null }, direction: { secteurId: 'divers', site: null }
}

// Pôles pour lesquels on peut fixer un quota : tous ceux du tableau des recettes.
export const POLES_QUOTA = POLES

// Les objectifs vivent dans une collection dédiée `objectifs_recettes` (un document par pôle, `{ montant }`), lisible par tous les comptes
// connectés : chaque module y lit l'objectif de son secteur et le fixe dans ses propres Paramètres ; la Comptabilité y lit tous les secteurs.
export const COL_OBJECTIFS = 'objectifs_recettes'

// Quotas enregistrés : { [idPole]: montant mensuel en FCFA }. `charge` est faux tant que la collection n'est pas arrivée.
export function useQuotas() {
  const { data, loading } = useCollection(COL_OBJECTIFS)
  const poles = {}
  let maj = 0
  ;(data || []).forEach((d) => { const n = Number(d.montant) || 0; if (n > 0) poles[d.id] = n; maj = Math.max(maj, Number(d.updatedAt) || 0) })
  return { quotas: poles, charge: !loading, doc: { updatedAt: maj } }
}

// Fixe (ou retire, avec 0) l'objectif mensuel d'un pôle. Un montant nul est conservé à 0 plutôt que supprimé : aucune suppression à justifier.
export async function fixerObjectif(poleId, montant, user) {
  await setItem(COL_OBJECTIFS, poleId, { id: poleId, montant: Math.max(0, Math.round(Number(montant) || 0)), updatedAt: Date.now(), updatedBy: user?.nom || user?.login || '' })
}

// Recettes déjà encaissées par un pôle sur un mois (AAAA-MM, le mois en cours par défaut), avec les mêmes règles que le Suivi journalier de la
// Comptabilité (factures, versements de clients, saisies manuelles, garderie, transport) : le chiffre est donc identique partout. Seules les
// collections utiles au secteur sont chargées.
const SOURCES_POLE = { gym: ['gym'], logistique: ['logistique'], agro: ['agro'], evenementiel: ['evenementiel'], garderie: ['garderie'], transport: ['transport'] }
export function useRealiseMois(poleId, mois = todayStr().slice(0, 7)) {
  const secteur = POLE_SECTEUR[poleId]?.secteurId
  const veut = (k) => (SOURCES_POLE[secteur] || []).includes(k)
  const { data: facturesAgro, loading: l1 } = useCollection(veut('agro') ? 'agro_factures' : null)
  const { data: facturesLogistique, loading: l2 } = useCollection(veut('logistique') ? 'logistique_factures' : null)
  const { data: facturesEvenementiel, loading: l3 } = useCollection(veut('evenementiel') ? 'evenementiel_factures' : null)
  const { data: facturesGym, loading: l4 } = useCollection(veut('gym') ? 'gym_factures' : null)
  const { data: paiementsGarderie, loading: l5 } = useCollection(veut('garderie') ? 'garderie_paiements' : null)
  const { data: transports, loading: l6 } = useCollection(veut('transport') ? 'evenementiel_transports' : null)
  const { data: projets } = useCollection('projets')
  const { data: versements } = useCollection('projet_versements_client')
  const { data: revenusManuels } = useCollection('depense_revenus_manuels')
  const lignes = useMemo(() => construireLignes({
    facturesAgro, facturesLogistique, facturesEvenementiel, facturesGym,
    versementsRoutes: versementsClientVersSecteurs(versements, projets), projets, revenusManuels
  }), [facturesAgro, facturesLogistique, facturesEvenementiel, facturesGym, versements, projets, revenusManuels])
  const { realise, precedent, details } = useMemo(() => {
    const [a, m] = mois.split('-').map(Number)
    const fin = mois === todayStr().slice(0, 7) ? todayStr() : `${mois}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`
    const ligne = recapPoles({ jour: fin, debut: `${mois}-01`, lignesRecettes: lignes, paiementsGarderie, transports, depenses: [] }).rows.find((r) => r.id === poleId)
    // `details` : une ligne par recette du mois, la plus récente d'abord (affichée au clic sur le KPI).
    // Mois précédent, arrêté au même jour du mois : comparaison à durée égale (le 27, on compare au 1er-27 du mois d'avant).
    const mp = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
    const finPrec = `${mp}-${String(Math.min(Number(fin.slice(8, 10)), new Date(a, m - 1, 0).getDate())).padStart(2, '0')}`
    const prec = recapPoles({ jour: finPrec, debut: `${mp}-01`, lignesRecettes: lignes, paiementsGarderie, transports, depenses: [] }).rows.find((r) => r.id === poleId)
    return { realise: ligne?.rm || 0, precedent: prec?.rm || 0, details: (ligne?.details || []).filter((o) => o.sens === 'recette').sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0)) }
  }, [lignes, paiementsGarderie, transports, mois, poleId])
  return { realise, precedent, details, charge: !(l1 || l2 || l3 || l4 || l5 || l6) }
}

// « +43 250 FCFA » / « −12 000 FCFA » : écart avec le mois précédent à la même date (`court` : sans l'unité, pour les tuiles étroites).
export const texteEcart = (diff, court = false) => `${diff >= 0 ? '+' : '−'}${court ? Math.abs(Math.round(diff)).toLocaleString('fr-FR') : formatMoney(Math.abs(diff))}`

// Objectif d'un pôle et ce qui est déjà réalisé ce mois : { cible, realise, pct, etat }.
export function useObjectifPole(poleId) {
  const { quotas } = useQuotas()
  const { realise, precedent } = useRealiseMois(poleId)
  const cible = quotas[poleId] || 0
  const pct = avancement(realise, cible)
  // `ecart` : recettes du mois moins celles du mois précédent à la même date (positif = en hausse).
  return { cible, realise, precedent, ecart: realise - precedent, pct, etat: etatAvancement(pct) }
}

// Objectif d'une période : le quota est mensuel ; une année entière en compte douze.
export const cibleQuota = (quotaMensuel, mode) => (Number(quotaMensuel) || 0) * (mode === 'annee' ? 12 : 1)

// Pourcentage d'avancement (non plafonné : 120 % veut dire que l'objectif est dépassé) ; null quand il n'y a pas de quota.
export const avancement = (realise, cible) => (cible > 0 ? ((Number(realise) || 0) / cible) * 100 : null)

// Couleur et libellé selon l'avancement.
export function etatAvancement(pct) {
  if (pct == null) return { couleur: '#94a3b8', libelle: "Pas d'objectif" }
  if (pct >= 100) return { couleur: '#16a34a', libelle: 'Objectif atteint' }
  if (pct >= 75) return { couleur: '#65a30d', libelle: 'Presque atteint' }
  if (pct >= 40) return { couleur: '#f59e0b', libelle: 'En cours' }
  return { couleur: '#dc2626', libelle: 'En retard' }
}

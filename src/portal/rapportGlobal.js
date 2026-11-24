// Rapport global de tous les secteurs : un seul calcul, trois usages (tableau de bord global, export Excel, export PDF).
// Lecture seule : on reprend exactement les sources et les règles du Suivi journalier de la Comptabilité (recettes : factures, versements de clients,
// saisies manuelles, garderie, transport ; dépenses : E-DÉPENSES, coûts de matières de la Briqueterie, dépenses des projets E-G.Pro), si bien que les
// chiffres du tableau de bord, des fichiers exportés et de la Comptabilité sont identiques.
//   Secteurs = les pôles de la Comptabilité (salles de gym, Logistique Lomé et Kara, Agro, Briqueterie, Garderie, Transport, Communication, Direction).
import { useMemo } from 'react'
import { useCollection } from '../hooks/useFirestore'
import { getAll } from '../core/db'
import { todayStr } from '../utils/formatters'
import { coutsMatieresBriqueterie, versementsClientVersSecteurs, depensesProjetVersSecteurs } from '../modules/depense/logic'
import { MOIS_LABELS } from '../modules/depense/data'
import { POLES, construireLignes, recapPoles, bornesPeriode, periodePrecedente } from '../modules/comptabilite/journalCalculs'
import { couleurPole, POLE_SECTEUR, COL_OBJECTIFS, cibleQuota, avancement, etatAvancement } from '../modules/comptabilite/quotas'

export const SECTEURS_RAPPORT = POLES.map((p) => ({ ...p, couleur: couleurPole(p.id), ...POLE_SECTEUR[p.id] }))
export const TOUS_LES_SECTEURS = SECTEURS_RAPPORT.map((s) => s.id)

// Collections lues, par clé de données.
const SOURCES = {
  depenses: 'depense_depenses', inventairesBriq: 'evenementiel_inventaires', facturesAgro: 'agro_factures', facturesLogistique: 'logistique_factures',
  facturesEvenementiel: 'evenementiel_factures', facturesGym: 'gym_factures', projets: 'projets', versements: 'projet_versements_client',
  revenusManuels: 'depense_revenus_manuels', paiementsGarderie: 'garderie_paiements', transports: 'evenementiel_transports', depensesProjet: 'projet_depenses',
  objectifs: COL_OBJECTIFS,
  // activité des secteurs
  inventairesAgro: 'agro_inventaires', productions: 'evenementiel_productions', prestations: 'logistique_prestations',
  seancesGym: 'gym_seances', abonnementsGym: 'gym_abonnements', enfants: 'garderie_enfants'
}

// Hook : les données se chargent (et se mettent à jour) tant que `actif` est vrai ; sinon aucune lecture n'est faite.
export function useDonneesRapport(actif = true) {
  const d = {}
  let charge = true
  for (const [cle, nom] of Object.entries(SOURCES)) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- l'ordre des appels est fixe (SOURCES ne change pas)
    const { data, loading } = useCollection(actif ? nom : null)
    d[cle] = data || []
    if (actif && loading) charge = false
  }
  const memo = useMemo(() => d, Object.values(d)) // eslint-disable-line react-hooks/exhaustive-deps
  return { donnees: memo, charge }
}

// Export : lit tout une fois, sans écouter (une collection illisible pour ce compte compte pour vide).
export async function chargerDonnees() {
  const paires = await Promise.all(Object.entries(SOURCES).map(async ([cle, nom]) => {
    try { return [cle, (await getAll(nom)) || []] } catch { return [cle, []] }
  }))
  return Object.fromEntries(paires)
}

const montant = (v) => Number(v) || 0
const ORIGINE = '2000-01-01' // début du cumul total (avant toute donnée de la plateforme)
const dansPeriode = (date, { start, end }) => { const d = String(date || '').slice(0, 10); return !!d && d >= start && d <= end }

// Ce que le secteur a fait sur la période, hors argent : { libelle, valeur }.
function activite(secteur, d, bornes) {
  const out = []
  const site = secteur.site
  const duSite = (x) => !site || (x.site || 'lome') === site
  if (secteur.secteurId === 'agro') {
    const inv = [...d.inventairesAgro].filter((i) => i.date && i.date <= bornes.end).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    if (inv) out.push({ libelle: 'Effectif animal (dernière saisie)', valeur: Object.values(inv.animaux || {}).reduce((s, a) => s + montant(a.fin), 0) })
    out.push({ libelle: 'Saisies sur la période', valeur: d.inventairesAgro.filter((i) => dansPeriode(i.date, bornes)).length })
  } else if (secteur.secteurId === 'evenementiel') {
    out.push({ libelle: 'Briques produites', valeur: d.productions.filter((p) => dansPeriode(p.date, bornes)).reduce((s, p) => s + montant(p.totalBriques), 0) })
  } else if (secteur.secteurId === 'logistique') {
    out.push({ libelle: 'Prestations', valeur: d.prestations.filter((p) => dansPeriode(p.date, bornes)).filter(duSite).length })
  } else if (secteur.secteurId === 'gym') {
    out.push({ libelle: 'Séances', valeur: d.seancesGym.filter((p) => dansPeriode(p.date, bornes)).filter(duSite).length })
    out.push({ libelle: 'Abonnements', valeur: d.abonnementsGym.filter((p) => dansPeriode(p.date, bornes)).filter(duSite).length })
  } else if (secteur.secteurId === 'garderie') {
    out.push({ libelle: 'Enfants inscrits', valeur: d.enfants.filter((e) => e.statut === 'actif').length })
    out.push({ libelle: 'Paiements reçus', valeur: d.paiementsGarderie.filter((p) => dansPeriode(p.date, bornes) || (p.type !== 'journalier' && p.annee)).length })
  } else if (secteur.secteurId === 'transport') {
    out.push({ libelle: 'Trajets', valeur: d.transports.filter((t) => dansPeriode(t.date, bornes)).length })
  }
  return out
}

// Recettes, dépenses, bénéfice, objectif et opérations de chaque secteur choisi sur la période { start, end }.
//   mode : 'jour' | 'mois' | 'annee' | 'plage' (l'objectif mensuel ne se compare que pour un mois ou une année).
export function calculerRapport(d, { ids = TOUS_LES_SECTEURS, mode = 'mois', bornes }) {
  const lignesRecettes = construireLignes({
    facturesAgro: d.facturesAgro, facturesLogistique: d.facturesLogistique, facturesEvenementiel: d.facturesEvenementiel, facturesGym: d.facturesGym,
    versementsRoutes: versementsClientVersSecteurs(d.versements, d.projets), projets: d.projets, revenusManuels: d.revenusManuels
  })
  const depenses = [...d.depenses.filter((x) => !x.projetId), ...coutsMatieresBriqueterie(d.inventairesBriq), ...depensesProjetVersSecteurs(d.depensesProjet, d.projets, [])]
  const entrees = { lignesRecettes, paiementsGarderie: d.paiementsGarderie, transports: d.transports, depenses }
  const quotas = {}
  d.objectifs.forEach((o) => { const n = montant(o.montant); if (n > 0) quotas[o.id] = n })

  const calc = (b) => recapPoles({ jour: b.end, debut: b.start, ...entrees })
  const actuel = calc(bornes)
  const precB = periodePrecedente(bornes)
  const prec = calc(precB)
  const precParId = Object.fromEntries(prec.rows.map((r) => [r.id, r]))
  // Cumul total : tout ce que le secteur a encaissé et dépensé depuis le début, jusqu'à la fin de la période choisie.
  const cumul = calc({ start: ORIGINE, end: bornes.end })
  const cumulParId = Object.fromEntries(cumul.rows.map((r) => [r.id, r]))

  const secteurs = SECTEURS_RAPPORT.filter((s) => ids.includes(s.id)).map((s) => {
    const ligne = actuel.rows.find((r) => r.id === s.id) || { rm: 0, dm: 0, details: [] }
    const cible = mode === 'mois' || mode === 'annee' ? cibleQuota(quotas[s.id], mode) : 0
    const recettes = ligne.rm, depensesS = ligne.dm
    const pct = avancement(recettes, cible)
    const operations = [...ligne.details].sort((a, b) => (a.date === b.date ? (a.sens === 'recette' ? -1 : 1) : a.date < b.date ? -1 : 1))
    return {
      ...s, recettes, depenses: depensesS, benefice: recettes - depensesS, nbOperations: operations.length,
      cumulRecettes: cumulParId[s.id]?.rm || 0, cumulDepenses: cumulParId[s.id]?.dm || 0, cumulBenefice: (cumulParId[s.id]?.rm || 0) - (cumulParId[s.id]?.dm || 0),
      recettesPrecedentes: precParId[s.id]?.rm || 0, cible, pct, etat: etatAvancement(pct), operations,
      activite: activite(s, d, bornes)
    }
  })

  const somme = (cle) => secteurs.reduce((t, s) => t + s[cle], 0)
  const total = { recettes: somme('recettes'), depenses: somme('depenses'), benefice: somme('benefice'), cible: somme('cible'), recettesPrecedentes: somme('recettesPrecedentes'), nbOperations: somme('nbOperations') }
  total.cumulRecettes = somme('cumulRecettes'); total.cumulDepenses = somme('cumulDepenses'); total.cumulBenefice = somme('cumulBenefice')
  total.pct = avancement(total.recettes, total.cible)
  total.croissance = total.recettesPrecedentes > 0 ? ((total.recettes - total.recettesPrecedentes) / total.recettesPrecedentes) * 100 : null

  // Une ligne par jour de la période, tous secteurs choisis confondus (courbe du tableau de bord).
  const parJour = new Map()
  secteurs.forEach((s) => s.operations.forEach((o) => {
    const x = parJour.get(o.date) || { date: o.date, recettes: 0, depenses: 0 }
    if (o.sens === 'recette') x.recettes += o.montant; else x.depenses += o.montant
    parJour.set(o.date, x)
  }))
  const jours = [...parJour.values()].sort((a, b) => (a.date < b.date ? -1 : 1))

  // Situation générale : TOUS les secteurs (quels que soient ceux choisis pour le détail), période et cumul total côte à côte.
  const lignesSituation = SECTEURS_RAPPORT.map((s) => {
    const p = actuel.rows.find((r) => r.id === s.id) || { rm: 0, dm: 0 }
    const c = cumulParId[s.id] || { rm: 0, dm: 0 }
    return { id: s.id, label: s.label, couleur: s.couleur, recettes: p.rm, depenses: p.dm, benefice: p.rm - p.dm, cumulRecettes: c.rm, cumulDepenses: c.dm, cumulBenefice: c.rm - c.dm }
  })
  const sommeS = (cle) => lignesSituation.reduce((t, l) => t + l[cle], 0)
  const situation = {
    secteurs: lignesSituation,
    total: { recettes: sommeS('recettes'), depenses: sommeS('depenses'), benefice: sommeS('benefice'), cumulRecettes: sommeS('cumulRecettes'), cumulDepenses: sommeS('cumulDepenses'), cumulBenefice: sommeS('cumulBenefice') }
  }
  return { secteurs, total, situation, jours, bornes, precedente: precB }
}

// « Novembre 2026 », « Année 2026 », « 19/11/2026 » ou « Du 01/11/2026 au 19/11/2026 ».
export function libellePeriode(mode, bornes) {
  const court = (j) => j.split('-').reverse().join('/')
  if (mode === 'jour' || bornes.start === bornes.end) return court(bornes.end)
  if (mode === 'mois') { const m = MOIS_LABELS[Number(bornes.start.slice(5, 7)) - 1]; return `${m} ${bornes.start.slice(0, 4)}` }
  if (mode === 'annee') return `Année ${bornes.start.slice(0, 4)}`
  return `Du ${court(bornes.start)} au ${court(bornes.end)}`
}

export { bornesPeriode, todayStr }

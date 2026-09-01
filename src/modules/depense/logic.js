// Calculs budget / dépenses par secteur et par mois.
import { SECTEURS, LOGISTIQUE_SITES, natureFluxDefaut } from './data'
import { METIERS_PRESTATAIRE } from '../projet/prestataire'

// MAXI LOGISTIQUE a un budget alloué distinct par site (Lomé/Kara) — seul secteur
// scindé ainsi côté E-DÉPENSES (cf. LOGISTIQUE_SITES). Un enregistrement (dépense,
// budget, apport PAU, revenu manuel/versement) sans `site` est antérieur à ce
// découpage : il appartient à KARA (décision explicite du 12/08/2026, l'essentiel de
// cet historique concernant Kara) — à l'INVERSE de la convention opérationnelle du
// module Logistique (factures, prestations… cf. `matchSite` dans
// src/modules/logistique/site/useSite.jsx), qui rattache SON legacy à Lomé. Les deux
// conventions coexistent volontairement : elles couvrent des historiques différents.
export const siteLogistiqueDe = (row) => row?.site || 'kara'

// MAXI BAT est un cas particulier : ses dépenses de chantier (tâches, prestataires…)
// sont gérées depuis E-G.Pro (`projet_depenses`, volet BTP) et n'apparaissent jamais
// dans E-DÉPENSES. Mais MAXI BAT reste un secteur sélectionnable dans les formulaires
// E-DÉPENSES eux-mêmes (Ajouter une dépense…) — une dépense BAT saisie DIRECTEMENT là
// doit, elle, y rester visible. `origineSaisie: 'e_depenses'` (posé par
// soumettreNouvelleDepense, seul circuit de création E-DÉPENSES) distingue les deux :
// à utiliser partout où l'on filtre la liste des dépenses pour un écran E-DÉPENSES.
export function visibleDansEDepenses(d) {
  return d.secteurId !== 'bat' || d.origineSaisie === 'e_depenses'
}

// Libellé d'affichage d'un secteur, avec le site en suffixe pour Logistique
// (ex. « MAXI LOGISTIQUE — Kara ») — résout aussi le site des documents hérités sans
// `site` (cf. siteLogistiqueDe), pour que l'affichage reste cohérent avec le filtrage.
// `d` = document portant `secteurId`/`site`.
export function libelleSecteurSite(secteur, d) {
  if (d?.secteurId === 'logistique') {
    const site = siteLogistiqueDe(d)
    const s = LOGISTIQUE_SITES.find((x) => x.id === site)
    return `${secteur?.label || d.secteurId} — ${s?.label || site}`
  }
  return secteur?.label || d?.secteurId
}

// Liste des « lignes » budget/dépense affichées dans E-DÉPENSES — un secteur = une
// ligne, SAUF MAXI LOGISTIQUE qui en fait deux (une par site). `excluBat` retire MAXI
// BAT (suivi exclusivement depuis le volet BTP d'E-G.Pro, pas la vue standalone).
export function secteursEtSites(excluBat = true) {
  return SECTEURS
    .filter((s) => !excluBat || s.id !== 'bat')
    .flatMap((s) => {
      if (s.id === 'logistique') {
        return LOGISTIQUE_SITES.map(({ id: site, label: siteLbl }) => ({
          ...s, id: `logistique__${site}`, secteurId: 'logistique', site, label: `${s.label} — ${siteLbl}`
        }))
      }
      return [{ ...s, secteurId: s.id, site: null }]
    })
}

// Correspondance type de projet (E-G.Pro) → secteur (E-DÉPENSES) : permet de ranger
// automatiquement chaque dépense de chantier dans le secteur qu'elle concerne réellement,
// plutôt que de tout regrouper sous "MAXI BAT".
export const SECTEUR_PAR_TYPE_PROJET = {
  construction: 'bat',
  amenagement:  'bat',
  agricole:     'agro',
  elevage:      'agro',
  evenementiel: 'evenementiel',
  informatique: 'divers',
  commercial:   'divers',
  autre:        'divers'
}

// Nature de flux d'une dépense de projet : un projet CLIENT (cas majoritaire — `pourClient`
// !== false) est un chantier facturé, dont la dépense est une charge d'EXPLOITATION à mettre
// en face du revenu du client. Un projet pour l'entreprise elle-même (`pourClient === false`,
// ex. l'entreprise construit son propre actif) reste un engagement ponctuel hors fonctionnement
// courant, classé en INVESTISSEMENT. Les projets créés avant ce champ sont traités comme
// « client » par défaut (cas majoritaire — cf. Projets.jsx → openEdit).
export function natureFluxProjet(projet) {
  return projet?.pourClient === false ? 'investissement' : natureFluxDefaut
}

// ── Passerelle en lecture seule avec E-G.Pro (module Projet) ────────────────
// Les dépenses de projet (`projet_depenses`) sont saisies et gérées exclusivement
// dans E-G.Pro (tâches, tranches…) — ici on les convertit juste au format attendu
// par E-DÉPENSES, rattachées au secteur que concerne réellement le projet d'origine
// (via `SECTEUR_PAR_TYPE_PROJET`), avec tous les détails utiles (projet, tâche,
// prestataire) pour éviter la double saisie tout en restant pleinement traçable.
// Toute dépense présente dans projet_depenses a déjà été validée/enregistrée côté
// E-G.Pro : elle est donc considérée comme réellement décaissée. `projets`/`taches`
// sont optionnels — sans `projets`, le secteur retombe sur "divers".
export function depensesProjetVersSecteurs(depensesProjet = [], projets = [], taches = []) {
  return depensesProjet.map((d) => {
    const projet = projets.find((p) => p.id === d.projetId)
    const tache  = taches.find((t) => t.id === d.tacheId)
    const metier = METIERS_PRESTATAIRE.find((m) => m.id === d.prestataireMetier)?.label || d.prestataireMetier || ''
    return {
      id: `projet_${d.id}`,
      // Secteur explicite choisi sur le projet (E-G.Pro) en priorité ; à défaut, on retombe
      // sur la correspondance type de projet → secteur, puis « divers ».
      secteurId: projet?.secteurId || SECTEUR_PAR_TYPE_PROJET[projet?.type] || 'divers',
      categorie: d.categorie || 'autre',
      montant: Number(d.montant) || 0,
      date: d.date ? new Date(d.date).toISOString().slice(0, 10) : '',
      description: [projet?.nom, tache?.titre, d.description].filter(Boolean).join(' — ') || d.description || '',
      noteOrigine: d.description || '',
      natureFlux: natureFluxProjet(projet),
      // Source de financement saisie dans E-G.Pro (apport du PAU ou fonds entreprise) :
      // transmise telle quelle pour que le suivi de l'apport du PAU (Dashboard / Analyses) la voie.
      sourceFinancement: d.sourceFinancement || 'entreprise',
      statut: 'decaissee',
      source: 'projet',
      projetId: d.projetId, projetNom: projet?.nom || '',
      tacheId: d.tacheId, tacheTitre: tache?.titre || '',
      enregistrePar: d.ajoutePar || '—',
      createdAt: d.createdAt || d.date || Date.now(),
      beneficiaireNom: d.fournisseur || '',
      beneficiaireFonction: metier,
      beneficiaireTelephone: d.prestataireTelephone || '',
      typePaiement: d.typePaiement || ''
    }
  })
}

// ── Passerelle en lecture seule avec les versements clients (E-G.Pro) ───────
// Un versement reçu d'un client (saisi dans la fiche du projet) est routé vers le secteur
// que concerne réellement le projet — même correspondance que les dépenses de projet — pour
// être compté comme un revenu réellement encaissé du secteur (cf. revenuClientSecteurMois).
export function versementsClientVersSecteurs(versementsClient = [], projets = []) {
  return versementsClient.map((v) => {
    const projet = projets.find((p) => p.id === v.projetId)
    return {
      ...v,
      secteurId: projet?.secteurId || SECTEUR_PAR_TYPE_PROJET[projet?.type] || 'divers',
      date: v.date ? new Date(v.date).toISOString().slice(0, 10) : ''
    }
  })
}

// Revenu (versements clients de projets E-G.Pro) d'un secteur sur un mois donné.
// `versementsRoutes` = résultat de versementsClientVersSecteurs (déjà rattaché à un secteur).
export function revenuClientSecteurMois(versementsRoutes, secteurId, annee, mois, site = null) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return totalDepenses(versementsRoutes.filter((v) => {
    if (v.secteurId !== secteurId) return false
    if (!(v.date || '').startsWith(prefixe)) return false
    if (secteurId === 'logistique' && site) return siteLogistiqueDe(v) === site
    return true
  }))
}

// Revenu saisi manuellement (collection `depense_revenus_manuels`) — pour les secteurs
// sans source de facturation automatique (ex. Caisse commune, MAXI BAT) : une rentrée
// d'argent ponctuelle qui ne vient ni d'une facture de module, ni d'un apport du PAU,
// ni d'un versement client E-G.Pro (ex. subvention, vente ponctuelle, remboursement reçu).
export function revenuManuelSecteurMois(revenusManuels, secteurId, annee, mois, site = null) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return totalDepenses(revenusManuels.filter((r) => {
    if (r.secteurId !== secteurId) return false
    if (!(r.date || '').startsWith(prefixe)) return false
    if (secteurId === 'logistique' && site) return siteLogistiqueDe(r) === site
    return true
  }))
}

// ── Passerelle en lecture seule avec la Briqueterie (module Événementiel) ────
// Le coût d'achat des matières premières (sable, ciment…) est saisi dans la Briqueterie
// (`evenementiel_inventaires`, champ `coutEntrees` par matière et par date). Ici on
// convertit chaque saisie journalière dont le coût est > 0 en une dépense du secteur
// BRIQUETERIE, pour éviter la double saisie tout en reflétant ces coûts réels.
export function coutsMatieresBriqueterie(inventaires = []) {
  return (inventaires || [])
    .map((inv) => ({
      inv,
      cout: Object.values(inv.matieres || {}).reduce((s, m) => s + (Number(m.coutEntrees) || 0), 0)
    }))
    .filter((x) => x.cout > 0)
    .map(({ inv, cout }) => ({
      id: `briqmat_${inv.date}`,
      secteurId: 'evenementiel',
      categorie: 'matieres',
      montant: cout,
      date: inv.date ? String(inv.date).slice(0, 10) : '',
      description: 'Achat de matières premières (Briqueterie)',
      noteOrigine: 'Coût des matières entrées ce jour — saisi dans le Stock de la Briqueterie',
      natureFlux: natureFluxDefaut,
      statut: 'decaissee',
      source: 'briqueterie',
      enregistrePar: '—'
    }))
}

// ── Passerelle en lecture seule avec les remboursements au PAU ──────────────
// Un remboursement (`depense_pau_remboursements`, saisi depuis le Dashboard) est une
// Document de budget effectif pour secteur+mois (+site pour Logistique). Résout le
// fallback historique de Kara vers l'ancien document non tagué (cf. siteLogistiqueDe) —
// Lomé, elle, n'a aucun historique et démarre donc toujours à « non défini ».
export function budgetDocSecteur(budgets, secteurId, annee, mois, site = null) {
  const matchMoisSecteur = (x) => x.secteurId === secteurId && Number(x.annee) === Number(annee) && Number(x.mois) === Number(mois)
  if (secteurId === 'logistique' && site) {
    const tague = budgets.find((x) => matchMoisSecteur(x) && x.site === site)
    if (tague) return tague
    if (site === 'kara') return budgets.find((x) => matchMoisSecteur(x) && !x.site) || null
    return null
  }
  return budgets.find((x) => matchMoisSecteur(x) && !x.site) || null
}

// Budget alloué à un secteur (+site pour Logistique) pour un mois donné (0 si non défini).
export function budgetSecteur(budgets, secteurId, annee, mois, site = null) {
  const doc = budgetDocSecteur(budgets, secteurId, annee, mois, site)
  return doc ? Number(doc.montant) || 0 : 0
}

// Une dépense compte dans le budget seulement une fois réellement décaissée
// (autorisation validée aux deux niveaux). Les entrées sans statut (anciennes
// données, avant l'ajout du circuit d'autorisation) restent comptées.
export function estDecaissee(d) {
  return !d.statut || d.statut === 'decaissee'
}

// Dépenses décaissées d'un secteur (+site pour Logistique) sur un mois donné (compte
// dans le budget).
export function depensesSecteurMois(depenses, secteurId, annee, mois, site = null) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return depenses.filter((d) => {
    if (d.secteurId !== secteurId) return false
    if (!(d.date || '').startsWith(prefixe)) return false
    if (!estDecaissee(d)) return false
    if (secteurId === 'logistique' && site) return siteLogistiqueDe(d) === site
    return true
  })
}

// Dépenses décaissées d'un secteur/mois financées par L'ENTREPRISE uniquement — les
// dépenses de projet E-G.Pro (repérables à leur `projetId`) ne remontent déjà plus
// jusqu'ici (filtrées en amont, dans chaque écran E-DÉPENSES). Les filtres ci-dessous
// restent un garde-fou pour d'éventuelles anciennes entrées historiques (apport PAU,
// remboursement PAU, ou `source: 'projet'`) qui ne doivent pas consommer le budget
// ALLOUÉ du secteur. À utiliser partout où l'on calcule « combien reste du budget
// ALLOUÉ » — pas pour un total « toutes dépenses » (rapports, rentabilité…).
//
// CAISSE COMMUNE (secteurId `divers`) — cas particulier : une dépense d'un AUTRE
// secteur peut être marquée `financePar: 'caisse_commune'` (cf. Depenses.jsx) — elle
// reste affichée sous son secteur d'origine (traçabilité, cf. depensesSecteurMois),
// mais ne consomme PLUS le budget de ce secteur (exclue ci-dessous) : c'est le budget
// de la Caisse commune qui est consommé à la place, comme si elle avait payé directement.
export function depensesEntrepriseSecteurMois(depenses, secteurId, annee, mois, site = null) {
  if (secteurId === 'divers') {
    const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
    return depenses.filter((d) => {
      if (!(d.date || '').startsWith(prefixe)) return false
      if (!estDecaissee(d)) return false
      if (d.secteurId === 'divers') return (d.sourceFinancement || 'entreprise') !== 'pau' && d.source !== 'projet' && d.source !== 'remboursement_pau'
      return d.financePar === 'caisse_commune'
    })
  }
  return depensesSecteurMois(depenses, secteurId, annee, mois, site)
    .filter((d) => (d.sourceFinancement || 'entreprise') !== 'pau')
    .filter((d) => d.source !== 'projet')
    .filter((d) => d.source !== 'remboursement_pau')
    .filter((d) => d.financePar !== 'caisse_commune')
}

// Dépenses décaissées d'un secteur/mois, hors dépenses de PROJET — pour le bilan
// « Dépenses »/« Solde » propre au secteur (écran Recettes & Dépenses). Garde-fou pour
// d'éventuelles anciennes entrées `source: 'projet'` historiques (les dépenses de
// projet E-G.Pro courantes ne remontent déjà plus jusqu'ici, cf. ci-dessus).
export function depensesHorsProjetSecteurMois(depenses, secteurId, annee, mois, site = null) {
  return depensesSecteurMois(depenses, secteurId, annee, mois, site)
    .filter((d) => d.source !== 'projet')
}

// Reste du budget alloué à un secteur (+site pour Logistique) pour le mois d'une date
// (format YYYY-MM-DD) — null si aucun budget n'est défini pour ce secteur/mois (pas de
// comparaison possible, donc pas de déclenchement d'autorisation sur ce seul critère).
export function budgetRestantSecteur(budgets, depenses, secteurId, dateStr, site = null) {
  const [annee, mois] = (dateStr || '').split('-').map(Number)
  if (!annee || !mois || !secteurId) return null
  const alloue = budgetSecteur(budgets, secteurId, annee, mois, site)
  if (alloue <= 0) return null
  return alloue - totalDepenses(depensesEntrepriseSecteurMois(depenses, secteurId, annee, mois, site))
}

// Dépenses en attente d'approbation ou approuvées (à décaisser).
export function depensesEnCircuit(depenses) {
  return depenses.filter((d) => d.statut === 'en_attente' || d.statut === 'approuvee')
}

// Somme des montants d'une liste de dépenses.
export function totalDepenses(liste) {
  return liste.reduce((s, d) => s + (Number(d.montant) || 0), 0)
}

// Statut d'un secteur selon son taux de consommation du budget (0-100+).
export function statutBudget(pct) {
  if (pct >= 100) return { key: 'depasse', label: 'Dépassé', tone: 'danger' }
  if (pct >= 80) return { key: 'attention', label: 'Attention', tone: 'warning' }
  return { key: 'ok', label: 'Dans le budget', tone: 'success' }
}

// Secteurs dont le budget est en alerte (≥80%) ou dépassé (≥100%) pour un mois donné.
// MAXI BAT (chantiers) est exclu des alertes de budget par secteur : son suivi
// vit exclusivement dans le volet BTP d'E-G.Pro, pas sur le Dashboard E-DÉPENSES.
export function secteursEnAlerte(budgets, depenses, annee, mois) {
  return secteursEtSites(true)
    .map((s) => {
      const alloue = budgetSecteur(budgets, s.secteurId, annee, mois, s.site)
      const depense = totalDepenses(depensesEntrepriseSecteurMois(depenses, s.secteurId, annee, mois, s.site))
      const pct = alloue > 0 ? Math.round((depense / alloue) * 100) : (depense > 0 ? 100 : 0)
      return { ...s, alloue, depense, pct, statut: statutBudget(pct) }
    })
    .filter((s) => s.statut.key !== 'ok')
    .sort((a, b) => b.pct - a.pct)
}

// Les n derniers mois (le plus ancien en premier), sous la forme { annee, mois, label }.
export function derniersMois(n, moisLabels) {
  const now = new Date()
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const annee = d.getFullYear()
    const mois = d.getMonth() + 1
    out.push({ annee, mois, label: `${moisLabels[mois - 1].slice(0, 4)} ${String(annee).slice(2)}` })
  }
  return out
}

// Le mois précédent une paire (année, mois) donnée.
export function moisPrecedent(annee, mois) {
  return mois === 1 ? { annee: annee - 1, mois: 12 } : { annee, mois: mois - 1 }
}

// Nature comptable d'une dépense (défaut "exploitation" pour les entrées antérieures
// à l'ajout de ce champ).
export function natureFlux(d) {
  return d.natureFlux || natureFluxDefaut
}

// Dépenses décaissées d'une nature donnée sur un mois, tous secteurs confondus.
export function depensesNatureMois(depenses, nature, annee, mois) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return depenses.filter((d) => (d.date || '').startsWith(prefixe) && estDecaissee(d) && natureFlux(d) === nature)
}

// Solde de trésorerie d'un mois : exploitation (revenus − dépenses d'exploitation),
// investissement et pertes (purs flux sortants), et le solde global qui les cumule.
export function soldesFluxMois(depenses, revenuExploitation, annee, mois) {
  const depExploitation   = totalDepenses(depensesNatureMois(depenses, 'exploitation', annee, mois))
  const depInvestissement = totalDepenses(depensesNatureMois(depenses, 'investissement', annee, mois))
  const depPerte          = totalDepenses(depensesNatureMois(depenses, 'perte', annee, mois))
  const soldeExploitation   = revenuExploitation - depExploitation
  const soldeInvestissement = -depInvestissement
  const soldePerte          = -depPerte
  return {
    revenuExploitation, depExploitation, depInvestissement, depPerte,
    soldeExploitation, soldeInvestissement, soldePerte,
    soldeGlobal: soldeExploitation + soldeInvestissement + soldePerte
  }
}

// Taux de croissance du solde global entre deux mois (null si non calculable).
export function croissance(soldeActuel, soldePrecedent) {
  if (soldePrecedent === 0) return null
  return Math.round(((soldeActuel - soldePrecedent) / Math.abs(soldePrecedent)) * 100)
}

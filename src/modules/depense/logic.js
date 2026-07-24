// Calculs budget / dépenses par secteur et par mois.
import { SECTEURS, natureFluxDefaut } from './data'
import { METIERS_PRESTATAIRE } from '../projet/prestataire'

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

// Nature de flux des dépenses de projet : toute dépense engagée dans un projet/chantier
// E-G.Pro est un engagement ponctuel (développement d'un actif ou d'une opération), pas
// une charge de fonctionnement courant. On la classe donc systématiquement en
// « Investissement » — ainsi elle n'écrase pas le solde d'EXPLOITATION, qui doit refléter
// le seul fonctionnement récurrent (revenus réels vs charges courantes). Le montant reste
// bien comptabilisé (solde d'investissement + solde global), il est juste au bon endroit.
export const NATURE_DEPENSE_PROJET = 'investissement'

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
      natureFlux: NATURE_DEPENSE_PROJET,
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

// Budget alloué à un secteur pour un mois donné (0 si non défini).
export function budgetSecteur(budgets, secteurId, annee, mois) {
  const b = budgets.find((x) =>
    x.secteurId === secteurId && Number(x.annee) === Number(annee) && Number(x.mois) === Number(mois)
  )
  return b ? Number(b.montant) || 0 : 0
}

// Une dépense compte dans le budget seulement une fois réellement décaissée
// (autorisation validée aux deux niveaux). Les entrées sans statut (anciennes
// données, avant l'ajout du circuit d'autorisation) restent comptées.
export function estDecaissee(d) {
  return !d.statut || d.statut === 'decaissee'
}

// Dépenses décaissées d'un secteur sur un mois donné (compte dans le budget).
export function depensesSecteurMois(depenses, secteurId, annee, mois) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return depenses.filter((d) => d.secteurId === secteurId && (d.date || '').startsWith(prefixe) && estDecaissee(d))
}

// Remboursements au PAU rattachés à un secteur donné, sur un mois donné. Le PAU finance
// une dépense d'un secteur précis (apport ponctuel) ; quand l'entreprise le rembourse, ce
// montant crédite le budget du secteur concerné — la dépense financée par le PAU n'entame
// plus durablement sa capacité budgétaire, puisqu'elle est restituée.
export function remboursementsSecteurMois(remboursements, secteurId, annee, mois) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return remboursements.filter((r) => r.secteurId === secteurId && (r.date || '').startsWith(prefixe))
}

// Dépense nette d'un secteur sur un mois : dépenses décaissées moins les remboursements au
// PAU rattachés à ce secteur ce même mois.
export function depenseNetteSecteurMois(depenses, remboursements, secteurId, annee, mois) {
  const brut = totalDepenses(depensesSecteurMois(depenses, secteurId, annee, mois))
  const rembourse = totalDepenses(remboursementsSecteurMois(remboursements, secteurId, annee, mois))
  return brut - rembourse
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
export function secteursEnAlerte(budgets, depenses, annee, mois, remboursements = []) {
  return SECTEURS
    .map((s) => {
      const alloue = budgetSecteur(budgets, s.id, annee, mois)
      const depense = depenseNetteSecteurMois(depenses, remboursements, s.id, annee, mois)
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

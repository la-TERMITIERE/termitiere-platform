// Agrège les revenus RÉELLEMENT réalisés dans les autres modules, par secteur et par mois.
// Lecture seule : aucune écriture croisée, on ne fait que sommer des collections existantes.

// Garderie : paiements mensuels (mois/annee) + paiements journaliers (date), montant réellement encaissé.
export function revenuGarderie(paiements, annee, mois) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return (paiements || [])
    .filter((p) => (p.type === 'journalier' ? (p.date || '').startsWith(prefixe) : Number(p.mois) === mois && Number(p.annee) === annee))
    .reduce((s, p) => s + (Number(p.montantPaye) || 0), 0)
}

// Maxi-Agro : seules les factures CERTIFIÉES constituent un chiffre d'affaires définitif.
export function revenuAgro(factures, annee, mois) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return (factures || [])
    .filter((f) => f.statut === 'certifiee' && (f.date || '').startsWith(prefixe))
    .reduce((s, f) => s + (Number(f.totalTTC) || 0), 0)
}

// Maxi Logistique / Briqueterie : toute facture de la collection est déjà émise/définitive.
export function revenuFactures(factures, annee, mois) {
  const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
  return (factures || [])
    .filter((f) => (f.date || '').startsWith(prefixe))
    .reduce((s, f) => s + (Number(f.totalTTC) || 0), 0)
}

// Secteurs pour lesquels un revenu réel est disponible ailleurs dans l'application.
export const SECTEURS_AVEC_REVENU = ['garderie', 'agro', 'logistique', 'evenementiel']

export function revenuSecteur(collections, secteurId, annee, mois) {
  const { paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel } = collections
  if (secteurId === 'garderie') return revenuGarderie(paiementsGarderie, annee, mois)
  if (secteurId === 'agro') return revenuAgro(facturesAgro, annee, mois)
  if (secteurId === 'logistique') return revenuFactures(facturesLogistique, annee, mois)
  if (secteurId === 'evenementiel') return revenuFactures(facturesEvenementiel, annee, mois)
  return 0
}

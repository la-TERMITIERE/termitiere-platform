// Logique métier MAXI-AGRO — calcul des inventaires et des sorties.
// Repris fidèlement de l'application d'origine (index.html).

// Renvoie la date d'inventaire la plus récente STRICTEMENT antérieure à `date`.
export function previousInventoryDate(inventaires, date) {
  const dates = inventaires
    .map((i) => i.date)
    .filter((d) => d && d < date)
    .sort()
  return dates.length ? dates[dates.length - 1] : null
}

// Inventaire d'une date donnée (ou null).
export const getInventaire = (inventaires, date) =>
  inventaires.find((i) => i.date === date) || null

// Somme des demandes APPROUVÉES pour un article animal à une date de sortie donnée.
// → alimente automatiquement la colonne "Sorties" de la saisie.
export function autoSorties(demandes, articleId, dateSortie) {
  return (demandes || [])
    .filter(
      (d) =>
        d.statut === 'approuve' &&
        d.typeArticle === 'animal' &&
        d.articleId === articleId &&
        d.dateSortie === dateSortie
    )
    .reduce((s, d) => s + (parseInt(d.qte) || 0), 0)
}

// EF Initial = valeur enregistrée si présente, sinon EF Final de la veille (report auto).
export function efInitial(savedData, prevInv, articleId, type = 'animaux') {
  if (savedData && savedData.init !== undefined) return savedData.init
  const prev = prevInv?.[type]?.[articleId]
  return prev ? prev.fin || 0 : 0
}

// EF Final animaux = init + naissances + entrées − sorties − décès (jamais négatif).
export const finAnimal = ({ init, naiss, ent, sor, dec }) =>
  Math.max(0, (init || 0) + (naiss || 0) + (ent || 0) - (sor || 0) - (dec || 0))

// EF Final aliments = init + entrées − sorties (jamais négatif).
export const finAliment = ({ init, ent, sor }) =>
  Math.max(0, (init || 0) + (ent || 0) - (sor || 0))

// Dernier stock connu d'un article (pour le contrôle de disponibilité des demandes).
export function dernierStock(inventaires, type, articleId) {
  const tri = [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))
  const last = tri[0]
  if (!last) return 0
  const coll = type === 'animal' ? last.animaux : last.aliments
  return coll?.[articleId]?.fin || 0
}

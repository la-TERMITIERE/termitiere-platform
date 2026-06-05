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

// ─────────── Mouvements typés (Entrées / Sorties) ───────────
// Saisie journalière simplifiée à 4 colonnes : EF Initial · Entrées · Sorties · EF Final.
// Chaque entrée et chaque sortie porte un TYPE choisi dans un menu déroulant ;
// le type « Autres » ouvre un champ libre (personne / motif personnalisé).

// Types d'ENTRÉES pour les animaux (la naissance est un cas d'entrée biologique).
// La « Mutation » n'est PAS saisie en entrée : elle est générée automatiquement
// côté espèce de destination quand on enregistre la mutation en SORTIE de l'origine.
export const ENTREE_TYPES_ANIMAL = ['Achat', 'Naissance', 'Dons', 'Autres']
// Types de SORTIES pour les animaux. La « Mutation » porte une espèce de destination.
export const SORTIE_TYPES_ANIMAL = ['Ventes', 'Décès', 'Mutation', 'Perte', 'Dons', 'Autres']
// Aliments / divers : pas de naissance ni de décès ni de mutation inter-espèces.
export const ENTREE_TYPES_ALIMENT = ['Achat', 'Dons', 'Autres']
export const SORTIE_TYPES_ALIMENT = ['Consommation', 'Ventes', 'Perte', 'Dons', 'Autres']

// Le type « Autres » exige une précision (personne / motif personnalisé).
// Le type « Décès » exige un motif (faithful à la règle d'origine).
export const labelRequis = (type) => type === 'Autres' || type === 'Décès'

// Somme des quantités d'une liste de mouvements.
export const sommeMouvements = (lignes) =>
  (lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)

// Somme des quantités d'un type précis.
const sommeType = (lignes, type) =>
  (lignes || []).filter((l) => l.type === type).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)

// Mutations = un animal qui change d'espèce/catégorie en grandissant
// (ex. agneau → bélier). On l'enregistre en SORTIE de l'espèce d'origine avec une
// espèce `cible` ; cela génère automatiquement une ENTRÉE de même quantité côté
// destination (conservation du cheptel : −1 ici, +1 là-bas).
//
// Calcule, pour chaque espèce de destination, le total des mutations ENTRANTES
// à partir de l'état complet des animaux du jour. Renvoie { destId: total }.
export function mutationsEntrantes(animState) {
  const map = {}
  Object.values(animState || {}).forEach((d) => {
    ;(d?.sorties || []).forEach((l) => {
      if (l.type === 'Mutation' && l.cible) {
        map[l.cible] = (map[l.cible] || 0) + (parseInt(l.qte) || 0)
      }
    })
  })
  return map
}

// Détail des mutations entrantes d'une espèce (libellés « depuis X »), pour
// affichage en lecture seule côté destination.
export function mutationsEntrantesDetail(animState, especes, destId) {
  const nomDe = (id) => especes.find((e) => e.id === id)?.nom || id
  const out = []
  Object.entries(animState || {}).forEach(([srcId, d]) => {
    ;(d?.sorties || []).forEach((l) => {
      if (l.type === 'Mutation' && l.cible === destId && (parseInt(l.qte) || 0) > 0) {
        out.push({ depuis: nomDe(srcId), qte: parseInt(l.qte) || 0 })
      }
    })
  })
  return out
}

// Agrège des listes de mouvements typés en champs scalaires de compatibilité
// (naiss / ent / sor / dec) + EF Final, attendus par le Dashboard et les Analyses.
//  - `ent`  = entrées HORS naissances (mutations entrantes incluses)
//  - `sor`  = sorties HORS décès
//  - `naiss`= entrées de type Naissance  - `dec` = sorties de type Décès
//  - autoSor = sorties auto issues des demandes approuvées (incluses dans le total)
//  - mutIn   = mutations entrantes (depuis d'autres espèces), comptées en entrée
export function agregerAnimal({ init = 0, entrees = [], sorties = [] }, autoSor = 0, mutIn = 0) {
  const totalEnt = sommeMouvements(entrees) + (mutIn || 0)
  const naiss = sommeType(entrees, 'Naissance')
  const decManuel = sommeType(sorties, 'Décès')
  const totalSorManuel = sommeMouvements(sorties) // inclut les mutations sortantes
  const totalSor = totalSorManuel + (autoSor || 0)
  const ent = totalEnt - naiss
  const sor = totalSor - decManuel // les sorties auto sont des ventes (jamais des décès)
  const fin = Math.max(0, init + totalEnt - totalSor)
  const decMotif = (sorties || [])
    .filter((l) => l.type === 'Décès' && (l.label || '').trim())
    .map((l) => l.label.trim())
    .join(' ; ')
  return { init, naiss, ent, sor, dec: decManuel, fin, decMotif, mutIn: mutIn || 0 }
}

// Agrégation aliments (pas de naissance / décès).
export function agregerAliment({ init = 0, entrees = [], sorties = [] }) {
  const ent = sommeMouvements(entrees)
  const sor = sommeMouvements(sorties)
  return { init, ent, sor, fin: Math.max(0, init + ent - sor) }
}

// Reconstruit des listes de mouvements typés à partir d'une saisie déjà enregistrée.
// Gère les anciennes saisies (champs scalaires naiss/ent/sor/dec sans listes typées).
export function mouvementsDepuisSaisie(saved, kind = 'animaux') {
  if (saved?.entrees || saved?.sorties) {
    return { entrees: saved.entrees || [], sorties: saved.sorties || [] }
  }
  if (!saved) return { entrees: [], sorties: [] }
  const entrees = []
  const sorties = []
  if (kind === 'animaux') {
    if (saved.naiss) entrees.push({ type: 'Naissance', qte: saved.naiss, label: '' })
    if (saved.ent) entrees.push({ type: 'Achat', qte: saved.ent, label: '' })
    if (saved.dec) sorties.push({ type: 'Décès', qte: saved.dec, label: saved.decMotif || '' })
    // saved.sor inclut les sorties auto (demandes) → on ne les recrée pas en manuel.
  } else {
    if (saved.ent) entrees.push({ type: 'Achat', qte: saved.ent, label: '' })
    if (saved.sor) sorties.push({ type: 'Consommation', qte: saved.sor, label: '' })
  }
  return { entrees, sorties }
}

// Dernier stock connu d'un article (pour le contrôle de disponibilité des demandes).
export function dernierStock(inventaires, type, articleId) {
  const tri = [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))
  const last = tri[0]
  if (!last) return 0
  const coll = type === 'animal' ? last.animaux : last.aliments
  return coll?.[articleId]?.fin || 0
}

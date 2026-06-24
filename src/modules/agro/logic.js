// Logique métier MAXI-AGRO — calcul des inventaires et des sorties.
// Repris fidèlement de l'application d'origine (index.html).
import { estCertifie } from '../../shared/workflow'

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

// Somme des demandes APPROUVÉES pour un article à une date de sortie donnée.
// → alimente automatiquement la colonne "Sorties" de la saisie.
// `type` = 'animal' (défaut) ou 'aliment' : toute sortie sur demande compte.
export function autoSorties(demandes, articleId, dateSortie, type = 'animal') {
  return (demandes || [])
    .filter(
      (d) =>
        estCertifie(d.statut) &&
        d.typeArticle === type &&
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
// Saisie directe : Ventes et Dons passent par le workflow « Demande » (approbation).
export const SORTIE_TYPES_SAISIE_ANIMAL = SORTIE_TYPES_ANIMAL.filter((t) => !['Ventes', 'Dons'].includes(t))
// Aliments / divers : pas de naissance ni de décès ni de mutation inter-espèces.
export const ENTREE_TYPES_ALIMENT = ['Achat', 'Dons', 'Autres']
export const SORTIE_TYPES_ALIMENT = ['Consommation', 'Ventes', 'Perte', 'Dons', 'Autres']
export const SORTIE_TYPES_SAISIE_ALIMENT = SORTIE_TYPES_ALIMENT.filter((t) => !['Ventes', 'Dons'].includes(t))

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
// autoSor = sorties auto issues des demandes approuvées (incluses dans le total).
export function agregerAliment({ init = 0, entrees = [], sorties = [] }, autoSor = 0) {
  const ent = sommeMouvements(entrees)
  const sor = sommeMouvements(sorties) + (autoSor || 0)
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

// Totaux entrées / sorties d'une catégorie animale pour un inventaire donné.
export function mouvementsCategorie(inv, especes, cat) {
  let entrees = 0
  let sorties = 0
  if (!inv) return { entrees, sorties }
  especes.filter((e) => e.cat === cat).forEach((e) => {
    const a = inv.animaux?.[e.id]
    if (!a) return
    entrees += (a.ent || 0) + (a.naiss || 0)
    sorties += (a.sor || 0) + (a.dec || 0)
  })
  return { entrees, sorties }
}

// Agrège achats (entrées type Achat) et ventes (sorties type Ventes + demandes approuvées)
// sur une période, avec le détail ligne par ligne pour les modales d'analyse.
export function agregerAchatsVentes(invPeriode, especes, aliments) {
  const achats = []
  const ventes = []

  invPeriode.forEach((inv) => {
    especes.forEach((e) => {
      const d = inv.animaux?.[e.id]
      if (!d) return
      const { entrees, sorties } = mouvementsDepuisSaisie(d, 'animaux')
      entrees.filter((l) => l.type === 'Achat' && (parseInt(l.qte) || 0) > 0).forEach((l) => {
        achats.push({ date: inv.date, article: e.nom, cat: e.cat, kind: 'animal', qte: parseInt(l.qte) || 0, label: l.label || '' })
      })
      sorties.filter((l) => l.type === 'Ventes' && (parseInt(l.qte) || 0) > 0).forEach((l) => {
        ventes.push({ date: inv.date, article: e.nom, cat: e.cat, kind: 'animal', qte: parseInt(l.qte) || 0, label: l.label || '', source: 'saisie' })
      })
      if ((d.autoSor || 0) > 0) {
        ventes.push({ date: inv.date, article: e.nom, cat: e.cat, kind: 'animal', qte: d.autoSor, label: 'Demande approuvée', source: 'demande' })
      }
    })
    aliments.forEach((a) => {
      const d = inv.aliments?.[a.id]
      if (!d) return
      const { entrees, sorties } = mouvementsDepuisSaisie(d, 'aliments')
      entrees.filter((l) => l.type === 'Achat' && (parseInt(l.qte) || 0) > 0).forEach((l) => {
        achats.push({ date: inv.date, article: a.nom, cat: a.cat, kind: 'aliment', qte: parseInt(l.qte) || 0, label: l.label || '' })
      })
      sorties.filter((l) => l.type === 'Ventes' && (parseInt(l.qte) || 0) > 0).forEach((l) => {
        ventes.push({ date: inv.date, article: a.nom, cat: a.cat, kind: 'aliment', qte: parseInt(l.qte) || 0, label: l.label || '', source: 'saisie' })
      })
    })
  })

  const totalAchats = achats.reduce((s, l) => s + l.qte, 0)
  const totalVentes = ventes.reduce((s, l) => s + l.qte, 0)
  return { achats, ventes, totalAchats, totalVentes }
}

// Entrées saisies (toutes : Achat / Naissance / Dons / Autres) non encore présentes
// dans l'inventaire précédent — pour notifier les responsables qu'« une entrée a eu lieu ».
export function nouvellesEntreesNotifiable(especes, aliments, anim, alim, prevInv) {
  const lignes = []
  const check = (coll, src, kind) => {
    coll.forEach((a) => {
      const cur = src[a.id]?.entrees || []
      const prev = prevInv?.[kind]?.[a.id]?.entrees || []
      cur.forEach((l) => {
        if (!(parseInt(l.qte) || 0)) return
        const sig = (x) => `${x.type}|${x.qte}|${x.label || ''}`
        if (prev.some((p) => sig(p) === sig(l))) return
        lignes.push({ article: a.nom, type: l.type, qte: parseInt(l.qte) || 0, motif: (l.label || '').trim() })
      })
    })
  }
  check(especes, anim, 'animaux')
  check(aliments, alim, 'aliments')
  return lignes
}

// Historique plat de tous les mouvements (entrées / sorties) sur une période,
// pour la page Historique : { date, kind, article, cat, sens, type, qte, motif, agent }.
export function historiqueMouvements(invPeriode, especes, aliments) {
  const out = []
  const nomCible = (id) => especes.find((e) => e.id === id)?.nom || id
  const parcourir = (coll, kind) => {
    invPeriode.forEach((inv) => {
      coll.forEach((a) => {
        const d = inv[kind]?.[a.id]
        if (!d) return
        const { entrees, sorties } = mouvementsDepuisSaisie(d, kind)
        entrees.forEach((l) => {
          if (!(parseInt(l.qte) || 0)) return
          out.push({ date: inv.date, kind, article: a.nom, cat: a.cat, sens: 'entree', type: l.type, qte: parseInt(l.qte) || 0, motif: (l.label || '').trim(), agent: l.agentNom || inv.agentNom || '—' })
        })
        sorties.forEach((l) => {
          if (!(parseInt(l.qte) || 0)) return
          const motif = l.type === 'Mutation' && l.cible ? `→ ${nomCible(l.cible)}` : (l.label || '').trim()
          out.push({ date: inv.date, kind, article: a.nom, cat: a.cat, sens: 'sortie', type: l.type, qte: parseInt(l.qte) || 0, motif, agent: l.agentNom || inv.agentNom || '—' })
        })
        // Sorties automatiques (demandes certifiées) comptées comme Ventes.
        if ((d.autoSor || 0) > 0) {
          out.push({ date: inv.date, kind, article: a.nom, cat: a.cat, sens: 'sortie', type: 'Ventes', qte: d.autoSor, motif: 'Demande certifiée', agent: inv.agentNom || '—' })
        }
      })
    })
  }
  parcourir(especes, 'animaux')
  parcourir(aliments, 'aliments')
  return out.sort((a, b) => (a.date < b.date ? 1 : -1))
}

// Sorties saisies directement (hors Ventes/Dons) non encore présentes dans l'inventaire précédent.
export function nouvellesSortiesNotifiable(especes, aliments, anim, alim, prevInv) {
  const lignes = []
  const nomCible = (especes, id) => especes.find((e) => e.id === id)?.nom || id

  const check = (coll, src, kind) => {
    coll.forEach((a) => {
      const cur = src[a.id]?.sorties || []
      const prev = prevInv?.[kind]?.[a.id]?.sorties || []
      cur.forEach((l) => {
        if (!(parseInt(l.qte) || 0) || ['Ventes', 'Dons'].includes(l.type)) return
        const sig = (x) => `${x.type}|${x.qte}|${x.label || ''}|${x.cible || ''}`
        if (prev.some((p) => sig(p) === sig(l))) return
        const motif = l.type === 'Mutation' && l.cible
          ? `→ ${nomCible(especes, l.cible)}`
          : (l.label || '').trim()
        lignes.push({ article: a.nom, type: l.type, qte: parseInt(l.qte) || 0, motif })
      })
    })
  }
  check(especes, anim, 'animaux')
  check(aliments, alim, 'aliments')
  return lignes
}

// Une ligne de mouvement n'est modifiable que par son auteur (agentId).
export function peutModifierLigne(ligne, userId) {
  if (!ligne?.agentId) return true
  return ligne.agentId === userId
}

// Fusionne les mouvements : conserve ceux des autres agents, remplace les siens.
export function mergeMouvementsUtilisateur(_prev, next, userId, userNom) {
  const autres = (next || []).filter((l) => l.agentId && l.agentId !== userId)
  const miennes = (next || [])
    .filter((l) => !l.agentId || l.agentId === userId)
    .map((l) => ({ ...l, agentId: userId, agentNom: userNom }))
  return [...autres, ...miennes]
}

// Attribue l'auteur aux lignes sans agentId (anciennes saisies ou nouvelles).
export function annoterLignesAgent(lignes, userId, userNom) {
  return (lignes || []).map((l) =>
    l.agentId ? l : { ...l, agentId: userId, agentNom: userNom }
  )
}

// Prévision statistique LÉGÈRE (pas de ML lourd, tourne dans le navigateur) :
// combine une TENDANCE linéaire (régression des moindres carrés sur la série) et
// une MOYENNE MOBILE récente (lisse le bruit), puis projette `horizon` points.
// Renvoie un tableau de valeurs prévues (jamais négatives). Sert au taux de morbidité
// et peut servir à d'autres séries (effectif, ventes…).
export function previsionSerie(values, horizon = 7) {
  const ys = (values || []).map((v) => Number(v) || 0)
  const n = ys.length
  if (n === 0) return []
  if (n === 1) return new Array(horizon).fill(Math.max(0, ys[0]))
  // Régression linéaire y = a + b·x sur les indices 0..n-1.
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  ys.forEach((y, x) => { sx += x; sy += y; sxy += x * y; sxx += x * x })
  const denom = n * sxx - sx * sx
  const b = denom !== 0 ? (n * sxy - sx * sy) / denom : 0
  const a = (sy - b * sx) / n
  // Moyenne mobile des 3 derniers points (ancrage prudent).
  const k = Math.min(3, n)
  const ma = ys.slice(n - k).reduce((s, y) => s + y, 0) / k
  const out = []
  for (let h = 1; h <= horizon; h++) {
    const x = n - 1 + h
    const lin = a + b * x
    // Mélange tendance (60 %) + moyenne mobile (40 %) : projection mesurée.
    out.push(Math.max(0, 0.6 * lin + 0.4 * ma))
  }
  return out
}

// Dernier stock connu d'un article (pour le contrôle de disponibilité des demandes).
export function dernierStock(inventaires, type, articleId) {
  const tri = [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))
  const last = tri[0]
  if (!last) return 0
  const coll = type === 'animal' ? last.animaux : last.aliments
  return coll?.[articleId]?.fin || 0
}

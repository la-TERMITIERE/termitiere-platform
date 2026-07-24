// Demande de CORRECTIF sur une autorisation de sortie DÉJÀ CERTIFIÉE.
//
// Une autorisation certifiée n'est plus supprimable : les quantités sont sorties
// du stock et la facture compte dans le chiffre d'affaires. En cas d'erreur de
// saisie (l'agent voulait 12 briques creuses, il en a saisi 10), l'auteur
// « relance » sa demande avec les quantités corrigées :
//
//   certifiée ── Relancer ──▶ correctif « demande » ──▶ la hiérarchie tranche
//                                   ├─ appliqué : les anciennes quantités
//                                   │             RENTRENT au stock, les
//                                   │             nouvelles en RESSORTENT
//                                   └─ refusé   : la demande reste inchangée
//
// Le statut de la demande RESTE `certifie` pendant tout le cycle : le stock ne
// doit pas se dénouer tant que le correctif n'est pas tranché. L'état du
// correctif vit dans le sous-objet `correctif` de la demande.

export const CORRECTIF_STATUTS = {
  demande:  { label: '🔄 Correctif demandé', short: 'Correctifs', tone: 'warning' },
  applique: { label: '🔄 Corrigée',          short: 'Corrigées',  tone: 'info' },
  refuse:   { label: '🔄 Correctif refusé',  short: 'Refusés',    tone: 'danger' }
}

export const correctifEnCours   = (d) => d?.correctif?.statut === 'demande'
export const correctifApplique  = (d) => d?.correctif?.statut === 'applique'

// L'auteur d'une autorisation certifiée (ou un approbateur) peut la relancer,
// sauf si un correctif est déjà en cours d'examen.
export function peutRelancer(d, { estCertifiee = false, isAuteur = false, canManage = false } = {}) {
  return estCertifiee && !correctifEnCours(d) && (isAuteur || canManage)
}

// Écarts ligne à ligne entre quantités certifiées et quantités corrigées.
//   `key` identifie l'article (briqueId · materielId · articleId…)
//   `nom` porte son libellé (briqueNom · materielNom · article…)
// delta > 0 → il faut sortir DAVANTAGE du stock · delta < 0 → on rend au stock.
export function deltasLignes(avant = [], apres = [], { key = 'id', nom = 'nom' } = {}) {
  const map = new Map()
  const cumuler = (lignes, champ) => {
    ;(lignes || []).forEach((l) => {
      const id = l?.[key]
      if (!id) return
      const cur = map.get(id) || { id, nom: l[nom] || '', avant: 0, apres: 0, ligne: l }
      cur[champ] += parseInt(l.qte) || 0
      if (champ === 'apres') { cur.ligne = l; cur.nom = l[nom] || cur.nom }
      map.set(id, cur)
    })
  }
  cumuler(avant, 'avant')
  cumuler(apres, 'apres')
  return [...map.values()].map((x) => ({ ...x, delta: x.apres - x.avant }))
}

// Un correctif sans aucun écart de quantité n'a pas lieu d'être.
export const aDesEcarts = (deltas) => deltas.some((d) => d.delta !== 0)

// Copie éditable des lignes certifiées, pour le formulaire de relance.
export const lignesEditables = (lignes = []) => (lignes || []).map((l) => ({ ...l, qte: parseInt(l.qte) || 0 }))

export const sommeQte = (lignes = []) => (lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)

// Applique un correctif — ARTICLE et quantité — à une liste « miroir » : la
// vente, la facture ou la prestation qui reflètent la demande. L'alignement se
// fait par POSITION (l'article ayant pu changer, la clé ne suffit plus) : à
// l'indice i, la ligne cible qui portait bien l'ancien article reçoit le nouvel
// article et la nouvelle quantité.
//   `key`      : champ identifiant sur les lignes de la demande
//   `keyCible` : idem sur les lignes de la cible (nommage souvent différent)
//   `mapper`   : (ligneCorrigee, ligneCible) → champs à écrire sur la cible,
//                chaque module ayant sa propre tarification.
// Une ligne corrigée vise la position `_idx` quand elle en porte une (cas où
// l'écran n'a présenté qu'une partie des lignes), sinon son propre rang.
const position = (ligne, rang) => (ligne?._idx ?? rang)

export function appliquerCorrectif(cibles = [], { avant = [], apres = [], key = 'id', keyCible = key, mapper }) {
  if (!mapper) return cibles || []
  const parPosition = new Map()
  ;(apres || []).forEach((c, i) => parPosition.set(position(c, i), c))
  return (cibles || []).map((l, i) => {
    const c = parPosition.get(i)
    if (!c) return l
    const a = avant[i]
    const attendu = a ? a[key] : c[key]
    if (l[keyCible] !== attendu) return l
    const { _idx, ...champs } = mapper(c, l)
    return { ...l, ...champs }
  })
}

// Lignes dont l'ARTICLE lui-même a été remplacé — pour l'afficher à la hiérarchie.
export function changementsArticle(avant = [], apres = [], { key = 'id', nom = 'nom' } = {}) {
  return (apres || []).reduce((acc, c, i) => {
    const a = avant[position(c, i)]
    if (a && c && a[key] !== c[key]) acc.push({ deNom: a[nom] || a[key], versNom: c[nom] || c[key], qte: parseInt(c.qte) || 0 })
    return acc
  }, [])
}

// Sous-objet à écrire sur la demande lors de la relance.
export const payloadDemandeCorrectif = ({ lignes, lignesAvant, motif, user, horodate }) => ({
  statut: 'demande',
  lignes,
  lignesAvant,
  motif: (motif || '').trim(),
  par: user?.login || '',
  parNom: user?.nom || '',
  le: horodate
})

// Sous-objet à écrire lorsque la hiérarchie tranche.
export const payloadDecisionCorrectif = (correctif, { accepte, user, horodate, commentaire = '' }) => ({
  ...correctif,
  statut: accepte ? 'applique' : 'refuse',
  traitePar: user?.nom || '',
  traiteLe: horodate,
  commentaireDecision: (commentaire || '').trim()
})

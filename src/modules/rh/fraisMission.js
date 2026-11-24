// RH : frais d'une mission calculés d'après le barème (Paramètres, Configuration des missions).
// Un barème = un type de frais (repas, hébergement, transport…) avec une indemnité PAR JOUR et un plafond de remboursement pour TOUTE la mission.
//  - montant proposé = indemnité par jour × nombre de jours de la mission (modifiable à la main) ;
//  - montant remboursable = le montant, sans jamais dépasser le plafond du type de frais (0 = pas de plafond) ;
//  - la différence est le dépassement, à la charge de l'employé.
const n = (v) => Number(v) || 0

// Montant proposé pour un type de frais : indemnité journalière × durée.
export const montantAuto = (bareme, jours) => n(bareme?.indemniteJour) * Math.max(0, n(jours))

// `frais` : { [idBareme]: { actif, montant, auto } } ; `autres` : frais hors barème (sans plafond).
// Renvoie { lignes: [{ typeId, typeNom, indemniteJour, plafond, montant, remboursable, depassement }], autres, total, depassement }.
export function calculerFrais({ baremes = [], frais = {}, autres = '' }) {
  const lignes = baremes.filter((b) => frais[b.id]?.actif).map((b) => {
    const montant = Math.max(0, n(frais[b.id].montant))
    const plafond = n(b.plafond)
    const remboursable = plafond > 0 ? Math.min(montant, plafond) : montant
    return { typeId: b.id, typeNom: b.typeFrais || '', indemniteJour: n(b.indemniteJour), plafond, montant, remboursable, depassement: montant - remboursable }
  })
  const autresMontant = Math.max(0, n(autres))
  return {
    lignes, autres: autresMontant,
    total: lignes.reduce((s, l) => s + l.remboursable, 0) + autresMontant,
    depassement: lignes.reduce((s, l) => s + l.depassement, 0)
  }
}

// Quand la durée change, les montants restés « automatiques » (jamais modifiés à la main) suivent la nouvelle durée.
export function recalculerAuto(baremes, frais = {}, jours) {
  const out = { ...frais }
  baremes.forEach((b) => {
    const l = out[b.id]
    if (l?.actif && l.auto) out[b.id] = { ...l, montant: String(montantAuto(b, jours) || '') }
  })
  return out
}

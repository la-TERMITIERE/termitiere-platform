// Logique VOYAGES & ACHATS — conversion de devises et sélection du meilleur fournisseur.

// Convertit un prix exprimé dans une devise vers le FCFA, avec un taux fourni
// (1 unité de devise = `taux` FCFA). Renvoie 0 si le prix ou le taux est absent.
export const enFCFA = (prix, taux) => (parseFloat(prix) || 0) * (parseFloat(taux) || 0)

// Meilleur fournisseur d'un article = celui dont le prix unitaire CONVERTI EN FCFA
// est le plus BAS (on compare dans une devise commune, sinon la comparaison serait
// faussée). `tauxDe(code)` renvoie le taux FCFA de la devise. Ignore les prix ≤ 0.
export function meilleurFournisseur(fournisseurs, tauxDe) {
  let best = null
  ;(fournisseurs || []).forEach((f, i) => {
    const fcfa = enFCFA(f.prixUnitaire, tauxDe(f.devise))
    if (fcfa > 0 && (best === null || fcfa < best.fcfa)) best = { index: i, id: f.id, fcfa, fournisseur: f }
  })
  return best
}

// Économie réalisée en choisissant le meilleur fournisseur plutôt que le plus cher
// (pour la même quantité) — met en valeur l'intérêt du voyage.
export function economieArticle(article, tauxDe) {
  const prixFCFA = (article.fournisseurs || [])
    .map((f) => enFCFA(f.prixUnitaire, tauxDe(f.devise)))
    .filter((v) => v > 0)
  if (prixFCFA.length < 2) return 0
  const qte = parseInt(article.quantite) || 1
  return (Math.max(...prixFCFA) - Math.min(...prixFCFA)) * qte
}

// Récupération EN DIRECT des taux de change (best-effort, sans clé API).
// Base USD (toujours disponible) → taux croisés : 1 CUR = rates[XOF] / rates[CUR] FCFA.
// Renvoie { CODE: tauxFCFA } ou null en cas d'échec (hors ligne, service injoignable).
export async function fetchTauxFCFA(codes = []) {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) return null
    const data = await res.json()
    const rates = data?.rates
    const xof = rates?.XOF
    if (!rates || !xof) return null
    const out = {}
    ;(codes.length ? codes : Object.keys(rates)).forEach((code) => {
      if (code === 'XOF') { out.XOF = 1; return }
      const r = rates[code]
      if (r) out[code] = xof / r // combien de FCFA vaut 1 unité de `code`
    })
    return out
  } catch {
    return null
  }
}

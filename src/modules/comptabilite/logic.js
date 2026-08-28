// Moteur comptable — partie double SYSCOHADA.
//
// Une écriture (pièce) = { id, date, journal, libelle, piece, statut, lignes[] }.
// Chaque ligne = { compte, libelle?, debit, credit } (l'un des deux à 0).
// Invariant fondamental : pour toute écriture VALIDÉE, Σ débits = Σ crédits.

import {
  PLAN_COMPTABLE_DEFAUT, CLASSES, classeDe, getClasse, CATEGORIES_IMMO,
  COMPTE_TVA_COLLECTEE, COMPTE_TVA_DEDUCTIBLE, TYPES_COMPTE
} from './data'

// ── Plan comptable effectif ───────────────────────────────────────────────────
// Fusionne le plan par défaut avec les comptes personnalisés (Firebase). Un compte
// personnalisé portant le même numéro qu'un compte par défaut le remplace (libellé).
export function planEffectif(comptesPersonnalises = []) {
  const map = new Map()
  PLAN_COMPTABLE_DEFAUT.forEach((c) => map.set(c.num, { ...c, source: 'defaut' }))
  comptesPersonnalises.forEach((c) => {
    if (!c.num) return
    const existant = map.get(String(c.num))
    map.set(String(c.num), {
      num: String(c.num),
      label: c.label || existant?.label || '',
      type: c.type || existant?.type || 'ASSET',
      source: 'perso', id: c.id
    })
  })
  return [...map.values()].sort((a, b) => a.num.localeCompare(b.num))
}

export function libelleCompte(plan, num) {
  const c = plan.find((x) => x.num === String(num))
  return c ? `${c.num} — ${c.label}` : String(num || '')
}

// ── Équilibre d'une écriture ──────────────────────────────────────────────────
export const totalDebit = (lignes = []) => lignes.reduce((s, l) => s + (Number(l.debit) || 0), 0)
export const totalCredit = (lignes = []) => lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0)

export function ecritureEquilibree(lignes = []) {
  const d = totalDebit(lignes)
  const c = totalCredit(lignes)
  // Tolérance 0.5 pour absorber d'éventuels arrondis (montants entiers en FCFA).
  return d > 0 && Math.abs(d - c) < 0.5
}

// Valide une écriture avant enregistrement. Renvoie { ok, erreurs[] }.
export function validerEcriture(ec) {
  const erreurs = []
  const lignes = (ec.lignes || []).filter((l) => l.compte && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0))
  if (!ec.date) erreurs.push('La date est obligatoire.')
  if (!ec.journal) erreurs.push('Le journal est obligatoire.')
  if (lignes.length < 2) erreurs.push('Une écriture doit comporter au moins 2 lignes.')
  lignes.forEach((l, i) => {
    const d = Number(l.debit) || 0
    const c = Number(l.credit) || 0
    if (d > 0 && c > 0) erreurs.push(`Ligne ${i + 1} : une ligne ne peut être à la fois au débit et au crédit.`)
  })
  if (lignes.length >= 2 && !ecritureEquilibree(lignes)) {
    erreurs.push(`Écriture déséquilibrée : débit ${totalDebit(lignes)} ≠ crédit ${totalCredit(lignes)}.`)
  }
  return { ok: erreurs.length === 0, erreurs, lignes }
}

// ── Aplatissement écritures → mouvements par ligne ────────────────────────────
// Déploie chaque écriture en mouvements individuels (une par ligne), en propageant
// l'en-tête (date, journal, pièce, libellé). Filtre optionnel sur le statut.
export function mouvements(ecritures = [], { statut = null } = {}) {
  const out = []
  ecritures.forEach((ec) => {
    if (statut && ec.statut !== statut) return
    ;(ec.lignes || []).forEach((l, idx) => {
      const debit = Number(l.debit) || 0
      const credit = Number(l.credit) || 0
      if (debit === 0 && credit === 0) return
      out.push({
        id: `${ec.id}_${idx}`,
        ecritureId: ec.id,
        date: ec.date,
        journal: ec.journal,
        piece: ec.piece || '',
        compte: String(l.compte),
        libelle: l.libelle || ec.libelle || '',
        debit, credit,
        statut: ec.statut || 'brouillon'
      })
    })
  })
  return out
}

const dansPeriode = (date, debut, fin) => {
  if (!date) return false
  if (debut && date < debut) return false
  if (fin && date > fin) return false
  return true
}

// ── Grand livre d'un compte ───────────────────────────────────────────────────
// Mouvements d'un compte triés par date, avec solde progressif. `mvts` = sortie de
// mouvements(). Renvoie { lignes[], totalDebit, totalCredit, solde, sens }.
export function grandLivreCompte(mvts, compte, { debut = null, fin = null } = {}) {
  const filtres = mvts
    .filter((m) => m.compte === String(compte))
    .filter((m) => dansPeriode(m.date, debut, fin))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  let cumul = 0
  const lignes = filtres.map((m) => {
    cumul += m.debit - m.credit
    return { ...m, soldeProgressif: cumul }
  })
  const td = filtres.reduce((s, m) => s + m.debit, 0)
  const tc = filtres.reduce((s, m) => s + m.credit, 0)
  const solde = td - tc
  return { lignes, totalDebit: td, totalCredit: tc, solde, sens: solde >= 0 ? 'debit' : 'credit' }
}

// ── Balance générale ──────────────────────────────────────────────────────────
// Un poste par compte mouvementé : totaux débit/crédit et solde (débiteur/créditeur).
export function balance(mvts, plan, { debut = null, fin = null } = {}) {
  const parCompte = new Map()
  mvts
    .filter((m) => dansPeriode(m.date, debut, fin))
    .forEach((m) => {
      if (!parCompte.has(m.compte)) parCompte.set(m.compte, { compte: m.compte, debit: 0, credit: 0 })
      const p = parCompte.get(m.compte)
      p.debit += m.debit
      p.credit += m.credit
    })
  const postes = [...parCompte.values()]
    .map((p) => {
      const solde = p.debit - p.credit
      return {
        ...p,
        libelle: (plan.find((c) => c.num === p.compte)?.label) || '',
        soldeDebiteur: solde > 0 ? solde : 0,
        soldeCrediteur: solde < 0 ? -solde : 0
      }
    })
    .sort((a, b) => a.compte.localeCompare(b.compte))
  const tot = postes.reduce(
    (t, p) => ({
      debit: t.debit + p.debit,
      credit: t.credit + p.credit,
      soldeDebiteur: t.soldeDebiteur + p.soldeDebiteur,
      soldeCrediteur: t.soldeCrediteur + p.soldeCrediteur
    }),
    { debit: 0, credit: 0, soldeDebiteur: 0, soldeCrediteur: 0 }
  )
  return { postes, totaux: tot, equilibree: Math.abs(tot.debit - tot.credit) < 0.5 }
}

// ── Solde d'un compte ou d'un préfixe de classe ───────────────────────────────
// Solde net (débit − crédit) de tous les comptes commençant par `prefixe`.
export function soldePrefixe(mvts, prefixe, { debut = null, fin = null } = {}) {
  return mvts
    .filter((m) => m.compte.startsWith(String(prefixe)))
    .filter((m) => dansPeriode(m.date, debut, fin))
    .reduce((s, m) => s + m.debit - m.credit, 0)
}

// ── Compte de résultat (charges classe 6 / produits classe 7) ─────────────────
export function compteDeResultat(mvts, opts = {}) {
  const charges = soldePrefixe(mvts, '6', opts) // débiteur → positif = charge
  const produits = -soldePrefixe(mvts, '7', opts) // créditeur → on inverse pour l'avoir positif
  const resultat = produits - charges
  return { charges, produits, resultat, benefice: resultat >= 0 }
}

// ── Grandes masses du bilan ───────────────────────────────────────────────────
export function grandesMasses(mvts, opts = {}) {
  const actifImmobilise = soldePrefixe(mvts, '2', opts)
  const stocks = soldePrefixe(mvts, '3', opts)
  const tresorerie = soldePrefixe(mvts, '5', opts)
  const clients = soldePrefixe(mvts, '41', opts)
  const fournisseurs = -soldePrefixe(mvts, '40', opts)
  const capitaux = -soldePrefixe(mvts, '1', opts)
  return { actifImmobilise, stocks, tresorerie, clients, fournisseurs, capitaux }
}

// ── TVA ───────────────────────────────────────────────────────────────────────
// TVA collectée (compte 4431, crédit) vs récupérable (445, débit) → TVA due.
export function syntheseTva(mvts, opts = {}) {
  const collectee = -soldePrefixe(mvts, COMPTE_TVA_COLLECTEE, opts) // 445710, crédit → positif
  const recuperable = soldePrefixe(mvts, COMPTE_TVA_DEDUCTIBLE, opts) // 445660, débit → positif
  const due = collectee - recuperable
  return { collectee, recuperable, due, sens: due >= 0 ? 'à payer' : 'crédit de TVA' }
}

// ── Amortissement linéaire d'une immobilisation ───────────────────────────────
// `immo` = { valeur, dateAcquisition, dureeAmort (ans), categorie }. Renvoie le plan
// d'amortissement + les cumuls à une date donnée (par défaut aujourd'hui).
export function planAmortissement(immo, jusquA = null) {
  const valeur = Number(immo.valeur) || 0
  const duree = Number(immo.dureeAmort ?? getCategorieDuree(immo.categorie)) || 0
  const cat = CATEGORIES_IMMO.find((c) => c.id === immo.categorie)
  const methode = immo.methode || cat?.methode || 'lineaire'
  const amortissable = methode !== 'aucune' && duree > 0 && valeur > 0
  if (!amortissable) {
    return { amortissable: false, annuites: [], cumul: 0, vnc: valeur, tauxLineaire: 0 }
  }
  const tauxLineaire = 100 / duree
  const annuiteBase = valeur / duree
  const anneeDebut = new Date(immo.dateAcquisition || Date.now()).getFullYear()
  const anneeRef = jusquA ? new Date(jusquA).getFullYear() : new Date().getFullYear()
  const annuites = []
  let cumul = 0
  for (let i = 0; i < duree; i++) {
    const annee = anneeDebut + i
    // Dernière annuité : solde résiduel (évite les écarts d'arrondi).
    const dotation = i === duree - 1 ? valeur - cumul : Math.round(annuiteBase)
    cumul += dotation
    annuites.push({ annee, dotation, cumul, vnc: Math.max(0, valeur - cumul) })
  }
  const ligneRef = annuites.filter((a) => a.annee <= anneeRef).slice(-1)[0]
  const cumulRef = ligneRef ? ligneRef.cumul : 0
  return { amortissable: true, tauxLineaire, duree, annuites, cumul: cumulRef, vnc: Math.max(0, valeur - cumulRef) }
}

function getCategorieDuree(categorieId) {
  return CATEGORIES_IMMO.find((c) => c.id === categorieId)?.dureeAmort || 0
}

// ── Regroupement d'écritures par journal (pour l'affichage du livre-journal) ──
export function ecrituresParJournal(ecritures = []) {
  const parJ = {}
  ecritures.forEach((ec) => {
    const j = ec.journal || 'OD'
    ;(parJ[j] ||= []).push(ec)
  })
  return parJ
}

// ── Numéro de pièce séquentiel par journal et par exercice ────────────────────
export function prochainNumeroPiece(ecritures, journal, annee) {
  const prefixe = `${journal}-${annee}-`
  const n = ecritures
    .filter((e) => (e.piece || '').startsWith(prefixe))
    .map((e) => parseInt((e.piece || '').slice(prefixe.length), 10) || 0)
    .reduce((max, x) => Math.max(max, x), 0)
  return `${prefixe}${String(n + 1).padStart(5, '0')}`
}

export { CLASSES, classeDe, getClasse, TYPES_COMPTE }

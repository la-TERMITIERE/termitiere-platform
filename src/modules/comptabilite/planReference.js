// Référentiel SYSCOHADA Révisé complet (2 320 comptes, cf. referentielSyscohada.js) et
// fonctions de recherche : libellé d'un compte, compte parent, validité d'un numéro.
//
// Le référentiel ne REMPLACE PAS le plan de l'entreprise (data.js + compta_comptes) : il
// sert de filet. Le libellé et le type du plan de l'entreprise priment toujours ; le
// référentiel ne fournit qu'un libellé de secours pour un compte absent du plan, et
// permet de vérifier qu'un numéro saisi existe bien dans la nomenclature SYSCOHADA.
import BRUT from './referentielSyscohada'

const TYPES = { A: 'ASSET', L: 'LIABILITY', E: 'EQUITY', I: 'INCOME', X: 'EXPENSE' }

// [{ num, label, type, niveau }] trié par numéro. niveau = nombre de chiffres
// (1 = classe, 2 = compte principal, 3 = divisionnaire, 4+ = sous-comptes).
export const REFERENTIEL = BRUT.split('\n').map((ligne) => {
  const i = ligne.indexOf(';')
  const j = ligne.indexOf(';', i + 1)
  const num = ligne.slice(0, i)
  return { num, type: TYPES[ligne.slice(i + 1, j)], label: ligne.slice(j + 1), niveau: num.length }
})

const PAR_NUM = new Map(REFERENTIEL.map((c) => [c.num, c]))

// Compte du référentiel correspondant à un numéro : exact, sinon sans les zéros de fin
// (le plan de l'entreprise est à 6 chiffres : 101000 → 101 « Capital social »).
export function trouverReference(num) {
  let n = String(num || '').trim()
  if (!n) return null
  if (PAR_NUM.has(n)) return PAR_NUM.get(n)
  while (n.length > 1 && n.endsWith('0')) {
    n = n.slice(0, -1)
    if (PAR_NUM.has(n)) return PAR_NUM.get(n)
  }
  return null
}

// Compte du référentiel le plus proche au-dessus d'un numéro (plus long préfixe connu,
// le numéro lui-même exclu). Ex. 601150 → 6011 ; 6011 → 601.
export function parentReference(num) {
  const n = String(num || '').trim()
  for (let l = n.length - 1; l >= 1; l--) {
    const c = PAR_NUM.get(n.slice(0, l))
    if (c) return c
  }
  return null
}

// Libellé de secours issu du référentiel (correspondance exacte ou sans zéros de fin).
export const libelleReference = (num) => trouverReference(num)?.label || ''

// Libellé d'affichage : plan de l'entreprise d'abord, référentiel ensuite.
export function libelleCompteRef(plan, num) {
  const n = String(num || '')
  return (plan || []).find((c) => c.num === n)?.label || libelleReference(n)
}

// Statut d'un numéro de compte saisi :
//  - 'plan'        : compte du plan de l'entreprise ;
//  - 'referentiel' : compte SYSCOHADA (hors plan de l'entreprise) ;
//  - 'subdivision' : subdivision libre d'un compte SYSCOHADA d'au moins 2 chiffres
//                    (autorisée : l'entreprise peut détailler un compte) ;
//  - 'inconnu'     : ne se rattache à aucun compte SYSCOHADA → refusé.
export function statutCompte(num, plan = []) {
  const n = String(num || '').trim()
  if (!n || !/^\d+$/.test(n)) return { statut: 'inconnu', compte: null }
  const duPlan = plan.find((c) => c.num === n)
  if (duPlan) return { statut: 'plan', compte: duPlan }
  const ref = trouverReference(n)
  if (ref) return { statut: 'referentiel', compte: ref }
  const parent = parentReference(n)
  if (parent && parent.niveau >= 2) return { statut: 'subdivision', compte: parent }
  return { statut: 'inconnu', compte: null }
}

// Sens normal du solde selon le type (débit pour Actif/Charge, crédit pour Passif/Capitaux/Produit).
export const sensDuType = (type) => (type === 'ASSET' || type === 'EXPENSE' ? 'Débit' : type ? 'Crédit' : '')

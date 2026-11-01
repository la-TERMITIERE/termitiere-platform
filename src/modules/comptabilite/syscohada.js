// COMPTABILITÉ — états au format SYSCOHADA révisé (système normal) : bilan par rubriques
// et compte de résultat en cascade (soldes intermédiaires XA → XI), calculés depuis la
// balance. La correspondance compte → rubrique suit le plan à 6 chiffres de l'application
// (cf. data.js) ; un compte sans rubrique précise tombe dans « autres » de sa classe, pour
// que les totaux restent exacts.
import { balance } from './logic'

const commence = (num, prefixes) => prefixes.some((p) => String(num).startsWith(p))

// ── Compte de résultat : rubriques (montants positifs ; signe = sens dans la cascade) ──
// `sens` : 'P' produit (crédit − débit), 'C' charge (débit − crédit).
export const RUBRIQUES_RESULTAT = [
  { ref: 'TA', label: 'Ventes de marchandises', sens: 'P', comptes: ['707'] },
  { ref: 'RA', label: 'Achats de marchandises', sens: 'C', comptes: ['607'] },
  { ref: 'RB', label: 'Variation de stocks de marchandises', sens: 'C', comptes: ['6031'] },
  { ref: 'TB', label: 'Ventes de produits fabriqués', sens: 'P', comptes: ['701', '702', '703'] },
  { ref: 'TC', label: 'Travaux, services vendus', sens: 'P', comptes: ['704', '705', '706'] },
  { ref: 'TD', label: 'Produits accessoires', sens: 'P', comptes: ['708'] },
  { ref: 'TE', label: 'Production stockée (ou déstockage)', sens: 'P', comptes: ['73'] },
  { ref: 'TF', label: 'Production immobilisée', sens: 'P', comptes: ['72'] },
  { ref: 'TG', label: 'Subventions d\'exploitation', sens: 'P', comptes: ['71'] },
  { ref: 'TH', label: 'Autres produits', sens: 'P', comptes: ['75'] },
  { ref: 'TI', label: 'Transferts de charges d\'exploitation', sens: 'P', comptes: ['78'], exclure: ['781', '79'] },
  { ref: 'RC', label: 'Achats de matières premières et fournitures liées', sens: 'C', comptes: ['601', '602'] },
  { ref: 'RD', label: 'Variation de stocks de matières premières et fournitures', sens: 'C', comptes: ['6032'] },
  { ref: 'RE', label: 'Autres achats', sens: 'C', comptes: ['604', '605', '608'] },
  { ref: 'RF', label: 'Variation de stocks d\'autres approvisionnements', sens: 'C', comptes: ['6033'] },
  { ref: 'RG', label: 'Transports', sens: 'C', comptes: ['61'], exclure: ['614', '615', '616'] },
  { ref: 'RH', label: 'Services extérieurs', sens: 'C', comptes: ['614', '615', '616', '62', '63'], exclure: ['631'] },
  { ref: 'RI', label: 'Impôts et taxes', sens: 'C', comptes: ['631', '64'], exclure: ['641'] },
  { ref: 'RJ', label: 'Autres charges', sens: 'C', comptes: ['65'] },
  { ref: 'RK', label: 'Charges de personnel', sens: 'C', comptes: ['641', '66'] },
  { ref: 'TJ', label: 'Reprises d\'amortissements, provisions et dépréciations', sens: 'P', comptes: ['781', '79'] },
  { ref: 'RL', label: 'Dotations aux amortissements, provisions et dépréciations', sens: 'C', comptes: ['68', '69'] },
  { ref: 'TK', label: 'Revenus financiers et assimilés', sens: 'P', comptes: ['77'] },
  { ref: 'RM', label: 'Frais financiers et charges assimilées', sens: 'C', comptes: ['67'] },
  { ref: 'TN', label: 'Produits des cessions d\'immobilisations', sens: 'P', comptes: ['82'] },
  { ref: 'TO', label: 'Autres produits HAO', sens: 'P', comptes: ['84', '86', '88'] },
  { ref: 'RO', label: 'Valeurs comptables des cessions d\'immobilisations', sens: 'C', comptes: ['81'] },
  { ref: 'RP', label: 'Autres charges HAO', sens: 'C', comptes: ['83', '85'] },
  { ref: 'RQ', label: 'Participation des travailleurs', sens: 'C', comptes: ['87'] },
  { ref: 'RS', label: 'Impôts sur le résultat', sens: 'C', comptes: ['89'] }
]

function rubriqueDe(num, liste) {
  // La règle la plus précise (préfixe le plus long) l'emporte ; les exclusions écartent un sous-compte.
  let best = null; let lg = -1
  for (const r of liste) {
    if (r.exclure && commence(num, r.exclure)) continue
    for (const p of r.comptes) if (String(num).startsWith(p) && p.length > lg) { best = r; lg = p.length }
  }
  return best
}

export function compteDeResultatSyscohada(mvts, plan, { debut, fin }) {
  const bal = balance(mvts, plan, { debut, fin })
  const v = Object.fromEntries(RUBRIQUES_RESULTAT.map((r) => [r.ref, 0]))
  const detail = Object.fromEntries(RUBRIQUES_RESULTAT.map((r) => [r.ref, []]))
  for (const p of bal.postes) {
    const cl = p.compte.charAt(0)
    if (!['6', '7', '8'].includes(cl)) continue
    const r = rubriqueDe(p.compte, RUBRIQUES_RESULTAT) || RUBRIQUES_RESULTAT.find((x) => x.ref === (cl === '7' ? 'TH' : cl === '6' ? 'RJ' : (p.debit >= p.credit ? 'RP' : 'TO')))
    const m = r.sens === 'P' ? p.credit - p.debit : p.debit - p.credit
    v[r.ref] += m
    detail[r.ref].push({ compte: p.compte, libelle: p.libelle, montant: m })
  }
  const XA = v.TA - v.RA - v.RB
  const XB = v.TA + v.TB + v.TC + v.TD
  const XC = XB + v.TE + v.TF + v.TG + v.TH + v.TI - (v.RA + v.RB + v.RC + v.RD + v.RE + v.RF + v.RG + v.RH + v.RI + v.RJ)
  const XD = XC - v.RK
  const XE = XD + v.TJ - v.RL
  const XF = v.TK - v.RM
  const XG = XE + XF
  const XH = v.TN + v.TO - v.RO - v.RP
  const XI = XG + XH - v.RQ - v.RS
  const ligne = (ref) => ({ ref, label: RUBRIQUES_RESULTAT.find((r) => r.ref === ref).label, montant: v[ref], sens: RUBRIQUES_RESULTAT.find((r) => r.ref === ref).sens, detail: detail[ref] })
  const solde = (ref, label, montant) => ({ ref, label, montant, solde: true })
  return {
    lignes: [
      ligne('TA'), ligne('RA'), ligne('RB'), solde('XA', 'MARGE COMMERCIALE', XA),
      ligne('TB'), ligne('TC'), ligne('TD'), solde('XB', 'CHIFFRE D\'AFFAIRES', XB),
      ligne('TE'), ligne('TF'), ligne('TG'), ligne('TH'), ligne('TI'),
      ligne('RC'), ligne('RD'), ligne('RE'), ligne('RF'), ligne('RG'), ligne('RH'), ligne('RI'), ligne('RJ'),
      solde('XC', 'VALEUR AJOUTÉE', XC), ligne('RK'), solde('XD', 'EXCÉDENT BRUT D\'EXPLOITATION', XD),
      ligne('TJ'), ligne('RL'), solde('XE', 'RÉSULTAT D\'EXPLOITATION', XE),
      ligne('TK'), ligne('RM'), solde('XF', 'RÉSULTAT FINANCIER', XF), solde('XG', 'RÉSULTAT DES ACTIVITÉS ORDINAIRES', XG),
      ligne('TN'), ligne('TO'), ligne('RO'), ligne('RP'), solde('XH', 'RÉSULTAT HORS ACTIVITÉS ORDINAIRES', XH),
      ligne('RQ'), ligne('RS'), solde('XI', 'RÉSULTAT NET', XI)
    ],
    resultatNet: XI
  }
}

// ── Bilan : rubriques ──────────────────────────────────────────────────────────
// Les comptes de tiers (4) et de trésorerie (5) vont à l'actif s'ils sont débiteurs et au
// passif s'ils sont créditeurs ; les amortissements (28) viennent en déduction de l'actif.
export function bilanSyscohada(mvts, plan, { fin, resultatNet, resultatsAnterieurs }) {
  const bal = balance(mvts, plan, { fin })
  const actif = { AD: 0, AI: 0, AQ: 0, BB: 0, BH: 0, BI: 0, BQ: 0 }
  const passif = { CA: 0, CD: 0, CH: 0, CJ: 0, DA: 0, DH: 0, DI: 0, DJ: 0, DR: 0 }
  for (const p of bal.postes) {
    const n = p.compte; const s = p.debit - p.credit
    if (/^[678]/.test(n)) continue
    if (n.startsWith('1')) {
      if (commence(n, ['101', '102', '103', '104', '105'])) passif.CA += -s
      else if (commence(n, ['106', '111', '112', '113', '118'])) passif.CD += -s
      else if (commence(n, ['11', '12', '13'])) passif.CH += -s
      else passif.DA += -s
    } else if (n.startsWith('2')) {
      if (commence(n, ['26', '27'])) actif.AQ += s
      else if (commence(n, ['20', '21']) && /incorpor/i.test(p.libelle)) actif.AD += s
      else actif.AI += s // terrains, constructions, matériel ; amortissements (28) en déduction
    } else if (n.startsWith('3')) actif.BB += s
    else if (n.startsWith('4')) {
      if (s >= 0) { if (commence(n, ['41'])) actif.BH += s; else actif.BI += s }
      else if (commence(n, ['40'])) passif.DH += -s
      else if (commence(n, ['42', '43', '44'])) passif.DI += -s
      else passif.DJ += -s
    } else if (n.startsWith('5')) {
      if (s >= 0) actif.BQ += s; else passif.DR += -s
    }
  }
  passif.CH += resultatsAnterieurs || 0
  passif.CJ += resultatNet || 0
  const L = (ref, label, montant) => ({ ref, label, montant })
  const actifLignes = [
    L('AD', 'Immobilisations incorporelles', actif.AD), L('AI', 'Immobilisations corporelles (nettes d\'amortissements)', actif.AI),
    L('AQ', 'Immobilisations financières', actif.AQ), { ref: 'AZ', label: 'TOTAL ACTIF IMMOBILISÉ', montant: actif.AD + actif.AI + actif.AQ, solde: true },
    L('BB', 'Stocks et encours', actif.BB), L('BH', 'Clients', actif.BH), L('BI', 'Autres créances', actif.BI),
    { ref: 'BK', label: 'TOTAL ACTIF CIRCULANT', montant: actif.BB + actif.BH + actif.BI, solde: true },
    L('BQ', 'Banques, chèques postaux, caisse', actif.BQ), { ref: 'BT', label: 'TOTAL TRÉSORERIE-ACTIF', montant: actif.BQ, solde: true }
  ]
  const passifLignes = [
    L('CA', 'Capital (et compte de l\'exploitant)', passif.CA), L('CD', 'Réserves', passif.CD), L('CH', 'Report à nouveau (résultats antérieurs)', passif.CH),
    L('CJ', 'Résultat net de l\'exercice', passif.CJ), { ref: 'CP', label: 'TOTAL CAPITAUX PROPRES', montant: passif.CA + passif.CD + passif.CH + passif.CJ, solde: true },
    L('DA', 'Emprunts et dettes financières', passif.DA), { ref: 'DF', label: 'TOTAL RESSOURCES STABLES', montant: passif.CA + passif.CD + passif.CH + passif.CJ + passif.DA, solde: true },
    L('DH', 'Fournisseurs d\'exploitation', passif.DH), L('DI', 'Dettes fiscales et sociales', passif.DI), L('DJ', 'Autres dettes', passif.DJ),
    { ref: 'DP', label: 'TOTAL PASSIF CIRCULANT', montant: passif.DH + passif.DI + passif.DJ, solde: true },
    L('DR', 'Banques, crédits de trésorerie (découverts)', passif.DR), { ref: 'DT', label: 'TOTAL TRÉSORERIE-PASSIF', montant: passif.DR, solde: true }
  ]
  const totalActif = Object.values(actif).reduce((a, b) => a + b, 0)
  const totalPassif = Object.values(passif).reduce((a, b) => a + b, 0)
  return { actif: actifLignes, passif: passifLignes, totalActif, totalPassif, equilibre: Math.abs(totalActif - totalPassif) < 1 }
}

// Passerelles automatiques — convertit les données des AUTRES modules en écritures
// comptables (partie double), SANS double saisie ni double stockage.
//
// Principe (repris de la passerelle read-only de src/modules/depense/logic.js) :
// les écritures générées ici sont VIRTUELLES — calculées à la volée à partir des
// collections existantes (dépenses, revenus…), jamais réécrites en base. Elles
// alimentent le grand livre, la balance et le résultat au même titre que les
// écritures saisies à la main, mais restent en lecture seule (source: 'auto').
//
// Ainsi « tous les achats faits sur les autres modules » remontent automatiquement
// dans la comptabilité, mappés sur le plan comptable SYSCOHADA.

// Une dépense est réellement décaissée (compte dans la compta) si elle n'a pas de
// circuit d'autorisation en cours. Inliné pour ne pas coupler au module Dépenses.
const estDecaissee = (d) => !d.statut || d.statut === 'decaissee'

// ── Catégorie de dépense (E-DÉPENSES) → compte de charge SYSCOHADA (6 chiffres, FEZIRE) ──
export const MAP_CATEGORIE_COMPTE = {
  salaires:      '641000', // Rémunérations du personnel
  fournitures:   '607000', // Achats de marchandises
  transport:     '605300', // Carburant et lubrifiants
  entretien:     '615000', // Entretien, réparations et maintenance
  communication: '626000', // Frais de télécoms / Internet
  loyer:         '614000', // Locations et charges locatives
  services:      '605000', // Autres achats (services & prestataires)
  impots:        '631000', // Impôts et taxes
  matieres:      '601000', // Achats de matières premières (passerelle briqueterie)
  remboursement_pau: '104000', // Remboursement au PAU (compte de l'exploitant)
  autre:         '605000'  // Autres achats
}
export const COMPTE_CHARGE_DEFAUT = '605000'
// Un achat d'ACTIF durable (natureFlux « investissement ») n'est pas une charge :
// il entre à l'actif immobilisé (classe 2) — matériel et outillage par défaut.
export const COMPTE_IMMO_DEFAUT = '218100'

// Compte à créditer (origine des fonds).
//   - Apport du PAU        → 104000 Compte de l'exploitant (dette envers le promoteur)
//   - Fonds de l'entreprise → 530000 Caisse (à défaut d'info de paiement)
function compteContrepartie(dep) {
  return (dep.sourceFinancement === 'pau') ? '104000' : '530000'
}

function compteDebit(dep) {
  if ((dep.natureFlux || 'exploitation') === 'investissement') return COMPTE_IMMO_DEFAUT
  return MAP_CATEGORIE_COMPTE[dep.categorie] || COMPTE_CHARGE_DEFAUT
}

// ── Dépenses (achats) → écritures d'achat (journal AC) ────────────────────────
// `depenses` = collection `depense_depenses`. Ne retient que les dépenses décaissées.
export function ecrituresDepuisDepenses(depenses = [], { compteTresorerie = null } = {}) {
  return depenses
    .filter((d) => estDecaissee(d) && (Number(d.montant) || 0) > 0)
    .map((d) => {
      const montant = Number(d.montant) || 0
      const libelle = d.description || d.categorie || 'Achat / dépense'
      const debit = compteDebit(d)
      // Dépense de l'entreprise : sort du compte de trésorerie affecté aux dépenses (Trésorerie › Paramètres).
      const credit = (d.sourceFinancement !== 'pau' && compteTresorerie) ? compteTresorerie : compteContrepartie(d)
      return {
        id: `auto_dep_${d.id}`,
        date: d.date ? String(d.date).slice(0, 10) : '',
        journal: 'AC',
        libelle,
        piece: `AUTO-DEP-${d.id}`,
        statut: 'validee',
        source: 'auto',
        module: 'depense',
        secteur: d.secteurId || '',
        lignes: [
          { compte: debit, libelle, debit: montant, credit: 0 },
          { compte: credit, libelle, debit: 0, credit: montant }
        ]
      }
    })
}

// ── Revenus manuels → écritures de vente (journal VE) ─────────────────────────
// `revenus` = collection `depense_revenus_manuels`. Débit caisse, crédit produit.
export function ecrituresDepuisRevenusManuels(revenus = []) {
  return revenus
    .filter((r) => (Number(r.montant) || 0) > 0)
    .map((r) => {
      const montant = Number(r.montant) || 0
      const libelle = r.description || r.libelle || 'Revenu'
      return {
        id: `auto_rev_${r.id}`,
        date: r.date ? String(r.date).slice(0, 10) : '',
        journal: 'VE',
        libelle,
        piece: `AUTO-REV-${r.id}`,
        statut: 'validee',
        source: 'auto',
        module: 'revenus',
        secteur: r.secteurId || '',
        lignes: [
          { compte: '530000', libelle, debit: montant, credit: 0 },
          { compte: '708000', libelle, debit: 0, credit: montant }
        ]
      }
    })
}

// ── Bulletins de paie (module RH) → écritures de paie (journal PA) ────────────
// `bulletins` = collection `rh_bulletins`. Seuls les bulletins validés/payés sont
// comptabilisés. Écriture SYSCOHADA (équilibrée : brut + CNSS employeur de part
// et d'autre) :
//   D 641000 Rémunérations (brut)        C 421000 Personnel dû (net)
//   D 664000 Charges sociales (CNSS emp) C 431000 Sécurité sociale (CNSS sal. + emp.)
//                                        C 447000 État, ITS retenu (impôt)
const estComptabilisable = (b) => b.statut === 'valide' || b.statut === 'paye'

export function ecrituresDepuisBulletins(bulletins = []) {
  return bulletins
    .filter((b) => estComptabilisable(b) && (Number(b.brutTotal) || 0) > 0)
    .map((b) => {
      const brut = Number(b.brutTotal) || 0
      const net = Number(b.net) || 0
      const cnssSal = Number(b.cnssSalarie) || 0
      const cnssEmp = Number(b.cnssEmployeur) || 0
      const its = Number(b.its) || 0
      const libelle = `Paie ${b.mois || ''} : ${b.employeNom || ''}`.trim()
      const lignes = [
        { compte: '641000', libelle, debit: brut, credit: 0 },
        { compte: '421000', libelle, debit: 0, credit: net },
        { compte: '431000', libelle, debit: 0, credit: cnssSal },
        { compte: '447000', libelle, debit: 0, credit: its }
      ]
      // Part patronale CNSS (charge de l'employeur) — n'impacte pas le net.
      if (cnssEmp > 0) {
        lignes.push({ compte: '664000', libelle, debit: cnssEmp, credit: 0 })
        lignes.push({ compte: '431000', libelle, debit: 0, credit: cnssEmp })
      }
      return {
        id: `auto_paie_${b.id}`,
        date: b.mois ? `${b.mois}-28` : '',
        journal: 'PA',
        libelle,
        piece: `AUTO-PAIE-${b.id}`,
        statut: 'validee',
        source: 'auto',
        module: 'rh',
        secteur: b.departement || '',
        lignes
      }
    })
}

// ── Versement des salaires : un bulletin PAYÉ solde la dette envers le salarié ──
//   D 421000 Personnel dû (net)   C 530000 Caisse (ou compte de trésorerie des dépenses)
export function ecrituresPaiementSalaires(bulletins = [], { compteTresorerie = '530000' } = {}) {
  return bulletins
    .filter((b) => b.statut === 'paye' && (Number(b.net) || 0) > 0)
    .map((b) => {
      const net = Number(b.net) || 0
      const libelle = `Salaire versé ${b.mois || ''} : ${b.employeNom || ''}`.trim()
      return {
        id: `auto_vsal_${b.id}`,
        date: b.datePaiement ? String(b.datePaiement).slice(0, 10) : (b.mois ? `${b.mois}-28` : ''),
        journal: 'CA', libelle, piece: `AUTO-VSAL-${b.id}`, statut: 'validee', source: 'auto', module: 'rh', secteur: b.departement || '',
        lignes: [
          { compte: '421000', libelle, debit: net, credit: 0 },
          { compte: compteTresorerie, libelle, debit: 0, credit: net }
        ]
      }
    })
}

// ── Ventes de tous les secteurs (src/shared/ventes.js) ────────────────────────
// Facture :       D 411100 Clients              C 70xxxx Produit du secteur   (journal VE)
// Encaissement :  D 5xxxxx compte de trésorerie C 411100 Clients              (journal CA/BQ/TR)
// Irrécouvrable : D 651000 Pertes sur créances  C 411100 Clients              (journal OD)
// `ventes` = sortie de creances() (Trésorerie) ; `flux` retrouve le compte de trésorerie
// qui a reçu chaque encaissement ; `comptes` = comptes de trésorerie.
export function ecrituresDepuisVentes(ventes = [], { flux = [], comptes = [] } = {}) {
  const parId = new Map(comptes.map((c) => [c.id, c]))
  const compteDuFlux = new Map(flux.filter((f) => f.venteCle).map((f) => [f.id, parId.get(f.compteId)]))
  const out = []
  for (const v of ventes) {
    const tiers = v.client?.nom || ''
    const lib = `${v.libelle}${tiers ? ` : ${tiers}` : ''}`
    out.push({
      id: `auto_ve_${v.cle}`, date: v.date, journal: 'VE', libelle: lib, piece: v.numero, statut: 'validee', source: 'auto',
      module: v.secteur, secteur: v.secteur, tiers,
      lignes: [
        { compte: '411100', libelle: lib, debit: v.total, credit: 0, tiers },
        { compte: v.compteProduit, libelle: lib, debit: 0, credit: v.total }
      ]
    })
    for (const e of v.encaissements || []) {
      const c = compteDuFlux.get(`enc-${e.id}`)
      const compteTreso = c?.compteComptable || '530000'
      const journal = c?.type === 'BANQUE' ? 'BQ' : c?.type === 'MOBILE_MONEY' ? 'TR' : 'CA'
      out.push({
        id: `auto_enc_${e.id}`, date: e.date, journal, libelle: `Encaissement ${v.numero}${tiers ? ` : ${tiers}` : ''}`,
        piece: e.reference || v.numero, statut: 'validee', source: 'auto', module: v.secteur, secteur: v.secteur, tiers,
        // Lettrage : la facture et ses encaissements portent la même lettre une fois soldée.
        lettrage: v.reste === 0 ? v.cle : null,
        lignes: [
          { compte: compteTreso, libelle: 'Encaissement client', debit: e.montant, credit: 0 },
          { compte: '411100', libelle: 'Encaissement client', debit: 0, credit: e.montant, tiers }
        ]
      })
    }
    if (v.etat === 'irrecouvrable' && v.reste > 0) {
      const d = v.surcouche?.dateIrrecouvrable || v.date
      out.push({
        id: `auto_irr_${v.cle}`, date: String(d).slice(0, 10), journal: 'OD', libelle: `Créance irrécouvrable ${v.numero}`, piece: v.numero,
        statut: 'validee', source: 'auto', module: 'tresorerie', secteur: v.secteur, tiers,
        lignes: [
          { compte: '651000', libelle: 'Perte sur créance', debit: v.reste, credit: 0 },
          { compte: '411100', libelle: 'Perte sur créance', debit: 0, credit: v.reste, tiers }
        ]
      })
    }
  }
  return out
}

// ── Trésorerie : mouvements saisis, virements internes, dépôts/retraits bancaires ──
// Les ventes, dépenses et rentrées ont leurs propres passerelles ci-dessus : pas reprises ici.
export function ecrituresDepuisTresorerie(flux = [], { comptes = [] } = {}) {
  const parId = new Map(comptes.map((c) => [c.id, c]))
  const estBanque = (id) => String(id || '').startsWith('banque:')
  const compteDe = (id) => parId.get(id)?.compteComptable || (estBanque(id) ? '512000' : '530000')
  const journalDe = (id) => {
    const t = parId.get(id)?.type || (estBanque(id) ? 'BANQUE' : 'CAISSE_SECTEUR')
    return t === 'BANQUE' ? 'BQ' : t === 'MOBILE_MONEY' ? 'TR' : 'CA'
  }
  const out = []
  for (const f of flux) {
    const base = { date: f.date, statut: 'validee', source: 'auto', module: 'tresorerie', secteur: f.secteur || '', libelle: f.libelle, piece: f.reference || f.id }
    const ligne = (compte, debit, credit, tiers) => ({ compte, libelle: f.libelle, debit, credit, ...(tiers ? { tiers } : {}) })
    if (f.source === 'tresorerie') {
      const treso = compteDe(f.compteId)
      const lignes = f.sens === 'IN'
        ? [ligne(treso, f.montant, 0), ligne(f.contrepartie, 0, f.montant, f.tiers)]
        : [ligne(f.contrepartie, f.montant, 0, f.tiers), ligne(treso, 0, f.montant)]
      out.push({ ...base, id: `auto_tr_${f.id}`, journal: journalDe(f.compteId), lignes })
      // Avance de mission régularisée : les frais justifiés passent de l'avance (425000) en charges.
      const r = f.regularisation
      if (f.nature === 'AVANCE_MISSION' && r && Number(r.frais) > 0) {
        const lib = `Frais de mission justifiés : ${f.tiers || ''}`.trim()
        out.push({ ...base, id: `auto_reg_${f.id}`, date: String(r.date || f.date).slice(0, 10), journal: 'OD', libelle: lib, lignes: [
          { compte: r.compteCharge || '658000', libelle: lib, debit: Number(r.frais), credit: 0 },
          { compte: '425000', libelle: lib, debit: 0, credit: Number(r.frais), tiers: f.tiers }
        ] })
      }
    } else if (f.source === 'virement' && f.sens === 'IN') {
      // Un virement interne = une seule écriture : D compte qui reçoit, C compte qui donne.
      out.push({ ...base, id: `auto_vir_${f.docId}`, journal: 'TR', lignes: [ligne(compteDe(f.compteId), f.montant, 0), ligne(compteDe(f.lie), 0, f.montant)] })
    } else if (f.source === 'banque' && estBanque(f.compteId)) {
      const banque = compteDe(f.compteId)
      if (f.nature === 'SOLDE_OUVERTURE') {
        out.push({ ...base, id: `auto_${f.id}`, journal: 'AN', lignes: [ligne(banque, f.montant, 0), ligne('110000', 0, f.montant)] })
      } else if (f.nature === 'VERSEMENT_BANQUE') {
        out.push({ ...base, id: `auto_${f.id}`, journal: 'BQ', lignes: [ligne(banque, f.montant, 0), ligne(compteDe(f.lie), 0, f.montant)] })
      } else if (f.nature === 'RETRAIT_BANQUE') {
        out.push({ ...base, id: `auto_${f.id}`, journal: 'BQ', lignes: [ligne(compteDe(f.lie), f.montant, 0), ligne(banque, 0, f.montant)] })
      }
    }
  }
  return out
}

// ── Soldes initiaux des caisses / Mobile Money (Trésorerie) → à-nouveaux ──────
//   D 5xxxxx compte de trésorerie   C 110000 Report à nouveau        (journal AN)
// (Les banques portent leur ouverture dans leurs mouvements, cf. ecrituresDepuisTresorerie.)
export function ecrituresSoldesInitiaux(comptes = []) {
  return comptes
    .filter((c) => c.source === 'treso' && (Number(c.soldeInitial) || 0) !== 0)
    .map((c) => {
      const m = Number(c.soldeInitial)
      const libelle = `Solde initial : ${c.nom}`
      const lignes = m > 0
        ? [{ compte: c.compteComptable, libelle, debit: m, credit: 0 }, { compte: '110000', libelle, debit: 0, credit: m }]
        : [{ compte: '110000', libelle, debit: -m, credit: 0 }, { compte: c.compteComptable, libelle, debit: 0, credit: -m }]
      return { id: `auto_si_${c.id}`, date: c.dateSoldeInitial || '', journal: 'AN', libelle, piece: `SI-${c.id}`, statut: 'validee', source: 'auto', module: 'tresorerie', secteur: '', lignes }
    })
}

// ── Agrégat : toutes les écritures automatiques ───────────────────────────────
// `ventes`, `flux`, `comptes` et `compteDepenses` viennent de la Trésorerie (cf. useCompta).
export function ecrituresAuto({ depenses = [], revenusManuels = [], bulletins = [], ventes = [], flux = [], comptes = [], compteDepenses = null } = {}) {
  return [
    ...ecrituresDepuisDepenses(depenses, { compteTresorerie: compteDepenses }),
    ...ecrituresDepuisRevenusManuels(revenusManuels),
    ...ecrituresDepuisBulletins(bulletins),
    ...ecrituresPaiementSalaires(bulletins, { compteTresorerie: compteDepenses || '530000' }),
    ...ecrituresDepuisVentes(ventes, { flux, comptes }),
    ...ecrituresDepuisTresorerie(flux, { comptes }),
    ...ecrituresSoldesInitiaux(comptes)
  ]
}

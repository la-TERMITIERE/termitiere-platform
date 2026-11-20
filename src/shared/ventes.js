// VENTES UNIFIÉES — une seule lecture des ventes de tous les secteurs, partagée par la
// Comptabilité (écritures de ventes et d'encaissements), la Trésorerie (créances,
// balance âgée, recouvrement) et l'export FEZIRE (netlify/functions/fezire-export.mjs).
// Module PUR (aucun import d'interface ni de base) : il tourne aussi côté serveur.
//
// Règle de gestion historique, CONSERVÉE : une facture définitive est ENCAISSÉE à sa date
// (c'est ce que comptent E-DÉPENSES et le Suivi journalier). La Trésorerie peut ensuite
// la déclarer « à crédit » (surcouche `treso_creances`) : l'encaissement immédiat disparaît
// et seuls les règlements saisis (`treso_reglements`) la soldent. Sans surcouche, rien ne
// change dans les chiffres existants.
//
// Garderie : le paiement porte déjà ce qui est dû (montantDu) et ce qui est payé
// (montantPaye) : le reste est une créance naturelle, sans surcouche.

const montant = (v) => Number(v) || 0
// Dates : texte « AAAA-MM-JJ… » ou horodatage en millisecondes (versements des projets).
const jour = (d) => {
  if (d === null || d === undefined || d === '') return ''
  if (typeof d === 'number' || /^\d{11,}$/.test(String(d))) return new Date(Number(d)).toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

// Comptes de produits SYSCOHADA par secteur (plan à 6 chiffres de la Comptabilité).
export const COMPTE_PRODUIT = {
  agro: '702000',         // Ventes de produits (élevage, aliments)
  evenementiel: '701000', // Ventes de produits finis (briques)
  logistique: '706000',   // Services vendus (locations de matériel)
  gym: '706000',          // Services vendus (séances, abonnements)
  garderie: '706000',     // Services vendus (scolarité, garde)
  projet: '704000'        // Travaux facturés (versements clients des projets)
}

export const LIBELLE_SECTEUR = {
  agro: 'Maxi Agro', evenementiel: 'Briqueterie', logistique: 'Logistique',
  gym: 'Maxi Gym', garderie: 'Garderie', projet: 'Projets'
}

// Mode de paiement des modules → code FEZIRE (CASH_MOVEMENT.payment_method / PAYMENT.method).
export function modeCanonique(mode) {
  const m = String(mode || '').toLowerCase()
  if (m.startsWith('mobile') || m === 'flooz' || m === 'tmoney') return 'MOBILE_MONEY'
  if (m.startsWith('virement') || m === 'banque') return 'BANK_TRANSFER'
  if (m.startsWith('cheque') || m.startsWith('chèque')) return 'CHEQUE'
  if (m.startsWith('carte')) return 'CARD'
  return 'CASH'
}

// Clé stable d'une vente, partagée par les surcouches Trésorerie et l'export FEZIRE.
export const cleVente = (secteur, id) => `${secteur}-${id}`

const parentDe = (p, enfants) => {
  const e = enfants.find((x) => x.id === p.enfantId) || {}
  return { nom: (e.parentNom || '').trim() || `Parent ${String(p.enfantId || p.id).slice(-6)}`, tel: e.parentContact || null }
}

// Ventes définitives de tous les secteurs :
// { cle, secteur, sourceId, site, numero, date, client:{nom,tel}, total, payeImmediat, mode, compteProduit, libelle }
export function ventesUnifiees({
  facturesAgro = [], facturesLogistique = [], facturesEvenementiel = [], facturesGym = [],
  paiementsGarderie = [], enfantsGarderie = [], versementsProjet = [], projets = []
} = {}) {
  const out = []
  const push = (secteur, f, champs) => {
    const total = Math.round(montant(champs.total))
    if (total <= 0) return
    out.push({
      cle: cleVente(secteur, f.id), secteur, sourceId: f.id, site: champs.site || null,
      numero: champs.numero || f.id, date: jour(champs.date), client: champs.client || { nom: '', tel: null },
      total, payeImmediat: Math.min(total, Math.round(champs.paye ?? total)), mode: champs.mode || 'espece',
      compteProduit: COMPTE_PRODUIT[secteur], libelle: champs.libelle || `Facture ${champs.numero || ''}`.trim()
    })
  }

  // Maxi Agro : seules les factures CERTIFIÉES sont définitives (même règle qu'E-DÉPENSES).
  facturesAgro.filter((f) => (f.statut || 'certifiee') === 'certifiee').forEach((f) => push('agro', f, {
    numero: f.numero, date: f.certifieeLe || f.date, client: { nom: f.client?.nom || '', tel: f.client?.tel || null },
    total: f.totalTTC, mode: f.modePaiement
  }))
  // Logistique : factures APPROUVÉES.
  facturesLogistique.filter((f) => f.statut === 'approuvee').forEach((f) => push('logistique', f, {
    numero: f.num, date: f.date, site: f.site || 'lome', client: { nom: f.clientNom || '', tel: null },
    total: f.totalTTC ?? f.totalHT, mode: f.modePaiement
  }))
  // Briqueterie : toute facture hors brouillon/annulée.
  facturesEvenementiel.filter((f) => !['brouillon', 'annulee'].includes(f.statut)).forEach((f) => push('evenementiel', f, {
    numero: f.numero, date: f.date, client: { nom: f.client?.nom || '', tel: f.client?.tel || null },
    total: f.totalTTC, mode: f.modePaiement
  }))
  // Maxi Gym : reçus encaissés immédiatement.
  facturesGym.forEach((f) => push('gym', f, {
    numero: f.numero, date: f.date, site: f.site || 'lome', client: { nom: f.clientNom || '', tel: f.clientTelephone || null },
    total: f.montant, mode: f.modePaiement, libelle: f.description || `Reçu ${f.numero || ''}`.trim()
  }))
  // Garderie : dû et payé portés par le paiement ; le client est le parent.
  paiementsGarderie.forEach((p) => {
    const du = montant(p.montantDu) || montant(p.montantPaye)
    const periode = p.mois && p.annee ? ` ${String(p.mois).padStart(2, '0')}/${p.annee}` : ''
    push('garderie', p, {
      numero: `GARD-${p.id}`, date: p.date, client: parentDe(p, enfantsGarderie),
      total: du, paye: montant(p.montantPaye), mode: p.modePaiement, libelle: `Garderie${periode}`
    })
  })
  // Projets : versements des clients (encaissés à leur date).
  versementsProjet.forEach((v) => {
    const projet = projets.find((p) => p.id === v.projetId)
    push('projet', v, {
      numero: `VERS-${v.id}`, date: v.date, client: { nom: projet?.clientNom || projet?.nom || '', tel: null },
      total: v.montant, mode: v.modePaiement, libelle: `Versement client : ${projet?.nom || 'projet'}`
    })
  })
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// Ajoute à chaque vente ses encaissements effectifs et son reste dû, selon les surcouches
// Trésorerie : `creances` (par cle : { aCredit, echeance, statut, echeancier, ... }) et
// `reglements` ({ cle, date, montant, compteId, mode, reference }).
export function avecEncaissements(ventes, { creances = [], reglements = [] } = {}) {
  const parCle = new Map(creances.map((c) => [c.cle || c.id, c]))
  const regs = new Map()
  for (const r of reglements) {
    if (!r.cle || montant(r.montant) <= 0) continue
    if (!regs.has(r.cle)) regs.set(r.cle, [])
    regs.get(r.cle).push(r)
  }
  return ventes.map((v) => {
    const surcouche = parCle.get(v.cle) || null
    const encaissements = []
    if (!surcouche?.aCredit && v.payeImmediat > 0) {
      encaissements.push({ id: `${v.cle}-imm`, date: v.date, montant: v.payeImmediat, mode: v.mode, immediat: true })
    }
    for (const r of (regs.get(v.cle) || []).sort((a, b) => jour(a.date).localeCompare(jour(b.date)))) {
      encaissements.push({ id: r.id, date: jour(r.date), montant: Math.round(montant(r.montant)), mode: r.mode, compteId: r.compteId || null, reference: r.reference || '' })
    }
    const encaisse = encaissements.reduce((s, e) => s + e.montant, 0)
    return { ...v, surcouche, encaissements, encaisse, reste: Math.max(0, v.total - encaisse) }
  })
}

// Suivi journalier : rassemble, en LECTURE SEULE, toutes les entrées d'argent (recettes) et toutes les
// sorties (dépenses) de tous les secteurs sous forme de lignes datées, pour en tirer, jour par jour, les
// recettes, les dépenses, le bénéfice et le chiffre d'affaires. Aucune saisie ni écriture : on reprend
// exactement les mêmes sources et les mêmes règles qu'E-DÉPENSES (cf. depense/SourcesRevenus.jsx et
// depense/RecettesDepenses.jsx), pour que les chiffres concordent.
import { SECTEURS, LOGISTIQUE_SITES, CATEGORIES_DEPENSE } from '../depense/data'
import { estDecaissee, siteLogistiqueDe, visibleDansEDepenses } from '../depense/logic'
import { todayStr, addDays } from '../../utils/formatters'

const SITES_GYM = [{ id: 'lome', label: 'Lomé' }, { id: 'kara', label: 'Kara' }]
const secteurDe = (id) => SECTEURS.find((s) => s.id === id)
const catLabel = (id) => CATEGORIES_DEPENSE.find((c) => c.id === id)?.label || id || 'Dépense'

// Vocabulaire d'une opération facturée selon le secteur : la Logistique LOUE du matériel (locations), le Gym facture des
// séances et des abonnements, les autres secteurs vendent. Sans secteur précis (vue de tous les secteurs), on parle de « ventes et locations ».
export function vocabulaire(secteurId) {
  if (secteurId === 'logistique') return { pluriel: 'Locations', moyenne: 'Moyenne par location', facture: 'Factures de locations' }
  if (secteurId === 'gym') return { pluriel: 'Séances et abonnements', moyenne: 'Moyenne par séance ou abonnement', facture: 'Factures de séances et abonnements' }
  if (!secteurId) return { pluriel: 'Ventes et locations', moyenne: 'Moyenne par opération', facture: 'Factures et ventes' }
  return { pluriel: 'Ventes', moyenne: 'Moyenne par vente', facture: 'Factures et ventes' }
}

// Domaine affiché (comme la colonne DOMAINE du fichier Excel des agents) : la caisse commune s'appelle
// « SIÈGE » ; MAXI LOGISTIQUE et MAXI-GYM précisent leur site.
export function domaineLibelle(secteurId, site) {
  const base = secteurId === 'divers' ? 'SIÈGE' : (secteurDe(secteurId)?.label || secteurId || 'AUTRE')
  const sites = secteurId === 'logistique' ? LOGISTIQUE_SITES : secteurId === 'gym' ? SITES_GYM : null
  const nomSite = sites?.find((x) => x.id === site)?.label
  return nomSite ? `${base} ${nomSite.toUpperCase()}` : base
}
export const couleurDomaine = (secteurId) => secteurDe(secteurId)?.color || '#64748b'

const montant = (v) => Number(v) || 0
const jour = (d) => (d ? String(d).slice(0, 10) : '')

// Secteurs proposés au filtre : ceux d'E-DÉPENSES, la caisse commune étant présentée comme le siège.
export const DOMAINES = SECTEURS.map((s) => ({ id: s.id, label: s.id === 'divers' ? 'SIÈGE' : s.label, color: s.color }))

// Lignes de RECETTES uniquement (les dépenses relèvent de la Caisse) : { id, date, designation, operateur, secteurId, site, entree, sortie, type, source }.
// `type` d'une entrée : 'facture' (vente facturée : compte dans le chiffre d'affaires), 'client' (versement
// d'un client de projet) ou 'manuel' (rentrée saisie à la main). Une sortie a pour type 'depense'.
export function construireLignes({
  facturesAgro = [], facturesLogistique = [], facturesEvenementiel = [],
  facturesGym = [], versementsRoutes = [], projets = [], revenusManuels = []
}) {
  const out = []

  // ----- Recettes : mêmes règles que « Sources de revenus » d'E-DÉPENSES (MAXI BAT et GARDERIE exclus) -----
  facturesAgro.filter((f) => f.statut === 'certifiee').forEach((f) => out.push({
    id: `agro_${f.id}`, date: jour(f.date), designation: `Facture ${f.numero || ''} : ${f.client?.nom || ''}`.trim(),
    operateur: f.agentNom || f.createdByNom || f.enregistrePar || '', secteurId: 'agro', site: null,
    entree: montant(f.totalTTC), sortie: 0, type: 'facture', source: 'agro'
  }))
  facturesLogistique.filter((f) => f.statut === 'approuvee').forEach((f) => out.push({
    id: `log_${f.id}`, date: jour(f.date), designation: `Facture ${f.num || ''} : ${f.clientNom || ''}`.trim(),
    operateur: f.agentNom || f.enregistrePar || '', secteurId: 'logistique', site: f.site || 'lome',
    entree: montant(f.totalTTC), sortie: 0, type: 'facture', source: 'logistique'
  }))
  facturesEvenementiel.forEach((f) => out.push({
    id: `evt_${f.id}`, date: jour(f.date), designation: `Facture ${f.numero || ''} : ${f.client?.nom || ''}`.trim(),
    operateur: f.agentNom || f.enregistrePar || '', secteurId: 'evenementiel', site: null,
    entree: montant(f.totalTTC), sortie: 0, type: 'facture', source: 'evenementiel'
  }))
  facturesGym.forEach((f) => out.push({
    id: `gym_${f.id}`, date: jour(f.date), designation: `${f.description || 'Facture'} : ${f.clientNom || ''}`.trim(),
    operateur: f.enregistrePar || '', secteurId: 'gym', site: f.site || 'lome',
    entree: montant(f.montant), sortie: 0, type: 'facture', source: 'gym'
  }))
  versementsRoutes.forEach((v) => {
    const projet = projets.find((p) => p.id === v.projetId)
    out.push({
      id: `vers_${v.id}`, date: jour(v.date), designation: `Versement client : ${projet?.nom || 'projet'}`,
      operateur: v.enregistrePar || '', secteurId: v.secteurId, site: null,
      entree: montant(v.montant), sortie: 0, type: 'client', source: 'projet'
    })
  })
  revenusManuels.forEach((r) => out.push({
    id: `man_${r.id}`, date: jour(r.date), designation: r.description || 'Revenu saisi manuellement',
    operateur: r.enregistrePar || '', secteurId: r.secteurId, site: r.secteurId === 'logistique' ? siteLogistiqueDe(r) : (r.site || null),
    entree: montant(r.montant), sortie: 0, type: 'manuel', source: 'manuel'
  }))

  // Aucune dépense ici : les dépenses sortent de la CAISSE (volet Caisse), pas des recettes.

  // Les secteurs sans revenu suivi (MAXI BAT, GARDERIE) ne comptent pas côté recettes, comme dans E-DÉPENSES.
  return out.filter((l) => l.date && !(l.entree > 0 && (l.secteurId === 'bat' || l.secteurId === 'garderie')))
}

// ----- Caisse : uniquement les DOTATIONS de caisse (entrées) et les DÉPENSES (sorties) -----
// Comme le journal tenu sur Excel par les agents : une dotation est un apport de budget dans E-DÉPENSES
// (chaque « révision » d'un budget : montant ajouté = nouveau - ancien), une dépense est une dépense
// décaissée financée par l'entreprise (ni apport du PAU, ni dépense de projet E-G.Pro). Aucune facture ici :
// les ventes et le chiffre d'affaires sont dans le volet « Recettes ». `brut` garde l'enregistrement
// d'origine pour afficher le détail au clic.
const jourDeMs = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const MOTIFS_PAR_DEFAUT = ['Apport à la caisse commune', 'Allocation initiale', 'Dotation de caisse']
// Un « report » est le reste du mois précédent que l'agent saisit en premier apport du mois (« reste du solde du mois
// de septembre », « solde restant du mois précédent »…) : au premier du mois, il constitue le solde initial.
const EST_REPORT = /(reste|restant|solde|report)/i

export function construireLignesCaisse({ depenses = [], coutsMatieres = [], budgets = [] }) {
  const out = []
  // La Caisse est la CAISSE COMMUNE d'E-DÉPENSES : son budget (dotations) et ses dépenses, avec la même règle que sa
  // carte « Caisse commune » (cf. depensesEntrepriseSecteurDates). Les budgets des secteurs restent dans E-DÉPENSES.
  budgets.filter((b) => b.secteurId === 'divers').forEach((b) => {
    const site = b.secteurId === 'logistique' ? siteLogistiqueDe(b) : (b.site || null)
    const revisions = b.revisions || []
    const base = { secteurId: b.secteurId, site, type: 'dotation', source: 'budget' }
    if (revisions.length) {
      revisions.forEach((r) => {
        const delta = (Number(r.nouveau) || 0) - (Number(r.ancien) || 0)
        if (!delta || !r.date) return
        const motif = r.motif && !MOTIFS_PAR_DEFAUT.includes(r.motif) ? ` : ${r.motif}` : ''
        out.push({
          ...base, id: `dot_${b.id}_${r.id}`, date: jourDeMs(r.date), createdAt: r.date, operateur: r.auteur && r.auteur !== '—' ? r.auteur : '',
          designation: delta > 0 ? `Dotation de caisse${motif}` : `Réduction de dotation${motif}`,
          entree: delta > 0 ? delta : 0, sortie: delta < 0 ? -delta : 0, brut: { revision: r, budget: b },
          report: delta > 0 && EST_REPORT.test(r.motif || '')
        })
      })
    } else if ((Number(b.montant) || 0) > 0 && b.annee && b.mois) {
      out.push({
        ...base, id: `dot_${b.id}`, date: `${b.annee}-${String(b.mois).padStart(2, '0')}-01`, createdAt: b.updatedAt || 0, operateur: '',
        designation: 'Dotation de caisse', entree: Number(b.montant) || 0, sortie: 0, brut: { revision: null, budget: b }
      })
    }
  })
  ;[...depenses.filter((d) => !d.projetId), ...coutsMatieres]
    .filter(visibleDansEDepenses).filter(estDecaissee)
    .filter((d) => (d.sourceFinancement || 'entreprise') !== 'pau' && d.source !== 'remboursement_pau' && d.source !== 'projet')
    .filter((d) => d.financePar === 'caisse_commune' || d.secteurId === 'divers')
    .forEach((d) => {
      // Un « retour de reliquat » (dépense de montant négatif, source retour_reliquat) ramène de l'argent à la caisse :
      // c'est une ENTRÉE du journal, pas une dépense.
      const m = montant(d.montant)
      const retour = d.source === 'retour_reliquat' || m < 0
      out.push({
        id: `dep_${d.id}`, date: jour(d.date), designation: d.description || catLabel(d.categorie),
        operateur: d.enregistrePar && d.enregistrePar !== '—' ? d.enregistrePar : '', secteurId: 'divers',
        site: null,
        entree: retour ? Math.abs(m) : 0, sortie: retour ? 0 : m, type: retour ? 'retour' : 'depense', source: d.source || 'depense', createdAt: d.createdAt || 0, brut: d
      })
    })
  return out.filter((l) => l.date)
}

// Bornes {start, end} (AAAA-MM-JJ) selon le mode du filtre de période.
export function bornesPeriode(mode, { jour: j, mois, annee, debut, fin }, aujourdhui = todayStr()) {
  if (mode === 'jour') { const x = j || aujourdhui; return { start: x, end: x } }
  if (mode === 'annee') { const an = annee || aujourdhui.slice(0, 4); return { start: `${an}-01-01`, end: `${an}-12-31` } }
  if (mode === 'plage') return { start: debut || aujourdhui, end: fin || aujourdhui }
  const m = mois || aujourdhui.slice(0, 7)
  const dernier = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate()
  return { start: `${m}-01`, end: `${m}-${String(dernier).padStart(2, '0')}` }
}

// Période immédiatement précédente, de même nature : la veille pour un jour, le mois d'avant pour un mois, l'année
// d'avant pour une année, sinon la plage de même durée juste avant. Sert aux indicateurs de croissance.
// Quand le mois (ou l'année) n'est PAS terminé, on compare à la MÊME DURÉE de la période d'avant : le 15 octobre,
// « octobre » est comparé au 1er au 15 septembre, pas à septembre entier.
const jj = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const plusTot = (a, b) => (a < b ? a : b)
export function periodePrecedente({ start, end }, aujourdhui = todayStr()) {
  const jours = Math.round((new Date(end) - new Date(start)) / 86400000) + 1
  const [an, mois] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))]
  const finDuMois = new Date(an, mois, 0).getDate()
  const enCours = start <= aujourdhui && aujourdhui < end // période commencée mais pas terminée
  const ecoules = enCours ? Math.round((new Date(aujourdhui) - new Date(start)) / 86400000) + 1 : jours

  if (start.endsWith('-01') && end === `${start.slice(0, 7)}-${String(finDuMois).padStart(2, '0')}`) {
    const d = new Date(an, mois - 2, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const finPrec = `${m}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
    const finMeme = enCours ? plusTot(finPrec, addDays(`${m}-01`, ecoules - 1)) : finPrec
    return { start: `${m}-01`, end: finMeme, label: enCours && finMeme < finPrec ? `le mois précédent (du 01/${m.slice(5)} au ${jj(finMeme)})` : 'le mois précédent' }
  }
  if (start === `${an}-01-01` && end === `${an}-12-31`) {
    const finPrec = `${an - 1}-12-31`
    const finMeme = enCours ? plusTot(finPrec, addDays(`${an - 1}-01-01`, ecoules - 1)) : finPrec
    return { start: `${an - 1}-01-01`, end: finMeme, label: enCours && finMeme < finPrec ? `l'année précédente (du 01/01 au ${jj(finMeme)})` : "l'année précédente" }
  }
  const finPrec = addDays(start, -1)
  return { start: addDays(finPrec, -(jours - 1)), end: finPrec, label: jours === 1 ? 'hier' : 'la période précédente' }
}

const ordre = (a, b) => (a.date === b.date ? (b.entree > 0 ? 1 : 0) - (a.entree > 0 ? 1 : 0) || (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1)

// Journal d'une période : solde initial, lignes avec solde cumulé, totaux.
// Par défaut le solde initial est tout ce qui précède la période (recettes).
// Avec `mensuel` (Caisse), on suit E-DÉPENSES mois par mois : le solde initial d'un mois est le REPORT que les agents
// saisissent en premier apport du mois (« reste du solde du mois de septembre »), c'est-à-dire ce qui restait dans la
// caisse. Les dotations du mois s'y ajoutent, les dépenses s'en retranchent. Sans report saisi, on prend le solde de fin
// du mois précédent (budget alloué moins dépenses). `controle` compare le report saisi à ce solde calculé : un écart
// signale une dépense, un apport ou un comptage à vérifier.
export function journalPeriode(lignes, { start, end }, { mensuel = false } = {}) {
  let soldeInitial
  let source = lignes
  let controle = null
  if (mensuel) {
    const net = (l) => l.entree - l.sortie
    const mois = (d) => d.slice(0, 7)
    const moisAvant = (m) => { const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
    const m = mois(start)
    const duMoisAvant = lignes.filter((l) => mois(l.date) === moisAvant(m))
    const saisi = lignes.filter((l) => l.report && mois(l.date) === m).reduce((t, l) => t + net(l), 0)
    const calcule = duMoisAvant.length ? duMoisAvant.reduce((t, l) => t + net(l), 0) : null
    const debutMois = `${m}-01`
    soldeInitial = (saisi || calcule || 0) + lignes.filter((l) => !l.report && l.date >= debutMois && l.date < start).reduce((t, l) => t + net(l), 0)
    // Un report ne compte jamais comme dotation, sauf l'ouverture d'un mois sans mois précédent, quand la période commence plus tôt.
    const estOuverture = (l) => l.report && !lignes.some((x) => mois(x.date) === moisAvant(mois(l.date)))
    source = lignes.filter((l) => !l.report || (estOuverture(l) && mois(l.date) !== m))
    if (calcule !== null && saisi) controle = { saisi, calcule, ecart: saisi - calcule }
  } else {
    soldeInitial = lignes.filter((l) => l.date < start).reduce((s, l) => s + l.entree - l.sortie, 0)
  }
  let cumul = soldeInitial
  const dansPeriode = source.filter((l) => l.date >= start && l.date <= end).sort(ordre)
    .map((l) => { cumul += l.entree - l.sortie; return { ...l, solde: cumul } })
  const recettes = dansPeriode.reduce((s, l) => s + l.entree, 0)
  const depenses = dansPeriode.reduce((s, l) => s + l.sortie, 0)
  const chiffreAffaires = dansPeriode.filter((l) => l.type === 'facture').reduce((s, l) => s + l.entree, 0)
  return { soldeInitial, lignes: dansPeriode, recettes, depenses, benefice: recettes - depenses, chiffreAffaires, soldeFinal: cumul, controle }
}

// Récapitulatif par jour (du plus ancien au plus récent), avec le bénéfice cumulé depuis le début de la période.
export function recapParJour(journal) {
  const map = new Map()
  journal.lignes.forEach((l) => {
    const x = map.get(l.date) || { date: l.date, recettes: 0, depenses: 0, chiffreAffaires: 0, ventes: 0, nb: 0 }
    x.recettes += l.entree; x.depenses += l.sortie; x.nb += 1
    if (l.type === 'facture') { x.chiffreAffaires += l.entree; x.ventes += 1 }
    map.set(l.date, x)
  })
  let cumul = journal.soldeInitial
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).map((x) => {
    const benefice = x.recettes - x.depenses
    cumul += benefice
    return { ...x, benefice, cumul }
  })
}

// Récapitulatif par secteur (domaine, site compris pour Logistique et Gym) : recettes, CA, dépenses, bénéfice.
export function recapParSecteur(journal) {
  const map = new Map()
  journal.lignes.forEach((l) => {
    const cle = `${l.secteurId}|${l.site || ''}`
    const x = map.get(cle) || { cle, secteurId: l.secteurId, site: l.site, domaine: domaineLibelle(l.secteurId, l.site), couleur: couleurDomaine(l.secteurId), recettes: 0, depenses: 0, chiffreAffaires: 0, ventes: 0 }
    x.recettes += l.entree; x.depenses += l.sortie
    if (l.type === 'facture') { x.chiffreAffaires += l.entree; x.ventes += 1 }
    map.set(cle, x)
  })
  return [...map.values()].map((x) => ({ ...x, benefice: x.recettes - x.depenses })).sort((a, b) => b.chiffreAffaires - a.chiffreAffaires || b.recettes - a.recettes)
}


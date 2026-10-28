// COMPTABILITÉ — Suivi journalier, pour la direction, en deux volets (sous-menu du même nom) :
//  - CAISSE : tous les mouvements de la caisse courante, tous secteurs, comme le journal tenu sur Excel par les
//    agents (date, désignation, opérateur, domaine, entrées, sorties, solde, solde initial, couleur par domaine) ;
//  - RECETTES : le chiffre d'affaires, les recettes, les dépenses et le bénéfice, par jour et par secteur.
// Lecture seule : tout est repris d'E-DÉPENSES et des modules, sans nouvelle saisie.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, Landmark, Layers, ChevronRight, CalendarCheck, Wallet, TrendingUp, TrendingDown, Scale, Target, BadgeDollarSign, FileSpreadsheet, Inbox, Receipt } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Modal from '../../shared/ui/Modal'
import StatCard from '../../shared/ui/StatCard'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { canExportExcel, isFullAccessRole, isReadOnlyRole } from '../../core/roles'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { coutsMatieresBriqueterie, versementsClientVersSecteurs, depensesProjetVersSecteurs } from '../depense/logic'
import BandeauCompta, { OngletsBande, ChampBande, CLASSE_CHAMP_BANDE } from './BandeauCompta'
import CaisseFiche from './CaisseFiche'
import DotationModal from './DotationModal'
import SecteurDetail from './SecteurDetail'
import { useQuotas, cibleQuota, avancement, etatAvancement, couleurPole, ICONE_POLE, POLE_SECTEUR } from './quotas'
import CarteSecteur, { Tendance, STYLES_TENDANCE } from './CarteSecteur'
import { iconeLigne, ICONE_DOTATION, COULEUR_DOTATION, COULEUR_DEPENSE } from './iconesCaisse'
import { icone3D, glassModalProps } from '../../utils/color'
import { genererRapportJournalier } from './rapportJournalierPDF'
import { toast } from '../../core/notifications'
import { MOIS_LABELS } from '../depense/data'
import { useReportAutomatique } from '../depense/reportAuto'
import { recapPoles, poleDe, POLES, construireLignes, construireLignesCaisse, bornesPeriode, journalPeriode, recapParJour, recapParSecteur, periodePrecedente, vocabulaire, domaineLibelle, couleurDomaine, DOMAINES } from './journalCalculs'

// Parties du rapport PDF que l'utilisateur peut inclure ou retirer
const SECTIONS_RAPPORT = [
  { id: 'banques', label: 'Comptes bancaires', Icone: Landmark, couleur: '#2563eb' },
  { id: 'caisse', label: 'Caisse', Icone: Wallet, couleur: '#16a34a' },
  { id: 'secteurs', label: 'Détail par secteur', Icone: Layers, couleur: '#ea580c' },
  { id: 'depenses', label: 'Dépenses', Icone: Receipt, couleur: '#dc2626' },
  { id: 'operations', label: 'Opérations détaillées', Icone: Inbox, couleur: '#7c3aed' }
]

const TH = 'sticky top-0 z-10 bg-orange-50 shadow-[0_1px_0_rgba(234,88,12,0.25)] dark:bg-gray-800 px-3 py-2.5'
const TF = 'sticky bottom-0 z-10 bg-orange-50 px-3 py-2.5 shadow-[0_-1px_0_rgba(234,88,12,0.25)] dark:bg-gray-800'
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR')
const signe = (n) => `${n >= 0 ? '+' : '-'}${fmt(Math.abs(n))}`
const VUES_RECETTES = [{ id: 'secteur', label: 'Par secteur' }, { id: 'jour', label: 'Par jour' }, { id: 'detail', label: 'Détail' }]

// Objectif de recettes du mois d'un secteur (Paramètres comptables), affiché sous son nom : recettes du mois sur l'objectif, et pourcentage atteint.
function ObjectifSecteur({ realise, cible, total = false }) {
  const pct = avancement(realise, cible)
  const etat = etatAvancement(pct)
  return (
    <span className="mt-2.5 flex w-full min-w-[220px] max-w-[300px] items-center justify-between gap-2 normal-case">
      <span className="min-w-0 text-[11px] font-semibold leading-snug text-gray-500">
        <span className="flex items-center gap-1 text-[10px] font-bold"><Target size={10} style={{ color: etat.couleur }} strokeWidth={2.6} />{total ? 'Objectifs du mois' : 'Objectif du mois'}</span>
        <span className="block whitespace-nowrap"><strong className="text-green-700">+{fmt(realise)}</strong> sur {fmt(cible)} FCFA</span>
      </span>
      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white" style={{ background: etat.couleur }}>{Math.round(pct)} %</span>
    </span>
  )
}

// page : 'caisse' (journal des mouvements) ou 'recettes' (chiffre d'affaires, par jour et par secteur).
// `couleur` : couleur du bandeau (orange de la Comptabilité par défaut ; E-DÉPENSES réutilise cet écran pour « Sources de revenus »).
// `epure` (E-DÉPENSES, « Sources de revenus ») : seulement les indicateurs et le tableau « Par jour », sans onglets, sans export Excel ni rapport PDF.
export default function SuiviJournalier({ page = 'caisse', couleur, epure = false }) {
  const role = useAuth((s) => s.role)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const jourParam = params.get('jour') // ouvre directement la caisse d'un jour précis (clic dans « Par jour »)
  const caisse = page === 'caisse'
  const { data: depenses } = useCollection('depense_depenses')
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  const { data: facturesAgro } = useCollection('agro_factures')
  const { data: facturesLogistique } = useCollection('logistique_factures')
  const { data: facturesEvenementiel } = useCollection('evenementiel_factures')
  const { data: facturesGym } = useCollection('gym_factures')
  const { data: projets } = useCollection('projets')
  const { data: versements } = useCollection('projet_versements_client')
  const { data: revenusManuels } = useCollection('depense_revenus_manuels')
  const { data: paiementsGarderie } = useCollection('garderie_paiements')
  const { data: transports } = useCollection('evenementiel_transports')
  const { data: depensesProjet } = useCollection('projet_depenses')
  const { data: budgets } = useCollection('depense_budgets')
  const { quotas } = useQuotas() // quotas mensuels de recettes par secteur (Paramètres)
  const user = useAuth((s) => s.user)
  useReportAutomatique(caisse) // le report du mois est créé tout seul dans E-DÉPENSES, la Caisse le reprend
  const [dotation, setDotation] = useState(false) // fenêtre « Nouvelle dotation » (Caisse)

  const [mode, setMode] = useState(jourParam ? 'jour' : 'mois')
  const [fJour, setFJour] = useState(jourParam || '')
  const [fMois, setFMois] = useState(todayStr().slice(0, 7))
  const [fAnnee, setFAnnee] = useState('')
  const [fDebut, setFDebut] = useState('')
  const [fFin, setFFin] = useState('')
  const [secteur, setSecteur] = useState('') // '' = tous les secteurs
  const [recherche, setRecherche] = useState('')
  const [fiche, setFiche] = useState(null) // ligne de la caisse dont on consulte le détail
  const [detailSecteur, setDetailSecteur] = useState(null) // carte de secteur ouverte (volet Recettes)
  const [vue, setVue] = useState(epure ? 'jour' : 'secteur')
  const [mouvementsOuverts, setMouvementsOuverts] = useState(false) // fenêtre « détail des mouvements » (KPI Mouvements, E-DÉPENSES)
  const [jourVue, setJourVue] = useState(todayStr()) // jour affiché dans « Par jour »
  const [rapport, setRapport] = useState(null) // fenêtre « Rapport du jour » : { mode, jour, mois, annee, debut, fin, sections }
  const [rapportEnCours, setRapportEnCours] = useState(false)
  const [poleOuvert, setPoleOuvert] = useState(null) // pôle dont on consulte le détail des opérations
  const [periodeDetail, setPeriodeDetail] = useState('jour') // détail d'un pôle : opérations du 'jour' ou du 'mois'
  const vueActive = caisse ? 'journal' : vue

  const lignesCaisse = useMemo(() => construireLignesCaisse({ depenses, coutsMatieres: coutsMatieresBriqueterie(inventairesBriq), budgets }), [depenses, inventairesBriq, budgets])
  // Recettes : factures, versements de clients et saisies manuelles, SANS aucune dépense (elles sortent de la caisse).
  const lignesRecettes = useMemo(() => construireLignes({
    facturesAgro, facturesLogistique, facturesEvenementiel, facturesGym,
    versementsRoutes: versementsClientVersSecteurs(versements, projets), projets, revenusManuels
  }), [facturesAgro, facturesLogistique, facturesEvenementiel, facturesGym, versements, projets, revenusManuels])
  const toutes = caisse ? lignesCaisse : lignesRecettes
  // Détail d'un jour (clic dans « Par jour ») : une ligne par pôle, recettes et dépenses du jour et du mois jusqu'à ce jour.
  const tableau = useMemo(() => (jourVue ? recapPoles({
    jour: jourVue, lignesRecettes, paiementsGarderie, transports,
    // Toutes les dépenses : celles d'E-DÉPENSES, plus celles saisies directement dans les modules (coûts de matières de la Briqueterie,
    // dépenses des projets E-G.Pro rangées par secteur). Celles d'E-DÉPENSES liées à un projet sont déjà comptées côté projet.
    depenses: [...depenses.filter((d) => !d.projetId), ...coutsMatieresBriqueterie(inventairesBriq), ...depensesProjetVersSecteurs(depensesProjet, projets, [])]
  }) : { rows: [], total: { rj: 0, dj: 0, rm: 0, dm: 0 } }), [jourVue, lignesRecettes, paiementsGarderie, transports, depenses, inventairesBriq, depensesProjet, projets])
  // Colonnes « Objectif du mois » et « Avancement » du tableau : seulement quand au moins un objectif est fixé.
  const avecQuotas = Object.keys(quotas).length > 0
  const totalQuotaTableau = tableau.rows.reduce((s, r) => s + (quotas[r.id] || 0), 0)
  const recettesAvecQuota = tableau.rows.reduce((s, r) => s + (quotas[r.id] ? r.rm : 0), 0)
  const decaleJour = (n) => { const d = new Date(`${jourVue || todayStr()}T00:00:00`); d.setDate(d.getDate() + n); setJourVue(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) }

  // Rapport financier en PDF (celui que le DF envoie au PAU) : il SUIT le filtre de période du haut de la page (Jour, Mois, Année ou Plage),
  // et la période est écrite dans l'en-tête. Pour un seul jour : situation du jour, du mois et de l'année ; sinon : situation de la période choisie.
  const bornesRapport = () => bornesPeriode(rapport?.mode || 'mois', { jour: rapport?.jour, mois: rapport?.mois, annee: rapport?.annee, debut: rapport?.debut, fin: rapport?.fin })
  const intituleRapport = (br) => {
    const [a, m] = br.start.split('-')
    const court = (d) => d.split('-').reverse().join('/')
    if (br.start === br.end) return `AU ${court(br.end)}`
    if (rapport?.mode === 'mois') return `: ${MOIS_LABELS[Number(m) - 1].toUpperCase()} ${a}`
    if (rapport?.mode === 'annee') return `: ANNÉE ${a}`
    return `DU ${court(br.start)} AU ${court(br.end)}`
  }
  async function genererRapport() {
    const br = bornesRapport()
    const debut = br.start
    const fin = br.end
    setRapportEnCours(true)
    try {
      const depensesToutes = [...depenses.filter((d) => !d.projetId), ...coutsMatieresBriqueterie(inventairesBriq), ...depensesProjetVersSecteurs(depensesProjet, projets, [])]
      const entrees = { lignesRecettes, paiementsGarderie, transports, depenses: depensesToutes }
      const surPeriode = recapPoles({ jour: fin, debut, ...entrees }) // recettes et dépenses de début à fin (colonnes « mois » du tableau)
      const duJour = recapPoles({ jour: fin, ...entrees }) // le dernier jour et le mois en cours jusqu'à ce jour
      const annee = recapPoles({ jour: fin, debut: `${fin.slice(0, 4)}-01-01`, ...entrees })
      const debutMois = `${fin.slice(0, 7)}-01`
      const caissePeriode = journalPeriode(lignesCaisse, { start: debut, end: fin }, { mensuel: true })
      const caisseMois = journalPeriode(lignesCaisse, { start: debutMois, end: fin }, { mensuel: true })
      const moisPrec = new Date(Number(fin.slice(0, 4)), Number(fin.slice(5, 7)) - 2, 1)
      const jourSeul = debut === fin
      await genererRapportJournalier({
        debut, fin, intitule: intituleRapport(br),
        periodes: {
          jour: { r: duJour.total.rj, d: duJour.total.dj },
          mois: { r: duJour.total.rm, d: duJour.total.dm },
          choisie: { r: surPeriode.total.rm, d: surPeriode.total.dm },
          annee: { r: annee.total.rm, d: annee.total.dm }
        },
        secteurs: jourSeul ? duJour : surPeriode,
        caisse: {
          moisPrecedent: MOIS_LABELS[moisPrec.getMonth()].toUpperCase(),
          debutMoisPlusAlimentation: caisseMois.soldeInitial + caisseMois.recettes,
          soldeVeille: caissePeriode.soldeInitial, alimentation: caissePeriode.recettes, depenses: caissePeriode.depenses, soldeFin: caissePeriode.soldeFinal
        },
        depensesPeriode: surPeriode.rows.flatMap((r) => r.details).filter((o) => o.sens === 'depense' && o.date >= debut && o.date <= fin)
          .sort((x, y) => (x.date < y.date ? -1 : 1)).map((o) => ({ date: o.date, libelle: o.libelle, montant: o.montant })),
        sections: rapport?.sections
      })
      setRapport(null)
      toast.success('Rapport PDF généré ✓')
    } catch (e) {
      console.error('[rapport] échec', e)
      toast.error('Impossible de générer le rapport : ' + (e?.message || e))
    } finally { setRapportEnCours(false) }
  }

  // Export Excel du tableau « Par jour » : le seul export de la page Recettes (l'export du journal est dans la Caisse).
  function exporterTableau() {
    exportRapportExcel({
      filename: `recettes-par-secteur-${jourVue}.xlsx`,
      sections: [{
        name: 'Par secteur', title: 'Recettes et dépenses par secteur', subtitle: `Jour : ${formatDateShort(jourVue)} · mois en cours jusqu'à ce jour`,
        columns: [
          { key: 'pole', label: 'Secteurs', width: 34 }, { key: 'rj', label: 'Recettes du jour', type: 'money', width: 18 }, { key: 'dj', label: 'Dépenses du jour', type: 'money', width: 18 },
          { key: 'rm', label: 'Recettes du mois', type: 'money', width: 18 }, { key: 'dm', label: 'Dépenses du mois', type: 'money', width: 18 }
        ],
        rows: tableau.rows.map((r) => ({ pole: r.label, rj: r.rj, dj: r.dj, rm: r.rm, dm: r.dm })),
        totals: { __label: 'TOTAL', rj: tableau.total.rj, dj: tableau.total.dj, rm: tableau.total.rm, dm: tableau.total.dm }
      }]
    })
  }

  const bornes = useMemo(() => bornesPeriode(mode, { jour: fJour, mois: fMois, annee: fAnnee, debut: fDebut, fin: fFin }), [mode, fJour, fMois, fAnnee, fDebut, fFin])
  const journal = useMemo(() => journalPeriode(secteur ? toutes.filter((l) => l.secteurId === secteur) : toutes, bornes, { mensuel: caisse }), [toutes, secteur, bornes, caisse])
  const lignesAffichees = useMemo(() => journal.lignes.filter((l) => correspond(recherche, l.designation, l.operateur, domaineLibelle(l.secteurId, l.site))), [journal, recherche])
  const parJour = useMemo(() => recapParJour(journal), [journal])
  const parSecteur = useMemo(() => recapParSecteur(journal), [journal])
  // Période précédente (même filtre de secteur) : sert aux indicateurs de croissance.
  const prec = useMemo(() => periodePrecedente(bornes), [bornes])
  const parSecteurPrec = useMemo(() => {
    const j = journalPeriode(secteur ? toutes.filter((l) => l.secteurId === secteur) : toutes, prec, { mensuel: caisse })
    return { journal: j, parCle: new Map(recapParSecteur(j).map((x) => [x.cle, x])) }
  }, [toutes, secteur, prec, caisse])

  // Objectifs : recettes déjà encaissées par secteur face à l'objectif mensuel, affichées dans chaque carte de secteur (le mois pour un jour ou une
  // plage, l'année pour une année : douze mois de quota).
  const quotaMode = mode === 'annee' ? 'annee' : 'mois'
  const quotaFenetre = useMemo(() => (mode === 'annee' || mode === 'mois' ? { start: bornes.start, end: bornes.end } : { start: `${bornes.end.slice(0, 7)}-01`, end: bornes.end }), [mode, bornes])
  const realiseParPole = useMemo(() => {
    if (!Object.keys(quotas).length) return new Map()
    return new Map(recapPoles({ jour: quotaFenetre.end, debut: quotaFenetre.start, lignesRecettes, paiementsGarderie, transports, depenses: [] }).rows.map((x) => [x.id, x]))
  }, [quotas, quotaFenetre, lignesRecettes, paiementsGarderie, transports])
  const quotaDuPole = (poleId) => (quotas[poleId] ? { cible: cibleQuota(quotas[poleId], quotaMode), realise: realiseParPole.get(poleId)?.rm || 0, periode: quotaMode === 'annee' ? "de l'année" : 'du mois' } : null)
  // Un secteur qui a un objectif mais aucun mouvement dans la période garde sa carte (sans cela, son objectif resterait invisible).
  const cartesQuotaSeules = useMemo(() => {
    if (secteur) return []
    const presents = new Set(parSecteur.map((x) => poleDe(x.secteurId, x.site)))
    return POLES.filter((pl) => quotas[pl.id] && !presents.has(pl.id)).map((pl) => {
      const { secteurId, site } = POLE_SECTEUR[pl.id]
      const r = realiseParPole.get(pl.id)
      const recettes = r?.rm || 0
      return { cle: `quota|${pl.id}`, secteurId, site, domaine: pl.label, couleur: couleurPole(pl.id), recettes, depenses: 0, chiffreAffaires: recettes, ventes: (r?.details || []).filter((o) => o.sens === 'recette').length, benefice: recettes, quotaSeul: true }
    })
  }, [secteur, parSecteur, quotas, realiseParPole])
  const libellePeriode = bornes.start === bornes.end ? `le ${formatDateShort(bornes.start)}` : `du ${formatDateShort(bornes.start)} au ${formatDateShort(bornes.end)}`
  const totalAffEntrees = lignesAffichees.reduce((s, l) => s + l.entree, 0)
  const totalAffSorties = lignesAffichees.reduce((s, l) => s + l.sortie, 0)
  const vocab = vocabulaire(secteur || null) // « locations » pour la Logistique, « ventes » ailleurs, « ventes et locations » pour tous
  const maxCA = Math.max(1, ...parSecteur.map((x) => Math.max(x.chiffreAffaires, x.recettes)))

  // Ouvre le journal détaillé d'un jour précis (clic dans « Par jour »).
  const ouvrirJour = (j) => setDetailSecteur({
    cle: '*', secteurId: 'divers', icone: CalendarCheck, domaine: `la journée du ${formatDateShort(j.date)}`, couleur: '#ea580c',
    recettes: j.recettes, depenses: j.depenses, benefice: j.benefice, chiffreAffaires: j.chiffreAffaires, date: j.date
  })

  function exporter() {
    const nom = DOMAINES.find((d) => d.id === secteur)?.label
    exportRapportExcel({
      filename: `${caisse ? 'caisse' : 'recettes'}${secteur ? `-${secteur}` : ''}-${bornes.start}${bornes.end !== bornes.start ? `_${bornes.end}` : ''}.xlsx`,
      sections: [
        {
          name: 'Journal', title: `Suivi journalier${nom ? ` : ${nom}` : ' : tous les secteurs'}`, subtitle: `Période : ${libellePeriode}`,
          columns: [
            { key: 'date', label: 'Date', width: 12 }, { key: 'designation', label: 'Désignation', width: 46 }, { key: 'operateur', label: 'Opérateur', width: 18 },
            { key: 'domaine', label: 'Domaine', width: 24 }, { key: 'entrees', label: 'Entrées', type: 'money', width: 16 }, { key: 'sorties', label: 'Sorties', type: 'money', width: 16 },
            { key: 'solde', label: 'Solde', type: 'money', width: 16 }
          ],
          rows: [
            { date: '', designation: 'SOLDE INITIAL', operateur: '', domaine: '', entrees: 0, sorties: 0, solde: journal.soldeInitial },
            ...journal.lignes.map((l) => ({ date: formatDateShort(l.date), designation: l.designation, operateur: l.operateur, domaine: domaineLibelle(l.secteurId, l.site), entrees: l.entree, sorties: l.sortie, solde: l.solde }))
          ],
          totals: { __label: 'TOTAL', entrees: journal.recettes, sorties: journal.depenses, solde: journal.soldeFinal }
        },
        {
          name: 'Détail', title: `Détail des recettes${nom ? ` : ${nom}` : ' : tous les secteurs'}`, subtitle: `Période : ${libellePeriode}`,
          columns: [
            { key: 'date', label: 'Date', width: 12 }, { key: 'designation', label: 'Recette', width: 50 }, { key: 'operateur', label: 'Opérateur', width: 18 },
            { key: 'domaine', label: 'Secteur', width: 24 }, { key: 'montant', label: 'Montant', type: 'money', width: 16 }
          ],
          rows: journal.lignes.map((l) => ({ date: formatDateShort(l.date), designation: l.designation, operateur: l.operateur, domaine: domaineLibelle(l.secteurId, l.site), montant: l.entree })),
          totals: { __label: 'TOTAL', montant: journal.recettes }
        },
        {
          name: 'Par jour', title: "Recettes et chiffre d'affaires par jour", subtitle: `Période : ${libellePeriode}`,
          columns: [
            { key: 'date', label: 'Date', width: 12 }, { key: 'recettes', label: 'Recettes', type: 'money', width: 16 },
            { key: 'ca', label: "Chiffre d'affaires", type: 'money', width: 18 }, { key: 'ventes', label: vocab.pluriel, width: 14 }
          ],
          rows: parJour.map((j) => ({ date: formatDateShort(j.date), recettes: j.recettes, ca: j.chiffreAffaires, ventes: j.ventes })),
          totals: { __label: 'TOTAL', recettes: journal.recettes, ca: journal.chiffreAffaires }
        },
        {
          name: 'Par secteur', title: "Chiffre d'affaires par secteur", subtitle: `Période : ${libellePeriode}`,
          columns: [
            { key: 'domaine', label: 'Secteur', width: 28 }, { key: 'ca', label: "Chiffre d'affaires", type: 'money', width: 18 },
            { key: 'recettes', label: 'Recettes', type: 'money', width: 16 }, { key: 'ventes', label: vocab.pluriel, width: 14 }
          ],
          rows: parSecteur.map((x) => ({ domaine: x.domaine, ca: x.chiffreAffaires, recettes: x.recettes, ventes: x.ventes })),
          totals: { __label: 'TOTAL', ca: journal.chiffreAffaires, recettes: journal.recettes }
        }
      ].filter((x) => (caisse ? x.name === 'Journal' : x.name !== 'Journal'))
    })
  }

  const rendreDetail = () => {
        const jours = []
        lignesAffichees.forEach((l) => {
          let g = jours[jours.length - 1]
          if (!g || g.date !== l.date) { g = { date: l.date, lignes: [], total: 0 }; jours.push(g) }
          g.lignes.push(l)
          g.total += l.entree
        })
        if (!lignesAffichees.length) {
          return <Card><p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-gray-400"><Inbox size={28} />Aucune recette sur cette période.</p></Card>
        }
        return (
          <div className="space-y-4">
            {jours.map((g, gi) => (
              <section key={g.date} className="ed-entree" style={{ animationDelay: `${Math.min(gi, 8) * 50}ms` }}>
                <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                  <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D('#ea580c')}><CalendarCheck size={12} /></span>
                    {formatDateShort(g.date)}
                    <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-gray-500 ring-1 ring-black/5">{g.lignes.length}</span>
                  </p>
                  <span className="text-xs font-extrabold text-green-700">+{fmt(g.total)} FCFA</span>
                </div>
                <div className="space-y-1.5">
                  {g.lignes.map((l) => {
                    const couleur = couleurDomaine(l.secteurId)
                    const { icone: Ic, couleur: cc, libelle } = iconeLigne(l)
                    return (
                      <button key={l.id} type="button" onClick={() => setFiche(l)} style={{ borderLeftColor: couleur }}
                        className="group flex w-full items-center gap-3 rounded-2xl border border-l-4 border-white/80 bg-white/70 px-3 py-2.5 text-left shadow-[0_8px_18px_-14px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-md">
                        <span title={libelle} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(cc)}><Ic size={16} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold uppercase text-gray-800">{l.designation}</span>
                          <span className="block truncate text-[11px] text-gray-500"><strong style={{ color: couleur }}>{domaineLibelle(l.secteurId, l.site)}</strong>{l.operateur ? ` · ${l.operateur}` : ''}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-extrabold text-green-700 ring-1 ring-green-100">+{fmt(l.entree)}</span>
                        <ChevronRight size={15} className="shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-orange-500" />
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
            <div className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/80 px-4 py-2.5 shadow-sm">
              <span className="text-xs font-extrabold uppercase tracking-wide text-gray-500">Total des recettes</span>
              <span className="text-base font-black text-green-700">+{fmt(totalAffEntrees)} FCFA</span>
            </div>
          </div>
        )
  }

  return (
    <div className="space-y-5">
      <BandeauCompta couleur={couleur} icone={caisse ? Wallet : TrendingUp} titre={caisse ? 'Caisse' : 'Recettes et chiffre d\'affaires'}
        sous={caisse ? "La caisse courante d'E-DÉPENSES : solde initial du mois, dotations et dépenses. Touchez une ligne pour son détail." : 'Chiffre d\'affaires et recettes de tous les secteurs. Les dépenses se suivent dans la Caisse.'}>
        <FiltrePeriode variant="glass" label="" mode={mode} onModeChange={setMode}
          valeurJour={fJour} onJourChange={setFJour} valeurMois={fMois} onMoisChange={setFMois}
          avecAnnee valeurAnnee={fAnnee} onAnneeChange={setFAnnee} avecPlage valeurDebut={fDebut} onDebutChange={setFDebut} valeurFin={fFin} onFinChange={setFFin} />
        {!caisse && <ChampBande label="Secteur">
          <select value={secteur} onChange={(e) => setSecteur(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-40`}>
            <option value="">Tous les secteurs</option>
            {DOMAINES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </ChampBande>}
        {(vueActive === 'journal' || vueActive === 'detail') && <ChampRecherche variant="glass" className="!w-44" value={recherche} onChange={setRecherche} placeholder="Désignation, opérateur…" />}
        {!caisse && !epure && <OngletsBande options={VUES_RECETTES} valeur={vue} onChange={setVue} taille="sm" />}
      </BandeauCompta>

      {!epure && (canExportExcel(role) || (caisse && isFullAccessRole(role) && !isReadOnlyRole(role))) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <style>{`
            @keyframes sj-ondes-vert { 0% { box-shadow: 0 8px 18px -8px rgba(22,163,74,0.7), 0 0 0 0 rgba(22,163,74,0.45); } 70% { box-shadow: 0 8px 18px -8px rgba(22,163,74,0.7), 0 0 0 12px rgba(22,163,74,0); } 100% { box-shadow: 0 8px 18px -8px rgba(22,163,74,0.7), 0 0 0 0 rgba(22,163,74,0); } }
            @keyframes sj-pieces { 0%, 100% { transform: translateY(-1.5px) rotate(-6deg); } 50% { transform: translateY(2px) rotate(5deg); } }
            @keyframes sj-brille-vert { 0% { transform: translateX(-130%) skewX(-20deg); } 55%, 100% { transform: translateX(260%) skewX(-20deg); } }
          `}</style>
          {canExportExcel(role) && (
            <button type="button" onClick={exporter} disabled={!journal.lignes.length}
              className="inline-flex items-center gap-2 rounded-2xl border border-orange-300 bg-white px-4 py-2.5 text-sm font-extrabold text-orange-700 shadow-sm transition-all enabled:hover:-translate-y-0.5 enabled:hover:bg-orange-50 disabled:opacity-50">
              <FileSpreadsheet size={17} /> Export Excel
            </button>
          )}
          {caisse && isFullAccessRole(role) && !isReadOnlyRole(role) && (
            <button type="button" onClick={() => setDotation(true)}
              className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-2xl border border-green-300 bg-gradient-to-br from-green-500 to-green-700 py-2 pl-2.5 pr-4 text-sm font-extrabold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
              style={{ animation: 'sj-ondes-vert 2.4s ease-out infinite' }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent" style={{ animation: 'sj-brille-vert 3.6s ease-in-out infinite' }} />
              <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-white/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_4px_8px_-3px_rgba(0,0,0,0.4)]">
                <ICONE_DOTATION size={18} style={{ animation: 'sj-pieces 2.4s ease-in-out infinite' }} />
              </span>
              <span className="relative">Nouvelle dotation</span>
            </button>
          )}
        </div>
      )}

      <div className={epure ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid grid-cols-2 gap-3 lg:grid-cols-4'}>
        {caisse ? (
          <>
            <StatCard title="MONTANT DE LA CAISSE" value={formatMoney(journal.soldeInitial + journal.recettes)} sub="solde initial du mois + dotations" accent={COULEUR_DOTATION} icon={ICONE_DOTATION} />
            <StatCard title="DÉPENSES" value={`-${formatMoney(journal.depenses)}`} sub={libellePeriode} accent={COULEUR_DEPENSE} icon={Receipt} />
            <StatCard title="RESTE EN CAISSE" value={formatMoney(journal.soldeFinal)} sub="montant moins dépenses" accent={journal.soldeFinal >= 0 ? '#2563eb' : '#dc2626'} icon={Wallet} />
            <StatCard title="MOUVEMENTS" value={journal.lignes.length} sub={libellePeriode} accent="#0d9488" icon={CalendarCheck} />
          </>
        ) : epure ? (
          <StatCard title="MOUVEMENTS" value={fmt(journal.lignes.length)} sub={`${libellePeriode} : toucher pour le détail`} accent="#0d9488" icon={CalendarCheck} onClick={() => setMouvementsOuverts(true)} />
        ) : (
          <>
            <StatCard title="CHIFFRE D'AFFAIRES" value={formatMoney(journal.chiffreAffaires)} sub={vocab.facture.toLowerCase()} accent="#ea580c" icon={BadgeDollarSign} />
            <StatCard title="RECETTES" value={`+${formatMoney(journal.recettes)}`} sub={libellePeriode} accent="#16a34a" icon={TrendingUp} />
            <StatCard title={vocab.pluriel.toUpperCase()} value={fmt(journal.lignes.filter((l) => l.type === 'facture').length)} sub="factures émises" accent="#7c3aed" icon={Receipt} />
            <StatCard title="MOYENNE PAR JOUR" value={formatMoney(parJour.length ? journal.recettes / parJour.length : 0)} sub={`${parJour.length} jour(s) d'activité`} accent="#0284c7" icon={CalendarCheck} />
          </>
        )}
      </div>

      {caisse && journal.controle && journal.controle.ecart !== 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800">
          Contrôle : le report saisi par les agents est de {fmt(journal.controle.saisi)} FCFA, le solde initial calculé est de {fmt(journal.controle.calcule)} FCFA (écart de {fmt(journal.controle.ecart)}). Une dépense ou une dotation du mois précédent est peut-être manquante.
        </div>
      )}

      {/* ---------- Détail des recettes : chaque recette sur une ligne en verre, regroupées par jour ---------- */}
      {vueActive === 'detail' && rendreDetail()}

      {/* ---------- Journal : présenté comme le fichier Excel des agents ---------- */}
      {vueActive === 'journal' && (
        <Card className="!p-0 overflow-hidden">
          <div className="max-h-[66vh] overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className={TH}>Date</th><th className={TH}>Désignation</th><th className={TH}>Opérateur</th><th className={TH}>Domaine</th>
                  <th className={`${TH} text-right`}>Entrées</th><th className={`${TH} text-right`}>Sorties</th><th className={`${TH} text-right`}>Solde</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-50 font-extrabold dark:bg-white/5">
                  <td colSpan={4} className="px-3 py-2 text-center text-xs uppercase tracking-wide text-gray-700 dark:text-gray-200">Solde initial</td>
                  <td className="px-3 py-2 text-right text-gray-400">{journal.soldeInitial > 0 ? fmt(journal.soldeInitial) : ''}</td>
                  <td className="px-3 py-2 text-right text-gray-400">-</td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-50">{fmt(journal.soldeInitial)}</td>
                </tr>
                {lignesAffichees.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-gray-400"><Inbox className="mx-auto mb-2" size={28} />Aucun mouvement sur cette période.</td></tr>
                )}
                {lignesAffichees.map((l, i) => {
                  const couleur = couleurDomaine(l.secteurId)
                  const memeJour = i > 0 && lignesAffichees[i - 1].date === l.date
                  return (
                    <tr key={l.id} onClick={() => setFiche(l)} className={`cursor-pointer border-t border-gray-100 transition-colors hover:brightness-95 dark:border-white/10 ${memeJour ? '' : 'border-t-gray-300 dark:border-t-white/25'}`} style={{ background: `${couleur}1c` }}>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-xs font-extrabold text-gray-700 dark:text-gray-200">{memeJour ? '' : formatDateShort(l.date)}</td>
                      <td className="px-3 py-2 font-semibold uppercase text-gray-800 dark:text-gray-100">
                        {(() => {
                          const { icone: Ic, couleur: cc, libelle } = iconeLigne(l)
                          return (
                            <span className="flex items-center gap-2">
                              <span title={libelle} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D(cc)}><Ic size={12} /></span>
                              <span className="min-w-0">
                                {l.type !== 'depense' && <span className="mb-0.5 block text-[9px] font-extrabold tracking-wider" style={{ color: cc }}>{libelle}</span>}
                                {l.designation}
                              </span>
                            </span>
                          )
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs uppercase text-gray-600 dark:text-gray-300">{l.operateur || ':'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs font-extrabold uppercase" style={{ color: couleur }}>{domaineLibelle(l.secteurId, l.site)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-blue-700">{l.entree > 0 ? fmt(l.entree) : <span className="text-gray-300">-</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-red-600">{l.sortie > 0 ? fmt(l.sortie) : <span className="text-gray-300">-</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-extrabold text-gray-900 dark:text-gray-50">{fmt(l.solde)}</td>
                    </tr>
                  )
                })}
              </tbody>
              {lignesAffichees.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={4} className={`${TF} text-xs font-extrabold uppercase tracking-wide text-gray-700 dark:text-gray-200`}>Total : {lignesAffichees.length} ligne(s)</td>
                    <td className={`${TF} whitespace-nowrap text-right font-black text-blue-700`}>{fmt(totalAffEntrees)}</td>
                    <td className={`${TF} whitespace-nowrap text-right font-black text-red-600`}>{fmt(totalAffSorties)}</td>
                    <td className={`${TF} whitespace-nowrap text-right font-black text-gray-900 dark:text-gray-50`}>{fmt(journal.soldeFinal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* ---------- Par jour : recettes et chiffre d'affaires (les dépenses sont dans la Caisse) ---------- */}
      {vueActive === 'jour' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-2xl border border-white/70 bg-white/60 p-1 backdrop-blur-xl">
              <button type="button" onClick={() => decaleJour(-1)} className="rounded-xl px-2.5 py-1.5 text-sm font-bold text-gray-600 hover:bg-white" title="Jour précédent">‹</button>
              <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D('#ea580c')}><CalendarCheck size={12} /></span>
              <input type="date" value={jourVue} onChange={(e) => setJourVue(e.target.value)} className="rounded-xl border-0 bg-transparent px-1 py-1 text-sm font-bold text-gray-800 outline-none" />
              <button type="button" onClick={() => decaleJour(1)} className="rounded-xl px-2.5 py-1.5 text-sm font-bold text-gray-600 hover:bg-white" title="Jour suivant">›</button>
            </div>
            <button type="button" onClick={() => setJourVue(todayStr())} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700 hover:bg-orange-100">Aujourd'hui</button>
            {!epure && canExportExcel(role) && (
              <button type="button" onClick={exporterTableau} className="ml-auto inline-flex items-center gap-2 rounded-2xl border border-orange-300 bg-white px-3.5 py-2 text-sm font-extrabold text-orange-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-orange-50">
                <FileSpreadsheet size={16} /> Export Excel
              </button>
            )}
          </div>
          <Card className="!p-0 overflow-hidden">
            <div className="max-h-[66vh] overflow-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500">
                    <th className={TH}><span className="inline-flex items-center gap-1.5"><Wallet size={12} className="text-orange-400" strokeWidth={2.4} />Secteur</span></th>
                    <th className={`${TH} text-right`}><span className="inline-flex items-center gap-1.5"><TrendingUp size={12} className="text-green-500" strokeWidth={2.4} />Recettes du jour</span></th>
                    <th className={`${TH} text-right`}><span className="inline-flex items-center gap-1.5"><TrendingDown size={12} className="text-red-400" strokeWidth={2.4} />Dépenses du jour</span></th>
                    <th className={`${TH} text-right`}><span className="inline-flex items-center gap-1.5"><TrendingUp size={12} className="text-green-500" strokeWidth={2.4} />Recettes du mois</span></th>
                    <th className={`${TH} text-right`}><span className="inline-flex items-center gap-1.5"><TrendingDown size={12} className="text-red-400" strokeWidth={2.4} />Dépenses du mois</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-white dark:divide-white/20">
                  {tableau.rows.map((r) => {
                    const couleur = couleurPole(r.id)
                    const IconePole = ICONE_POLE[r.id] || Layers
                    return (
                      <tr key={r.id} onClick={() => { setPeriodeDetail('jour'); setPoleOuvert(r.id) }} className="group cursor-pointer transition-colors hover:brightness-95" style={{ background: `linear-gradient(90deg, ${couleur}1f 0%, ${couleur}0a 55%, transparent 100%)` }} title="Voir le détail de ce secteur">
                        <td className="px-3 py-3.5">
                          <span className="flex items-center gap-2 text-xs font-extrabold uppercase text-gray-700 dark:text-gray-200">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={icone3D(couleur)}><IconePole size={12} /></span>
                            {r.label}
                          </span>
                          {quotas[r.id] && <ObjectifSecteur realise={r.rm} cible={quotas[r.id]} />}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold text-green-700">{r.rj ? `+${fmt(r.rj)}` : <span className="text-gray-300">-</span>}</td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold text-red-600">{r.dj ? fmt(r.dj) : <span className="text-gray-300">-</span>}</td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold text-green-700">{r.rm ? `+${fmt(r.rm)}` : <span className="text-gray-300">-</span>}</td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold text-red-600"><span className="inline-flex items-center gap-1.5">{r.dm ? fmt(r.dm) : <span className="text-gray-300">-</span>}<ChevronRight size={14} className="text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-500" /></span></td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className={`${TF} text-xs font-extrabold uppercase tracking-wide text-gray-700 dark:text-gray-200`}>
                      Total
                      {totalQuotaTableau > 0 && <ObjectifSecteur realise={recettesAvecQuota} cible={totalQuotaTableau} total />}
                    </td>
                    <td className={`${TF} whitespace-nowrap text-right font-black text-green-700`}>+{fmt(tableau.total.rj)}</td>
                    <td className={`${TF} whitespace-nowrap text-right font-black text-red-600`}>{fmt(tableau.total.dj)}</td>
                    <td className={`${TF} whitespace-nowrap text-right font-black text-green-700`}>+{fmt(tableau.total.rm)}</td>
                    <td className={`${TF} whitespace-nowrap text-right font-black text-red-600`}>{fmt(tableau.total.dm)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
          <p className="text-[11px] text-gray-400">Le mois va du 1er du mois au jour choisi. Les dépenses sont rangées sous le secteur de destination. Cliquez sur un secteur pour voir le détail de ses opérations.</p>
        </div>
      )}

      {/* ---------- Par secteur : chiffre d'affaires et recettes ---------- */}
      {!caisse && !epure && canExportExcel(role) && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setRapport({ sections: {}, mode, jour: fJour || todayStr(), mois: fMois, annee: fAnnee, debut: fDebut, fin: fFin })}
            className="inline-flex items-center gap-2 rounded-2xl border border-orange-300 bg-white px-4 py-2.5 text-sm font-extrabold text-orange-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-orange-50">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D('#ea580c')}><FileText size={13} /></span> Rapport financier (PDF)
          </button>
        </div>
      )}

      {vueActive === 'secteur' && (
        <div className="rounded-3xl bg-gradient-to-br from-orange-100/70 via-rose-50/50 to-sky-100/70 p-3 shadow-inner">
          <style>{STYLES_TENDANCE}</style>
          {parSecteur.length === 0 && cartesQuotaSeules.length === 0 ? (
            <p className="py-8 text-center text-gray-400"><Inbox className="mx-auto mb-2" size={28} />Aucun mouvement sur cette période.</p>
          ) : (
            <div className="space-y-3">
              {[...parSecteur, ...cartesQuotaSeules].map((x) => (
                <CarteSecteur key={x.cle} x={x} prec={parSecteurPrec.parCle.get(x.cle)} maxCA={Math.max(maxCA, x.chiffreAffaires)} libellePrec={x.quotaSeul ? '' : prec.label}
                  quota={quotaDuPole(poleDe(x.secteurId, x.site))} onClick={x.quotaSeul ? undefined : () => setDetailSecteur(x)} />
              ))}
              <div className="relative flex flex-wrap items-center justify-between gap-2 overflow-hidden rounded-2xl border border-white/70 bg-white/60 px-3 py-2.5 text-sm font-black text-gray-900 backdrop-blur-xl">
                <span className="uppercase">Total tous secteurs</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  CA {fmt(journal.chiffreAffaires)} <Tendance actuel={journal.chiffreAffaires} precedent={parSecteurPrec.journal.chiffreAffaires} />
                  <span className="text-xs font-semibold text-gray-500">· recettes +{fmt(journal.recettes)}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <CaisseFiche ligne={fiche} onClose={() => setFiche(null)} />
      {mouvementsOuverts && (
        <Modal open onClose={() => setMouvementsOuverts(false)} size="lg" title={`Mouvements : ${libellePeriode}`} {...glassModalProps(couleur || '#ea580c')}
          footer={<Button variant="ghost" onClick={() => setMouvementsOuverts(false)}>Fermer</Button>}>
          <div className="space-y-3">
            <ChampRecherche value={recherche} onChange={setRecherche} placeholder="Désignation, opérateur, secteur…" />
            {rendreDetail()}
          </div>
        </Modal>
      )}
      <DotationModal open={dotation} onClose={() => setDotation(false)} budgets={budgets} user={user} />
      <Modal open={!!rapport} onClose={() => !rapportEnCours && setRapport(null)} size="md" title="Rapport financier"
        {...glassModalProps('#ea580c')}
        footer={<>
          <Button variant="ghost" onClick={() => setRapport(null)} disabled={rapportEnCours}>Annuler</Button>
          <Button onClick={genererRapport} loading={rapportEnCours}><FileText size={15} /> Générer le PDF</Button>
        </>}>
        {rapport && (
          <div className="space-y-3">
            {(() => {
              const br = bornesRapport()
              const nbJours = Math.round((new Date(br.end) - new Date(br.start)) / 86400000) + 1
              const champGlass = 'rounded-xl border border-white/80 bg-white/70 px-3 py-2 text-sm font-bold text-gray-800 shadow-[inset_0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-md outline-none transition-shadow focus:ring-2 focus:ring-orange-300'
              const maj = (cle) => (v) => setRapport((r) => ({ ...r, [cle]: v }))
              return (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                  <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-white/55 p-3.5 shadow-[0_8px_30px_-12px_rgba(234,88,12,0.35)] backdrop-blur-2xl sm:col-span-3">
                    <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-300/40 blur-2xl" />
                    <p className="relative mb-2.5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-gray-500">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D('#f59e0b')}><CalendarCheck size={13} /></span>Période du rapport
                    </p>
                    <div className="relative mb-2.5 grid grid-cols-4 gap-1 rounded-2xl border border-white/80 bg-white/40 p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.05)] backdrop-blur-md">
                      {[['jour', 'Jour'], ['mois', 'Mois'], ['annee', 'Année'], ['plage', 'Plage']].map(([m, lib]) => (
                        <button key={m} type="button" onClick={() => maj('mode')(m)}
                          className={`rounded-xl px-2 py-1.5 text-xs font-extrabold transition-all ${rapport.mode === m ? 'text-white shadow-md' : 'text-gray-500 hover:bg-white/70 hover:text-gray-800'}`}
                          style={rapport.mode === m ? { background: 'linear-gradient(135deg,#f59e0b,#ea580c)', boxShadow: '0 6px 14px -4px rgba(234,88,12,0.55), inset 0 1px 1px rgba(255,255,255,0.5)' } : undefined}>
                          {lib}
                        </button>
                      ))}
                    </div>
                    <div className="relative flex flex-wrap items-center gap-2">
                      {rapport.mode === 'mois' ? (
                        <input type="month" value={rapport.mois} onChange={(e) => maj('mois')(e.target.value)} className={`w-full ${champGlass}`} />
                      ) : rapport.mode === 'annee' ? (
                        <input type="number" min="2000" max="2100" placeholder="Année" value={rapport.annee} onChange={(e) => maj('annee')(e.target.value)} className={`w-full ${champGlass}`} />
                      ) : rapport.mode === 'plage' ? (
                        <>
                          <input type="date" value={rapport.debut || ''} max={rapport.fin || undefined} onChange={(e) => maj('debut')(e.target.value)} className={`min-w-0 flex-1 ${champGlass}`} />
                          <span className="text-xs font-extrabold text-gray-400">→</span>
                          <input type="date" value={rapport.fin || ''} min={rapport.debut || undefined} onChange={(e) => maj('fin')(e.target.value)} className={`min-w-0 flex-1 ${champGlass}`} />
                        </>
                      ) : (
                        <input type="date" value={rapport.jour || ''} onChange={(e) => maj('jour')(e.target.value)} className={`w-full ${champGlass}`} />
                      )}
                    </div>
                  </div>
                  <div className="relative flex flex-col justify-center overflow-hidden rounded-3xl border border-white/40 p-3.5 text-white shadow-[0_14px_30px_-12px_rgba(234,88,12,0.7)] backdrop-blur-2xl sm:col-span-2"
                    style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.92), rgba(234,88,12,0.88))' }}>
                    <span className="pointer-events-none absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-white/25 blur-2xl" />
                    <p className="relative text-[10px] font-extrabold uppercase tracking-wide text-white/80">Le rapport couvre</p>
                    <p className="relative mt-1 text-base font-extrabold leading-tight">
                      {br.start === br.end ? `Le ${formatDateShort(br.end)}` : <>Du {formatDateShort(br.start)}<br />au {formatDateShort(br.end)}</>}
                    </p>
                    <span className="relative mt-2 inline-flex w-fit items-center rounded-full border border-white/50 bg-white/25 px-2.5 py-0.5 text-[11px] font-extrabold backdrop-blur-md">
                      {nbJours} jour{nbJours > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )
            })()}
            <div className="rounded-3xl border border-white/80 bg-white/55 p-3.5 shadow-[0_8px_30px_-12px_rgba(71,85,105,0.3)] backdrop-blur-2xl">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-gray-500"><span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D('#475569')}><FileText size={13} /></span>Contenu du rapport</p>
              <div className="grid grid-cols-2 gap-2">
                {SECTIONS_RAPPORT.map(({ id, label, Icone, couleur }) => {
                  const actif = rapport.sections?.[id] !== false
                  return (
                    <button key={id} type="button" aria-pressed={actif}
                      onClick={() => setRapport((r) => ({ ...r, sections: { ...r.sections, [id]: !actif } }))}
                      className={`flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-left text-xs font-extrabold backdrop-blur-md transition-all ${actif ? 'border-white/90 bg-white/80 text-gray-800 shadow-md' : 'border-white/60 bg-white/30 text-gray-400'}`}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={actif ? icone3D(couleur) : { background: 'rgba(148,163,184,0.35)', color: '#fff' }}><Icone size={14} /></span>
                      <span className="min-w-0 flex-1 leading-tight">{label}</span>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${actif ? 'bg-emerald-500 text-white' : 'border border-gray-300 text-transparent'}`}>✓</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {(() => {
        const pole = tableau.rows.find((r) => r.id === poleOuvert)
        const ops = pole ? pole.details.filter((o) => (periodeDetail === 'jour' ? o.date === jourVue : true)).sort((x, y) => (x.date < y.date ? 1 : -1)) : []
        const rec = ops.filter((o) => o.sens === 'recette').reduce((t, o) => t + o.montant, 0)
        const dep = ops.filter((o) => o.sens === 'depense').reduce((t, o) => t + o.montant, 0)
        return (
          <Modal open={!!pole} onClose={() => setPoleOuvert(null)} size="lg" title={pole ? `${pole.label} : ${formatDateShort(jourVue)}` : ''}
            {...glassModalProps(pole ? couleurPole(pole.id) : '#ea580c')}
            footer={<Button variant="ghost" onClick={() => setPoleOuvert(null)}>Fermer</Button>}>
            {pole && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white/70 bg-white/60 p-3 backdrop-blur-xl">
                    <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500"><span className="flex h-5 w-5 items-center justify-center rounded-md" style={icone3D('#16a34a')}><TrendingUp size={11} /></span>Recettes {periodeDetail === 'jour' ? 'du jour' : 'du mois'}</p>
                    <p className="mt-1 text-xl font-black text-green-700">+{fmt(rec)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/60 p-3 backdrop-blur-xl">
                    <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-gray-500"><span className="flex h-5 w-5 items-center justify-center rounded-md" style={icone3D('#dc2626')}><TrendingDown size={11} /></span>Dépenses {periodeDetail === 'jour' ? 'du jour' : 'du mois'}</p>
                    <p className="mt-1 text-xl font-black text-red-600">{fmt(dep)}</p>
                  </div>
                </div>
                <OngletsBande options={[{ id: 'jour', label: 'Du jour' }, { id: 'mois', label: 'Du mois' }]} valeur={periodeDetail} onChange={setPeriodeDetail} taille="sm" />
                {ops.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-400"><Inbox className="mx-auto mb-2" size={26} />Aucune opération {periodeDetail === 'jour' ? 'ce jour-là' : 'ce mois-ci'} pour ce secteur.</p>
                ) : (
                  <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
                    {ops.map((o, i) => (
                      <li key={i} className="flex items-center gap-2.5 rounded-2xl border border-white/70 bg-white/60 px-3 py-2 backdrop-blur-xl">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={icone3D(o.sens === 'recette' ? '#16a34a' : '#dc2626')}>{o.sens === 'recette' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-800">{o.libelle || (o.sens === 'recette' ? 'Recette' : 'Dépense')}</p>
                          <p className="text-[11px] text-gray-400">{formatDateShort(o.date)}</p>
                        </div>
                        <span className={`shrink-0 text-sm font-extrabold ${o.sens === 'recette' ? 'text-green-700' : 'text-red-600'}`}>{o.sens === 'recette' ? '+' : '-'}{fmt(o.montant)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Modal>
        )
      })()}

      <SecteurDetail secteur={detailSecteur} lignes={detailSecteur?.cle === '*' ? journal.lignes.filter((l) => l.date === detailSecteur.date) : journal.lignes} periode={libellePeriode} onClose={() => setDetailSecteur(null)} />
    </div>
  )
}

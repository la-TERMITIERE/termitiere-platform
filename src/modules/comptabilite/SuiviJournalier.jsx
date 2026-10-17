// COMPTABILITÉ — Suivi journalier, pour la direction, en deux volets (sous-menu du même nom) :
//  - CAISSE : tous les mouvements de la caisse courante, tous secteurs, comme le journal tenu sur Excel par les
//    agents (date, désignation, opérateur, domaine, entrées, sorties, solde, solde initial, couleur par domaine) ;
//  - RECETTES : le chiffre d'affaires, les recettes, les dépenses et le bénéfice, par jour et par secteur.
// Lecture seule : tout est repris d'E-DÉPENSES et des modules, sans nouvelle saisie.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, CalendarCheck, Wallet, TrendingUp, TrendingDown, Scale, BadgeDollarSign, FileSpreadsheet, Inbox, Receipt } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { canExportExcel, isFullAccessRole, isReadOnlyRole } from '../../core/roles'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { coutsMatieresBriqueterie, versementsClientVersSecteurs } from '../depense/logic'
import BandeauCompta, { OngletsBande, ChampBande, CLASSE_CHAMP_BANDE } from './BandeauCompta'
import CaisseFiche from './CaisseFiche'
import DotationModal from './DotationModal'
import SecteurDetail from './SecteurDetail'
import CarteSecteur, { Tendance, STYLES_TENDANCE } from './CarteSecteur'
import { iconeLigne, ICONE_DOTATION, COULEUR_DOTATION, COULEUR_DEPENSE } from './iconesCaisse'
import { icone3D } from '../../utils/color'
import { useReportAutomatique } from '../depense/reportAuto'
import { construireLignes, construireLignesCaisse, bornesPeriode, journalPeriode, recapParJour, recapParSecteur, periodePrecedente, vocabulaire, domaineLibelle, couleurDomaine, DOMAINES } from './journalCalculs'

const TH = 'sticky top-0 z-10 bg-orange-50 shadow-[0_1px_0_rgba(234,88,12,0.25)] dark:bg-gray-800 px-3 py-2.5'
const TF = 'sticky bottom-0 z-10 bg-orange-50 px-3 py-2.5 shadow-[0_-1px_0_rgba(234,88,12,0.25)] dark:bg-gray-800'
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR')
const signe = (n) => `${n >= 0 ? '+' : '-'}${fmt(Math.abs(n))}`
const VUES_RECETTES = [{ id: 'secteur', label: 'Par secteur' }, { id: 'jour', label: 'Par jour' }]

// page : 'caisse' (journal des mouvements) ou 'recettes' (chiffre d'affaires, par jour et par secteur).
export default function SuiviJournalier({ page = 'caisse' }) {
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
  const { data: budgets } = useCollection('depense_budgets')
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
  const [vue, setVue] = useState('secteur')
  const vueActive = caisse ? 'journal' : vue

  const lignesCaisse = useMemo(() => construireLignesCaisse({ depenses, coutsMatieres: coutsMatieresBriqueterie(inventairesBriq), budgets }), [depenses, inventairesBriq, budgets])
  // Recettes : factures, versements de clients et saisies manuelles, SANS aucune dépense (elles sortent de la caisse).
  const lignesRecettes = useMemo(() => construireLignes({
    facturesAgro, facturesLogistique, facturesEvenementiel, facturesGym,
    versementsRoutes: versementsClientVersSecteurs(versements, projets), projets, revenusManuels
  }), [facturesAgro, facturesLogistique, facturesEvenementiel, facturesGym, versements, projets, revenusManuels])
  const toutes = caisse ? lignesCaisse : lignesRecettes

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

  return (
    <div className="space-y-5">
      <BandeauCompta icone={caisse ? Wallet : TrendingUp} titre={caisse ? 'Caisse' : 'Recettes et chiffre d\'affaires'}
        sous={caisse ? "La caisse commune d'E-DÉPENSES : solde initial du mois, dotations et dépenses. Touchez une ligne pour son détail." : 'Chiffre d\'affaires et recettes de tous les secteurs. Les dépenses se suivent dans la Caisse.'}>
        <FiltrePeriode variant="glass" label="" mode={mode} onModeChange={setMode}
          valeurJour={fJour} onJourChange={setFJour} valeurMois={fMois} onMoisChange={setFMois}
          avecAnnee valeurAnnee={fAnnee} onAnneeChange={setFAnnee} avecPlage valeurDebut={fDebut} onDebutChange={setFDebut} valeurFin={fFin} onFinChange={setFFin} />
        {!caisse && <ChampBande label="Secteur">
          <select value={secteur} onChange={(e) => setSecteur(e.target.value)} className={`${CLASSE_CHAMP_BANDE} w-40`}>
            <option value="">Tous les secteurs</option>
            {DOMAINES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </ChampBande>}
        {vueActive === 'journal' && <ChampRecherche variant="glass" className="!w-44" value={recherche} onChange={setRecherche} placeholder="Désignation, opérateur…" />}
        {!caisse && <OngletsBande options={VUES_RECETTES} valeur={vue} onChange={setVue} taille="sm" />}
      </BandeauCompta>

      {(canExportExcel(role) || (caisse && isFullAccessRole(role) && !isReadOnlyRole(role))) && (
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {caisse ? (
          <>
            <StatCard title="MONTANT DE LA CAISSE" value={formatMoney(journal.soldeInitial + journal.recettes)} sub="solde initial du mois + dotations" accent={COULEUR_DOTATION} icon={ICONE_DOTATION} />
            <StatCard title="DÉPENSES" value={`-${formatMoney(journal.depenses)}`} sub={libellePeriode} accent={COULEUR_DEPENSE} icon={Receipt} />
            <StatCard title="RESTE EN CAISSE" value={formatMoney(journal.soldeFinal)} sub="montant moins dépenses" accent={journal.soldeFinal >= 0 ? '#2563eb' : '#dc2626'} icon={Wallet} />
            <StatCard title="MOUVEMENTS" value={journal.lignes.length} sub={libellePeriode} accent="#0d9488" icon={CalendarCheck} />
          </>
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
        <Card className="!p-0 overflow-hidden">
          <div className="max-h-[66vh] overflow-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className={TH}>Date</th><th className={`${TH} text-right`}>Recettes</th><th className={`${TH} text-right`}>Chiffre d'affaires</th><th className={`${TH} text-right`}>{vocab.pluriel}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {parJour.length === 0 && <tr><td colSpan={4} className="px-3 py-10 text-center text-gray-400"><Inbox className="mx-auto mb-2" size={28} />Aucune recette sur cette période.</td></tr>}
                {parJour.map((j) => (
                  <tr key={j.date} onClick={() => ouvrirJour(j)} className="cursor-pointer hover:bg-orange-50/60 dark:hover:bg-white/5" title="Voir le détail de ce jour">
                    <td className="whitespace-nowrap px-3 py-2 text-xs font-extrabold text-gray-700 dark:text-gray-200">{formatDateShort(j.date)} <span className="block text-[10px] font-semibold text-gray-400" title="Nombre de recettes enregistrées ce jour">{j.nb} recette{j.nb > 1 ? 's' : ''}</span></td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-green-700">{j.recettes > 0 ? `+${fmt(j.recettes)}` : <span className="text-gray-300">-</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-gray-800 dark:text-gray-100">{j.chiffreAffaires > 0 ? fmt(j.chiffreAffaires) : <span className="text-gray-300">-</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-600 dark:text-gray-300">{j.ventes > 0 ? fmt(j.ventes) : <span className="text-gray-300">-</span>}</td>
                  </tr>
                ))}
              </tbody>
              {parJour.length > 0 && (
                <tfoot>
                  <tr>
                    <td className={`${TF} text-xs font-extrabold uppercase tracking-wide text-gray-700 dark:text-gray-200`}>Total</td>
                    <td className={`${TF} whitespace-nowrap text-right font-black text-green-700`}>+{fmt(journal.recettes)}</td>
                    <td className={`${TF} whitespace-nowrap text-right font-black text-gray-900 dark:text-gray-50`}>{fmt(journal.chiffreAffaires)}</td>
                    <td className={`${TF} whitespace-nowrap text-right font-black text-gray-800 dark:text-gray-100`}>{fmt(parJour.reduce((t, j) => t + j.ventes, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* ---------- Par secteur : chiffre d'affaires et recettes ---------- */}
      {vueActive === 'secteur' && (
        <div className="rounded-3xl bg-gradient-to-br from-orange-100/70 via-rose-50/50 to-sky-100/70 p-3 shadow-inner">
          <style>{STYLES_TENDANCE}</style>
          {parSecteur.length === 0 ? (
            <p className="py-8 text-center text-gray-400"><Inbox className="mx-auto mb-2" size={28} />Aucun mouvement sur cette période.</p>
          ) : (
            <div className="space-y-3">
              {parSecteur.map((x) => (
                <CarteSecteur key={x.cle} x={x} prec={parSecteurPrec.parCle.get(x.cle)} maxCA={maxCA} libellePrec={prec.label} onClick={() => setDetailSecteur(x)} />
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
      <DotationModal open={dotation} onClose={() => setDotation(false)} budgets={budgets} user={user} />
      <SecteurDetail secteur={detailSecteur} lignes={detailSecteur?.cle === '*' ? journal.lignes.filter((l) => l.date === detailSecteur.date) : journal.lignes} periode={libellePeriode} onClose={() => setDetailSecteur(null)} />
    </div>
  )
}

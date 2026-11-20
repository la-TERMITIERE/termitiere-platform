// Tableau de bord global : tous les secteurs de La Termitière en un coup d'œil, en grille bento de tuiles de verre.
//  - Chiffres financiers de la période choisie (jour, mois, année, plage) : recettes, dépenses, bénéfice, objectif, puis une carte par secteur,
//    des graphiques comparés et la répartition des recettes (réservé à la direction : mêmes règles que le chiffre d'affaires du mois) ;
//  - Activité du mois (effectif animal, prestations, briques, dossiers fonciers) et alertes cross-modules cliquables (pour tous) ;
//  - Export Excel et PDF du rapport global : on choisit la période et les secteurs (cf. ExportRapportModal).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import {
  Leaf, Truck, BrickWall, MapPin, TrendingUp, TrendingDown, AlertTriangle, ChevronRight, LayoutDashboard, FileSpreadsheet, FileText, Wallet, Target,
  PiggyBank, Layers, Activity, BellRing, ArrowUpRight
} from 'lucide-react'
import StatCard from '../shared/ui/StatCard'
import Modal from '../shared/ui/Modal'
import BandeauVolet, { BoutonBande } from '../shared/ui/BandeauVolet'
import FiltrePeriode from '../shared/ui/FiltrePeriode'
import { ParamsGrille, ParamsCarte } from '../shared/ui/ParamsVerre'
import { useCollection } from '../hooks/useFirestore'
import { useAuth } from '../hooks/useAuth'
import { niveauBilanGlobal } from '../core/roles'
import RecapDuJour from './RecapDuJour'
import { todayStr, formatMoney, formatNumber, formatDateShort } from '../utils/formatters'
import { glassModalProps, icone3D } from '../utils/color'
import { ICONE_POLE } from '../modules/comptabilite/quotas'
import ExportRapportModal from './ExportRapportModal'
import { useDonneesRapport, calculerRapport, libellePeriode, bornesPeriode } from './rapportGlobal'

const ROUGE = '#BC3C31'
// Module à ouvrir au clic sur la carte d'un secteur (si la personne y a accès).
const MODULE_SECTEUR = { gym_kara: 'gym', gym_lome: 'gym', log_kara: 'logistique', log_lome: 'logistique', agro: 'agro', briques: 'evenementiel', garderie: 'garderie', transport: 'evenementiel', direction: 'comptabilite' }
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR')

// Tuile de la grille bento : verre dépoli teinté, icône en relief, léger soulèvement au survol.
function Tuile({ icone: Icone, couleur, titre, valeur, sous, className = '', children, sombre = false }) {
  return (
    <div className={`ed-entree group relative overflow-hidden rounded-[1.7rem] border p-4 backdrop-blur-2xl transition-all hover:-translate-y-0.5 ${sombre ? 'border-white/30 text-white shadow-[0_22px_44px_-20px_rgba(188,60,49,0.8),inset_0_1px_0_rgba(255,255,255,0.4)]' : 'border-white/80 shadow-[0_14px_30px_-20px_rgba(26,26,26,0.45),inset_0_1px_0_rgba(255,255,255,0.95)] hover:shadow-[0_20px_36px_-18px_rgba(26,26,26,0.5),inset_0_1px_0_rgba(255,255,255,1)]'} ${className}`}
      style={{ background: sombre ? `linear-gradient(145deg, color-mix(in srgb, ${couleur} 85%, #ffffff) 0%, ${couleur} 40%, color-mix(in srgb, ${couleur} 45%, #1a0504) 100%)` : `linear-gradient(140deg, ${couleur}22 0%, rgba(255,255,255,0.72) 62%)` }}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/45 to-transparent" />
      {!sombre && <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl" style={{ background: couleur }} />}
      <div className="relative flex items-center gap-2.5">
        {Icone && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={sombre ? { background: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.5)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)' } : icone3D(couleur)}><Icone size={19} /></span>}
        <p className={`text-[11px] font-extrabold uppercase tracking-wide ${sombre ? 'text-white/85' : 'text-gray-500'}`}>{titre}</p>
      </div>
      <p className={`relative mt-2 break-words font-black leading-tight tabular-nums ${sombre ? 'text-3xl' : 'text-2xl'} ${sombre ? '' : 'text-gray-900'}`}>{valeur}</p>
      {sous && <p className={`relative mt-0.5 text-xs font-semibold ${sombre ? 'text-white/80' : 'text-gray-500'}`}>{sous}</p>}
      {children && <div className="relative mt-2">{children}</div>}
    </div>
  )
}

// Anneau d'avancement (objectif atteint).
function Anneau({ pct, couleur, taille = 74 }) {
  const r = (taille - 10) / 2, c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, pct || 0))
  return (
    <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} role="img" aria-label={`${Math.round(pct || 0)} % de l'objectif`}>
      <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="rgba(148,163,184,0.3)" strokeWidth="8" />
      <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke={couleur} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * p) / 100}
        transform={`rotate(-90 ${taille / 2} ${taille / 2})`} style={{ transition: 'stroke-dashoffset .8s ease', filter: `drop-shadow(0 2px 4px ${couleur}66)` }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="fill-gray-800 text-[15px] font-black">{Math.round(pct || 0)}%</text>
    </svg>
  )
}

// Trois niveaux (voir niveauBilanGlobal) : 'finance' (PAU, GE, DF, Info, Assistant(e) GE : argent et exports), 'admin' (reste de l'administration : activité et alertes,
// jamais d'argent) et 'jour' (compte à qui Info a donné l'accès : récap du jour des secteurs, sans montant).
export default function GlobalDashboard() {
  const roleReel = useAuth((s) => s.roleReel)
  const user = useAuth((s) => s.user)
  const niveau = niveauBilanGlobal(roleReel, user)
  if (niveau === 'jour') return <RecapDuJour />
  return <TableauComplet voitFinance={niveau === 'finance'} />
}

function TableauComplet({ voitFinance }) {
  const { hasModule } = useAuth()
  const navigate = useNavigate()
  const [alerteDetail, setAlerteDetail] = useState(null)
  const [exportFormat, setExportFormat] = useState(null) // 'pdf' | 'excel' | null
  // Tout ce qui touche à l'argent (recettes, dépenses, bénéfice, objectifs, exports) : PAU, GE, DF, Info et Assistant(e) GE seulement.
  const peutExporter = voitFinance

  // Période des chiffres financiers
  const [mode, setMode] = useState('mois')
  const [fJour, setFJour] = useState(todayStr())
  const [fMois, setFMois] = useState(todayStr().slice(0, 7))
  const [fAnnee, setFAnnee] = useState(todayStr().slice(0, 4))
  const [fDebut, setFDebut] = useState('')
  const [fFin, setFFin] = useState('')
  const bornes = useMemo(() => bornesPeriode(mode, { jour: fJour, mois: fMois, annee: fAnnee, debut: fDebut, fin: fFin }), [mode, fJour, fMois, fAnnee, fDebut, fFin])
  const { donnees, charge } = useDonneesRapport(voitFinance)
  const rapport = useMemo(() => (voitFinance && charge && bornes.start <= bornes.end ? calculerRapport(donnees, { mode, bornes }) : null), [voitFinance, charge, donnees, mode, bornes])

  const { data: inventaires } = useCollection('agro_inventaires')
  const { data: demandes } = useCollection('agro_demandes')
  const { data: demandesLog } = useCollection('logistique_demandes')
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: demandesBriq } = useCollection('evenementiel_demandes')
  const { data: dossiersFoncier } = useCollection('foncier_dossiers')

  const invTries = useMemo(() => [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1)), [inventaires])
  const dernier = invTries[0]
  const moisCourant = todayStr().slice(0, 7)

  // ── AGRO ──
  const totalAnimaux = dernier ? Object.values(dernier.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0) : 0
  const demandesAgroAttente = demandes.filter((d) => d.statut === 'en_attente').length
  const last12Agro = useMemo(() => [...invTries].reverse().slice(-12), [invTries])
  // ── LOGISTIQUE ──
  const prestationsMois = prestations.filter((p) => (p.date || '').startsWith(moisCourant)).length
  const autorisationsLog = demandesLog.filter((d) => d.statut === 'en_attente').length
  // ── BRIQUETERIE ──
  const prodMois = productions.filter((p) => (p.date || '').startsWith(moisCourant)).reduce((s, p) => s + (p.totalBriques || 0), 0)
  const autorisationsBriq = demandesBriq.filter((d) => ['en_attente', 'partiel'].includes(d.statut)).length
  const prodLast12 = useMemo(() => {
    const grouped = {}
    productions.forEach((p) => { const m = (p.date || '').slice(0, 7); if (m) grouped[m] = (grouped[m] || 0) + (p.totalBriques || 0) })
    const keys = Object.keys(grouped).sort().slice(-12)
    return { labels: keys.map((k) => k.slice(5)), data: keys.map((k) => grouped[k]) }
  }, [productions])
  // ── FONCIER ──
  const dossiersActifs = dossiersFoncier.filter((d) => !['cloture', 'suspendu'].includes(d.statut)).length
  const dossiersMois = dossiersFoncier.filter((d) => (d.dateOuverture || '').startsWith(moisCourant)).length

  // ── ALERTES cross-modules ──
  const alertes = useMemo(() => {
    const list = []
    if (demandesAgroAttente > 0) list.push({ id: 'agro-demandes', module: 'agro', path: '/agro/demandes', tone: 'warning', icon: Leaf, text: `${demandesAgroAttente} demande(s) de sortie AGRO en attente`, details: demandes.filter((d) => d.statut === 'en_attente') })
    if (autorisationsLog > 0) list.push({ id: 'log-demandes', module: 'logistique', path: '/logistique/demandes', tone: 'warning', icon: Truck, text: `${autorisationsLog} autorisation(s) sortie matériel en attente`, details: demandesLog.filter((d) => d.statut === 'en_attente') })
    if (autorisationsBriq > 0) list.push({ id: 'briq-demandes', module: 'evenementiel', path: '/evenementiel/demandes', tone: 'danger', icon: BrickWall, text: `${autorisationsBriq} autorisation(s) sortie briques en attente (3 autorités)`, details: demandesBriq.filter((d) => ['en_attente', 'partiel'].includes(d.statut)) })
    return list
  }, [demandesAgroAttente, autorisationsLog, autorisationsBriq, demandes, demandesLog, demandesBriq])

  const chartOpts = { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 9 } } }, y: { ticks: { font: { size: 9 } } } } }
  const chartAgro = { labels: last12Agro.map((i) => i.date?.slice(5) || ''), datasets: [{ label: 'Animaux', data: last12Agro.map((i) => Object.values(i.animaux || {}).reduce((s, a) => s + (a.fin || 0), 0)), borderColor: ROUGE, backgroundColor: 'rgba(188,60,49,0.12)', fill: true, tension: 0.3, pointRadius: 2 }] }
  const chartBriq = { labels: prodLast12.labels, datasets: [{ label: 'Briques', data: prodLast12.data, backgroundColor: 'rgba(124,58,237,0.7)', borderRadius: 6 }] }

  // ── Graphiques financiers ──
  const secteursActifs = rapport ? rapport.secteurs.filter((s) => s.recettes || s.depenses) : []
  const chartSecteurs = {
    labels: secteursActifs.map((s) => s.label),
    datasets: [
      { label: 'Recettes', data: secteursActifs.map((s) => s.recettes), backgroundColor: 'rgba(22,163,74,0.8)', borderRadius: 6 },
      { label: 'Dépenses', data: secteursActifs.map((s) => s.depenses), backgroundColor: 'rgba(220,38,38,0.75)', borderRadius: 6 }
    ]
  }
  const chartRepartition = {
    labels: secteursActifs.filter((s) => s.recettes > 0).map((s) => s.label),
    datasets: [{ data: secteursActifs.filter((s) => s.recettes > 0).map((s) => s.recettes), backgroundColor: secteursActifs.filter((s) => s.recettes > 0).map((s) => s.couleur), borderColor: '#fff', borderWidth: 2 }]
  }
  const chartJours = {
    labels: (rapport?.jours || []).map((j) => j.date.slice(5).split('-').reverse().join('/')),
    datasets: [
      { label: 'Recettes', data: (rapport?.jours || []).map((j) => j.recettes), borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.14)', fill: true, tension: 0.35, pointRadius: 2 },
      { label: 'Dépenses', data: (rapport?.jours || []).map((j) => j.depenses), borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.08)', fill: true, tension: 0.35, pointRadius: 2 }
    ]
  }
  const optsSparkline = { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } }, elements: { point: { radius: 0 } } }
  const total = rapport?.total
  const periodeTexte = libellePeriode(mode, bornes)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <BandeauVolet couleur={ROUGE} icone={LayoutDashboard} surtitre="Bilan global" titre="Tableau de bord global" sous="Tous les secteurs de La Termitière en un coup d’œil.">
        {voitFinance && (
          <FiltrePeriode variant="glass" label="" mode={mode} onModeChange={setMode} valeurJour={fJour} onJourChange={setFJour} valeurMois={fMois} onMoisChange={setFMois}
            avecAnnee valeurAnnee={fAnnee} onAnneeChange={setFAnnee} avecPlage valeurDebut={fDebut} onDebutChange={setFDebut} valeurFin={fFin} onFinChange={setFFin} />
        )}
        {peutExporter && <BoutonBande icone={FileSpreadsheet} plein={false} onClick={() => setExportFormat('excel')}>Exporter en Excel</BoutonBande>}
        {peutExporter && <BoutonBande icone={FileText} onClick={() => setExportFormat('pdf')}>Exporter en PDF</BoutonBande>}
      </BandeauVolet>

      {/* ───── Finances de la période (direction) ───── */}
      {voitFinance && (
        <section aria-label="Finances de la période" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-gray-500"><Wallet size={15} aria-hidden="true" /> Finances : {periodeTexte}</h2>
            {rapport && rapport.precedente?.label && <p className="text-xs text-gray-400">Comparaison : {rapport.precedente.label}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tuile sombre couleur={ROUGE} icone={TrendingUp} titre="Recettes" className="col-span-2 lg:row-span-2"
              valeur={total ? formatMoney(total.recettes) : '…'}
              sous={total?.croissance == null ? (total ? 'Pas de période précédente à comparer' : 'Chargement des chiffres…') : `${total.croissance >= 0 ? '▲ +' : '▼ '}${Math.round(total.croissance)} % sur la période précédente`}>
              <div className="h-24 sm:h-32">
                {rapport && rapport.jours.length > 1
                  ? <Line data={{ labels: chartJours.labels, datasets: [{ data: rapport.jours.map((j) => j.recettes), borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.22)', fill: true, tension: 0.4, borderWidth: 2 }] }} options={optsSparkline} />
                  : <p className="pt-6 text-center text-xs text-white/70">{rapport ? 'La courbe apparaît dès deux jours d’activité.' : ''}</p>}
              </div>
            </Tuile>
            <Tuile couleur="#dc2626" icone={TrendingDown} titre="Dépenses" valeur={total ? formatMoney(total.depenses) : '…'} sous={total ? `${total.nbOperations} opération(s)` : ''} />
            <Tuile couleur={total && total.benefice < 0 ? '#dc2626' : '#0284c7'} icone={PiggyBank} titre="Bénéfice" valeur={total ? `${total.benefice < 0 ? '- ' : ''}${formatMoney(Math.abs(total.benefice))}` : '…'}
              sous={total && total.recettes > 0 ? `${Math.round((total.benefice / total.recettes) * 100)} % des recettes` : ''} />
            <Tuile couleur="#7c3aed" icone={Target} titre="Objectif" className="col-span-2">
              {total && total.cible > 0 ? (
                <div className="flex items-center gap-3">
                  <Anneau pct={total.pct} couleur={total.pct >= 100 ? '#16a34a' : total.pct >= 40 ? '#f59e0b' : '#dc2626'} />
                  <div className="min-w-0">
                    <p className="text-lg font-black tabular-nums text-gray-900">{fmt(total.recettes)} <span className="text-xs font-semibold text-gray-500">sur {fmt(total.cible)} FCFA</span></p>
                    <p className="text-xs font-semibold text-gray-500">Objectifs de recettes des secteurs, fixés dans leurs Paramètres.</p>
                  </div>
                </div>
              ) : <p className="text-sm text-gray-500">{total ? (mode === 'mois' || mode === 'annee' ? 'Aucun objectif fixé : réglez-les dans les Paramètres de chaque secteur.' : 'Les objectifs sont mensuels : choisissez un mois ou une année pour les comparer.') : 'Chargement…'}</p>}
            </Tuile>
          </div>

          <ParamsGrille>
            <ParamsCarte icone={Layers} couleur={ROUGE} titre="Secteurs" sous="Recettes et dépenses de la période, touchez un secteur pour l’ouvrir" large>
              {!rapport ? <p className="py-6 text-center text-sm text-gray-400">Chargement des chiffres…</p> : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                  {rapport.secteurs.map((s) => {
                    const Ico = ICONE_POLE[s.id] || Layers
                    const mod = MODULE_SECTEUR[s.id]
                    const ouvrable = mod && hasModule(mod)
                    const part = total.recettes > 0 ? (s.recettes / total.recettes) * 100 : 0
                    return (
                      <button key={s.id} type="button" disabled={!ouvrable} onClick={() => navigate(`/${mod}`)} title={ouvrable ? `Ouvrir ${s.label}` : undefined}
                        className="group relative overflow-hidden rounded-2xl border border-white/80 p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl transition-all enabled:hover:-translate-y-0.5 enabled:hover:shadow-md disabled:cursor-default"
                        style={{ background: `linear-gradient(140deg, ${s.couleur}1f 0%, rgba(255,255,255,0.7) 70%)` }}>
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(s.couleur)}><Ico size={16} /></span>
                          {ouvrable && <ArrowUpRight size={14} className="text-gray-300 transition-colors group-hover:text-gray-600" aria-hidden="true" />}
                        </div>
                        <p className="mt-2 truncate text-[11px] font-extrabold uppercase tracking-wide text-gray-600" title={s.label}>{s.label}</p>
                        <p className="text-sm font-black tabular-nums text-green-700">{fmt(s.recettes)}</p>
                        <p className="text-[11px] font-semibold tabular-nums text-red-600">- {fmt(s.depenses)}</p>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200/70" title={s.cible > 0 ? `${Math.round(s.pct)} % de l’objectif` : `${Math.round(part)} % des recettes`}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.cible > 0 ? s.pct : part)}%`, background: s.cible > 0 ? s.etat.couleur : s.couleur, transition: 'width .7s ease' }} />
                        </div>
                        <p className="mt-0.5 text-[10px] font-semibold text-gray-500">{s.cible > 0 ? `${Math.round(s.pct)} % de l’objectif` : `${Math.round(part)} % des recettes`}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </ParamsCarte>

            <ParamsCarte icone={Activity} couleur="#16a34a" titre="Recettes et dépenses par secteur" sous="Même échelle pour comparer">
              <div className="h-60">
                {secteursActifs.length
                  ? <Bar data={chartSecteurs} options={{ maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: true, position: 'bottom' } }, scales: { x: { ticks: { font: { size: 9 }, callback: (v) => fmt(v) } }, y: { ticks: { font: { size: 10 } } } } }} />
                  : <p className="py-16 text-center text-sm text-gray-400">{rapport ? 'Aucune recette ni dépense sur cette période.' : 'Chargement…'}</p>}
              </div>
            </ParamsCarte>

            <ParamsCarte icone={PiggyBank} couleur="#7c3aed" titre="Répartition des recettes" sous="Part de chaque secteur">
              <div className="h-60">
                {chartRepartition.labels.length
                  ? <Doughnut data={chartRepartition} options={{ maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: true, position: 'right', labels: { font: { size: 10 }, boxWidth: 10 } } } }} />
                  : <p className="py-16 text-center text-sm text-gray-400">{rapport ? 'Aucune recette sur cette période.' : 'Chargement…'}</p>}
              </div>
            </ParamsCarte>

            {rapport && rapport.jours.length > 1 && (
              <ParamsCarte icone={TrendingUp} couleur={ROUGE} titre="Évolution jour par jour" sous="Recettes et dépenses de la période" large>
                <div className="h-52"><Line data={chartJours} options={{ ...chartOpts, plugins: { legend: { display: true, position: 'bottom' } } }} /></div>
              </ParamsCarte>
            )}
          </ParamsGrille>
        </section>
      )}

      {/* ───── Activité du mois ───── */}
      <section aria-label="Activité du mois" className="space-y-3">
        <h2 className="flex items-center gap-2 px-1 text-sm font-extrabold uppercase tracking-wide text-gray-500"><Activity size={15} aria-hidden="true" /> Activité du mois</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {hasModule('agro') && <StatCard title="MAXI-AGRO" value={formatNumber(totalAnimaux)} sub={demandesAgroAttente ? `⚠ ${demandesAgroAttente} demande(s) en attente` : 'Effectif animal actuel'} icon={Leaf} accent="#BC3C31" />}
          {hasModule('logistique') && <StatCard title="Logistique" value={prestationsMois} sub={autorisationsLog ? `⚠ ${autorisationsLog} autorisation(s) en attente` : 'Prestations ce mois'} icon={Truck} accent="#0284c7" />}
          {hasModule('evenementiel') && <StatCard title="Briqueterie" value={formatNumber(prodMois)} sub={autorisationsBriq ? `⚠ ${autorisationsBriq} autorisation(s)` : 'Briques produites ce mois'} icon={BrickWall} accent="#475569" />}
          {hasModule('foncier') && <StatCard title="Foncier" value={dossiersActifs} sub={dossiersMois ? `${dossiersMois} ouvert(s) ce mois` : 'Dossiers actifs'} icon={MapPin} accent="#059669" />}
          <button onClick={() => alertes.length && setAlerteDetail('all')}
            className="card group relative flex min-h-[5.3rem] w-full items-center gap-3 overflow-hidden border-white/50 p-3 text-left backdrop-blur-xl transition-all hover:shadow-md sm:p-4"
            style={{ background: `linear-gradient(135deg, ${alertes.length ? 'rgba(245,158,11,0.16)' : 'rgba(148,163,184,0.12)'} 0%, rgba(255,255,255,0.8) 70%)` }}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12" style={icone3D(alertes.length ? '#f59e0b' : '#94a3b8')}><BellRing size={20} /></span>
            <span className="min-w-0">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">Alertes</span>
              <span className={`block text-xl font-extrabold leading-tight ${alertes.length ? 'text-amber-600' : 'text-gray-400'}`}>{alertes.length}</span>
              <span className="block text-[11px] text-gray-400">{alertes.length ? 'Touchez pour les détails' : 'Aucune alerte'}</span>
            </span>
          </button>
        </div>

        <ParamsGrille>
          {hasModule('agro') && (
            <ParamsCarte icone={Leaf} couleur="#BC3C31" titre="MAXI-AGRO : effectif" sous="12 dernières saisies">
              <div className="h-40">{last12Agro.length ? <Line data={chartAgro} options={chartOpts} /> : <p className="py-10 text-center text-sm text-gray-400">Aucune saisie</p>}</div>
              <div className="mt-2 flex gap-4 text-xs text-gray-500"><span>Total actuel : <strong className="text-gray-800">{formatNumber(totalAnimaux)}</strong></span><span>Saisies : <strong>{inventaires.length}</strong></span></div>
            </ParamsCarte>
          )}
          {hasModule('evenementiel') && (
            <ParamsCarte icone={BrickWall} couleur="#7c3aed" titre="Briqueterie : production" sous="Mensuelle">
              <div className="h-40">{prodLast12.data.length ? <Bar data={chartBriq} options={chartOpts} /> : <p className="py-10 text-center text-sm text-gray-400">Aucune production</p>}</div>
              <div className="mt-2 flex gap-4 text-xs text-gray-500"><span>Ce mois : <strong className="text-gray-800">{formatNumber(prodMois)}</strong> briques</span><span>Productions : <strong>{productions.length}</strong></span></div>
            </ParamsCarte>
          )}
          {hasModule('logistique') && (
            <ParamsCarte icone={Truck} couleur="#0284c7" titre="Logistique : activité du mois">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/80 bg-sky-50/70 p-3 text-center backdrop-blur-md"><p className="text-2xl font-extrabold text-sky-700">{prestationsMois}</p><p className="text-xs text-sky-600">Prestations ce mois</p></div>
                <div className="rounded-2xl border border-white/80 bg-amber-50/70 p-3 text-center backdrop-blur-md"><p className="text-2xl font-extrabold text-amber-700">{autorisationsLog}</p><p className="text-xs text-amber-600">Autorisations en attente</p></div>
              </div>
            </ParamsCarte>
          )}
          {hasModule('foncier') && (
            <ParamsCarte icone={MapPin} couleur="#059669" titre="Foncier : portefeuille de dossiers">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/80 bg-green-50/70 p-3 text-center backdrop-blur-md"><p className="text-2xl font-extrabold text-green-700">{dossiersActifs}</p><p className="text-xs text-green-600">Dossiers actifs</p></div>
                <div className="rounded-2xl border border-white/80 bg-gray-50/70 p-3 text-center backdrop-blur-md"><p className="text-2xl font-extrabold text-gray-700">{dossiersFoncier.length}</p><p className="text-xs text-gray-600">Total dossiers</p></div>
              </div>
            </ParamsCarte>
          )}
        </ParamsGrille>
      </section>

      {/* ───── Alertes cross-modules cliquables ───── */}
      <ParamsGrille>
        <ParamsCarte icone={AlertTriangle} couleur="#f59e0b" titre="Alertes cross-modules" sous={alertes.length ? 'Des décisions vous attendent' : 'Tout est à jour'} large>
          {alertes.length === 0 ? (
            <p className="py-5 text-center text-sm text-gray-400">Aucune alerte en cours 🎉</p>
          ) : (
            <div className="space-y-2">
              {alertes.map((a) => (
                <button key={a.id} onClick={() => setAlerteDetail(a.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50/90 to-white/70 px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={icone3D('#f59e0b')}><a.icon size={15} /></span>
                  <span className="flex-1 text-sm font-semibold text-amber-900">{a.text}</span>
                  <ChevronRight size={16} className="shrink-0 text-amber-400" />
                </button>
              ))}
            </div>
          )}
        </ParamsCarte>
      </ParamsGrille>

      {alerteDetail && <AlerteDetailModal alerteId={alerteDetail} alertes={alertes} onClose={() => setAlerteDetail(null)} onNavigate={(path) => { setAlerteDetail(null); navigate(path) }} />}
      {exportFormat && <ExportRapportModal format={exportFormat} periode={{ mode, jour: fJour, mois: fMois, annee: fAnnee, debut: fDebut, fin: fFin }} onClose={() => setExportFormat(null)} />}
    </div>
  )
}

function AlerteDetailModal({ alerteId, alertes, onClose, onNavigate }) {
  const liste = alerteId === 'all' ? alertes : alertes.filter((a) => a.id === alerteId)
  return (
    <Modal open onClose={onClose} size="lg" title="Détail des alertes" {...glassModalProps('#f59e0b')}>
      <div className="space-y-4">
        {liste.map((a) => (
          <div key={a.id} className="rounded-3xl border border-amber-200/80 bg-amber-50/70 p-4 backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-bold text-amber-900">{a.text}</h3>
              <button onClick={() => onNavigate(a.path)} className="flex shrink-0 items-center gap-1 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-amber-700">Accéder <ChevronRight size={13} /></button>
            </div>
            {a.details && a.details.length > 0 && (
              <div className="overflow-x-auto rounded-2xl border border-amber-200 bg-white/80">
                <table className="w-full text-sm">
                  <thead className="bg-amber-100 text-xs uppercase text-amber-700">
                    <tr><th className="px-3 py-2 text-left">N°</th><th className="px-3 py-2 text-left">Article</th><th className="px-2 py-2 text-center">Qté</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Demandeur</th></tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {a.details.slice(0, 20).map((d) => (
                      <tr key={d.id || d.num}>
                        <td className="px-3 py-1.5 font-mono text-xs">{d.num || d.id?.slice(0, 8) || '—'}</td>
                        <td className="px-3 py-1.5">{d.articleNom || d.materielNom || d.typeArticle || '—'}</td>
                        <td className="px-2 py-1.5 text-center font-semibold">{d.qte || d.quantite || '—'}</td>
                        <td className="px-3 py-1.5 text-xs">{formatDateShort(d.date)}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-500">{d.agentNom || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

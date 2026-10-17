// Flux de trésorerie — solde par nature de flux (exploitation / investissement / perte),
// croisé avec les revenus réels des autres modules. Lecture seule, aucune écriture croisée.
import '../../utils/chartSetup'
import { useMemo, useState } from 'react'
import { Chart } from 'react-chartjs-2'
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, FileSpreadsheet, Waves, ArrowDownToLine, ArrowUpFromLine, Factory, Landmark, Flame, Scale, LineChart } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import InfoBulle from '../../shared/ui/InfoBulle'
import BandeauVolet, { BoutonBande } from '../../shared/ui/BandeauVolet'
import Compteur from '../../shared/ui/Compteur'
import { useCollection } from '../../hooks/useFirestore'
import { exportRapportExcel } from '../../utils/excelReport'
import { MOIS_LABELS, NATURES_FLUX } from './data'
import { soldesFluxMois, croissance, derniersMois, moisPrecedent, coutsMatieresBriqueterie, visibleDansEDepenses } from './logic'
import { revenuSecteur, SECTEURS_AVEC_REVENU } from './revenus'
import { icone3D } from '../../utils/color'
import { optionsGraphique, styleBarre, styleCourbe } from './chartStyle'

const now = new Date()
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR')

export default function Flux() {
  const { data: depensesReelles }      = useCollection('depense_depenses')
  const { data: inventairesBriq }      = useCollection('evenementiel_inventaires')
  const { data: paiementsGarderie }    = useCollection('garderie_paiements')
  const { data: facturesAgro }         = useCollection('agro_factures')
  const { data: facturesLogistique }   = useCollection('logistique_factures')
  const { data: facturesEvenementiel } = useCollection('evenementiel_factures')

  // Coût matières Briqueterie, inclus en lecture seule — pas de double saisie. Les
  // dépenses de projet (E-G.Pro) n'apparaissent plus ici — elles ne se consultent
  // que depuis E-G.Pro lui-même. MAXI BAT reste exclu (volet BTP d'E-G.Pro), sauf les
  // dépenses saisies directement dans E-DÉPENSES (cf. visibleDansEDepenses).
  const depenses = useMemo(() => [
    ...depensesReelles.filter((d) => !d.projetId),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ].filter(visibleDansEDepenses), [depensesReelles, inventairesBriq])

  const collections = { paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel }

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)

  const changerMois = (delta) => {
    let m = mois + delta, a = annee
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMois(m); setAnnee(a)
  }

  const revenuMois = (a, m) => SECTEURS_AVEC_REVENU.reduce((s, id) => s + revenuSecteur(collections, id, a, m), 0)

  const solde = useMemo(() => soldesFluxMois(depenses, revenuMois(annee, mois), annee, mois),
    [depenses, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel, annee, mois])

  const { annee: aPrec, mois: mPrec } = moisPrecedent(annee, mois)
  const soldePrecedent = useMemo(() => soldesFluxMois(depenses, revenuMois(aPrec, mPrec), aPrec, mPrec),
    [depenses, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel, aPrec, mPrec])

  const tauxCroissance = croissance(solde.soldeGlobal, soldePrecedent.soldeGlobal)

  const tendance = useMemo(() => derniersMois(6, MOIS_LABELS).map(({ annee: a, mois: m, label }) => {
    const s = soldesFluxMois(depenses, revenuMois(a, m), a, m)
    return { label, ...s }
  }), [depenses, paiementsGarderie, facturesAgro, facturesLogistique, facturesEvenementiel])

  // Barres = solde de chaque nature (exploitation / investissement / perte), ligne = solde global.
  // Le zéro accentué sépare visuellement gain (au-dessus) et sortie (en-dessous).
  const chartData = {
    labels: tendance.map((t) => t.label),
    datasets: [
      { type: 'line', label: 'Solde global', data: tendance.map((t) => t.soldeGlobal), ...styleCourbe('#334155', { zone: false, pointille: true }), order: 0 },
      { type: 'bar', label: 'Exploitation',   data: tendance.map((t) => t.soldeExploitation),   ...styleBarre('#0d9488'), order: 1 },
      { type: 'bar', label: 'Investissement', data: tendance.map((t) => t.soldeInvestissement), ...styleBarre('#d97706'), order: 1 },
      { type: 'bar', label: 'Pertes',         data: tendance.map((t) => t.soldePerte),          ...styleBarre('#dc2626'), order: 1 }
    ]
  }

  const chartOptions = optionsGraphique()

  function exportXLSX() {
    exportRapportExcel({
      filename: `flux-tresorerie-${annee}-${String(mois).padStart(2, '0')}.xlsx`,
      sections: [{
        id: 'flux', name: 'Flux de trésorerie', title: 'Solde de trésorerie par nature de flux',
        subtitle: `${MOIS_LABELS[mois - 1]} ${annee}`,
        columns: [
          { key: 'Nature', label: 'Nature', width: 22 },
          { key: 'Entrées (FCFA)', label: 'Entrées (FCFA)', width: 18 },
          { key: 'Sorties (FCFA)', label: 'Sorties (FCFA)', width: 18 },
          { key: 'Solde (FCFA)', label: 'Solde (FCFA)', width: 18 }
        ],
        rows: [
          { Nature: 'Exploitation',   'Entrées (FCFA)': solde.revenuExploitation, 'Sorties (FCFA)': solde.depExploitation,   'Solde (FCFA)': solde.soldeExploitation },
          { Nature: 'Investissement', 'Entrées (FCFA)': 0,                        'Sorties (FCFA)': solde.depInvestissement, 'Solde (FCFA)': solde.soldeInvestissement },
          { Nature: 'Pertes',         'Entrées (FCFA)': 0,                        'Sorties (FCFA)': solde.depPerte,          'Solde (FCFA)': solde.soldePerte },
          { Nature: 'Solde global',   'Entrées (FCFA)': solde.revenuExploitation, 'Sorties (FCFA)': solde.depExploitation + solde.depInvestissement + solde.depPerte, 'Solde (FCFA)': solde.soldeGlobal }
        ]
      }]
    })
  }

  const IconCroissance = tauxCroissance === null ? Minus : tauxCroissance >= 0 ? TrendingUp : TrendingDown
  const couleurCroissance = tauxCroissance === null ? '#94a3b8' : tauxCroissance >= 0 ? '#059669' : '#dc2626'

  return (
    <div className="space-y-5">
      <style>{`
        @keyframes fx-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes fx-flotte { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes fx-barre { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes fx-bascule { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
        .fx-tuile { animation: fx-entree 0.45s ease-out backwards; }
        .fx-icone { animation: fx-flotte 3.2s ease-in-out infinite; }
        .fx-barre { transform-origin: left; animation: fx-barre 0.9s ease-out backwards; }
        @media (prefers-reduced-motion: reduce) { .fx-tuile, .fx-icone, .fx-barre { animation: none; } }
      `}</style>

      <BandeauVolet couleur="#B45309" icone={Waves} titre="Flux de trésorerie" sous={`${MOIS_LABELS[mois - 1]} ${annee} : entrées, sorties et solde par nature de flux.`}>
        <div className="flex items-center gap-1 rounded-2xl border border-white/30 bg-white/15 p-1 backdrop-blur-sm">
          <button onClick={() => changerMois(-1)} aria-label="Mois précédent" className="rounded-xl p-2 text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-90"><ChevronLeft size={16} /></button>
          <span className="px-1 text-sm font-bold whitespace-nowrap">{MOIS_LABELS[mois - 1]} {annee}</span>
          <button onClick={() => changerMois(1)} aria-label="Mois suivant" className="rounded-xl p-2 text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-90"><ChevronRight size={16} /></button>
        </div>
        <BoutonBande icone={FileSpreadsheet} onClick={exportXLSX}>Export Excel</BoutonBande>
      </BandeauVolet>

      <div className="ed-grille grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={<span className="flex items-center gap-1">Solde d'exploitation <InfoBulle texte="Revenus réels du mois − dépenses classées Exploitation." /></span>}
          value={`${fmt(solde.soldeExploitation)} FCFA`} icon={solde.soldeExploitation >= 0 ? TrendingUp : TrendingDown}
          sub={`Revenus ${fmt(solde.revenuExploitation)} − Charges ${fmt(solde.depExploitation)}`}
          accent={solde.soldeExploitation >= 0 ? '#0d9488' : '#dc2626'} />
        <StatCard
          title={<span className="flex items-center gap-1">Solde d'investissement <InfoBulle texte="− dépenses classées Investissement (achat d'actif durable)." /></span>}
          value={`${fmt(solde.soldeInvestissement)} FCFA`} icon={TrendingDown}
          sub={`Décaissé : ${fmt(solde.depInvestissement)} FCFA`} accent="#d97706" />
        <StatCard
          title={<span className="flex items-center gap-1">Pertes <InfoBulle texte="− dépenses classées Perte (argent perdu sans contrepartie)." /></span>}
          value={`${fmt(solde.soldePerte)} FCFA`} icon={TrendingDown}
          sub={`Décaissé : ${fmt(solde.depPerte)} FCFA`} accent="#dc2626" />
        <StatCard
          title={<span className="flex items-center gap-1">Solde global <InfoBulle texte="Exploitation + Investissement + Pertes." /></span>}
          value={`${fmt(solde.soldeGlobal)} FCFA`} icon={solde.soldeGlobal >= 0 ? TrendingUp : TrendingDown}
          sub={`Revenus ${fmt(solde.revenuExploitation)} − Sorties ${fmt(solde.depExploitation + solde.depInvestissement + solde.depPerte)}`}
          accent={solde.soldeGlobal >= 0 ? '#B45309' : '#dc2626'} />
      </div>

      <div className="fx-tuile relative overflow-hidden rounded-3xl border border-white/70 bg-white/70 p-4 shadow-[0_14px_30px_-18px_rgba(26,26,26,0.3),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl" style={{ animationDelay: '0.1s' }}>
        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl" style={{ background: couleurCroissance }} />
        <div className="relative flex items-center gap-3">
          <div className="fx-icone flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={icone3D(couleurCroissance)}>
            <IconCroissance size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-700">
              Croissance du solde global vs {MOIS_LABELS[mPrec - 1]} {aPrec}
              <InfoBulle texte="(Solde global de ce mois − solde global du mois précédent) ÷ |solde précédent| × 100." className="ml-1" />
            </p>
            <p className="text-2xl font-black" style={{ color: couleurCroissance }}>
              {tauxCroissance === null ? 'Non calculable (solde précédent nul)' : `${tauxCroissance >= 0 ? '+' : ''}${tauxCroissance}%`}
            </p>
          </div>
        </div>
      </div>

      {/* Entrées vs sorties : deux tuiles verre, des barres proportionnelles, et le solde net. */}
      {(() => {
        const entrees = solde.revenuExploitation
        const sorties = solde.depExploitation + solde.depInvestissement + solde.depPerte
        const base = Math.max(entrees, sorties, 1)
        const lignes = [
          { icone: Factory, label: 'Fonctionnement (exploitation)', valeur: solde.depExploitation, couleur: '#0d9488' },
          { icone: Landmark, label: 'Investissements', valeur: solde.depInvestissement, couleur: '#d97706' },
          { icone: Flame, label: 'Pertes', valeur: solde.depPerte, couleur: '#dc2626' }
        ]
        const positif = solde.soldeGlobal >= 0
        return (
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-base font-bold text-gray-800 dark:text-gray-100">
              <span className="fx-icone flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D('#B45309')}><Scale size={15} /></span>
              Entrées vs sorties : {MOIS_LABELS[mois - 1]} {annee}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="fx-tuile rounded-3xl border border-green-200/70 bg-gradient-to-br from-green-50/90 to-white/70 p-4 shadow-[0_14px_30px_-18px_rgba(22,163,74,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl" style={{ animationDelay: '0.15s' }}>
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-green-700">
                  <span className="fx-icone flex h-8 w-8 items-center justify-center rounded-xl" style={icone3D('#16a34a')}><ArrowDownToLine size={16} /></span> Entrées
                </p>
                <p className="mt-2 text-xs font-semibold text-gray-500">Revenus réels du mois</p>
                <p className="text-2xl font-black text-green-700"><Compteur valeur={entrees} format={fmt} /> <span className="text-xs font-bold text-gray-400">FCFA</span></p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-green-100">
                  <div className="fx-barre h-full rounded-full bg-gradient-to-r from-green-400 to-green-600" style={{ width: `${Math.round((entrees / base) * 100)}%` }} />
                </div>
              </div>
              <div className="fx-tuile rounded-3xl border border-red-200/70 bg-gradient-to-br from-red-50/90 to-white/70 p-4 shadow-[0_14px_30px_-18px_rgba(220,38,38,0.45),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl" style={{ animationDelay: '0.22s' }}>
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-red-700">
                  <span className="fx-icone flex h-8 w-8 items-center justify-center rounded-xl" style={icone3D('#dc2626')}><ArrowUpFromLine size={16} /></span> Sorties
                </p>
                <div className="mt-2 space-y-2">
                  {lignes.map((l) => {
                    const Ic = l.icone
                    return (
                      <div key={l.label}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-1.5 text-gray-600"><Ic size={13} style={{ color: l.couleur }} className="shrink-0" /> <span className="truncate">{l.label}</span></span>
                          <span className="font-mono font-semibold text-gray-800">{fmt(l.valeur)}</span>
                        </div>
                        <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/80">
                          <div className="fx-barre h-full rounded-full" style={{ width: `${Math.round((l.valeur / base) * 100)}%`, background: l.couleur }} />
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex items-center justify-between border-t border-red-200/70 pt-1.5 font-bold"><span className="text-gray-700">Total sorties</span><span className="font-mono text-red-700">{fmt(sorties)} FCFA</span></div>
                </div>
              </div>
            </div>
            <div className="fx-tuile relative flex items-center gap-3 overflow-hidden rounded-3xl p-4 text-white shadow-[0_16px_28px_-16px_rgba(0,0,0,0.55)]"
              style={{ animationDelay: '0.3s', background: positif ? 'linear-gradient(135deg, #4ade80 0%, #16a34a 55%, #14532d 130%)' : 'linear-gradient(135deg, #f87171 0%, #dc2626 55%, #7f1d1d 130%)' }}>
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/25 shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_10px_20px_-8px_rgba(0,0,0,0.5)]">
                <Scale size={22} style={{ animation: 'fx-bascule 3s ease-in-out infinite' }} />
              </span>
              <div className="relative min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-white/80">Solde net du mois (entrées − sorties)</p>
                <p className="text-2xl font-black leading-tight">{positif ? '' : '-'}<Compteur valeur={Math.abs(solde.soldeGlobal)} format={fmt} /> <span className="text-sm font-bold text-white/75">FCFA</span></p>
              </div>
            </div>
          </div>
        )
      })()}

      <Card className="fx-tuile" style={{ animationDelay: '0.35s' }} title={<span className="flex items-center gap-2"><span className="fx-icone flex h-7 w-7 items-center justify-center rounded-xl" style={icone3D('#0d9488')}><LineChart size={15} /></span>Tendance sur 6 mois : solde par nature de flux</span>}>
        <div style={{ height: 300 }}>
          <Chart type="bar" data={chartData} options={chartOptions} />
        </div>
      </Card>
    </div>
  )
}

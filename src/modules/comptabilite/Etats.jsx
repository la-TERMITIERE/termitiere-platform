// COMPTABILITÉ — États Financiers (aligné FEZIRE /accounting/financial-reports).
// Onglets : Bilan · Résultat · Flux Trésorerie · Ratios & Analyses.
import { useMemo, useState } from 'react'
import { BarChart2, CheckCircle2, FileDown } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import { formatMoney } from '../../utils/formatters'
import { exportRapportExcel } from '../../utils/excelReport'
import { useCompta } from './useCompta'
import { balance, compteDeResultat, soldePrefixe } from './logic'

const TABS = ['Bilan', 'Résultat', 'Flux Trésorerie', 'Ratios & Analyses']

export default function Etats() {
  const { plan, mvtsValides, loading } = useCompta()
  const annee = new Date().getFullYear()
  const [exercice, setExercice] = useState(annee)
  const [tab, setTab] = useState('Bilan')
  const bornes = { debut: `${exercice}-01-01`, fin: `${exercice}-12-31` }

  const bal = useMemo(() => balance(mvtsValides, plan, bornes), [mvtsValides, plan, exercice])
  const res = useMemo(() => compteDeResultat(mvtsValides, bornes), [mvtsValides, exercice])

  // Répartition des postes du bilan par type de compte.
  const bilan = useMemo(() => {
    const typeDe = (num) => plan.find((c) => c.num === num)?.type
    const actif = [], passif = []
    bal.postes.forEach((p) => {
      const t = typeDe(p.compte)
      if (t === 'ASSET') actif.push({ ...p, net: p.soldeDebiteur - p.soldeCrediteur })
      else if (t === 'LIABILITY' || t === 'EQUITY') passif.push({ ...p, net: p.soldeCrediteur - p.soldeDebiteur })
    })
    const totalActif = actif.reduce((s, p) => s + p.net, 0)
    const totalPassifHorsResultat = passif.reduce((s, p) => s + p.net, 0)
    const resultatNet = res.resultat
    return { actif, passif, totalActif, totalPassif: totalPassifHorsResultat + resultatNet, resultatNet }
  }, [bal, plan, res])

  const exporter = () => {
    const colPoste = [
      { key: 'compte', label: 'N° Compte', width: 12 },
      { key: 'libelle', label: 'Rubrique / Poste', width: 40 },
      { key: 'net', label: 'Net (XOF)', type: 'money', width: 18 }
    ]
    exportRapportExcel({
      filename: `etats-financiers-${exercice}.xlsx`,
      sections: [
        { name: 'Bilan Actif', title: `Bilan — ACTIF · Exercice ${exercice}`, subtitle: 'SYSCOHADA · devise XOF', columns: colPoste, rows: bilan.actif, totals: { __label: "TOTAL DE L'ACTIF", net: bilan.totalActif } },
        { name: 'Bilan Passif', title: `Bilan — PASSIF & CAPITAUX · Exercice ${exercice}`, subtitle: 'SYSCOHADA · devise XOF', columns: colPoste, rows: [...bilan.passif, { compte: '120/129', libelle: "Résultat Net de l'exercice", net: bilan.resultatNet }], totals: { __label: 'TOTAL DU PASSIF & CAPITAUX', net: bilan.totalPassif } },
        { name: 'Compte de résultat', title: `Compte de résultat · Exercice ${exercice}`, subtitle: 'SYSCOHADA · devise XOF',
          columns: [{ key: 'poste', label: 'Poste', width: 40 }, { key: 'montant', label: 'Montant (XOF)', type: 'money', width: 20 }],
          rows: [{ poste: "Produits d'exploitation (classe 7)", montant: res.produits }, { poste: "Charges d'exploitation (classe 6)", montant: -res.charges }],
          totals: { __label: res.benefice ? 'RÉSULTAT NET (Bénéfice)' : 'RÉSULTAT NET (Perte)', montant: res.resultat } }
      ]
    })
  }

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <BarChart2 className="text-orange-600" /> États Financiers
          </h1>
          <p className="text-sm text-gray-500">Consultez les états financiers réglementaires, les flux de trésorerie et les indicateurs analytiques de l'organisation.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" value={exercice} onChange={(e) => setExercice(Number(e.target.value))}
            className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5" />
          <Button variant="outline" onClick={exporter}><FileDown size={15} /> Exporter (Excel)</Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>{t}</button>
        ))}
      </div>

      {tab === 'Bilan' && <Bilan bilan={bilan} />}
      {tab === 'Résultat' && <Resultat res={res} />}
      {tab === 'Flux Trésorerie' && <Flux mvts={mvtsValides} bornes={bornes} />}
      {tab === 'Ratios & Analyses' && <Ratios res={res} bilan={bilan} />}
    </div>
  )
}

function Bilan({ bilan }) {
  const equilibre = Math.abs(bilan.totalActif - bilan.totalPassif) < 1
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${equilibre ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
        <CheckCircle2 size={16} />
        {equilibre ? "Le Bilan est parfaitement équilibré. L'Actif correspond au Passif & Capitaux propres." : 'Écart de bilan détecté — vérifiez les écritures.'}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PosteBloc titre="ACTIF (Assets)" sousTitre="Emplois et ressources détenues par l'organisation." colonne="Net (XOF)"
          postes={bilan.actif} total={bilan.totalActif} totalLabel="TOTAL DE L'ACTIF" />
        <PosteBloc titre="PASSIF & CAPITAUX (Liabilities & Equity)" sousTitre="Origine des financements et capitaux de l'organisation." colonne="Montant (XOF)"
          postes={bilan.passif} total={bilan.totalPassif} totalLabel="TOTAL DU PASSIF & CAPITAUX"
          extra={{ code: '120/129', label: "Résultat Net de l'exercice", net: bilan.resultatNet }} />
      </div>
    </div>
  )
}

function PosteBloc({ titre, sousTitre, colonne, postes, total, totalLabel, extra }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <p className="font-bold text-gray-800 dark:text-gray-100">{titre}</p>
        <p className="text-xs text-gray-500">{sousTitre}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
            <th className="px-3 py-2">N° Compte</th><th className="px-3 py-2">Rubrique / Poste</th><th className="px-3 py-2 text-right">{colonne}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-white/10">
          {postes.map((p) => (
            <tr key={p.compte}><td className="px-3 py-2 font-mono text-xs">{p.compte}</td><td className="px-3 py-2">{p.libelle}</td><td className="px-3 py-2 text-right">{formatMoney(p.net)}</td></tr>
          ))}
          {extra && (
            <tr className="bg-orange-50/40 dark:bg-orange-500/10"><td className="px-3 py-2 font-mono text-xs">{extra.code}</td><td className="px-3 py-2 font-semibold">{extra.label}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(extra.net)}</td></tr>
          )}
          {postes.length === 0 && !extra && <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">Aucun poste.</td></tr>}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-100 font-extrabold dark:border-white/20 dark:bg-white/10">
            <td className="px-3 py-2.5" colSpan={2}>{totalLabel}</td><td className="px-3 py-2.5 text-right">{formatMoney(total)} XOF</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  )
}

function Resultat({ res }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="Produits (classe 7)" value={formatMoney(res.produits)} accent="#0ea5e9" />
        <StatCard title="Charges (classe 6)" value={formatMoney(res.charges)} accent="#f59e0b" />
        <StatCard title={res.benefice ? 'Résultat net (Bénéfice)' : 'Résultat net (Perte)'} value={formatMoney(res.resultat)}
          valueColor={res.benefice ? '#16a34a' : '#dc2626'} accent={res.benefice ? '#16a34a' : '#dc2626'} />
      </div>
      <Card>
        <div className="space-y-2 text-sm">
          <Ligne label="Total des produits d'exploitation" value={res.produits} />
          <Ligne label="Total des charges d'exploitation" value={-res.charges} />
          <div className="my-2 border-t border-gray-100 dark:border-white/10" />
          <div className="flex items-center justify-between text-base font-bold">
            <span>Résultat net de l'exercice</span>
            <span className={res.benefice ? 'text-green-600' : 'text-red-600'}>{formatMoney(res.resultat)}</span>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Flux({ mvts, bornes }) {
  const tresorerie = soldePrefixe(mvts, '5', bornes)
  const encaissements = mvts.filter((m) => m.compte.startsWith('5')).reduce((s, m) => s + m.debit, 0)
  const decaissements = mvts.filter((m) => m.compte.startsWith('5')).reduce((s, m) => s + m.credit, 0)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard title="Encaissements (classe 5, débit)" value={formatMoney(encaissements)} accent="#16a34a" />
      <StatCard title="Décaissements (classe 5, crédit)" value={formatMoney(decaissements)} accent="#dc2626" />
      <StatCard title="Trésorerie nette" value={formatMoney(tresorerie)} accent="#7c3aed" />
    </div>
  )
}

function Ratios({ res, bilan }) {
  const marge = res.produits > 0 ? Math.round((res.resultat / res.produits) * 100) : 0
  const autonomie = bilan.totalPassif > 0 ? Math.round(((bilan.resultatNet + bilan.passif.reduce((s, p) => s + p.net, 0)) / bilan.totalPassif) * 100) : 0
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard title="Taux de marge nette" value={`${marge} %`} accent="#0ea5e9" />
      <StatCard title="Total Actif" value={formatMoney(bilan.totalActif)} accent="#0d9488" />
      <StatCard title="Résultat net" value={formatMoney(res.resultat)} valueColor={res.benefice ? '#16a34a' : '#dc2626'} accent={res.benefice ? '#16a34a' : '#dc2626'} />
    </div>
  )
}

function Ligne({ label, value }) {
  return <div className="flex items-center justify-between"><span className="text-gray-500">{label}</span><span className="font-semibold">{formatMoney(value)}</span></div>
}

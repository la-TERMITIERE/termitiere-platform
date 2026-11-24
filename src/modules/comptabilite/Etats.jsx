// COMPTABILITÉ — États Financiers (aligné FEZIRE /accounting/financial-reports).
// Onglets : Bilan · Résultat · Flux Trésorerie · Ratios & Analyses.
import { useMemo, useState } from 'react'
import { BarChart2, CheckCircle2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Badge from '../../shared/ui/Badge'
import { formatMoney } from '../../utils/formatters'
import { useCompta } from './useCompta'
import { balance, compteDeResultat, soldePrefixe } from './logic'
import { compteDeResultatSyscohada, bilanSyscohada } from './syscohada'
import Button from '../../shared/ui/Button'
import { exportRapportExcel } from '../../utils/excelReport'
import BandeauCompta, { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from './BandeauCompta'

const TABS = ['Bilan', 'Résultat', 'Flux Trésorerie', 'Ratios & Analyses', 'Format SYSCOHADA']

export default function Etats() {
  const { plan, mvtsValides, loading } = useCompta()
  const annee = new Date().getFullYear()
  const [exercice, setExercice] = useState(annee)
  const [tab, setTab] = useState('Bilan')
  const bornes = { debut: `${exercice}-01-01`, fin: `${exercice}-12-31` }

  // Le bilan est un état de STOCK : il cumule tous les mouvements jusqu'à la fin de l'exercice
  // (les soldes d'ouverture des années précédentes y figurent, comme des à-nouveaux).
  const bal = useMemo(() => balance(mvtsValides, plan, { fin: bornes.fin }), [mvtsValides, plan, exercice]) // eslint-disable-line react-hooks/exhaustive-deps
  const res = useMemo(() => compteDeResultat(mvtsValides, bornes), [mvtsValides, exercice]) // eslint-disable-line react-hooks/exhaustive-deps
  // Résultats des exercices antérieurs, non encore affectés : report à nouveau.
  const resAnterieur = useMemo(() => compteDeResultat(mvtsValides, { fin: `${exercice - 1}-12-31` }).resultat, [mvtsValides, exercice])

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
    return { actif, passif, totalActif, totalPassif: totalPassifHorsResultat + resAnterieur + resultatNet, resultatNet, resAnterieur }
  }, [bal, plan, res, resAnterieur])

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  return (
    <div className="space-y-5">
      <BandeauCompta icone={BarChart2} titre="États Financiers" sous="Consultez les états financiers réglementaires, les flux de trésorerie et les indicateurs analytiques de l'organisation.">
        <OngletsBande options={TABS.map((t) => ({ id: t, label: t }))} valeur={tab} onChange={setTab} />
        <ChampBande label="Exercice">
          <input type="number" value={exercice} onChange={(e) => setExercice(Number(e.target.value))} className={`${CLASSE_CHAMP_BANDE} w-24`} />
        </ChampBande>
      </BandeauCompta>

      {tab === 'Bilan' && <Bilan bilan={bilan} />}
      {tab === 'Résultat' && <Resultat res={res} />}
      {tab === 'Flux Trésorerie' && <Flux mvts={mvtsValides} bornes={bornes} />}
      {tab === 'Ratios & Analyses' && <Ratios res={res} bilan={bilan} />}
      {tab === 'Format SYSCOHADA' && <FormatSyscohada mvts={mvtsValides} plan={plan} bornes={bornes} exercice={exercice} resAnterieur={resAnterieur} />}
    </div>
  )
}

function Bilan({ bilan }) {
  const equilibre = Math.abs(bilan.totalActif - bilan.totalPassif) < 1
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${equilibre ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
        <CheckCircle2 size={16} />
        {equilibre ? "Le Bilan est parfaitement équilibré. L'Actif correspond au Passif & Capitaux propres." : 'Écart de bilan détecté : vérifiez les écritures.'}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PosteBloc titre="ACTIF (Assets)" sousTitre="Emplois et ressources détenues par l'organisation." colonne="Net (XOF)"
          postes={bilan.actif} total={bilan.totalActif} totalLabel="TOTAL DE L'ACTIF" />
        <PosteBloc titre="PASSIF & CAPITAUX (Liabilities & Equity)" sousTitre="Origine des financements et capitaux de l'organisation." colonne="Montant (XOF)"
          postes={bilan.passif} total={bilan.totalPassif} totalLabel="TOTAL DU PASSIF & CAPITAUX"
          extra={{ code: '120/129', label: "Résultat Net de l'exercice", net: bilan.resultatNet }}
          extraAvant={bilan.resAnterieur ? { code: '110/119', label: 'Résultats antérieurs (report à nouveau)', net: bilan.resAnterieur } : null} />
      </div>
    </div>
  )
}

function PosteBloc({ titre, sousTitre, colonne, postes, total, totalLabel, extra, extraAvant }) {
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
          {extraAvant && (
            <tr className="bg-gray-50/60"><td className="px-3 py-2 font-mono text-xs">{extraAvant.code}</td><td className="px-3 py-2 font-semibold">{extraAvant.label}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(extraAvant.net)}</td></tr>
          )}
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

// États au format SYSCOHADA révisé : compte de résultat en cascade (XA → XI) et bilan par
// rubriques, avec contrôle d'équilibre et export Excel.
function FormatSyscohada({ mvts, plan, bornes, exercice, resAnterieur }) {
  const cr = useMemo(() => compteDeResultatSyscohada(mvts, plan, bornes), [mvts, plan, exercice]) // eslint-disable-line react-hooks/exhaustive-deps
  const bil = useMemo(() => bilanSyscohada(mvts, plan, { fin: bornes.fin, resultatNet: cr.resultatNet, resultatsAnterieurs: resAnterieur }), [mvts, plan, exercice, cr.resultatNet, resAnterieur]) // eslint-disable-line react-hooks/exhaustive-deps
  const [ouverte, setOuverte] = useState(null)
  const exporter = () => exportRapportExcel({
    filename: `etats-syscohada-${exercice}.xlsx`,
    sections: [
      { name: 'Compte de résultat', title: `Compte de résultat SYSCOHADA : exercice ${exercice}`, subtitle: `Du ${bornes.debut} au ${bornes.fin}`,
        columns: [{ key: 'ref', label: 'Réf.', width: 8 }, { key: 'label', label: 'Libellé', width: 52 }, { key: 'montant', label: 'Montant (XOF)', width: 18 }],
        rows: cr.lignes.map((l) => ({ ref: l.ref, label: l.label, montant: Math.round(l.montant) })) },
      { name: 'Bilan', title: `Bilan SYSCOHADA au ${bornes.fin}`, subtitle: bil.equilibre ? 'Bilan équilibré' : 'Écart de bilan',
        columns: [{ key: 'ref', label: 'Réf.', width: 8 }, { key: 'label', label: 'Libellé', width: 52 }, { key: 'montant', label: 'Montant (XOF)', width: 18 }],
        rows: [{ ref: '', label: 'ACTIF' }, ...bil.actif, { ref: 'BZ', label: 'TOTAL GÉNÉRAL ACTIF', montant: bil.totalActif }, { ref: '', label: 'PASSIF' }, ...bil.passif, { ref: 'DZ', label: 'TOTAL GÉNÉRAL PASSIF', montant: bil.totalPassif }]
          .map((l) => ({ ref: l.ref, label: l.label, montant: l.montant === undefined ? '' : Math.round(l.montant) })) }
    ]
  })
  const Ligne = ({ l, i }) => (
    <>
      <tr onClick={() => !l.solde && l.detail?.length && setOuverte(ouverte === i ? null : i)} className={l.solde ? 'bg-orange-50/60 font-extrabold' : `${l.detail?.length ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
        <td className="px-3 py-1.5 font-mono text-xs">{l.ref}</td><td className="px-3 py-1.5">{l.label}</td>
        <td className={`px-3 py-1.5 text-right ${l.montant < 0 ? 'text-red-600' : ''}`}>{l.montant ? formatMoney(l.montant) : (l.solde ? formatMoney(0) : '—')}</td>
      </tr>
      {ouverte === i && l.detail.map((d) => <tr key={d.compte} className="bg-gray-50/60 text-xs text-gray-600"><td /><td className="px-6 py-1"><span className="font-mono">{d.compte}</span> {d.libelle}</td><td className="px-3 py-1 text-right">{formatMoney(d.montant)}</td></tr>)}
    </>
  )
  const Tableau = ({ titre, lignes, total, totalLabel }) => (
    <Card className="!p-0 overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">{titre}</p></div>
      <table className="w-full text-sm"><tbody className="divide-y divide-gray-100">
        {lignes.map((l, i) => <Ligne key={l.ref} l={l} i={`${titre}-${i}`} />)}
        {totalLabel && <tr className="bg-gray-100 font-extrabold"><td /><td className="px-3 py-2">{totalLabel}</td><td className="px-3 py-2 text-right">{formatMoney(total)}</td></tr>}
      </tbody></table>
    </Card>
  )
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className={`flex flex-1 items-center gap-2 rounded-lg p-3 text-sm ${bil.equilibre ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          <CheckCircle2 size={16} /> {bil.equilibre ? `Bilan équilibré : ${formatMoney(bil.totalActif)} à l'actif et au passif. Résultat net (XI) : ${formatMoney(cr.resultatNet)}.` : `Écart de bilan : ${formatMoney(bil.totalActif - bil.totalPassif)}.`}
        </div>
        <Button variant="ghost" onClick={exporter}>Exporter en Excel</Button>
      </div>
      <p className="text-xs text-gray-500">Présentation du système normal SYSCOHADA révisé, établie depuis la balance. Touchez une rubrique pour voir ses comptes. À faire valider par l'expert-comptable avant tout dépôt officiel (DSF).</p>
      <Tableau titre={`Compte de résultat : exercice ${exercice}`} lignes={cr.lignes} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Tableau titre={`Actif au ${bornes.fin}`} lignes={bil.actif} total={bil.totalActif} totalLabel="TOTAL GÉNÉRAL ACTIF (BZ)" />
        <Tableau titre={`Passif au ${bornes.fin}`} lignes={bil.passif} total={bil.totalPassif} totalLabel="TOTAL GÉNÉRAL PASSIF (DZ)" />
      </div>
    </div>
  )
}

// COMPTABILITÉ — Stocks (valorisation, classe 3) : valeur du stock Maxi Agro à une date,
// d'après les inventaires journaliers, au coût unitaire saisi ici (sinon prix du référentiel).
// Les variations de fin de mois sont comptabilisées automatiquement (journal ST, cf. stocks.js).
import { useMemo, useState } from 'react'
import { Package, Download } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { formatMoney, formatNumber, formatDateShort, todayStr } from '../../utils/formatters'
import { exportRapportExcel } from '../../utils/excelReport'
import { useCompta } from './useCompta'
import { COL } from './data'
import BandeauCompta, { ChampBande, CLASSE_CHAMP_BANDE, BoutonBande } from './BandeauCompta'
import { valeurStocks, COMPTES_STOCK } from './valorisationStocks'

export default function Stocks() {
  const { stocks, loading } = useCompta()
  const [date, setDate] = useState(todayStr())
  const [couts, setCouts] = useState(null)
  const coutsEff = couts || stocks.couts
  const v = useMemo(() => valeurStocks({ inventaires: stocks.inventaires, referentiel: stocks.referentiel, couts: coutsEff, date }), [stocks, coutsEff, date])

  const enregistrer = async () => {
    const propres = Object.fromEntries(Object.entries(couts).filter(([, x]) => x !== '' && x !== undefined).map(([k, x]) => [k, Number(x)]))
    await setItem(COL.params, 'stocks', { couts: propres })
    await audit('comptabilite', 'STOCKS', 'Coûts unitaires de valorisation modifiés')
    setCouts(null)
  }
  const exporter = () => exportRapportExcel({
    filename: `stocks-${date}.xlsx`,
    sections: [{ name: 'Stocks', title: 'Valorisation des stocks', subtitle: `Au ${date}`,
      columns: [{ key: 'nom', label: 'Article', width: 28 }, { key: 'famille', label: 'Famille', width: 12 }, { key: 'qte', label: 'Quantité', width: 12 }, { key: 'unite', label: 'Unité', width: 10 }, { key: 'cout', label: 'Coût unitaire', width: 14 }, { key: 'valeur', label: 'Valeur', width: 16 }],
      rows: v.lignes, totals: { __label: 'TOTAL', valeur: v.total } }]
  })

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>
  return (
    <div className="space-y-5">
      <BandeauCompta icone={Package} titre="Stocks (valorisation)" sous="Valeur du stock Maxi Agro d'après les inventaires journaliers. Les variations de fin de mois sont comptabilisées automatiquement (journal ST).">
        <ChampBande label="Au"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={CLASSE_CHAMP_BANDE} /></ChampBande>
        <BoutonBande icone={Download} plein={false} onClick={exporter}>Excel</BoutonBande>
      </BandeauCompta>
      <div className="grid grid-cols-3 gap-3">
        <StatCard title={`${COMPTES_STOCK.animaux.label} (${COMPTES_STOCK.animaux.stock})`} value={formatMoney(v.animaux)} accent="#16a34a" icon={Package} />
        <StatCard title={`${COMPTES_STOCK.aliments.label} (${COMPTES_STOCK.aliments.stock})`} value={formatMoney(v.aliments)} accent="#f59e0b" icon={Package} />
        <StatCard title="Valeur totale du stock" value={formatMoney(v.total)} accent="#0f766e" icon={Package} />
      </div>
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center border-b border-gray-100 px-4 py-3">
          <div className="mr-auto"><p className="font-bold text-gray-800">Articles en stock au {formatDateShort(date)}</p><p className="text-xs text-gray-500">Coût unitaire modifiable : sans saisie, c'est le prix du référentiel Maxi Agro (souvent un prix de vente : à remplacer par le coût de revient).</p></div>
          {couts && <Button size="sm" onClick={enregistrer}>Enregistrer les coûts</Button>}
        </div>
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50"><tr className="text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Article</th><th className="px-3 py-2">Famille</th><th className="px-3 py-2 text-right">Quantité</th><th className="px-3 py-2">Inventaire du</th><th className="px-3 py-2 text-right">Coût unitaire</th><th className="px-3 py-2 text-right">Valeur</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {v.lignes.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Aucun stock inventorié à cette date.</td></tr>}
              {v.lignes.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 font-medium">{l.nom}</td><td className="px-3 py-2"><Badge tone={l.famille === 'animaux' ? 'success' : 'warning'}>{l.famille === 'animaux' ? 'Animaux' : 'Aliments'}</Badge></td>
                  <td className="px-3 py-2 text-right">{formatNumber(l.qte)} <span className="text-xs text-gray-400">{l.unite}</span></td>
                  <td className="px-3 py-2 font-mono text-xs">{formatDateShort(l.dateInventaire)}</td>
                  <td className="px-3 py-2 text-right"><input type="number" min="0" value={coutsEff[l.id] ?? ''} placeholder={String(l.coutSaisi ? '' : l.cout)} onChange={(e) => setCouts({ ...coutsEff, [l.id]: e.target.value })} className="input-base !w-28 !py-1 text-right" /></td>
                  <td className="px-3 py-2 text-right font-semibold">{formatMoney(l.valeur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

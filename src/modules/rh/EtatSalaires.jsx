// RH — État des salaires (Temps & Paie). Synthèse de la paie par mois et département.
import { useMemo, useState } from 'react'
import { BarChart2, FileDown } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { formatMoney, todayStr } from '../../utils/formatters'
import { exportRapportExcel } from '../../utils/excelReport'
import { MOIS_LABELS, COL } from './store/rhStore'

export default function EtatSalaires() {
  const { data: bulletins } = useCollection(COL.bulletins)
  const [mois, setMois] = useState(todayStr().slice(0, 7))
  const b = useMemo(() => bulletins.filter((x) => x.mois === mois), [bulletins, mois])

  const totaux = useMemo(() => b.reduce((s, x) => ({
    brut: s.brut + (Number(x.brutTotal) || 0), net: s.net + (Number(x.net) || 0),
    cnss: s.cnss + (Number(x.cnssSalarie) || 0) + (Number(x.cnssEmployeur) || 0),
    its: s.its + (Number(x.its) || 0), cout: s.cout + (Number(x.coutEmployeur) || 0)
  }), { brut: 0, net: 0, cnss: 0, its: 0, cout: 0 }), [b])

  const parDept = useMemo(() => {
    const acc = {}
    b.forEach((x) => {
      const d = x.departement || 'Non affecté'
      acc[d] ||= { dept: d, effectif: 0, brut: 0, net: 0 }
      acc[d].effectif++; acc[d].brut += Number(x.brutTotal) || 0; acc[d].net += Number(x.net) || 0
    })
    return Object.values(acc).sort((a, z) => z.brut - a.brut)
  }, [b])

  const moisLabel = (() => { const [a, m] = mois.split('-'); return m ? `${MOIS_LABELS[Number(m) - 1]} ${a}` : mois })()

  const exporter = () => {
    exportRapportExcel({
      filename: `etat-salaires-${mois}.xlsx`,
      sections: [
        {
          name: 'Bulletins', title: `Bulletins de paie — ${moisLabel}`, subtitle: 'Détail par employé · devise XOF',
          columns: [
            { key: 'employeNom', label: 'Employé', width: 24 },
            { key: 'poste', label: 'Poste', width: 20 },
            { key: 'departement', label: 'Département', width: 18 },
            { key: 'brutTotal', label: 'Brut', type: 'money', width: 15 },
            { key: 'cnssSalarie', label: 'CNSS sal.', type: 'money', width: 14 },
            { key: 'its', label: 'ITS', type: 'money', width: 14 },
            { key: 'net', label: 'Net à payer', type: 'money', width: 15 }
          ],
          rows: b,
          totals: { __label: 'TOTAL', brutTotal: totaux.brut, net: totaux.net }
        },
        {
          name: 'Par département', title: `Masse salariale par département — ${moisLabel}`, subtitle: 'Synthèse',
          columns: [
            { key: 'dept', label: 'Département', width: 24 },
            { key: 'effectif', label: 'Effectif', type: 'number', width: 12 },
            { key: 'brut', label: 'Masse brute', type: 'money', width: 18 },
            { key: 'net', label: 'Net payé', type: 'money', width: 18 }
          ],
          rows: parDept,
          totals: { __label: 'TOTAL', brut: totaux.brut, net: totaux.net }
        }
      ]
    })
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Temps & Paie</div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <BarChart2 className="text-sky-600" /> État des salaires
          </h1>
          <p className="text-sm text-gray-500">Synthèse de la masse salariale par période et par département.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={mois} onChange={(e) => setMois(e.target.value)} className="input-base !w-auto" />
          <Button variant="outline" onClick={exporter} disabled={b.length === 0}><FileDown size={15} /> Exporter (Excel)</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard title="Masse brute" value={formatMoney(totaux.brut)} accent="#7c3aed" />
        <StatCard title="Net payé" value={formatMoney(totaux.net)} accent="#16a34a" />
        <StatCard title="Charges (CNSS+ITS)" value={formatMoney(totaux.cnss + totaux.its)} accent="#f59e0b" />
        <StatCard title="Coût employeur total" value={formatMoney(totaux.cout)} accent="#0284c7" />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <p className="font-bold text-gray-800 dark:text-gray-100">Répartition par département — {moisLabel}</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
              <th className="px-3 py-2.5">Département</th><th className="px-3 py-2.5 text-center">Effectif</th>
              <th className="px-3 py-2.5 text-right">Masse brute</th><th className="px-3 py-2.5 text-right">Net payé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {parDept.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">Aucun bulletin sur la période. Générez la paie dans « Paie & Bulletins ».</td></tr>}
            {parDept.map((d) => (
              <tr key={d.dept} className="hover:bg-gray-50 dark:hover:bg-white/5">
                <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{d.dept}</td>
                <td className="px-3 py-2 text-center">{d.effectif}</td>
                <td className="px-3 py-2 text-right">{formatMoney(d.brut)}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatMoney(d.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

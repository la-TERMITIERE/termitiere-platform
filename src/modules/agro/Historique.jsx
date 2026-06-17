// Historique MAXI-AGRO — tous les mouvements (entrées / sorties / décès / autres)
// sur une période, avec filtres par sens et par type, et export Excel.
import { useMemo, useState } from 'react'
import { FileSpreadsheet, ArrowDownCircle, ArrowUpCircle, Skull } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Select from '../../shared/forms/Select'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { useCollection } from '../../hooks/useFirestore'
import { useAgroStore } from './store/agroStore'
import { historiqueMouvements } from './logic'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatDateShort } from '../../utils/formatters'

export default function Historique() {
  const { data: inventaires } = useCollection('agro_inventaires')
  const especes = useAgroStore((s) => s.especes)
  const aliments = useAgroStore((s) => s.aliments)
  const { start, end, node: periodNode } = usePeriodSelect('30')

  const [sens, setSens] = useState('tous')   // tous | entree | sortie
  const [type, setType] = useState('')        // type de mouvement

  const invPeriode = useMemo(
    () => inventaires.filter((i) => i.date >= start && i.date <= end),
    [inventaires, start, end]
  )

  const mouvements = useMemo(
    () => historiqueMouvements(invPeriode, especes, aliments),
    [invPeriode, especes, aliments]
  )

  const typesPresents = useMemo(
    () => [...new Set(mouvements.map((m) => m.type).filter(Boolean))].sort(),
    [mouvements]
  )

  const lignes = useMemo(
    () => mouvements.filter((m) =>
      (sens === 'tous' || m.sens === sens) &&
      (!type || m.type === type)
    ),
    [mouvements, sens, type]
  )

  const totaux = useMemo(() => {
    let entrees = 0, sorties = 0, deces = 0
    mouvements.forEach((m) => {
      if (m.sens === 'entree') entrees += m.qte
      else { sorties += m.qte; if (m.type === 'Décès') deces += m.qte }
    })
    return { entrees, sorties, deces }
  }, [mouvements])

  function exportXLSX() {
    const rows = lignes.map((l) => ({
      Date: formatDateShort(l.date),
      Sens: l.sens === 'entree' ? 'Entrée' : 'Sortie',
      Type: l.type,
      Article: l.article,
      Catégorie: l.cat,
      Quantité: l.qte,
      'Motif / détail': l.motif || '—',
      Agent: l.agent
    }))
    exportRapportExcel({
      filename: `historique-maxi-agro-${start}_${end}.xlsx`,
      sections: [{
        id: 'historique', name: 'Historique',
        title: 'Historique des mouvements — MAXI-AGRO',
        subtitle: `Du ${formatDateShort(start)} au ${formatDateShort(end)} · ${lignes.length} mouvement(s)`,
        columns: [
          { key: 'Date', label: 'Date', width: 14 },
          { key: 'Sens', label: 'Sens', width: 10 },
          { key: 'Type', label: 'Type', width: 16 },
          { key: 'Article', label: 'Article', width: 22 },
          { key: 'Catégorie', label: 'Catégorie', width: 18 },
          { key: 'Quantité', label: 'Quantité', width: 10 },
          { key: 'Motif / détail', label: 'Motif / détail', width: 30 },
          { key: 'Agent', label: 'Agent', width: 20 }
        ],
        rows
      }]
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat title="Entrées (période)" value={totaux.entrees} color="#16a34a" icon={ArrowDownCircle} />
        <Stat title="Sorties (période)" value={totaux.sorties} color="#d97706" icon={ArrowUpCircle} />
        <Stat title="Décès (période)" value={totaux.deces} color="#dc2626" icon={Skull} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {periodNode}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Sens</label>
          <Select className="w-auto" value={sens} onChange={(e) => setSens(e.target.value)}
            options={[{ value: 'tous', label: 'Entrées & sorties' }, { value: 'entree', label: 'Entrées' }, { value: 'sortie', label: 'Sorties' }]} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Type</label>
          <Select className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tous les types</option>
            {typesPresents.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-400">{lignes.length} mouvement(s)</span>
          <Button variant="outline" onClick={exportXLSX} disabled={!lignes.length}><FileSpreadsheet size={16} /> Export Excel</Button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Sens</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Article</th>
              <th className="px-3 py-2 text-left">Catégorie</th>
              <th className="px-2 py-2 text-center">Qté</th>
              <th className="px-3 py-2 text-left">Motif / détail</th>
              <th className="px-3 py-2 text-left">Agent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lignes.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-sm text-gray-400">Aucun mouvement sur la période.</td></tr>
            )}
            {lignes.map((l, i) => (
              <tr key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{formatDateShort(l.date)}</td>
                <td className="px-3 py-1.5">
                  <Badge tone={l.sens === 'entree' ? 'success' : 'warning'}>{l.sens === 'entree' ? 'Entrée' : 'Sortie'}</Badge>
                </td>
                <td className="px-3 py-1.5 font-semibold">{l.type}</td>
                <td className="px-3 py-1.5">{l.article}</td>
                <td className="px-3 py-1.5 text-gray-500">{l.cat}</td>
                <td className={`px-2 py-1.5 text-center font-bold ${l.sens === 'entree' ? 'text-green-600' : l.type === 'Décès' ? 'text-red-600' : 'text-amber-600'}`}>{l.qte}</td>
                <td className="px-3 py-1.5 text-gray-600">{l.motif || '—'}</td>
                <td className="px-3 py-1.5 text-xs text-gray-400">{l.agent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function Stat({ title, value, color, icon: Icon }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: color + '1a', color }}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
        <p className="text-2xl font-extrabold" style={{ color }}>{value}</p>
      </div>
    </div>
  )
}

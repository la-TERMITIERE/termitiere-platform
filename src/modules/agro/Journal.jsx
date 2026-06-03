// Journal MAXI-AGRO : accès verrouillé par code PIN, historique des saisies.
import { useMemo, useState } from 'react'
import { Lock, FileSpreadsheet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Table from '../../shared/ui/Table'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAgroStore } from './store/agroStore'
import { exportExcel } from '../../utils/exportExcel'
import { toast } from '../../core/notifications'
import { formatDateShort } from '../../utils/formatters'

export const PIN_KEY = 'termitiere_agro_pin'
export const getPin = () => localStorage.getItem(PIN_KEY) || '0000'

export default function Journal() {
  const { data: inventaires } = useCollection('agro_inventaires')
  const especes = useAgroStore((s) => s.especes)

  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [agent, setAgent] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const agents = useMemo(() => [...new Set(inventaires.map((i) => i.agentNom).filter(Boolean))], [inventaires])

  const lignes = useMemo(() => {
    return [...inventaires]
      .filter((i) => (!agent || i.agentNom === agent) && (!from || i.date >= from) && (!to || i.date <= to))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((i) => {
        const totalFin = especes.reduce((s, e) => s + (i.animaux?.[e.id]?.fin || 0), 0)
        const naiss = Object.values(i.animaux || {}).reduce((s, a) => s + (a.naiss || 0), 0)
        const dec = Object.values(i.animaux || {}).reduce((s, a) => s + (a.dec || 0), 0)
        const sor = Object.values(i.animaux || {}).reduce((s, a) => s + (a.sor || 0), 0)
        return { id: i.id, date: i.date, agent: i.agentNom, totalFin, naiss, sor, dec }
      })
  }, [inventaires, especes, agent, from, to])

  function unlock() {
    if (pin === getPin()) { setUnlocked(true); toast.success('Journal déverrouillé') }
    else toast.error('Code PIN incorrect')
  }

  function exportXLSX() {
    exportExcel(
      lignes.map((l) => ({ Date: l.date, Agent: l.agent, 'Effectif final': l.totalFin, Naissances: l.naiss, Sorties: l.sor, Décès: l.dec })),
      'journal-saisies.xlsx',
      'Journal'
    )
  }

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-sm">
        <Card className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600"><Lock size={26} /></div>
          <h2 className="mb-1 text-lg font-bold">Journal protégé</h2>
          <p className="mb-4 text-sm text-gray-500">Saisissez le code PIN pour accéder à l'historique.</p>
          <Input type="password" inputMode="numeric" placeholder="••••" className="mb-3 text-center tracking-widest"
            value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} />
          <Button className="w-full" onClick={unlock}>Déverrouiller</Button>
          <p className="mt-3 text-xs text-gray-400">PIN par défaut : 0000 (modifiable dans Paramètres)</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="mb-1 block text-xs font-semibold text-gray-600">Agent</label>
          <Select className="w-auto" value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">Tous</option>{agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select></div>
        <div><label className="mb-1 block text-xs font-semibold text-gray-600">Du</label><Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs font-semibold text-gray-600">Au</label><Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button variant="outline" className="ml-auto" onClick={exportXLSX}><FileSpreadsheet size={16} /> Export Excel</Button>
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'agent', label: 'Agent' },
            { key: 'totalFin', label: 'Effectif final', align: 'center' },
            { key: 'naiss', label: 'Naiss.', align: 'center' },
            { key: 'sor', label: 'Sorties', align: 'center' },
            { key: 'dec', label: 'Décès', align: 'center' }
          ]}
          rows={lignes}
          empty="Aucune saisie sur la période."
        />
      </Card>
    </div>
  )
}

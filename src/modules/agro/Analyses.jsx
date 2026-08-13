// Analyses MAXI-AGRO — pilotage décisionnel (vue Power BI) + export Excel.
import { useMemo, useState } from 'react'
import { FileSpreadsheet, LayoutDashboard, Table2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAgroStore } from './store/agroStore'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { exportRapportExcel } from '../../utils/excelReport'
import { toast } from '../../core/notifications'
import { formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
import { sectionsRapport, SECTIONS_RAPPORT } from './rapport'
import DecisionBI from './DecisionBI'

export default function Analyses() {
  const { data: inventaires } = useCollection('agro_inventaires')
  const { data: factures } = useCollection('agro_factures')
  const { data: demandes } = useCollection('agro_demandes')
  const { data: sante } = useCollection('agro_sante')
  const { data: stockVaccins } = useCollection('agro_vaccins')
  const aliments = useAgroStore((s) => s.aliments)
  const especes = useAgroStore((s) => s.especes)

  const [vue, setVue] = useState('pilotage') // pilotage | tableaux
  const [gran, setGran] = useState('jour')
  const [exportOpen, setExportOpen] = useState(false)
  const [choix, setChoix] = useState(() => Object.fromEntries(SECTIONS_RAPPORT.map((s) => [s.id, true])))
  const { start, end, node: periodNode } = usePeriodSelect('mois')

  const invPeriode = useMemo(() => inventaires.filter((i) => i.date >= start && i.date <= end), [inventaires, start, end])

  const ligneAnimaux = useMemo(() => {
    const tri = [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))
    const dernier = tri[0]
    return especes.map((e) => {
      let naiss = 0, ent = 0, sor = 0, dec = 0
      invPeriode.forEach((i) => { const a = i.animaux?.[e.id]; if (a) { naiss += a.naiss || 0; ent += a.ent || 0; sor += a.sor || 0; dec += a.dec || 0 } })
      const efFinal = dernier?.animaux?.[e.id]?.fin || 0
      const efInit = dernier?.animaux?.[e.id]?.init || 0
      return { nom: e.nom, cat: e.cat, efInit, naiss, ent, sor, dec, efFinal }
    })
  }, [especes, invPeriode, inventaires])

  const ligneAliments = useMemo(() => {
    const tri = [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))
    const dernier = tri[0]
    return aliments.map((a) => {
      let ent = 0, sor = 0
      invPeriode.forEach((i) => { const d = i.aliments?.[a.id]; if (d) { ent += d.ent || 0; sor += d.sor || 0 } })
      const stock = dernier?.aliments?.[a.id]?.fin || 0
      return { nom: a.nom, cat: a.cat, unite: a.unite || 'kg', stock, ent, sor, variation: ent - sor }
    })
  }, [aliments, invPeriode, inventaires])

  const clients = useMemo(() => {
    const map = {}
    factures.filter((f) => f.date >= start && f.date <= end).forEach((f) => {
      const nom = f.client?.nom || 'Inconnu'
      if (!map[nom]) map[nom] = { nom, ca: 0, nb: 0, derniere: f.date }
      map[nom].ca += f.totalTTC || 0
      map[nom].nb += 1
      if (f.date > map[nom].derniere) map[nom].derniere = f.date
    })
    return Object.values(map).sort((a, b) => b.ca - a.ca)
  }, [factures, start, end])

  function exporterRapport() {
    const ids = SECTIONS_RAPPORT.filter((s) => choix[s.id]).map((s) => s.id)
    if (!ids.length) return toast.error('Choisissez au moins une section à exporter')
    const secs = sectionsRapport({ inventaires, especes, aliments, factures, sante, start, end, gran })
    exportRapportExcel({ filename: `rapport-maxi-agro-${start}_${end}.xlsx`, sections: ids.map((id) => secs[id]).filter(Boolean) })
    toast.success('Rapport Excel généré ✓')
    setExportOpen(false)
  }

  return (
    <div className="space-y-4">
      {/* Barre de pilotage */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 p-3 text-white shadow-lg">
        <div className="flex gap-1 rounded-lg bg-white/10 p-1">
          <button
            onClick={() => setVue('pilotage')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold ${vue === 'pilotage' ? 'bg-white text-slate-900' : 'text-white/80 hover:bg-white/10'}`}
          >
            <LayoutDashboard size={15} /> Pilotage décisionnel
          </button>
          <button
            onClick={() => setVue('tableaux')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold ${vue === 'tableaux' ? 'bg-white text-slate-900' : 'text-white/80 hover:bg-white/10'}`}
          >
            <Table2 size={15} /> Tableaux détaillés
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="[&_.input-base]:border-white/40 [&_.input-base]:bg-white/20 [&_.input-base]:text-white [&_.input-base]:font-semibold [&_label]:text-white [&_label]:font-bold">
            {periodNode}
          </div>
          <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={() => setExportOpen(true)}>
            <FileSpreadsheet size={16} /> Exporter Excel
          </Button>
        </div>
      </div>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Exporter un rapport Excel"
        footer={<><Button variant="ghost" onClick={() => setExportOpen(false)}>Annuler</Button><Button onClick={exporterRapport}><FileSpreadsheet size={16} /> Générer</Button></>}
      >
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">
          Période : <strong>{formatDateShort(start)} → {formatDateShort(end)}</strong>
        </p>
        <div className="mb-4 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {SECTIONS_RAPPORT.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">
              <input type="checkbox" checked={!!choix[s.id]} onChange={() => setChoix((c) => ({ ...c, [s.id]: !c[s.id] }))} />
              {s.label}
            </label>
          ))}
        </div>
        <Select className="w-auto" value={gran} onChange={(e) => setGran(e.target.value)}>
          <option value="jour">Granularité journalière</option>
          <option value="semaine">Hebdomadaire</option>
          <option value="mois">Mensuelle</option>
        </Select>
      </Modal>

      {vue === 'pilotage' && (
        <DecisionBI
          inventaires={inventaires}
          factures={factures}
          demandes={demandes}
          sante={sante}
          stockVaccins={stockVaccins}
          invPeriode={invPeriode}
          start={start}
          end={end}
        />
      )}

      {vue === 'tableaux' && (
        <div className="space-y-4">
          <Card title="Animaux par espèce — période" className="p-0">
            <Table
              columns={[
                { key: 'nom', label: 'Espèce' },
                { key: 'cat', label: 'Catégorie' },
                { key: 'efInit', label: 'EF Initial', align: 'center', render: (r) => formatNumber(r.efInit) },
                { key: 'naiss', label: 'Naiss.', align: 'center', render: (r) => <span className="font-semibold text-green-600">{formatNumber(r.naiss)}</span> },
                { key: 'ent', label: 'Entrées', align: 'center', render: (r) => <span className="text-sky-600">{formatNumber(r.ent)}</span> },
                { key: 'sor', label: 'Sorties', align: 'center', render: (r) => <span className="text-amber-600">{formatNumber(r.sor)}</span> },
                { key: 'dec', label: 'Décès', align: 'center', render: (r) => <span className="text-red-600">{formatNumber(r.dec)}</span> },
                { key: 'efFinal', label: 'EF Final', align: 'center', render: (r) => <strong>{formatNumber(r.efFinal)}</strong> }
              ]}
              rows={ligneAnimaux}
              rowKey="nom"
              empty="Aucun animal."
            />
          </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Stocks aliments & divers" className="p-0">
            <Table
              columns={[
                { key: 'nom', label: 'Article' },
                { key: 'cat', label: 'Catégorie' },
                { key: 'stock', label: 'Stock', align: 'center', render: (r) => <>{formatNumber(r.stock)} <span className="text-[10px] text-gray-400">{r.unite}</span></> },
                { key: 'ent', label: 'Entrées', align: 'center', render: (r) => formatNumber(r.ent) },
                { key: 'sor', label: 'Sorties', align: 'center', render: (r) => formatNumber(r.sor) },
                { key: 'variation', label: 'Δ', align: 'center', render: (r) => <span className={r.variation >= 0 ? 'text-green-600' : 'text-red-600'}>{r.variation >= 0 ? '+' : ''}{formatNumber(r.variation)}</span> }
              ]}
              rows={ligneAliments}
              rowKey="nom"
              empty="Aucun aliment."
            />
          </Card>
          <Card title="Clients — CA période" className="p-0">
            <Table
              columns={[
                { key: 'nom', label: 'Client' },
                { key: 'nb', label: 'Cmd', align: 'center' },
                { key: 'ca', label: 'CA', align: 'right', render: (r) => <strong>{formatMoney(r.ca)}</strong> },
                { key: 'derniere', label: 'Dernière', align: 'right', render: (r) => formatDateShort(r.derniere) }
              ]}
              rows={clients}
              rowKey="nom"
              empty="Aucune facture."
            />
          </Card>
        </div>
        </div>
      )}
    </div>
  )
}

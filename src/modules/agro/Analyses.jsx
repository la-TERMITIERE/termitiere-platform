// Analyses MAXI-AGRO — onglets Animaux | Aliments | Clients + export de rapports Excel.
import { useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { FileSpreadsheet } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import StatCard from '../../shared/ui/StatCard'
import Table from '../../shared/ui/Table'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAgroStore } from './store/agroStore'
import { usePeriodSelect } from '../../shared/ui/PeriodSelect'
import { exportRapportExcel } from '../../utils/excelReport'
import { toast } from '../../core/notifications'
import { formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
import { sectionsRapport, SECTIONS_RAPPORT } from './rapport'

export default function Analyses() {
  const { data: inventaires } = useCollection('agro_inventaires')
  const { data: factures } = useCollection('agro_factures')
  const { data: sante } = useCollection('agro_sante')
  const especes = useAgroStore((s) => s.especes)
  const aliments = useAgroStore((s) => s.aliments)

  const [tab, setTab] = useState('animaux')
  const [gran, setGran] = useState('jour')
  const [exportOpen, setExportOpen] = useState(false)
  // Sections cochées par défaut (toutes).
  const [choix, setChoix] = useState(() => Object.fromEntries(SECTIONS_RAPPORT.map((s) => [s.id, true])))
  const { start, end, node: periodNode } = usePeriodSelect('90')

  const invPeriode = useMemo(() => inventaires.filter((i) => i.date >= start && i.date <= end), [inventaires, start, end])

  const toggleSection = (id) => setChoix((c) => ({ ...c, [id]: !c[id] }))

  function exporterRapport() {
    const ids = SECTIONS_RAPPORT.filter((s) => choix[s.id]).map((s) => s.id)
    if (!ids.length) return toast.error('Choisissez au moins une section à exporter')
    const secs = sectionsRapport({ inventaires, especes, aliments, factures, sante, start, end, gran })
    const sections = ids.map((id) => secs[id]).filter(Boolean)
    exportRapportExcel({ filename: `rapport-maxi-agro-${start}_${end}.xlsx`, sections })
    toast.success('Rapport Excel généré ✓')
    setExportOpen(false)
  }

  // ── Animaux ──
  const totauxAnim = useMemo(() => {
    let naiss = 0, ent = 0, sor = 0, dec = 0
    invPeriode.forEach((i) => Object.values(i.animaux || {}).forEach((a) => {
      naiss += a.naiss || 0; ent += a.ent || 0; sor += a.sor || 0; dec += a.dec || 0
    }))
    return { naiss, ent, sor, dec }
  }, [invPeriode])

  const chartMouvements = {
    labels: ['Naissances', 'Entrées', 'Sorties', 'Décès'],
    datasets: [{ label: 'Mouvements', data: [totauxAnim.naiss, totauxAnim.ent, totauxAnim.sor, totauxAnim.dec], backgroundColor: ['#16a34a', '#0284c7', '#d97706', '#dc2626'] }]
  }

  // ── Aliments : stock / entrées / sorties / variation ──
  const ligneAliments = useMemo(() => {
    const tri = [...inventaires].sort((a, b) => (a.date < b.date ? 1 : -1))
    const dernier = tri[0]
    return aliments.map((a) => {
      let ent = 0, sor = 0
      invPeriode.forEach((i) => { const d = i.aliments?.[a.id]; if (d) { ent += d.ent || 0; sor += d.sor || 0 } })
      const stock = dernier?.aliments?.[a.id]?.fin || 0
      return { nom: a.nom, cat: a.cat, stock, ent, sor, variation: ent - sor }
    })
  }, [aliments, invPeriode, inventaires])

  // ── Clients : CA par client sur la période ──
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
  const caTotal = clients.reduce((s, c) => s + c.ca, 0)
  const panierMoyen = clients.reduce((s, c) => s + c.nb, 0) ? caTotal / clients.reduce((s, c) => s + c.nb, 0) : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-white p-1">
          {[['animaux', 'Animaux'], ['aliments', 'Aliments & Divers'], ['clients', 'Clients']].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} className={`rounded px-3 py-1.5 text-sm font-semibold ${tab === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{l}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {periodNode}
          <Button onClick={() => setExportOpen(true)}><FileSpreadsheet size={16} /> Exporter un rapport</Button>
        </div>
      </div>

      {/* Modal : configuration du rapport Excel (sections + période + granularité) */}
      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Exporter un rapport Excel"
        footer={<><Button variant="ghost" onClick={() => setExportOpen(false)}>Annuler</Button><Button onClick={exporterRapport}><FileSpreadsheet size={16} /> Générer le fichier</Button></>}
      >
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">
          📅 Période : <strong>{formatDateShort(start)} → {formatDateShort(end)}</strong>
          <span className="text-sky-500"> (modifiable via le sélecteur de période)</span>
        </p>

        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Que voulez-vous exporter ?</p>
        <div className="mb-4 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {SECTIONS_RAPPORT.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
              <input type="checkbox" checked={!!choix[s.id]} onChange={() => toggleSection(s.id)} />
              {s.label}
            </label>
          ))}
        </div>
        <div className="mb-1 flex gap-2">
          <button onClick={() => setChoix(Object.fromEntries(SECTIONS_RAPPORT.map((s) => [s.id, true])))} className="text-xs font-semibold text-primary hover:underline">Tout cocher</button>
          <span className="text-gray-300">·</span>
          <button onClick={() => setChoix({})} className="text-xs font-semibold text-gray-500 hover:underline">Tout décocher</button>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Granularité de la feuille « Évolution »</label>
          <Select className="w-auto" value={gran} onChange={(e) => setGran(e.target.value)}>
            <option value="jour">Journalier (jour par jour)</option>
            <option value="semaine">Hebdomadaire (semaine par semaine)</option>
            <option value="mois">Mensuel (mois par mois)</option>
          </Select>
        </div>
      </Modal>

      {tab === 'animaux' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard title="Naissances" value={formatNumber(totauxAnim.naiss)} accent="#16a34a" />
            <StatCard title="Entrées" value={formatNumber(totauxAnim.ent)} accent="#0284c7" />
            <StatCard title="Sorties" value={formatNumber(totauxAnim.sor)} accent="#d97706" />
            <StatCard title="Décès" value={formatNumber(totauxAnim.dec)} accent="#dc2626" />
          </div>
          <Card title="Mouvements du cheptel">
            <div className="h-72"><Bar data={chartMouvements} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
          </Card>
        </>
      )}

      {tab === 'aliments' && (
        <Card className="p-0" title={undefined}>
          <Table
            columns={[
              { key: 'nom', label: 'Article' },
              { key: 'cat', label: 'Catégorie' },
              { key: 'stock', label: 'Stock', align: 'center', render: (r) => formatNumber(r.stock) },
              { key: 'ent', label: 'Entrées', align: 'center', render: (r) => formatNumber(r.ent) },
              { key: 'sor', label: 'Sorties', align: 'center', render: (r) => formatNumber(r.sor) },
              { key: 'variation', label: 'Variation', align: 'center', render: (r) => <span className={r.variation >= 0 ? 'text-green-600' : 'text-red-600'}>{r.variation >= 0 ? '+' : ''}{formatNumber(r.variation)}</span> },
              { key: 'etat', label: 'État', align: 'center', render: (r) => r.stock <= 0 ? <span className="text-red-600">Rupture</span> : r.stock < 10 ? <span className="text-amber-600">Bas</span> : <span className="text-green-600">OK</span> }
            ]}
            rows={ligneAliments}
            rowKey="nom"
            empty="Aucun aliment."
          />
        </Card>
      )}

      {tab === 'clients' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard title="CA période" value={formatMoney(caTotal)} accent="#16a34a" />
            <StatCard title="Clients actifs" value={clients.length} accent="#0284c7" />
            <StatCard title="Panier moyen" value={formatMoney(panierMoyen)} accent="#7c3aed" />
          </div>
          <Card className="p-0">
            <Table
              columns={[
                { key: 'nom', label: 'Client' },
                { key: 'nb', label: 'Commandes', align: 'center' },
                { key: 'ca', label: 'CA', align: 'right', render: (r) => <strong>{formatMoney(r.ca)}</strong> },
                { key: 'derniere', label: 'Dernière', align: 'right', render: (r) => formatDateShort(r.derniere) }
              ]}
              rows={clients}
              rowKey="nom"
              empty="Aucune facture sur la période."
            />
          </Card>
        </>
      )}
    </div>
  )
}

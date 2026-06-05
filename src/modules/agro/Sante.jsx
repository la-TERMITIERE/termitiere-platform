// Santé animale MAXI-AGRO — onglets :
//   • Interventions : vaccinations / traitements (+ numéros des animaux traités,
//     produit issu du stock, rendez-vous de suivi).
//   • Stock vaccins & produits : entrées/sorties de stock + alertes (bas / périmé).
//   • Rendez-vous : suivis à venir + rappels envoyés à celui qui a enregistré.
//   • Bilan : synthèse (interventions par type, animaux traités, alertes).
import { useEffect, useMemo, useState } from 'react'
import { Plus, FileDown, FileSpreadsheet, Trash2, Syringe, Boxes, CalendarClock, BarChart3, AlertTriangle, CheckCircle2, Bell } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import StatCard from '../../shared/ui/StatCard'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useAgroStore } from './store/agroStore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { notify } from '../../core/notify'
import { toast } from '../../core/notifications'
import { usePDF } from '../../hooks/usePDF'
import { exportRapportExcel } from '../../utils/excelReport'
import { todayStr, addDays, formatDateShort } from '../../utils/formatters'

const TYPES = [
  { value: 'vaccination', label: '💉 Vaccination', tone: 'info' },
  { value: 'traitement', label: '💊 Traitement', tone: 'warning' },
  { value: 'deparasitage', label: '🪱 Déparasitage', tone: 'success' },
  { value: 'autre', label: '🔧 Autre', tone: 'neutral' }
]
const toneOf = (t) => TYPES.find((x) => x.value === t)?.tone || 'neutral'
const labelOf = (t) => TYPES.find((x) => x.value === t)?.label || t

const PRODUIT_TYPES = ['Vaccin', 'Médicament', 'Antiparasitaire', 'Vitamine', 'Autre']

export default function Sante() {
  const { user } = useAuth()
  const { data: fiches } = useCollection('agro_sante')
  const { data: stock } = useCollection('agro_vaccins')
  const especes = useAgroStore((s) => s.especes)
  const { generateRapportPDF } = usePDF()

  const [tab, setTab] = useState('interventions')

  // Rappels automatiques : RDV arrivant à échéance (≤ demain) → notifie son auteur.
  useRappelsRDV(fiches)

  return (
    <div className="space-y-4">
      {/* Onglets */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-white p-1">
        {[
          ['interventions', 'Interventions', Syringe],
          ['stock', 'Stock vaccins', Boxes],
          ['rdv', 'Rendez-vous', CalendarClock],
          ['bilan', 'Bilan', BarChart3]
        ].map(([v, l, Icon]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold ${
              tab === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Icon size={15} /> {l}
          </button>
        ))}
      </div>

      {tab === 'interventions' && <Interventions fiches={fiches} stock={stock} especes={especes} user={user} generateRapportPDF={generateRapportPDF} />}
      {tab === 'stock' && <StockVaccins stock={stock} user={user} />}
      {tab === 'rdv' && <RendezVous fiches={fiches} user={user} />}
      {tab === 'bilan' && <Bilan fiches={fiches} stock={stock} />}
    </div>
  )
}

// ─────────── Onglet INTERVENTIONS ───────────
function Interventions({ fiches, stock, especes, user, generateRapportPDF }) {
  const [filtreType, setFiltreType] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)

  const liste = useMemo(
    () => [...fiches].filter((f) => !filtreType || f.type === filtreType).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [fiches, filtreType]
  )

  function openCreate() {
    setForm({
      date: todayStr(), especeId: especes[0]?.id || '', type: 'vaccination',
      produit: '', produitStockId: '', quantiteUtilisee: 0,
      dosage: '', veterinaire: '', nombreAnimaux: 1, animauxIds: '',
      prochainRdv: '', rdvNote: '', description: ''
    })
    setOpen(true)
  }

  async function save() {
    if (!form.produit.trim() && !form.produitStockId) return toast.error('Indiquez le produit (saisi ou issu du stock)')
    const esp = especes.find((e) => e.id === form.especeId)
    const stockItem = stock.find((s) => s.id === form.produitStockId)
    const produitNom = stockItem?.nom || form.produit.trim()
    const qteUtil = parseInt(form.quantiteUtilisee) || 0

    const fiche = {
      ...form,
      produit: produitNom,
      especeNom: esp?.nom || '',
      nombreAnimaux: parseInt(form.nombreAnimaux) || 0,
      quantiteUtilisee: qteUtil,
      animauxIds: form.animauxIds.trim(),
      agentId: user.uid,
      creeParLogin: user.login,
      creeParNom: user.nom,
      rappelNotifie: false,
      rdvFait: false
    }
    const id = await addItem('agro_sante', fiche)

    // Décrémente le stock si un produit du stock a été utilisé.
    if (stockItem && qteUtil > 0) {
      await updateItem('agro_vaccins', stockItem.id, { quantite: Math.max(0, (stockItem.quantite || 0) - qteUtil) })
    }

    await audit('agro', 'VACCIN', `${labelOf(form.type)} — ${esp?.nom} (${produitNom}) sur ${fiche.nombreAnimaux} animal(aux)`, {
      Type: labelOf(form.type), Espèce: esp?.nom, Produit: produitNom, Dosage: form.dosage,
      'Nb animaux': fiche.nombreAnimaux, 'Numéros animaux': fiche.animauxIds || '—',
      Vétérinaire: form.veterinaire || '—', 'Stock décrémenté': stockItem ? `${qteUtil} ${stockItem.unite || ''}` : '—',
      'Prochain RDV': form.prochainRdv || '—'
    })

    if (form.prochainRdv) {
      await audit('agro', 'RDV', `Suivi programmé le ${form.prochainRdv} — ${esp?.nom} (${produitNom})`, {
        'Date RDV': form.prochainRdv, Espèce: esp?.nom, Note: form.rdvNote || '—', 'Programmé par': user.nom
      })
    }

    toast.success('Intervention enregistrée ✓')
    setOpen(false)
  }

  async function supprimer(f) {
    if (!confirm('Supprimer cette intervention ?')) return
    await removeItem('agro_sante', f.id)
    await audit('agro', 'VACCIN', `Intervention supprimée — ${f.especeNom} (${f.produit})`)
    toast.success('Supprimée')
  }

  function exportPDF() {
    generateRapportPDF({
      titre: 'Rapport sanitaire',
      colonnes: ['Date', 'Espèce', 'Type', 'Produit', 'Nb', 'N° animaux', 'Vétérinaire', 'Prochain RDV'],
      lignes: liste.map((f) => [
        formatDateShort(f.date), f.especeNom, labelOf(f.type), f.produit,
        String(f.nombreAnimaux), f.animauxIds || '—', f.veterinaire || '—',
        f.prochainRdv ? formatDateShort(f.prochainRdv) : '—'
      ]),
      fichier: 'rapport-sanitaire.pdf'
    })
  }

  function exportXLSX() {
    exportRapportExcel({
      filename: 'rapport-sanitaire.xlsx',
      sections: [{
        name: 'Santé animale',
        title: 'Rapport sanitaire',
        subtitle: `${liste.length} intervention(s)${filtreType ? ` · ${labelOf(filtreType)}` : ''}`,
        columns: [
          { key: 'Date', label: 'Date', width: 12 },
          { key: 'Espèce', label: 'Espèce', width: 18 },
          { key: 'Type', label: 'Type', width: 14 },
          { key: 'Produit', label: 'Produit', width: 20 },
          { key: 'Dosage', label: 'Dosage', width: 14 },
          { key: 'Nb animaux', label: 'Nb animaux', width: 11, type: 'number' },
          { key: 'N° animaux', label: 'N° animaux', width: 20 },
          { key: 'Vétérinaire', label: 'Vétérinaire', width: 18 },
          { key: 'Prochain RDV', label: 'Prochain RDV', width: 14 },
          { key: 'Notes', label: 'Notes', width: 28 }
        ],
        rows: liste.map((f) => ({
          Date: formatDateShort(f.date),
          Espèce: f.especeNom,
          Type: labelOf(f.type).replace(/^[^\sA-Za-zÀ-ÿ]+\s*/, ''),
          Produit: f.produit,
          Dosage: f.dosage || '',
          'Nb animaux': f.nombreAnimaux || 0,
          'N° animaux': f.animauxIds || '',
          Vétérinaire: f.veterinaire || '',
          'Prochain RDV': f.prochainRdv ? formatDateShort(f.prochainRdv) : '',
          Notes: f.description || ''
        })),
        totals: { __label: 'TOTAL', 'Nb animaux': liste.reduce((s, f) => s + (f.nombreAnimaux || 0), 0) }
      }]
    })
    toast.success('Rapport santé Excel généré ✓')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="max-w-xs" value={filtreType} onChange={(e) => setFiltreType(e.target.value)}>
          <option value="">Tous les types</option>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} /> Rapport Excel</Button>
          <Button variant="outline" onClick={exportPDF}><FileDown size={16} /> Rapport PDF</Button>
          <Button onClick={openCreate}><Plus size={16} /> Nouvelle intervention</Button>
        </div>
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'especeNom', label: 'Espèce' },
            { key: 'type', label: 'Type', render: (r) => <Badge tone={toneOf(r.type)}>{labelOf(r.type)}</Badge> },
            { key: 'produit', label: 'Produit' },
            { key: 'nombreAnimaux', label: 'Nb', align: 'center' },
            { key: 'animauxIds', label: 'N° animaux', render: (r) => r.animauxIds ? <span className="font-mono text-xs">{r.animauxIds}</span> : <span className="text-gray-300">—</span> },
            { key: 'veterinaire', label: 'Vétérinaire', render: (r) => r.veterinaire || '—' },
            { key: 'prochainRdv', label: 'Prochain RDV', render: (r) => r.prochainRdv ? <span className="text-sky-700">📅 {formatDateShort(r.prochainRdv)}</span> : <span className="text-gray-300">—</span> },
            { key: 'actions', label: '', align: 'right', render: (r) => <button onClick={() => supprimer(r)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button> }
          ]}
          rows={liste}
          empty="Aucune intervention enregistrée."
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle intervention sanitaire" size="lg"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {form && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Date" required><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></FormGroup>
              <FormGroup label="Espèce" required>
                <Select value={form.especeId} onChange={(e) => setForm((f) => ({ ...f, especeId: e.target.value }))}>
                  {especes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Type" required>
                <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  options={TYPES.map((t) => ({ value: t.value, label: t.label }))} />
              </FormGroup>
              <FormGroup label="Nombre d'animaux"><Input type="number" min="1" value={form.nombreAnimaux} onChange={(e) => setForm((f) => ({ ...f, nombreAnimaux: e.target.value }))} /></FormGroup>
            </div>

            <FormGroup label="Numéros des animaux traités / vaccinés" hint="ex : B-001, B-014, B-027 (béliers, boucles…)">
              <Input value={form.animauxIds} onChange={(e) => setForm((f) => ({ ...f, animauxIds: e.target.value }))} placeholder="B-001, B-014…" />
            </FormGroup>

            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Produit du stock" hint="Décrémente le stock automatiquement">
                <Select value={form.produitStockId} onChange={(e) => setForm((f) => ({ ...f, produitStockId: e.target.value }))}>
                  <option value="">— Saisie libre ci-contre —</option>
                  {stock.map((s) => <option key={s.id} value={s.id}>{s.nom} ({s.quantite ?? 0} {s.unite || ''})</option>)}
                </Select>
              </FormGroup>
              {form.produitStockId
                ? <FormGroup label="Quantité utilisée"><Input type="number" min="0" value={form.quantiteUtilisee} onChange={(e) => setForm((f) => ({ ...f, quantiteUtilisee: e.target.value }))} /></FormGroup>
                : <FormGroup label="Produit (saisie libre)" required><Input value={form.produit} onChange={(e) => setForm((f) => ({ ...f, produit: e.target.value }))} placeholder="ex : Vaccin PPR" /></FormGroup>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Dosage"><Input value={form.dosage} onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))} placeholder="ex : 1 ml / tête" /></FormGroup>
              <FormGroup label="Vétérinaire"><Input value={form.veterinaire} onChange={(e) => setForm((f) => ({ ...f, veterinaire: e.target.value }))} /></FormGroup>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg bg-sky-50 p-3">
              <FormGroup label="📅 Prochain rendez-vous (suivi)" hint="Un rappel vous sera envoyé">
                <Input type="date" value={form.prochainRdv} min={form.date} onChange={(e) => setForm((f) => ({ ...f, prochainRdv: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Note du rendez-vous"><Input value={form.rdvNote} onChange={(e) => setForm((f) => ({ ...f, rdvNote: e.target.value }))} placeholder="ex : rappel vaccin, 2e dose" /></FormGroup>
            </div>

            <FormGroup label="Description / notes">
              <textarea className="input-base" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}

// ─────────── Onglet STOCK VACCINS ───────────
function StockVaccins({ stock, user }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)

  const liste = useMemo(() => [...stock].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')), [stock])

  const etatStock = (s) => {
    const q = s.quantite || 0
    const seuil = s.seuilAlerte || 0
    const perime = s.peremption && s.peremption < todayStr()
    if (perime) return { label: 'Périmé', tone: 'danger' }
    if (q <= 0) return { label: 'Rupture', tone: 'danger' }
    if (seuil && q <= seuil) return { label: 'Stock bas', tone: 'warning' }
    return { label: 'OK', tone: 'success' }
  }

  function openCreate(item = null) {
    setForm(item
      ? { ...item }
      : { nom: '', type: 'Vaccin', quantite: 0, unite: 'doses', seuilAlerte: 5, peremption: '', note: '' })
    setOpen(true)
  }

  async function save() {
    if (!form.nom.trim()) return toast.error('Nom du produit requis')
    const data = {
      nom: form.nom.trim(), type: form.type,
      quantite: parseInt(form.quantite) || 0, unite: form.unite.trim() || 'unités',
      seuilAlerte: parseInt(form.seuilAlerte) || 0, peremption: form.peremption || '', note: form.note || ''
    }
    if (form.id) {
      await updateItem('agro_vaccins', form.id, data)
      await audit('agro', 'STOCK_VACCIN', `Stock modifié — ${data.nom} : ${data.quantite} ${data.unite}`, data)
    } else {
      await addItem('agro_vaccins', { ...data, creeParNom: user.nom })
      await audit('agro', 'STOCK_VACCIN', `Produit ajouté au stock — ${data.nom} : ${data.quantite} ${data.unite}`, data)
    }
    toast.success('Stock enregistré ✓')
    setOpen(false)
  }

  async function supprimer(s) {
    if (!confirm(`Supprimer « ${s.nom} » du stock ?`)) return
    await removeItem('agro_vaccins', s.id)
    await audit('agro', 'STOCK_VACCIN', `Produit retiré du stock — ${s.nom}`)
    toast.success('Supprimé')
  }

  const alertes = liste.filter((s) => ['danger', 'warning'].includes(etatStock(s).tone))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {alertes.length > 0 && (
          <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">
            <AlertTriangle size={15} /> {alertes.length} produit(s) à réapprovisionner ou périmé(s)
          </span>
        )}
        <Button className="ml-auto" onClick={() => openCreate()}><Plus size={16} /> Ajouter un produit</Button>
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Produit', render: (r) => <button onClick={() => openCreate(r)} className="font-semibold text-primary hover:underline">{r.nom}</button> },
            { key: 'type', label: 'Type' },
            { key: 'quantite', label: 'Quantité', align: 'center', render: (r) => <strong>{r.quantite ?? 0}</strong> },
            { key: 'unite', label: 'Unité' },
            { key: 'seuilAlerte', label: 'Seuil alerte', align: 'center', render: (r) => r.seuilAlerte || '—' },
            { key: 'peremption', label: 'Péremption', render: (r) => r.peremption ? formatDateShort(r.peremption) : '—' },
            { key: 'etat', label: 'État', align: 'center', render: (r) => { const e = etatStock(r); return <Badge tone={e.tone}>{e.label}</Badge> } },
            { key: 'actions', label: '', align: 'right', render: (r) => <button onClick={() => supprimer(r)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button> }
          ]}
          rows={liste}
          empty="Aucun produit en stock. Ajoutez vos vaccins et médicaments."
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={form?.id ? 'Modifier le produit' : 'Nouveau produit'}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {form && (
          <>
            <FormGroup label="Nom du produit" required>
              <Input value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} placeholder="ex : Vaccin PPR" autoFocus />
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Type">
                <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {PRODUIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Unité"><Input value={form.unite} onChange={(e) => setForm((f) => ({ ...f, unite: e.target.value }))} placeholder="doses, ml, flacons…" /></FormGroup>
              <FormGroup label="Quantité en stock"><Input type="number" min="0" value={form.quantite} onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))} /></FormGroup>
              <FormGroup label="Seuil d'alerte" hint="Alerte si stock ≤ seuil"><Input type="number" min="0" value={form.seuilAlerte} onChange={(e) => setForm((f) => ({ ...f, seuilAlerte: e.target.value }))} /></FormGroup>
              <FormGroup label="Date de péremption" className="col-span-2"><Input type="date" value={form.peremption} onChange={(e) => setForm((f) => ({ ...f, peremption: e.target.value }))} /></FormGroup>
            </div>
            <FormGroup label="Note"><Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}

// ─────────── Onglet RENDEZ-VOUS ───────────
function RendezVous({ fiches, user }) {
  const rdvs = useMemo(
    () => fiches.filter((f) => f.prochainRdv).sort((a, b) => (a.prochainRdv < b.prochainRdv ? -1 : 1)),
    [fiches]
  )
  const aVenir = rdvs.filter((r) => !r.rdvFait && r.prochainRdv >= todayStr())
  const enRetard = rdvs.filter((r) => !r.rdvFait && r.prochainRdv < todayStr())
  const faits = rdvs.filter((r) => r.rdvFait)

  async function marquerFait(r) {
    await updateItem('agro_sante', r.id, { rdvFait: true })
    await audit('agro', 'RDV_FAIT', `Rendez-vous clôturé — ${r.especeNom} (${r.produit}) du ${r.prochainRdv}`)
    toast.success('Rendez-vous clôturé ✓')
  }

  const Item = ({ r, retard }) => (
    <Card key={r.id} className="flex items-start justify-between gap-3">
      <div>
        <p className="font-bold text-gray-800">📅 {formatDateShort(r.prochainRdv)} — {r.especeNom}</p>
        <p className="text-xs text-gray-500">{labelOf(r.type)} · {r.produit}{r.animauxIds ? ` · N° ${r.animauxIds}` : ''}</p>
        {r.rdvNote && <p className="mt-1 text-xs italic text-gray-600">« {r.rdvNote} »</p>}
        <p className="mt-1 text-xs text-gray-400">Programmé par {r.creeParNom || '—'}</p>
        {retard && <Badge tone="danger" className="mt-1">En retard</Badge>}
      </div>
      <Button size="sm" variant="outline" onClick={() => marquerFait(r)}><CheckCircle2 size={15} /> Fait</Button>
    </Card>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">
        <Bell size={16} /> Un rappel automatique est envoyé à l'auteur d'un rendez-vous dès qu'il arrive à échéance (la veille / le jour même).
      </div>

      {enRetard.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-red-500">⏰ En retard ({enRetard.length})</p>
          {enRetard.map((r) => <Item key={r.id} r={r} retard />)}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">À venir ({aVenir.length})</p>
        {aVenir.length === 0 ? <Card><p className="py-6 text-center text-sm text-gray-400">Aucun rendez-vous à venir.</p></Card>
          : aVenir.map((r) => <Item key={r.id} r={r} />)}
      </div>

      {faits.length > 0 && (
        <details className="rounded-lg bg-white p-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-gray-400">Clôturés ({faits.length})</summary>
          <div className="mt-2 space-y-1">
            {faits.map((r) => (
              <p key={r.id} className="text-sm text-gray-500">✔️ {formatDateShort(r.prochainRdv)} — {r.especeNom} ({r.produit})</p>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ─────────── Onglet BILAN ───────────
function Bilan({ fiches, stock }) {
  const stats = useMemo(() => {
    const parType = {}
    let totalAnimaux = 0
    fiches.forEach((f) => {
      parType[f.type] = (parType[f.type] || 0) + 1
      totalAnimaux += f.nombreAnimaux || 0
    })
    const rdvAVenir = fiches.filter((f) => f.prochainRdv && !f.rdvFait && f.prochainRdv >= todayStr()).length
    const rdvRetard = fiches.filter((f) => f.prochainRdv && !f.rdvFait && f.prochainRdv < todayStr()).length
    const stockBas = stock.filter((s) => {
      const perime = s.peremption && s.peremption < todayStr()
      return perime || (s.quantite || 0) <= 0 || (s.seuilAlerte && (s.quantite || 0) <= s.seuilAlerte)
    }).length
    return { parType, totalAnimaux, rdvAVenir, rdvRetard, stockBas, totalFiches: fiches.length }
  }, [fiches, stock])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Interventions" value={stats.totalFiches} accent="#0284c7" />
        <StatCard title="Animaux traités (cumul)" value={stats.totalAnimaux} accent="#16a34a" />
        <StatCard title="RDV à venir" value={stats.rdvAVenir} accent="#7c3aed" />
        <StatCard title="RDV en retard" value={stats.rdvRetard} accent="#dc2626" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Interventions par type">
          {stats.totalFiches === 0 ? <p className="py-4 text-center text-sm text-gray-400">Aucune intervention.</p> : (
            <div className="space-y-2">
              {TYPES.map((t) => {
                const n = stats.parType[t.value] || 0
                const pct = stats.totalFiches ? Math.round((n / stats.totalFiches) * 100) : 0
                return (
                  <div key={t.value}>
                    <div className="flex justify-between text-sm"><span>{t.label}</span><span className="font-semibold">{n}</span></div>
                    <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card title="État du stock de produits">
          <div className="space-y-2 text-sm">
            <p className="flex justify-between"><span>Produits référencés</span><strong>{stock.length}</strong></p>
            <p className="flex justify-between"><span className="text-amber-700">À réapprovisionner / périmés</span><strong className="text-amber-700">{stats.stockBas}</strong></p>
            {stats.stockBas > 0 && <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">Consultez l'onglet « Stock vaccins » pour le détail.</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─────────── Rappels RDV (effet) ───────────
// Parcourt les fiches : si un RDV arrive à échéance (≤ demain), pas encore notifié
// ni clôturé → crée une notification ciblée sur l'auteur et marque la fiche notifiée.
function useRappelsRDV(fiches) {
  useEffect(() => {
    const seuil = addDays(todayStr(), 1) // aujourd'hui + demain
    fiches
      .filter((f) => f.prochainRdv && !f.rappelNotifie && !f.rdvFait && f.prochainRdv <= seuil)
      .forEach(async (f) => {
        // Marque d'abord pour éviter les doublons en cas de re-render concurrent.
        await updateItem('agro_sante', f.id, { rappelNotifie: true })
        await notify({
          type: 'rappel',
          title: '📅 Rappel : rendez-vous santé',
          body: `${f.especeNom} — ${f.produit} prévu le ${formatDateShort(f.prochainRdv)}${f.rdvNote ? ` (${f.rdvNote})` : ''}`,
          module: 'agro',
          forUsers: f.creeParLogin ? [f.creeParLogin] : [],
          link: '/agro/sante'
        })
      })
  }, [fiches])
}

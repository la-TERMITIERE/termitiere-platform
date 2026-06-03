// Santé animale MAXI-AGRO : historique des interventions + ajout + export PDF.
import { useMemo, useState } from 'react'
import { Plus, FileDown, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useAgroStore } from './store/agroStore'
import { addItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { usePDF } from '../../hooks/usePDF'
import { todayStr, formatDateShort } from '../../utils/formatters'

const TYPES = [
  { value: 'vaccination', label: '💉 Vaccination', tone: 'info' },
  { value: 'traitement', label: '💊 Traitement', tone: 'warning' },
  { value: 'deparasitage', label: '🪱 Déparasitage', tone: 'success' },
  { value: 'autre', label: '🔧 Autre', tone: 'neutral' }
]
const toneOf = (t) => TYPES.find((x) => x.value === t)?.tone || 'neutral'
const labelOf = (t) => TYPES.find((x) => x.value === t)?.label || t

export default function Sante() {
  const { user } = useAuth()
  const { data: fiches } = useCollection('agro_sante')
  const especes = useAgroStore((s) => s.especes)
  const { generateRapportPDF } = usePDF()

  const [filtreType, setFiltreType] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)

  const liste = useMemo(
    () => [...fiches].filter((f) => !filtreType || f.type === filtreType).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [fiches, filtreType]
  )

  function openCreate() {
    setForm({ date: todayStr(), especeId: especes[0]?.id || '', type: 'vaccination', produit: '', dosage: '', veterinaire: '', nombreAnimaux: 1, description: '' })
    setOpen(true)
  }

  async function save() {
    if (!form.produit.trim()) return toast.error('Indiquez le produit')
    const esp = especes.find((e) => e.id === form.especeId)
    await addItem('agro_sante', {
      ...form,
      especeNom: esp?.nom || '',
      nombreAnimaux: parseInt(form.nombreAnimaux) || 0,
      agentId: user.uid
    })
    await audit('agro', 'SANTE', `${labelOf(form.type)} — ${esp?.nom}`)
    toast.success('Intervention enregistrée ✓')
    setOpen(false)
  }

  async function supprimer(f) {
    if (!confirm('Supprimer cette intervention ?')) return
    await removeItem('agro_sante', f.id)
    toast.success('Supprimée')
  }

  function exportPDF() {
    generateRapportPDF({
      titre: 'Rapport sanitaire',
      colonnes: ['Date', 'Espèce', 'Type', 'Produit', 'Dosage', 'Nb', 'Vétérinaire'],
      lignes: liste.map((f) => [formatDateShort(f.date), f.especeNom, labelOf(f.type), f.produit, f.dosage, String(f.nombreAnimaux), f.veterinaire]),
      fichier: 'rapport-sanitaire.pdf'
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="max-w-xs" value={filtreType} onChange={(e) => setFiltreType(e.target.value)}>
          <option value="">Tous les types</option>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <div className="ml-auto flex gap-2">
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
            { key: 'dosage', label: 'Dosage' },
            { key: 'nombreAnimaux', label: 'Nb', align: 'center' },
            { key: 'veterinaire', label: 'Vétérinaire' },
            { key: 'actions', label: '', align: 'right', render: (r) => <button onClick={() => supprimer(r)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button> }
          ]}
          rows={liste}
          empty="Aucune intervention enregistrée."
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle intervention sanitaire"
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
              <FormGroup label="Produit" required><Input value={form.produit} onChange={(e) => setForm((f) => ({ ...f, produit: e.target.value }))} /></FormGroup>
              <FormGroup label="Dosage"><Input value={form.dosage} onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))} placeholder="ex : 1 ml / tête" /></FormGroup>
              <FormGroup label="Vétérinaire" className="col-span-2"><Input value={form.veterinaire} onChange={(e) => setForm((f) => ({ ...f, veterinaire: e.target.value }))} /></FormGroup>
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

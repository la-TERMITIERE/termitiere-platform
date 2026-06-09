// Production briques — cycle 24h ou 48h, consommation matières auto, ajout stock appatam.
import { useMemo, useState } from 'react'
import { Factory, Plus } from 'lucide-react'
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
import { useBriqueterieStore } from './store/referentielStore'
import { addItem, setItem, ts } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genNumero, formatNumber } from '../../utils/formatters'
import { DUREE_PRODUCTION_OPTIONS } from './data'
import { calcConsommationProduction, getInventaire } from './logic'

export default function Production() {
  const { user } = useAuth()
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const briques = useBriqueterieStore((s) => s.briques.filter((b) => b.id !== 'caillasses'))
  const recettes = useBriqueterieStore((s) => s.recettes)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)

  const liste = useMemo(() => [...productions].sort((a, b) => (a.date < b.date ? 1 : -1)), [productions])

  function openCreate() {
    const qty = {}
    briques.forEach((b) => { qty[b.id] = 0 })
    setForm({ date: todayStr(), duree: 24, machine: 'Machine 1', quantites: qty, caillasses: 0, notes: '' })
    setOpen(true)
  }

  const consoPreview = useMemo(() => {
    if (!form) return null
    return calcConsommationProduction(form.quantites, recettes)
  }, [form, recettes])

  const totalBriques = useMemo(() => {
    if (!form) return 0
    return Object.values(form.quantites).reduce((s, q) => s + (parseInt(q) || 0), 0)
  }, [form])

  async function enregistrer() {
    if (!form || totalBriques <= 0) return toast.error('Indiquez au moins une quantité produite')
    const num = genNumero('PROD', productions.length)
    const lignes = briques.map((b) => ({
      briqueId: b.id, briqueNom: b.nom, qte: parseInt(form.quantites[b.id]) || 0
    })).filter((l) => l.qte > 0)

    const conso = calcConsommationProduction(form.quantites, recettes)

    await addItem('evenementiel_productions', {
      num, date: form.date, duree: form.duree, machine: form.machine,
      lignes, totalBriques, caillasses: parseInt(form.caillasses) || 0,
      consommation: conso, notes: form.notes,
      agentId: user.uid, agentNom: user.nom
    })

    // Mise à jour inventaire du jour : stock appatam + consommation matières
    const inv = getInventaire(inventaires, form.date) || { date: form.date, matieres: {}, briques: {} }
    const briquesStock = { ...(inv.briques || {}) }
    lignes.forEach((l) => {
      const cur = briquesStock[l.briqueId] || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
      briquesStock[l.briqueId] = { ...cur, appatam: (cur.appatam || 0) + l.qte }
    })
    if (form.caillasses > 0) {
      const cur = briquesStock.caillasses || { appatam: 0, sechage: 0, pret: 0, caillasses: 0 }
      briquesStock.caillasses = { ...cur, caillasses: (cur.caillasses || 0) + parseInt(form.caillasses) }
    }

    const matieresData = { ...(inv.matieres || {}) }
    Object.entries(conso).forEach(([matId, qte]) => {
      if (!qte) return
      const cur = matieresData[matId] || { init: 0, entrees: [], consommations: [], fin: 0 }
      const consos = [...(cur.consommations || []), {
        qte: Math.round(qte * 10) / 10,
        label: `Production ${num}`,
        agentId: user.uid,
        agentNom: user.nom
      }]
      const totConso = consos.reduce((s, l) => s + (parseFloat(l.qte) || 0), 0)
      const totEnt = (cur.entrees || []).reduce((s, l) => s + (parseFloat(l.qte) || 0), 0)
      matieresData[matId] = { ...cur, consommations: consos, conso: totConso, fin: Math.max(0, (cur.init || 0) + totEnt - totConso) }
    })

    await setItem('evenementiel_inventaires', form.date, {
      ...inv, date: form.date, savedAt: ts(),
      matieres: matieresData, briques: briquesStock,
      agentId: user.uid, agentNom: user.nom
    })

    await audit('evenementiel', 'PRODUCTION', `${num} — ${formatNumber(totalBriques)} briques`)
    toast.success(`Production ${num} enregistrée ✓ — briques en appatam, matières consommées`)
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-800">
        Cycle de production <strong>24 h ou 48 h max</strong>. Les briques produites sont placées en <strong>appatam</strong>,
        puis déplacées vers l'extérieur pour séchage (5 à 6 jours).
      </div>
      <div className="flex justify-end">
        <Button onClick={openCreate}><Plus size={16} /> Nouvelle production</Button>
      </div>
      <Card className="p-0">
        <Table
          columns={[
            { key: 'num', label: 'N°' },
            { key: 'date', label: 'Date' },
            { key: 'duree', label: 'Durée', render: (r) => `${r.duree}h` },
            { key: 'machine', label: 'Machine' },
            { key: 'totalBriques', label: 'Total briques', align: 'right', render: (r) => formatNumber(r.totalBriques) },
            { key: 'caillasses', label: 'Caillasses', align: 'right' },
            { key: 'agentNom', label: 'Agent' }
          ]}
          rows={liste}
          empty="Aucune production enregistrée."
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} size="lg" title="Enregistrer une production"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={enregistrer}><Factory size={16} /> Enregistrer</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <FormGroup label="Date"><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></FormGroup>
              <FormGroup label="Durée cycle">
                <Select value={form.duree} onChange={(e) => setForm((f) => ({ ...f, duree: parseInt(e.target.value) }))}>
                  {DUREE_PRODUCTION_OPTIONS.map((d) => <option key={d} value={d}>{d} heures</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Machine"><Input value={form.machine} onChange={(e) => setForm((f) => ({ ...f, machine: e.target.value }))} /></FormGroup>
            </div>
            <p className="text-xs font-bold uppercase text-gray-500">Quantités produites par catégorie</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {briques.map((b) => (
                <FormGroup key={b.id} label={b.nom}>
                  <Input type="number" min="0" value={form.quantites[b.id] || 0}
                    onChange={(e) => setForm((f) => ({ ...f, quantites: { ...f.quantites, [b.id]: e.target.value } }))} />
                </FormGroup>
              ))}
            </div>
            <FormGroup label="Caillasses (cassées)">
              <Input type="number" min="0" value={form.caillasses} onChange={(e) => setForm((f) => ({ ...f, caillasses: e.target.value }))} />
            </FormGroup>
            {consoPreview && (
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="mb-2 font-bold text-gray-700">Consommation matières estimée :</p>
                <div className="flex flex-wrap gap-4">
                  <span>Ciment : <strong>{consoPreview.ciment.toFixed(1)}</strong> sacs</span>
                  <span>Concassé : <strong>{consoPreview.concasse.toFixed(1)}</strong> m³</span>
                  <span>Sable : <strong>{consoPreview.sable.toFixed(1)}</strong> m³</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">Total : {formatNumber(totalBriques)} briques</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

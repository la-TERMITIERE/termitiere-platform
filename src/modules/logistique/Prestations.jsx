// Prestations / Location de matériel — quantité × tarif unitaire = montant par catégorie.
import { useMemo, useState } from 'react'
import { Plus, Eye } from 'lucide-react'
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
import { useLogistiqueStore } from './store/referentielStore'
import { addItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'
import { catColor } from './data'

const STATUTS = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  facturee: { label: 'Facturée', tone: 'info' },
  en_cours: { label: 'En location', tone: 'warning' },
  terminee: { label: 'Terminée', tone: 'success' },
  annulee: { label: 'Annulée', tone: 'danger' }
}

export default function Prestations() {
  const { user } = useAuth()
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: clients } = useCollection('logistique_clients')
  const materiel = useLogistiqueStore((s) => s.materiel)
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(null)

  const liste = useMemo(() => [...prestations].sort((a, b) => (a.date < b.date ? 1 : -1)), [prestations])

  function openCreate() {
    setForm({
      clientId: clients[0]?.id || '',
      clientNom: clients[0]?.nom || '',
      dateDebut: todayStr(),
      dateFin: todayStr(),
      lieu: '',
      lignes: [{ materielId: materiel[0]?.id || '', qte: 1, tarif: materiel[0]?.tarifLocation || 0 }],
      statut: 'brouillon'
    })
    setOpen(true)
  }

  function addLigne() {
    const m = materiel[0]
    setForm((f) => ({ ...f, lignes: [...f.lignes, { materielId: m?.id || '', qte: 1, tarif: m?.tarifLocation || 0 }] }))
  }

  function setLigne(i, patch) {
    setForm((f) => {
      const lignes = f.lignes.map((l, k) => {
        if (k !== i) return l
        const next = { ...l, ...patch }
        if (patch.materielId) {
          const mat = materiel.find((x) => x.id === patch.materielId)
          next.tarif = mat?.tarifLocation || 0
        }
        return next
      })
      return { ...f, lignes }
    })
  }

  const totalForm = useMemo(() => {
    if (!form) return 0
    return form.lignes.reduce((s, l) => s + (parseInt(l.qte) || 0) * (parseFloat(l.tarif) || 0), 0)
  }, [form])

  const parCategorie = useMemo(() => {
    if (!form) return []
    const map = {}
    form.lignes.forEach((l) => {
      const m = materiel.find((x) => x.id === l.materielId)
      if (!m) return
      const montant = (parseInt(l.qte) || 0) * (parseFloat(l.tarif) || 0)
      map[m.cat] = (map[m.cat] || 0) + montant
    })
    return Object.entries(map).map(([cat, montant]) => ({ cat, montant, color: catColor(cat) }))
  }, [form, materiel])

  async function save() {
    if (!form.clientNom?.trim() && !form.clientId) return toast.error('Client requis')
    if (!form.lignes.length) return toast.error('Ajoutez au moins une ligne')
    const client = clients.find((c) => c.id === form.clientId)
    const num = genNumero('PREST', prestations.length)
    const lignes = form.lignes.map((l) => {
      const m = materiel.find((x) => x.id === l.materielId)
      const qte = parseInt(l.qte) || 0
      const tarif = parseFloat(l.tarif) || 0
      return { materielId: m?.id, materielNom: m?.nom, cat: m?.cat, unite: m?.unite, qte, tarifUnitaire: tarif, montant: qte * tarif }
    })
    const total = lignes.reduce((s, l) => s + l.montant, 0)
    await addItem('logistique_prestations', {
      num, date: todayStr(),
      clientId: form.clientId, clientNom: client?.nom || form.clientNom,
      dateDebut: form.dateDebut, dateFin: form.dateFin, lieu: form.lieu,
      lignes, total, statut: 'brouillon',
      agentId: user.uid, agentNom: user.nom
    })
    await audit('logistique', 'PRESTATION', `${num} — ${formatMoney(total)}`)
    toast.success('Prestation créée ✓ — émettez la facture puis demandez l\'autorisation de sortie')
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={openCreate}><Plus size={16} /> Nouvelle prestation</Button></div>
      <Card className="p-0">
        <Table
          columns={[
            { key: 'num', label: 'N°' },
            { key: 'clientNom', label: 'Client' },
            { key: 'periode', label: 'Période', render: (r) => `${formatDateShort(r.dateDebut)} → ${formatDateShort(r.dateFin)}` },
            { key: 'total', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.total)}</strong> },
            { key: 'statut', label: 'Statut', render: (r) => <Badge tone={STATUTS[r.statut]?.tone}>{STATUTS[r.statut]?.label || r.statut}</Badge> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <button onClick={() => setDetail(r)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Eye size={16} /></button>
            ) }
          ]}
          rows={liste}
          empty="Aucune prestation."
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} size="lg" title="Nouvelle prestation / location"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}>
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Client">
                <Select value={form.clientId} onChange={(e) => {
                  const c = clients.find((x) => x.id === e.target.value)
                  setForm((f) => ({ ...f, clientId: e.target.value, clientNom: c?.nom || '' }))
                }}>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  {!clients.length && <option value="">— Créez un client d'abord —</option>}
                </Select>
              </FormGroup>
              <FormGroup label="Lieu"><Input value={form.lieu} onChange={(e) => setForm((f) => ({ ...f, lieu: e.target.value }))} /></FormGroup>
              <FormGroup label="Date début"><Input type="date" value={form.dateDebut} onChange={(e) => setForm((f) => ({ ...f, dateDebut: e.target.value }))} /></FormGroup>
              <FormGroup label="Date fin"><Input type="date" value={form.dateFin} onChange={(e) => setForm((f) => ({ ...f, dateFin: e.target.value }))} /></FormGroup>
            </div>

            <p className="text-xs font-bold uppercase text-gray-500">Matériel loué</p>
            {form.lignes.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 rounded-lg border p-2">
                <Select className="col-span-5" value={l.materielId} onChange={(e) => setLigne(i, { materielId: e.target.value })}>
                  {materiel.map((m) => <option key={m.id} value={m.id}>{m.nom} ({m.cat})</option>)}
                </Select>
                <Input className="col-span-2" type="number" min="1" value={l.qte} onChange={(e) => setLigne(i, { qte: e.target.value })} placeholder="Qté" />
                <Input className="col-span-2" type="number" min="0" value={l.tarif} onChange={(e) => setLigne(i, { tarif: e.target.value })} placeholder="Tarif/u" />
                <div className="col-span-3 flex items-center justify-end font-bold text-secondary">
                  {formatMoney((parseInt(l.qte) || 0) * (parseFloat(l.tarif) || 0))}
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addLigne}><Plus size={14} /> Ligne</Button>

            {parCategorie.length > 0 && (
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="mb-2 text-xs font-bold uppercase text-gray-500">Par catégorie</p>
                {parCategorie.map((p) => (
                  <div key={p.cat} className="flex justify-between text-sm">
                    <span style={{ color: p.color }} className="font-semibold">{p.cat}</span>
                    <span>{formatMoney(p.montant)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-right text-lg font-extrabold">Total : {formatMoney(totalForm)}</p>
          </div>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Prestation ${detail?.num || ''}`}>
        {detail && (
          <div className="space-y-2 text-sm">
            <p><strong>Client :</strong> {detail.clientNom}</p>
            <p><strong>Période :</strong> {formatDateShort(detail.dateDebut)} → {formatDateShort(detail.dateFin)}</p>
            <table className="mt-3 w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase"><tr><th className="p-2 text-left">Matériel</th><th className="p-2">Qté</th><th className="p-2">Tarif</th><th className="p-2 text-right">Montant</th></tr></thead>
              <tbody>
                {(detail.lignes || []).map((l, i) => (
                  <tr key={i} className="border-t"><td className="p-2">{l.materielNom}</td><td className="p-2 text-center">{l.qte}</td><td className="p-2 text-center">{formatMoney(l.tarifUnitaire)}</td><td className="p-2 text-right font-bold">{formatMoney(l.montant)}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-right font-extrabold">Total : {formatMoney(detail.total)}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}

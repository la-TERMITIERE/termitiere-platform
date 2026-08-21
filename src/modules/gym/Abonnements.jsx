// MAXI-GYM — Abonnements : liste complète + ajout d'un abonnement.
import { useMemo, useState } from 'react'
import { CreditCard, Plus, Trash2 } from 'lucide-react'
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
import { addItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { isFullAccessRole } from '../../core/roles'
import { todayStr, formatMoney, formatDateShort } from '../../utils/formatters'

const COULEUR = '#A6342A'
const TYPES_ABONNEMENT = ['Mensuel', 'Trimestriel', 'Semestriel', 'Annuel']
const vide = () => ({ date: todayStr(), clientNom: '', type: TYPES_ABONNEMENT[0], montant: '', notes: '' })

export default function Abonnements() {
  const { user, role } = useAuth()
  const { data: abonnements } = useCollection('gym_abonnements')
  const peutSupprimer = isFullAccessRole(role)

  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)

  const liste = useMemo(() => [...abonnements].sort((a, b) => (a.date < b.date ? 1 : -1)), [abonnements])
  const total = useMemo(() => liste.reduce((s, x) => s + (Number(x.montant) || 0), 0), [liste])

  async function enregistrer() {
    const d = modal
    if (!d.clientNom.trim()) return toast.error('Nom du client requis')
    if (!d.montant || Number(d.montant) <= 0) return toast.error('Montant requis')
    setSaving(true)
    try {
      await addItem('gym_abonnements', {
        date: d.date, clientNom: d.clientNom.trim(), type: d.type, montant: Number(d.montant), notes: d.notes.trim(),
        enregistrePar: user?.nom || user?.login || '—', enregistreParUid: user?.uid || null, createdAt: Date.now()
      })
      await audit('gym', 'ABONNEMENT_CREATE', `${d.clientNom.trim()} — ${d.type} — ${Number(d.montant).toLocaleString('fr-FR')} FCFA`)
      toast.success('Abonnement enregistré ✓')
      setModal(null)
    } finally { setSaving(false) }
  }

  async function supprimer(a) {
    if (!confirm(`Supprimer l'abonnement de ${a.clientNom} (${a.type}) ?`)) return
    await removeItem('gym_abonnements', a.id)
    await audit('gym', 'ABONNEMENT_DELETE', `${a.clientNom} — ${a.type} — ${Number(a.montant).toLocaleString('fr-FR')} FCFA`)
    toast.success('Abonnement supprimé')
  }

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45)]"
        style={{ background: `linear-gradient(135deg, ${COULEUR}e6 0%, #E8850Fe6 100%)` }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: COULEUR, boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <CreditCard size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Abonnements</h2>
          <p className="text-sm text-white/80">{liste.length} abonnement(s) — {formatMoney(total)} au total</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setModal(vide())}><Plus size={16} /> Nouvel abonnement</Button>
      </div>

      <Card className="p-0">
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'clientNom', label: 'Client' },
            { key: 'type', label: 'Type', render: (r) => <Badge tone="info">{r.type}</Badge> },
            { key: 'montant', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.montant)}</strong> },
            { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
            { key: 'enregistrePar', label: 'Enregistré par' },
            { key: 'actions', label: '', align: 'right', render: (r) => peutSupprimer ? (
              <button onClick={() => supprimer(r)} title="Supprimer" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
            ) : null }
          ]}
          rows={liste}
          empty="Aucun abonnement enregistré."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title="Nouvel abonnement"
        footer={<><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Annuler</Button><Button onClick={enregistrer} loading={saving}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <FormGroup label="Client" required>
              <Input value={modal.clientNom} onChange={(e) => setModal((f) => ({ ...f, clientNom: e.target.value }))} placeholder="Nom du client" />
            </FormGroup>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup label="Type d'abonnement">
                <Select value={modal.type} onChange={(e) => setModal((f) => ({ ...f, type: e.target.value }))}>
                  {TYPES_ABONNEMENT.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </FormGroup>
              <FormGroup label="Date de souscription"><Input type="date" value={modal.date} onChange={(e) => setModal((f) => ({ ...f, date: e.target.value }))} /></FormGroup>
            </div>
            <FormGroup label="Montant (FCFA)" required><Input type="number" min="0" value={modal.montant} onChange={(e) => setModal((f) => ({ ...f, montant: e.target.value }))} placeholder="ex : 15000" /></FormGroup>
            <FormGroup label="Notes" hint="Optionnel">
              <Input value={modal.notes} onChange={(e) => setModal((f) => ({ ...f, notes: e.target.value }))} />
            </FormGroup>
          </div>
        )}
      </Modal>
    </div>
  )
}

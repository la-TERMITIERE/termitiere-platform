// Facturation logistique — émission obligatoire avant demande d'autorisation de sortie.
import { useMemo, useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'

export default function Factures() {
  const { user, role } = useAuth()
  const peutFacturer = role === 'agent'
  const { data: factures } = useCollection('logistique_factures')
  const { data: prestations } = useCollection('logistique_prestations')
  const [open, setOpen] = useState(false)
  const [prestId, setPrestId] = useState('')

  // L'autorisation vient AVANT la facturation : on ne facture QUE les prestations
  // approuvées (par un gérant / la direction) et pas encore facturées.
  const brouillons = prestations.filter((p) => p.approuvee && p.statut !== 'facturee' && p.statut !== 'annulee')
  const liste = useMemo(() => [...factures].sort((a, b) => (a.date < b.date ? 1 : -1)), [factures])

  async function emettre() {
    const p = prestations.find((x) => x.id === prestId)
    if (!p) return toast.error('Sélectionnez une prestation')
    const num = genNumero('FAC-LOG', factures.length)
    await addItem('logistique_factures', {
      num, date: todayStr(),
      prestationId: p.id, prestationNum: p.num,
      clientNom: p.clientNom, lignes: p.lignes, totalHT: p.total, totalTTC: p.total,
      statut: 'emise', agentNom: user.nom
    })
    await updateItem('logistique_prestations', p.id, { statut: 'facturee', factureNum: num })
    await audit('logistique', 'FACTURE', `${num} — ${formatMoney(p.total)}`)
    toast.success(`Facture ${num} émise ✓`)
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      {!peutFacturer && (
        <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
          👁️ Mode consultation — seuls les agents peuvent émettre des factures
        </div>
      )}
      <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <strong>Workflow :</strong> Prestation → <strong>Approbation (gérant / direction)</strong> → Facture → Sortie magasin
      </div>
      {peutFacturer && !brouillons.length && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Aucune prestation approuvée à facturer. Une prestation doit d'abord être <strong>approuvée</strong> par un gérant / la direction (onglet Prestations).
        </div>
      )}
      {peutFacturer && (
        <div className="flex justify-end">
          <Button onClick={() => { setPrestId(brouillons[0]?.id || ''); setOpen(true) }} disabled={!brouillons.length}>
            <Plus size={16} /> Émettre une facture
          </Button>
        </div>
      )}
      <Card className="p-0">
        <Table
          columns={[
            { key: 'num', label: 'N° facture' },
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'clientNom', label: 'Client' },
            { key: 'prestationNum', label: 'Prestation' },
            { key: 'totalTTC', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.totalTTC)}</strong> },
            { key: 'statut', label: 'Statut', render: () => <Badge tone="success">Émise</Badge> }
          ]}
          rows={liste}
          empty="Aucune facture."
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Émettre une facture"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={emettre}><FileText size={16} /> Émettre</Button></>}>
        <FormGroup label="Prestation à facturer" required>
          <Select value={prestId} onChange={(e) => setPrestId(e.target.value)}>
            {brouillons.map((p) => <option key={p.id} value={p.id}>{p.num} — {p.clientNom} ({formatMoney(p.total)})</option>)}
          </Select>
        </FormGroup>
        {prestId && (() => {
          const p = prestations.find((x) => x.id === prestId)
          return p ? <p className="mt-2 text-sm text-gray-600">Montant TTC : <strong>{formatMoney(p.total)}</strong></p> : null
        })()}
      </Modal>
    </div>
  )
}

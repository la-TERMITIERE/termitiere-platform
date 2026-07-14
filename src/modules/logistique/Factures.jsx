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
import { useSite, matchSite, siteLabel } from './site/useSite'

// Une facture logistique naît en BROUILLON. Elle n'est APPROUVÉE (et ne compte
// dans le chiffre d'affaires) qu'une fois l'autorisation de sortie liée certifiée.
const F_STATUTS = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  approuvee: { label: 'Approuvée', tone: 'success' }
}

export default function Factures() {
  const { user, role } = useAuth()
  const site = useSite()
  const peutFacturer = role === 'agent'
  const { data: allFactures } = useCollection('logistique_factures')
  const { data: allPrestations } = useCollection('logistique_prestations')
  const [open, setOpen] = useState(false)
  const [prestId, setPrestId] = useState('')

  const factures = useMemo(() => allFactures.filter((f) => matchSite(f, site)), [allFactures, site])
  const prestations = useMemo(() => allPrestations.filter((p) => matchSite(p, site)), [allPrestations, site])

  // L'agent garde la main : il facture une prestation dès qu'elle est en brouillon
  // (pas besoin d'approbation préalable). L'approbation viendra via l'autorisation de sortie.
  const aFacturer = prestations.filter((p) => p.statut === 'brouillon')
  const liste = useMemo(() => [...factures].sort((a, b) => (a.date < b.date ? 1 : -1)), [factures])

  async function emettre() {
    const p = prestations.find((x) => x.id === prestId)
    if (!p) return toast.error('Sélectionnez une prestation')
    const num = genNumero(`FAC-LOG-${site.toUpperCase()}`, factures.length)
    const factureId = await addItem('logistique_factures', {
      num, date: todayStr(), site,
      prestationId: p.id, prestationNum: p.num,
      clientNom: p.clientNom, evenement: p.evenement || '',
      dateDebut: p.dateDebut || '', dateFin: p.dateFin || '',
      lignes: p.lignes, frais: p.frais || [], totalHT: p.total, totalTTC: p.total,
      statut: 'brouillon', agentNom: user.nom
    })
    await updateItem('logistique_prestations', p.id, { statut: 'facturee', factureId, factureNum: num })
    await audit('logistique', 'FACTURE', `${siteLabel(site)} — ${num} — ${formatMoney(p.total)} (brouillon)`)
    toast.success(`Facture ${num} émise en brouillon ✓ — émettez l'autorisation de sortie liée`)
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
        <strong>Workflow :</strong> Prestation (brouillon) → <strong>Facture (brouillon)</strong> → Autorisation de sortie → <strong>facture approuvée &amp; CA + stock décrémenté</strong>
      </div>
      {peutFacturer && !aFacturer.length && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Aucune prestation à facturer. Créez d'abord une prestation (onglet Prestations) — elle est facturable dès qu'elle est en brouillon.
        </div>
      )}
      {peutFacturer && (
        <div className="flex justify-end">
          <Button onClick={() => { setPrestId(aFacturer[0]?.id || ''); setOpen(true) }} disabled={!aFacturer.length}>
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
            { key: 'statut', label: 'Statut', render: (r) => { const s = F_STATUTS[r.statut] || F_STATUTS.brouillon; return <Badge tone={s.tone}>{s.label}</Badge> } }
          ]}
          rows={liste}
          empty="Aucune facture."
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Émettre une facture (brouillon)"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={emettre}><FileText size={16} /> Émettre</Button></>}>
        <FormGroup label="Prestation à facturer" required>
          <Select value={prestId} onChange={(e) => setPrestId(e.target.value)}>
            {aFacturer.map((p) => <option key={p.id} value={p.id}>{p.num} — {p.clientNom} ({formatMoney(p.total)})</option>)}
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

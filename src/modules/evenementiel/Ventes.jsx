// Ventes briques — création de commandes, liées aux autorisations de sortie.
import { useMemo, useState } from 'react'
import { Plus, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
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
import { addItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'
import { isReadOnlyRole } from '../../core/roles'
import { dernierStockBriques } from './logic'

const STATUTS = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  en_attente: { label: 'Autorisation requise', tone: 'warning' },
  autorisee: { label: 'Autorisée', tone: 'success' },
  chargee: { label: 'Chargée / Partie', tone: 'info' },
  annulee: { label: 'Annulée', tone: 'danger' }
}

export default function Ventes() {
  const { user, role } = useAuth()
  const lectureSeule = isReadOnlyRole(role)
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: clients } = useCollection('evenementiel_clients')
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const briques = useBriqueterieStore((s) => s.briques)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)

  const liste = useMemo(() => [...ventes].sort((a, b) => (a.date < b.date ? 1 : -1)), [ventes])

  function openCreate() {
    setForm({
      clientId: clients[0]?.id || '',
      clientNom: clients[0]?.nom || '',
      dateChargement: todayStr(),
      lignes: [{ briqueId: briques.find((b) => b.id !== 'caillasses')?.id || '', qte: 100, prixUnitaire: 350 }],
      notes: ''
    })
    setOpen(true)
  }

  const totalForm = useMemo(() => {
    if (!form) return 0
    return form.lignes.reduce((s, l) => s + (parseInt(l.qte) || 0) * (parseFloat(l.prixUnitaire) || 0), 0)
  }, [form])

  async function save() {
    if (!form.clientNom?.trim() && !form.clientId) return toast.error('Client requis')
    for (const l of form.lignes) {
      const stock = dernierStockBriques(inventaires, l.briqueId, l.briqueId === 'caillasses' ? 'caillasses' : 'pret')
      if ((parseInt(l.qte) || 0) > stock) {
        const b = briques.find((x) => x.id === l.briqueId)
        return toast.error(`Stock insuffisant pour ${b?.nom} (${stock} disponible)`)
      }
    }
    const client = clients.find((c) => c.id === form.clientId)
    const num = genNumero('VTE', ventes.length)
    const lignes = form.lignes.map((l) => {
      const b = briques.find((x) => x.id === l.briqueId)
      const qte = parseInt(l.qte) || 0
      const pu = parseFloat(l.prixUnitaire) || b?.tarifVente || 0
      return { briqueId: b?.id, briqueNom: b?.nom, qte, prixUnitaire: pu, montant: qte * pu }
    })
    await addItem('evenementiel_ventes', {
      num, date: todayStr(), clientId: form.clientId, clientNom: client?.nom || form.clientNom,
      dateChargement: form.dateChargement, lignes, total: lignes.reduce((s, l) => s + l.montant, 0),
      statut: 'brouillon', notes: form.notes, agentNom: user.nom
    })
    await audit('evenementiel', 'VENTE', num)
    toast.success('Vente créée ✓ — demandez les 3 autorisations avant le chargement')
    setOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
        <strong>Important :</strong> avant que les briques ne quittent le site, il faut l'accord des{' '}
        <strong>3 autorités</strong> (Direction, Contrôle, Commercial).{' '}
        <Link to="/evenementiel/demandes" className="font-semibold underline">Demander une autorisation →</Link>
      </div>
      <div className="flex justify-end gap-2">
        <Link to="/evenementiel/demandes"><Button variant="outline"><Send size={16} /> Autorisations</Button></Link>
        {!lectureSeule && <Button onClick={openCreate}><Plus size={16} /> Nouvelle vente</Button>}
      </div>
      <Card className="p-0">
        <Table
          columns={[
            { key: 'num', label: 'N°' },
            { key: 'clientNom', label: 'Client' },
            { key: 'dateChargement', label: 'Chargement', render: (r) => formatDateShort(r.dateChargement) },
            { key: 'total', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.total)}</strong> },
            { key: 'statut', label: 'Statut', render: (r) => <Badge tone={STATUTS[r.statut]?.tone}>{STATUTS[r.statut]?.label || r.statut}</Badge> }
          ]}
          rows={liste}
          empty="Aucune vente."
        />
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} size="lg" title="Nouvelle vente"
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
                  {!clients.length && <option value="">— Créez un client —</option>}
                </Select>
              </FormGroup>
              <FormGroup label="Date chargement"><Input type="date" value={form.dateChargement} onChange={(e) => setForm((f) => ({ ...f, dateChargement: e.target.value }))} /></FormGroup>
            </div>
            {form.lignes.map((l, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-2 md:grid-cols-12">
                <Select className="col-span-2 md:col-span-5" value={l.briqueId} onChange={(e) => {
                  const b = briques.find((x) => x.id === e.target.value)
                  setForm((f) => {
                    const lignes = [...f.lignes]
                    lignes[i] = { ...lignes[i], briqueId: e.target.value, prixUnitaire: b?.tarifVente || 0 }
                    return { ...f, lignes }
                  })
                }}>
                  {briques.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
                </Select>
                <Input className="md:col-span-2" type="number" min="1" value={l.qte} onChange={(e) => {
                  setForm((f) => { const lignes = [...f.lignes]; lignes[i] = { ...lignes[i], qte: e.target.value }; return { ...f, lignes } })
                }} />
                <Input className="md:col-span-2" type="number" min="0" value={l.prixUnitaire} onChange={(e) => {
                  setForm((f) => { const lignes = [...f.lignes]; lignes[i] = { ...lignes[i], prixUnitaire: e.target.value }; return { ...f, lignes } })
                }} />
                <div className="col-span-2 flex items-center justify-end font-bold md:col-span-3">{formatMoney((parseInt(l.qte) || 0) * (parseFloat(l.prixUnitaire) || 0))}</div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, lignes: [...f.lignes, { briqueId: briques[0]?.id, qte: 100, prixUnitaire: briques[0]?.tarifVente || 0 }] }))}>
              <Plus size={14} /> Ligne
            </Button>
            <p className="text-right text-lg font-extrabold">Total : {formatMoney(totalForm)}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}

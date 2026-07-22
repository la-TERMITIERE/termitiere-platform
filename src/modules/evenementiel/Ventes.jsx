// Ventes briques — création de commandes, liées aux autorisations de sortie.
import { useMemo, useState } from 'react'
import { Plus, Send, Trash2, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FicheDetail from '../../shared/ui/FicheDetail'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useBriqueterieStore } from './store/referentielStore'
import { addItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { todayStr, genNumero, formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
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
  const [detail, setDetail] = useState(null)   // vente consultée

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

  // Une vente n'est supprimable qu'en BROUILLON : dès qu'une autorisation de
  // sortie est engagée dessus, elle se retire depuis l'onglet Autorisations.
  async function supprimer(v) {
    if (!confirm(`Supprimer la vente ${v.num} (${v.clientNom}) ?`)) return
    await removeItem('evenementiel_ventes', v.id)
    await audit('evenementiel', 'VENTE_DELETE', v.num)
    toast.success('Vente supprimée')
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
            { key: 'statut', label: 'Statut', render: (r) => <Badge tone={STATUTS[r.statut]?.tone}>{STATUTS[r.statut]?.label || r.statut}</Badge> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => setDetail(r)} title="Voir le détail" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Eye size={16} /></button>
                {!lectureSeule && r.statut === 'brouillon' && (
                  <button onClick={() => supprimer(r)} title="Supprimer le brouillon" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
                )}
              </div>
            ) }
          ]}
          rows={liste}
          empty="Aucune vente."
        />
      </Card>

      {/* Consultation d'une vente — lecture seule */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg"
        title={detail ? `Vente ${detail.num}` : ''}
        footer={<Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>}>
        {detail && (
          <FicheDetail
            entetes={[
              { label: 'Client', value: detail.clientNom || '—' },
              { label: 'Statut', value: STATUTS[detail.statut]?.label || detail.statut },
              { label: 'Date de la vente', value: formatDateShort(detail.date) },
              { label: 'Chargement prévu', value: formatDateShort(detail.dateChargement) },
              { label: 'Enregistrée par', value: detail.agentNom },
              { label: 'Notes', value: detail.notes }
            ]}
            colonnes={[
              { label: 'Brique', render: (l) => l.briqueNom || '—' },
              { label: 'Quantité', align: 'center', render: (l) => formatNumber(l.qte) },
              { label: 'Prix unitaire', align: 'right', render: (l) => formatMoney(l.prixUnitaire || 0) },
              { label: 'Montant', align: 'right', render: (l) => formatMoney(l.montant || 0) }
            ]}
            lignes={detail.lignes || []}
            vide="Aucune brique sur cette vente."
            pied={[
              { label: 'Total briques', value: formatNumber((detail.lignes || []).reduce((s, l) => s + (parseInt(l.qte) || 0), 0)) },
              { label: 'Montant total', value: detail.total || 0, fort: true }
            ]}
          />
        )}
      </Modal>

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

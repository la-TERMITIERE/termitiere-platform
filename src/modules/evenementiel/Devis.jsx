// Devis & Facturation événementiel — création, PDF, conversion en facture.
import { useMemo, useState } from 'react'
import { Plus, FileDown, Trash2, FileCheck } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { usePDF } from '../../hooks/usePDF'
import { todayStr, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'
import { STATUTS_DEVIS } from './store/evenementielStore'

const empty = () => ({
  date: todayStr(), client: { nom: '', tel: '', email: '', adresse: '' },
  lignes: [{ article: '', qte: 1, prixUnit: 0, total: 0 }], remise: 0, tva: 0, statut: 'brouillon', conditions: 'Acompte de 50% à la signature.'
})

export default function Devis() {
  const { data: devis } = useCollection('evenementiel_devis')
  const { generateDevisPDF, generateFacturePDF } = usePDF()
  const [modal, setModal] = useState(null)

  const liste = useMemo(() => [...devis].sort((a, b) => (a.date < b.date ? 1 : -1)), [devis])

  const calc = (d) => {
    const totalHT = d.lignes.reduce((s, l) => s + (l.total || 0), 0)
    const apresRemise = totalHT * (1 - (d.remise || 0) / 100)
    return { totalHT, totalTTC: Math.round(apresRemise + apresRemise * ((d.tva || 0) / 100)) }
  }
  const setLigne = (i, patch) => setModal((m) => {
    const lignes = [...m.data.lignes]; lignes[i] = { ...lignes[i], ...patch }
    lignes[i].total = (parseInt(lignes[i].qte) || 0) * (parseFloat(lignes[i].prixUnit) || 0)
    return { ...m, data: { ...m.data, lignes } }
  })

  async function save() {
    const d = modal.data
    if (!d.client.nom.trim()) return toast.error('Client requis')
    const { totalHT, totalTTC } = calc(d)
    const payload = { ...d, totalHT, totalTTC }
    if (modal.id) await updateItem('evenementiel_devis', modal.id, payload)
    else { payload.numero = genNumero('DEV', devis.length); await addItem('evenementiel_devis', payload) }
    toast.success('Devis enregistré ✓'); setModal(null)
  }
  async function changerStatut(d, statut) { await updateItem('evenementiel_devis', d.id, { statut }); toast.success(`Statut → ${STATUTS_DEVIS[statut].label}`) }
  async function convertir(d) {
    await updateItem('evenementiel_devis', d.id, { statut: 'accepte', converti: true })
    generateFacturePDF({ ...d, numero: d.numero.replace('DEV', 'FAC') })
    toast.success('Devis converti en facture ✓')
  }
  async function supprimer(d) { if (confirm(`Supprimer ${d.numero} ?`)) { await removeItem('evenementiel_devis', d.id); toast.success('Supprimé') } }

  const totaux = modal ? calc(modal.data) : null

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button style={{ background: '#7c3aed' }} onClick={() => setModal({ data: empty(), id: null })}><Plus size={16} /> Nouveau devis</Button></div>
      <Card className="p-0">
        <Table
          columns={[
            { key: 'numero', label: 'N°' },
            { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
            { key: 'client', label: 'Client', render: (r) => r.client?.nom },
            { key: 'totalTTC', label: 'TTC', align: 'right', render: (r) => <strong>{formatMoney(r.totalTTC)}</strong> },
            { key: 'statut', label: 'Statut', render: (r) => (
              <Select className="!w-auto !py-1 text-xs" value={r.statut} onChange={(e) => changerStatut(r, e.target.value)} options={Object.entries(STATUTS_DEVIS).map(([v, o]) => ({ value: v, label: o.label }))} />
            ) },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button title="PDF devis" onClick={() => generateDevisPDF(r)} className="rounded p-1.5 text-violet-600 hover:bg-violet-50"><FileDown size={16} /></button>
                <button title="Convertir en facture" onClick={() => convertir(r)} className="rounded p-1.5 text-green-600 hover:bg-green-50"><FileCheck size={16} /></button>
                <button onClick={() => setModal({ data: { ...empty(), ...r }, id: r.id })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">✏️</button>
                <button onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            ) }
          ]}
          rows={liste}
          empty="Aucun devis."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} size="xl" title={modal?.id ? 'Modifier le devis' : 'Nouveau devis'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button style={{ background: '#7c3aed' }} onClick={save}>Enregistrer</Button></>}>
        {modal && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <FormGroup label="Date"><Input type="date" value={modal.data.date} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, date: e.target.value } }))} /></FormGroup>
              <FormGroup label="Client" required><Input value={modal.data.client.nom} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, client: { ...m.data.client, nom: e.target.value } } }))} /></FormGroup>
              <FormGroup label="Téléphone"><Input value={modal.data.client.tel} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, client: { ...m.data.client, tel: e.target.value } } }))} /></FormGroup>
            </div>
            <div className="my-2 overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-2 py-2 text-left">Prestation</th><th className="px-2 py-2">Qté</th><th className="px-2 py-2">Prix unit.</th><th className="px-2 py-2 text-right">Total</th><th></th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {modal.data.lignes.map((l, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5"><Input value={l.article} onChange={(e) => setLigne(i, { article: e.target.value })} placeholder="Sono, déco…" /></td>
                      <td className="px-2 py-1.5"><Input type="number" min="1" className="w-16" value={l.qte} onChange={(e) => setLigne(i, { qte: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><Input type="number" min="0" className="w-28" value={l.prixUnit} onChange={(e) => setLigne(i, { prixUnit: e.target.value })} /></td>
                      <td className="px-2 py-1.5 text-right font-semibold">{formatMoney(l.total)}</td>
                      <td className="px-2 py-1.5"><button onClick={() => setModal((m) => ({ ...m, data: { ...m.data, lignes: m.data.lignes.filter((_, j) => j !== i) } }))} className="text-red-500"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" onClick={() => setModal((m) => ({ ...m, data: { ...m.data, lignes: [...m.data.lignes, { article: '', qte: 1, prixUnit: 0, total: 0 }] } }))}><Plus size={14} /> Ligne</Button>
            <div className="mt-3 flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Remise %</label><Input type="number" className="w-20" value={modal.data.remise} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, remise: parseFloat(e.target.value) || 0 } }))} />
                <label className="text-sm text-gray-600">TVA %</label><Input type="number" className="w-20" value={modal.data.tva} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, tva: parseFloat(e.target.value) || 0 } }))} />
              </div>
              <p className="text-lg font-extrabold text-violet-700">TOTAL TTC : {formatMoney(totaux.totalTTC)}</p>
            </div>
            <FormGroup label="Conditions de paiement" className="mt-2"><Input value={modal.data.conditions} onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, conditions: e.target.value } }))} /></FormGroup>
          </>
        )}
      </Modal>
    </div>
  )
}

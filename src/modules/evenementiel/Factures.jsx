// Facturation BRIQUETERIE : liste, création/édition, export PDF.
// Calquée sur la facturation MAXI-AGRO — permet d'émettre des factures
// directement depuis l'application (briques + lignes libres).
import { useMemo, useState } from 'react'
import { Plus, FileDown, Trash2, Pencil } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useBriqueterieStore } from './store/referentielStore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { usePDF } from '../../hooks/usePDF'
import { todayStr, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'

const emptyFacture = () => ({
  date: todayStr(),
  client: { nom: '', tel: '', adresse: '', email: '' },
  lignes: [{ articleId: '', article: '', qte: 100, prixUnit: 0, total: 0 }],
  remise: 0,
  tva: 0
})

export default function Factures() {
  const { role } = useAuth()
  // Seuls les agents créent/modifient/suppriment des factures ; les autres consultent.
  const peutFacturer = () => role === 'agent'
  const { data: factures } = useCollection('evenementiel_factures')
  const { data: clients } = useCollection('evenementiel_clients')
  const briques = useBriqueterieStore((s) => s.briques)

  const [recherche, setRecherche] = useState('')
  const [modal, setModal] = useState(null) // { facture, editId }

  const liste = useMemo(
    () =>
      [...factures]
        .filter((f) => (f.client?.nom || '').toLowerCase().includes(recherche.toLowerCase()))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [factures, recherche]
  )

  // Clients connus : ceux du référentiel + ceux déjà facturés (uniques par nom).
  const clientsConnus = useMemo(() => {
    const map = {}
    clients.forEach((c) => {
      const nom = (c.nom || '').trim()
      if (nom && !map[nom]) map[nom] = { nom, tel: c.tel || '', email: c.email || '', adresse: c.adresse || '', _date: '' }
    })
    factures.forEach((f) => {
      const nom = (f.client?.nom || '').trim()
      if (!nom) return
      if (!map[nom] || (f.date || '') > (map[nom]._date || '')) {
        map[nom] = { nom, _date: f.date || '', tel: f.client?.tel || '', email: f.client?.email || '', adresse: f.client?.adresse || '' }
      }
    })
    return Object.values(map).sort((a, b) => a.nom.localeCompare(b.nom))
  }, [clients, factures])

  // ── Calculs ──
  const calcTotaux = (f) => {
    const totalHT = (f.lignes || []).reduce((s, l) => s + (l.total || 0), 0)
    const apresRemise = totalHT * (1 - (f.remise || 0) / 100)
    const tva = apresRemise * ((f.tva || 0) / 100)
    return { totalHT, totalTTC: Math.round(apresRemise + tva) }
  }

  const { generateFacturePDF } = usePDF('evenementiel')

  function openCreate() { setModal({ facture: emptyFacture(), editId: null }) }
  function openEdit(f) { setModal({ facture: structuredClone(f), editId: f.id }) }

  function setLigne(i, patch) {
    setModal((m) => {
      const lignes = [...m.facture.lignes]
      lignes[i] = { ...lignes[i], ...patch }
      lignes[i].total = (parseInt(lignes[i].qte) || 0) * (parseFloat(lignes[i].prixUnit) || 0)
      return { ...m, facture: { ...m.facture, lignes } }
    })
  }
  function pickArticle(i, id) {
    const b = briques.find((x) => x.id === id)
    setLigne(i, { articleId: id, article: b?.nom || '', prixUnit: b?.tarifVente || 0 })
  }
  function addLigne() {
    setModal((m) => ({ ...m, facture: { ...m.facture, lignes: [...m.facture.lignes, { articleId: '', article: '', qte: 100, prixUnit: 0, total: 0 }] } }))
  }
  function removeLigne(i) {
    setModal((m) => ({ ...m, facture: { ...m.facture, lignes: m.facture.lignes.filter((_, j) => j !== i) } }))
  }

  async function save() {
    const f = modal.facture
    if (!f.client.nom.trim()) return toast.error('Nom du client requis')
    const lignes = (f.lignes || []).filter((l) =>
      l.articleId || (l.article || '').trim() || (parseInt(l.qte) || 0) > 0 || (parseFloat(l.prixUnit) || 0) > 0
    )
    if (!lignes.some((l) => (l.article || '').trim() && (parseInt(l.qte) || 0) > 0)) {
      return toast.error('Ajoutez au moins une ligne avec un article et une quantité')
    }
    const fClean = { ...f, lignes }
    const { totalHT, totalTTC } = calcTotaux(fClean)
    const payload = { ...fClean, totalHT, totalTTC }
    try {
      if (modal.editId) {
        await updateItem('evenementiel_factures', modal.editId, payload)
        await audit('evenementiel', 'FACTURE_EDIT', `${f.numero}`)
        toast.success('Facture modifiée ✓')
      } else {
        payload.numero = genNumero('FAC-BRIQ', factures.length)
        await addItem('evenementiel_factures', payload)
        await audit('evenementiel', 'FACTURE', `${payload.numero} — ${formatMoney(totalTTC)}`)
        toast.success('Facture créée ✓')
      }
      setModal(null)
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  async function supprimer(f) {
    if (!confirm(`Supprimer la facture ${f.numero} ?`)) return
    await removeItem('evenementiel_factures', f.id)
    await audit('evenementiel', 'FACTURE_DELETE', f.numero)
    toast.success('Facture supprimée')
  }

  const totaux = modal ? calcTotaux(modal.facture) : null

  const columns = [
    { key: 'numero', label: 'N°' },
    { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
    { key: 'client', label: 'Client', render: (r) => r.client?.nom },
    { key: 'totalTTC', label: 'Total TTC', align: 'right', render: (r) => <strong>{formatMoney(r.totalTTC)}</strong> },
    {
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button title="PDF" onClick={() => generateFacturePDF(r)} className="rounded p-1.5 text-secondary hover:bg-sky-50"><FileDown size={16} /></button>
          {peutFacturer() && <button title="Modifier" onClick={() => openEdit(r)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>}
          {peutFacturer() && <button title="Supprimer" onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>}
        </div>
      )
    }
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="🔍 Rechercher un client…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        {peutFacturer() && <Button className="ml-auto" onClick={openCreate}><Plus size={16} /> Nouvelle facture</Button>}
      </div>

      <Card className="p-0">
        <Table columns={columns} rows={liste} empty="Aucune facture." />
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        size="xl"
        title={modal?.editId ? 'Modifier la facture' : 'Nouvelle facture'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}
      >
        {modal && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <FormGroup label="Date"><Input type="date" value={modal.facture.date} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, date: e.target.value } }))} /></FormGroup>
              <FormGroup label="Client" required hint="Choisissez un client existant ou tapez un nouveau nom">
                <Input
                  list="clients-briq-list"
                  value={modal.facture.client.nom}
                  onChange={(e) => {
                    const nom = e.target.value
                    const connu = clientsConnus.find((c) => c.nom.toLowerCase() === nom.trim().toLowerCase())
                    setModal((m) => ({
                      ...m,
                      facture: {
                        ...m.facture,
                        client: connu
                          ? { ...m.facture.client, nom, tel: connu.tel, email: connu.email, adresse: connu.adresse }
                          : { ...m.facture.client, nom }
                      }
                    }))
                  }}
                />
                <datalist id="clients-briq-list">
                  {clientsConnus.map((c) => <option key={c.nom} value={c.nom} />)}
                </datalist>
              </FormGroup>
              <FormGroup label="Téléphone"><Input value={modal.facture.client.tel} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, tel: e.target.value } } }))} /></FormGroup>
              <FormGroup label="Email"><Input value={modal.facture.client.email} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, email: e.target.value } } }))} /></FormGroup>
            </div>

            {/* Lignes */}
            <div className="mb-2 mt-2 overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr><th className="px-2 py-2 text-left">Article</th><th className="px-2 py-2">Qté</th><th className="px-2 py-2">Prix unit.</th><th className="px-2 py-2 text-right">Total</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modal.facture.lignes.map((l, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <Select value={l.articleId} onChange={(e) => pickArticle(i, e.target.value)}>
                          <option value="">— Choisir / libre —</option>
                          {briques.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
                        </Select>
                        {!l.articleId && (
                          <Input className="mt-1" placeholder="Désignation libre…" value={l.article} onChange={(e) => setLigne(i, { article: e.target.value })} />
                        )}
                      </td>
                      <td className="px-2 py-1.5"><Input type="number" min="1" className="w-20" value={l.qte} onChange={(e) => setLigne(i, { qte: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><Input type="number" min="0" className="w-28" value={l.prixUnit} onChange={(e) => setLigne(i, { prixUnit: e.target.value })} /></td>
                      <td className="px-2 py-1.5 text-right font-semibold">{formatMoney(l.total)}</td>
                      <td className="px-2 py-1.5"><button onClick={() => removeLigne(i)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" onClick={addLigne}><Plus size={14} /> Ajouter une ligne</Button>

            {/* Totaux */}
            <div className="mt-3 flex flex-col items-end gap-2">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600">Remise %</label>
                <Input type="number" min="0" max="100" className="w-20" value={modal.facture.remise} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, remise: parseFloat(e.target.value) || 0 } }))} />
                <label className="text-sm text-gray-600">TVA %</label>
                <Input type="number" min="0" max="100" className="w-20" value={modal.facture.tva} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, tva: parseFloat(e.target.value) || 0 } }))} />
              </div>
              <p className="text-sm text-gray-600">Total HT : <strong>{formatMoney(totaux.totalHT)}</strong></p>
              <p className="text-lg font-extrabold text-primary-dark">TOTAL TTC : {formatMoney(totaux.totalTTC)}</p>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

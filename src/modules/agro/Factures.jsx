// Facturation MAXI-AGRO : liste, création/édition, export PDF.
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
import { useAgroStore } from './store/agroStore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { usePDF } from '../../hooks/usePDF'
import { todayStr, genNumero, formatMoney, formatDateShort } from '../../utils/formatters'

const emptyFacture = () => ({
  date: todayStr(),
  client: { nom: '', tel: '', adresse: '', email: '' },
  // Apporteur d'affaires : membre de l'entreprise qui a amené / recommandé le
  // client (sert à le primer ensuite). Vide = client venu en direct.
  apporteur: '',
  lignes: [{ articleId: '', article: '', qte: 1, prixUnit: 0, total: 0 }],
  remise: 0,
  tva: 0
})

export default function Factures() {
  const { user, role } = useAuth()
  // Seuls les agents créent/modifient/suppriment des factures ; admin/ctrl consultent.
  const peutFacturer = () => role === 'agent'
  const { data: factures } = useCollection('agro_factures')
  const { data: users } = useCollection('users') // membres de l'entreprise (apporteurs)
  const especes = useAgroStore((s) => s.especes)
  const aliments = useAgroStore((s) => s.aliments)
  const getArticle = useAgroStore((s) => s.getArticle)
  const { generateFacturePDF } = usePDF()

  const tousArticles = [...especes, ...aliments]
  const [recherche, setRecherche] = useState('')
  const [modal, setModal] = useState(null) // { facture, editId }

  const liste = useMemo(
    () =>
      [...factures]
        .filter((f) => (f.client?.nom || '').toLowerCase().includes(recherche.toLowerCase()))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [factures, recherche]
  )

  // ── Calculs ──
  const calcTotaux = (f) => {
    const totalHT = (f.lignes || []).reduce((s, l) => s + (l.total || 0), 0)
    const apresRemise = totalHT * (1 - (f.remise || 0) / 100)
    const tva = apresRemise * ((f.tva || 0) / 100)
    return { totalHT, totalTTC: Math.round(apresRemise + tva) }
  }

  function openCreate() { setModal({ facture: emptyFacture(), editId: null }) }
  function openEdit(f) { setModal({ facture: structuredClone(f), editId: f.id }) }

  function setLigne(i, patch) {
    setModal((m) => {
      const lignes = [...m.facture.lignes]
      lignes[i] = { ...lignes[i], ...patch }
      // total = qte × prixUnit
      lignes[i].total = (parseInt(lignes[i].qte) || 0) * (parseFloat(lignes[i].prixUnit) || 0)
      return { ...m, facture: { ...m.facture, lignes } }
    })
  }
  function pickArticle(i, id) {
    const art = getArticle(id)
    // On mémorise le type + la catégorie de l'article pour rattacher de façon
    // fiable le chiffre d'affaires à l'espèce/aliment (analyses par catégorie).
    const type = especes.some((e) => e.id === id) ? 'animal'
      : aliments.some((a) => a.id === id) ? 'aliment' : ''
    // Le prix n'est plus prérempli : l'utilisateur saisit lui-même le prix de l'animal.
    setLigne(i, { articleId: id, article: art?.nom || '', articleType: type, articleCat: art?.cat || '' })
  }
  function addLigne() {
    setModal((m) => ({ ...m, facture: { ...m.facture, lignes: [...m.facture.lignes, { articleId: '', article: '', qte: 1, prixUnit: 0, total: 0 }] } }))
  }
  function removeLigne(i) {
    setModal((m) => ({ ...m, facture: { ...m.facture, lignes: m.facture.lignes.filter((_, j) => j !== i) } }))
  }

  async function save() {
    const f = modal.facture
    if (!f.client.nom.trim()) return toast.error('Nom du client requis')
    // Nettoyage : on retire les lignes totalement vides (ni article, ni qté, ni prix).
    const lignes = (f.lignes || []).filter((l) =>
      l.articleId || (parseInt(l.qte) || 0) > 0 || (parseFloat(l.prixUnit) || 0) > 0
    )
    if (!lignes.some((l) => l.articleId && (parseInt(l.qte) || 0) > 0)) return toast.error('Ajoutez au moins une ligne avec un article')
    // Toute ligne facturée (avec une quantité) doit référencer un article : sinon
    // son montant ne pourrait pas être rattaché à une espèce dans les analyses.
    if (lignes.some((l) => (parseInt(l.qte) || 0) > 0 && !l.articleId)) {
      return toast.error('Chaque ligne facturée doit avoir un article sélectionné')
    }
    const fClean = { ...f, lignes }
    const { totalHT, totalTTC } = calcTotaux(fClean)
    const payload = { ...fClean, totalHT, totalTTC }
    try {
      if (modal.editId) {
        await updateItem('agro_factures', modal.editId, payload)
        await audit('agro', 'FACTURE_EDIT', `${f.numero}`)
        toast.success('Facture modifiée ✓')
      } else {
        payload.numero = genNumero('FAC', factures.length)
        payload.createdBy = user.nom
        await addItem('agro_factures', payload)
        await audit('agro', 'FACTURE', `${payload.numero} — ${formatMoney(totalTTC)}`)
        toast.success('Facture créée ✓')
      }
      setModal(null)
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  async function supprimer(f) {
    if (!confirm(`Supprimer la facture ${f.numero} ?`)) return
    await removeItem('agro_factures', f.id)
    await audit('agro', 'FACTURE_DELETE', f.numero)
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
              <FormGroup label="Client" required><Input value={modal.facture.client.nom} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, nom: e.target.value } } }))} /></FormGroup>
              <FormGroup label="Téléphone"><Input value={modal.facture.client.tel} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, tel: e.target.value } } }))} /></FormGroup>
              <FormGroup label="Email"><Input value={modal.facture.client.email} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, email: e.target.value } } }))} /></FormGroup>
            </div>
            <div className="mt-2">
              <FormGroup label="Apporté / recommandé par (membre de l'entreprise)" hint="Laissez vide si le client est venu en direct. Sert à primer l'apporteur.">
                <Input
                  list="apporteurs-list"
                  placeholder="Nom du membre qui a amené le client…"
                  value={modal.facture.apporteur || ''}
                  onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, apporteur: e.target.value } }))}
                />
                <datalist id="apporteurs-list">
                  {users.map((u) => <option key={u.id} value={u.nom || u.login} />)}
                </datalist>
              </FormGroup>
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
                          <option value="">— Choisir —</option>
                          {tousArticles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                        </Select>
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

// Facturation BRIQUETERIE : liste, création/édition, export PDF.
// Calquée sur la facturation MAXI-AGRO — permet d'émettre des factures
// directement depuis l'application (briques + lignes libres).
import { useMemo, useState } from 'react'
import { Plus, FileDown, FileSpreadsheet, Trash2, Pencil, Eye, Receipt } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import Table from '../../shared/ui/Table'
import FicheDetail from '../../shared/ui/FicheDetail'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import ChampAutocomplete from '../../shared/forms/ChampAutocomplete'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole, canExportExcel } from '../../core/roles'
import { useBriqueterieStore } from './store/referentielStore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { usePDF } from '../../hooks/usePDF'
import { exportRapportExcel } from '../../utils/excelReport'
import { todayStr, genNumero, formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'

const emptyFacture = () => ({
  date: todayStr(),
  client: { nom: '', tel: '', adresse: '', email: '' },
  lignes: [{ articleId: '', article: '', qte: 100, prixUnit: 0, total: 0 }],
  remise: 0,
  tva: 0
})

export default function Factures() {
  const { role } = useAuth()
  // Seuls les agents créent/modifient des factures ; les autres consultent. La
  // suppression, elle, reste réservée à l'accès total — les agents modifient
  // partout mais ne suppriment jamais (décision explicite).
  const peutFacturer = () => role === 'agent'
  const peutSupprimer = isFullAccessRole(role)
  const { data: factures } = useCollection('evenementiel_factures')
  const { data: clients } = useCollection('evenementiel_clients')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const briques = useBriqueterieStore((s) => s.briques)

  // Ventes approuvées (sortie certifiée) pas encore facturées : proposées à la facturation.
  const ventesAFacturer = useMemo(
    () => ventes.filter((v) => v.statut === 'autorisee' && !factures.some((f) => f.venteId === v.id)),
    [ventes, factures]
  )

  const [recherche, setRecherche] = useState('')
  const [modal, setModal] = useState(null) // { facture, editId }
  const [detail, setDetail] = useState(null) // facture consultée

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

  function openCreate() { setModal({ facture: emptyFacture(), editId: null, venteId: null }) }
  function openEdit(f) { setModal({ facture: structuredClone(f), editId: f.id, venteId: f.venteId || null }) }

  // Pré-remplit la facture à partir d'une vente approuvée (client + lignes).
  function pickVente(id) {
    const v = ventes.find((x) => x.id === id)
    if (!v) { setModal((m) => ({ ...m, venteId: null })); return }
    const cli = clients.find((c) => c.id === v.clientId)
    setModal((m) => ({
      ...m,
      venteId: v.id,
      facture: {
        ...m.facture,
        client: { nom: v.clientNom || cli?.nom || '', tel: cli?.tel || '', email: cli?.email || '', adresse: cli?.adresse || '' },
        lignes: (v.lignes || []).map((l) => ({
          articleId: l.briqueId, article: l.briqueNom,
          qte: l.qte, prixUnit: l.prixUnitaire, total: (parseInt(l.qte) || 0) * (parseFloat(l.prixUnitaire) || 0)
        }))
      }
    }))
  }

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
    const payload = { ...fClean, totalHT, totalTTC, venteId: modal.venteId || null }
    try {
      if (modal.editId) {
        await updateItem('evenementiel_factures', modal.editId, payload)
        await audit('evenementiel', 'FACTURE_EDIT', `${f.numero}`)
        toast.success('Facture modifiée ✓')
      } else {
        payload.numero = genNumero('FAC-BRIQ', factures.length)
        await addItem('evenementiel_factures', payload)
        // Vente facturée : passe en « chargée / partie ».
        if (modal.venteId) await updateItem('evenementiel_ventes', modal.venteId, { statut: 'chargee' })
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

  // Export Excel — réservé à PAU/GE/Info (cf. canExportExcel) — reprend EXACTEMENT
  // les factures actuellement affichées (recherche client + tri déjà appliqués à
  // `liste`), jamais la collection brute.
  function exportXLSX() {
    const rows = liste.map((f) => {
      const t = calcTotaux(f)
      return {
        'N°': f.numero,
        'Date': formatDateShort(f.date),
        'Client': f.client?.nom || '—',
        'Article(s)': (f.lignes || []).filter((l) => (l.article || '').trim()).map((l) => `${l.article} ×${formatNumber(l.qte)}`).join(', '),
        'Total TTC': t.totalTTC
      }
    })
    exportRapportExcel({
      filename: `factures-briqueterie-${todayStr()}.xlsx`,
      sections: [{
        name: 'Factures Briqueterie',
        title: 'Facturation — Briqueterie',
        subtitle: `${liste.length} facture(s)${recherche ? ` — recherche : « ${recherche} »` : ''}`,
        columns: [
          { key: 'N°', label: 'N°', width: 14 },
          { key: 'Date', label: 'Date', width: 12 },
          { key: 'Client', label: 'Client', width: 22 },
          { key: 'Article(s)', label: 'Article(s)', width: 40 },
          { key: 'Total TTC', label: 'Total TTC', width: 16, type: 'money' }
        ],
        rows,
        totals: { __label: 'TOTAL', 'Total TTC': rows.reduce((s, r) => s + r['Total TTC'], 0) }
      }]
    })
  }

  const columns = [
    { key: 'numero', label: 'N°', sticky: true, width: '110px' },
    { key: 'date', label: 'Date', render: (r) => formatDateShort(r.date) },
    { key: 'client', label: 'Client', render: (r) => r.client?.nom },
    { key: 'totalTTC', label: 'Total TTC', align: 'right', render: (r) => <strong>{formatMoney(r.totalTTC)}</strong> },
    {
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button title="Voir le détail" onClick={() => setDetail(r)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Eye size={16} /></button>
          <button title="PDF" onClick={() => generateFacturePDF(r)} className="rounded p-1.5 text-secondary hover:bg-sky-50"><FileDown size={16} /></button>
          {peutFacturer() && <button title="Modifier" onClick={() => openEdit(r)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={16} /></button>}
          {peutSupprimer && <button title="Supprimer" onClick={() => supprimer(r)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>}
        </div>
      )
    }
  ]

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(124,58,237,0.35),0_8px_20px_-8px_rgba(124,58,237,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.85) 0%, rgba(76,29,149,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#7c3aed', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Receipt size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Facturation</h2>
          <p className="text-sm text-white/80">Factures émises aux clients de la Briqueterie</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="🔍 Rechercher un client…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        {canExportExcel(role) && (
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} /> Export Excel</Button>
        )}
        {peutFacturer() && <Button className="ml-auto" onClick={openCreate}><Plus size={16} /> Nouvelle facture</Button>}
      </div>

      <Card className="p-0">
        <Table stickyHeader columns={columns} rows={liste} empty="Aucune facture." />
      </Card>

      {/* Consultation d'une facture — lecture seule */}
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" {...glassModalProps(COULEUR_MODULE.evenementiel)}
        title={detail ? `Facture ${detail.numero}` : ''}
        footer={<>
          <Button variant="ghost" onClick={() => setDetail(null)}>Fermer</Button>
          {detail && <Button variant="secondary" onClick={() => generateFacturePDF(detail)}><FileDown size={15} /> PDF</Button>}
        </>}>
        {detail && (() => {
          const t = calcTotaux(detail)
          const vente = ventes.find((v) => v.id === detail.venteId)
          return (
            <FicheDetail
              entetes={[
                { label: 'Client', value: detail.client?.nom || '—' },
                { label: 'Date', value: formatDateShort(detail.date) },
                { label: 'Téléphone', value: detail.client?.tel },
                { label: 'Adresse', value: detail.client?.adresse },
                { label: 'E-mail', value: detail.client?.email },
                { label: 'Vente liée', value: vente ? `${vente.num} · ${vente.clientNom || ''}` : null }
              ]}
              colonnes={[
                { label: 'Article', render: (l) => l.article || '—' },
                { label: 'Quantité', align: 'center', render: (l) => formatNumber(l.qte) },
                { label: 'Prix unitaire', align: 'right', render: (l) => formatMoney(l.prixUnit || 0) },
                { label: 'Total', align: 'right', render: (l) => formatMoney(l.total || 0) }
              ]}
              lignes={detail.lignes || []}
              vide="Aucune ligne sur cette facture."
              pied={[
                { label: 'Total HT', value: t.totalHT },
                { label: 'Remise', value: detail.remise ? `${detail.remise} %` : null },
                { label: 'TVA', value: detail.tva ? `${detail.tva} %` : null },
                { label: 'Total TTC', value: t.totalTTC, fort: true }
              ]}
            />
          )
        })()}
      </Modal>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        size="xl"
        title={modal?.editId ? 'Modifier la facture' : 'Nouvelle facture'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Enregistrer</Button></>}
      >
        {modal && (
          <>
            {!modal.editId && (
              <div className="mb-3 rounded-lg border border-violet-100 bg-violet-50 p-3">
                <FormGroup label="Facturer une vente approuvée" hint="Sélectionnez une vente autorisée : le client et les lignes seront pré-remplis.">
                  <Select value={modal.venteId || ''} onChange={(e) => pickVente(e.target.value)}>
                    <option value="">— Nouvelle facture libre —</option>
                    {ventesAFacturer.map((v) => (
                      <option key={v.id} value={v.id}>{v.num} — {v.clientNom} ({formatMoney(v.total || 0)})</option>
                    ))}
                  </Select>
                </FormGroup>
                {!ventesAFacturer.length && (
                  <p className="mt-1 text-xs text-gray-500">Aucune vente approuvée en attente de facturation.</p>
                )}
              </div>
            )}
            {modal.venteId ? (
              /* Facture issue d'une vente déjà approuvée : lecture seule, on enregistre seulement. */
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <FormGroup label="Date"><Input type="date" value={modal.facture.date} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, date: e.target.value } }))} /></FormGroup>
                  <ReadField label="Client" value={modal.facture.client.nom} />
                  <ReadField label="Téléphone" value={modal.facture.client.tel || '—'} />
                  <ReadField label="Email" value={modal.facture.client.email || '—'} />
                </div>

                <div className="mb-2 mt-2 overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr><th className="px-2 py-2 text-left">Article</th><th className="px-2 py-2 text-center">Qté</th><th className="px-2 py-2 text-right">Prix unit.</th><th className="px-2 py-2 text-right">Total</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {modal.facture.lignes.map((l, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 font-medium">{l.article}</td>
                          <td className="px-2 py-1.5 text-center">{l.qte}</td>
                          <td className="px-2 py-1.5 text-right">{formatMoney(l.prixUnit)}</td>
                          <td className="px-2 py-1.5 text-right font-semibold">{formatMoney(l.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-col items-end gap-1">
                  <p className="text-sm text-gray-600">Total HT : <strong>{formatMoney(totaux.totalHT)}</strong></p>
                  <p className="text-lg font-extrabold text-primary-dark">TOTAL TTC : {formatMoney(totaux.totalTTC)}</p>
                </div>
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Vente déjà approuvée — les informations ne sont pas modifiables. Cliquez sur <strong>Enregistrer</strong> pour émettre la facture, puis imprimez-la.
                </p>
              </>
            ) : (
              /* Facture libre : entièrement éditable. */
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <FormGroup label="Date"><Input type="date" value={modal.facture.date} onChange={(e) => setModal((m) => ({ ...m, facture: { ...m.facture, date: e.target.value } }))} /></FormGroup>
                  <FormGroup label="Client" required hint="Choisissez un client existant ou tapez un nouveau nom">
                    <ChampAutocomplete
                      value={modal.facture.client.nom}
                      suggestions={clientsConnus}
                      getLabel={(c) => c.nom}
                      onChange={(nom) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, nom } } }))}
                      onSelect={(connu) => setModal((m) => ({ ...m, facture: { ...m.facture, client: { ...m.facture.client, nom: connu.nom, tel: connu.tel, email: connu.email, adresse: connu.adresse } } }))}
                    />
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
          </>
        )}
      </Modal>
    </div>
  )
}

// Champ en lecture seule (facture issue d'une vente approuvée).
function ReadField({ label, value }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
      <div className="truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800">{value}</div>
    </div>
  )
}

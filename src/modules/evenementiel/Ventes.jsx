// Ventes briques — création de commandes, liées aux autorisations de sortie.
import { useMemo, useState } from 'react'
import { Plus, Send, Trash2, Eye, ShoppingCart, Wallet, FileSpreadsheet } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { glassModalProps, COULEUR_MODULE } from '../../utils/color'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import StatCard from '../../shared/ui/StatCard'
import FiltrePeriode from '../../shared/ui/FiltrePeriode'
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
import { exportRapportExcel } from '../../utils/excelReport'
import { todayStr, genNumero, formatMoney, formatNumber, formatDateShort } from '../../utils/formatters'
import { isReadOnlyRole, isFullAccessRole, canViewFinance, canExportExcel } from '../../core/roles'
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
  // Les agents modifient/créent partout mais ne suppriment jamais (décision explicite).
  const peutSupprimer = isFullAccessRole(role)
  const estAdministration = canViewFinance(role)
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: clients } = useCollection('evenementiel_clients')
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const briques = useBriqueterieStore((s) => s.briques)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null)   // vente consultée

  // Filtre de tri — période (Jour / Mois / Plage), client et statut — même
  // composant et même comportement que la Facturation MAXI LOGISTIQUE.
  const [modePeriode, setModePeriode] = useState('jour')
  const [filtreJour, setFiltreJour]   = useState('')
  const [filtreMois, setFiltreMois]   = useState('')
  const [filtreAnnee, setFiltreAnnee] = useState('')
  const [filtreDebut, setFiltreDebut] = useState('')
  const [filtreFin, setFiltreFin]     = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreClient, setFiltreClient] = useState('')
  const filtrePeriodeActif = modePeriode === 'mois' ? filtreMois : modePeriode === 'annee' ? filtreAnnee : modePeriode === 'plage' ? (filtreDebut || filtreFin) : filtreJour

  const liste = useMemo(() => {
    let rows = [...ventes]
    if (modePeriode === 'mois' && filtreMois) {
      rows = rows.filter((v) => (v.date || '').startsWith(filtreMois))
    } else if (modePeriode === 'annee' && filtreAnnee) {
      rows = rows.filter((v) => (v.date || '').startsWith(filtreAnnee))
    } else if (modePeriode === 'plage' && (filtreDebut || filtreFin)) {
      rows = rows.filter((v) => (!filtreDebut || v.date >= filtreDebut) && (!filtreFin || v.date <= filtreFin))
    } else if (modePeriode === 'jour' && filtreJour) {
      rows = rows.filter((v) => v.date === filtreJour)
    }
    if (filtreStatut) rows = rows.filter((v) => v.statut === filtreStatut)
    if (filtreClient.trim()) {
      const q = filtreClient.trim().toLowerCase()
      rows = rows.filter((v) => (v.clientNom || '').toLowerCase().includes(q))
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [ventes, modePeriode, filtreJour, filtreMois, filtreAnnee, filtreDebut, filtreFin, filtreStatut, filtreClient])

  // Cumul des ventes — réservé à l'administration, recalculé selon les filtres
  // ci-dessus (période, statut, client) : sans filtre de statut, il mélange donc
  // tous les statuts (brouillon compris), comme la valeur brute déjà affichée.
  const cumulVentes = useMemo(() => liste.reduce((s, v) => s + (Number(v.total) || 0), 0), [liste])

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

  // Export Excel — réservé à PAU/GE/Info (cf. canExportExcel) — reprend EXACTEMENT
  // les ventes actuellement affichées (période, statut, client, tri déjà
  // appliqués à `liste`), jamais la collection brute.
  function exportXLSX() {
    const rows = liste.map((v) => ({
      'N°': v.num,
      'Date': formatDateShort(v.date),
      'Client': v.clientNom || '—',
      'Chargement': formatDateShort(v.dateChargement),
      'Brique(s)': (v.lignes || []).filter((l) => (l.briqueNom || '').trim()).map((l) => `${l.briqueNom} ×${formatNumber(l.qte)}`).join(', '),
      'Montant': Number(v.total) || 0,
      'Statut': (STATUTS[v.statut] || { label: v.statut }).label
    }))
    exportRapportExcel({
      filename: `ventes-briqueterie-${todayStr()}.xlsx`,
      sections: [{
        name: 'Ventes Briqueterie',
        title: 'Ventes — Briqueterie',
        subtitle: `${liste.length} vente(s)${filtreStatut ? ` — ${STATUTS[filtreStatut]?.label}` : ''}${filtrePeriodeActif ? ' — période filtrée' : ''}${filtreClient.trim() ? ` — client : « ${filtreClient} »` : ''}`,
        columns: [
          { key: 'N°', label: 'N°', width: 14 },
          { key: 'Date', label: 'Date', width: 12 },
          { key: 'Client', label: 'Client', width: 22 },
          { key: 'Chargement', label: 'Chargement', width: 14 },
          { key: 'Brique(s)', label: 'Brique(s)', width: 40 },
          { key: 'Montant', label: 'Montant', width: 16, type: 'money' },
          { key: 'Statut', label: 'Statut', width: 16 }
        ],
        rows,
        totals: { __label: 'TOTAL', 'Montant': rows.reduce((s, r) => s + (r['Montant'] || 0), 0) }
      }]
    })
  }

  return (
    <div className="space-y-4">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(124,58,237,0.35),0_8px_20px_-8px_rgba(124,58,237,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.85) 0%, rgba(76,29,149,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#7c3aed', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <ShoppingCart size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Ventes</h2>
          <p className="text-sm text-white/80">Commandes clients — chargement et autorisation de sortie</p>
        </div>
      </div>

      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
        <strong>Important :</strong> avant que les briques ne quittent le site, il faut l'accord des{' '}
        <strong>3 autorités</strong> (Direction, Contrôle, Commercial).{' '}
        <Link to="/evenementiel/demandes" className="font-semibold underline">Demander une autorisation →</Link>
      </div>
      {estAdministration && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title={`Cumul des ventes${filtreStatut ? ` (${STATUTS[filtreStatut]?.label.toLowerCase()})` : ''}`}
            value={formatMoney(cumulVentes)}
            sub={`${liste.length} vente${liste.length > 1 ? 's' : ''}${!filtreStatut ? ' · tous statuts confondus' : ''}${filtrePeriodeActif ? ' · période filtrée' : ''}${filtreClient.trim() ? ' · client filtré' : ''}`}
            icon={Wallet} accent={COULEUR_MODULE.evenementiel} />
        </div>
      )}

      <div className="flex justify-end gap-2">
        {canExportExcel(role) && (
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet size={16} /> Export Excel</Button>
        )}
        <Link to="/evenementiel/demandes"><Button variant="outline"><Send size={16} /> Autorisations</Button></Link>
        {!lectureSeule && <Button onClick={openCreate}><Plus size={16} /> Nouvelle vente</Button>}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <FiltrePeriode mode={modePeriode} onModeChange={setModePeriode}
          valeurJour={filtreJour} onJourChange={setFiltreJour}
          valeurMois={filtreMois} onMoisChange={setFiltreMois}
          avecAnnee valeurAnnee={filtreAnnee} onAnneeChange={setFiltreAnnee}
          avecPlage valeurDebut={filtreDebut} onDebutChange={setFiltreDebut}
          valeurFin={filtreFin} onFinChange={setFiltreFin} />
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Client</label>
          <input value={filtreClient} onChange={(e) => setFiltreClient(e.target.value)} placeholder="Rechercher un client…"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {[['', 'Tous'], ...Object.entries(STATUTS).map(([k, v]) => [k, v.label])].map(([v, l]) => (
            <button key={v || 'tous'} onClick={() => setFiltreStatut(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtreStatut === v ? 'bg-secondary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <Card className="p-0">
        <Table
          stickyHeader
          columns={[
            { key: 'num', label: 'N°', sticky: true, width: '95px' },
            { key: 'clientNom', label: 'Client' },
            { key: 'dateChargement', label: 'Chargement', render: (r) => formatDateShort(r.dateChargement) },
            { key: 'total', label: 'Montant', align: 'right', render: (r) => <strong>{formatMoney(r.total)}</strong> },
            { key: 'statut', label: 'Statut', render: (r) => <Badge tone={STATUTS[r.statut]?.tone}>{STATUTS[r.statut]?.label || r.statut}</Badge> },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => setDetail(r)} title="Voir le détail" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Eye size={16} /></button>
                {peutSupprimer && r.statut === 'brouillon' && (
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
      <Modal open={!!detail} onClose={() => setDetail(null)} size="lg" {...glassModalProps(COULEUR_MODULE.evenementiel)}
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

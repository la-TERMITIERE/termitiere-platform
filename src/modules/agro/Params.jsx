// Paramètres MAXI-AGRO — référentiels, utilisateurs (démo), données, PIN, système.
import { useRef, useState } from 'react'
import { Plus, Trash2, Download, Upload, RotateCcw } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Table from '../../shared/ui/Table'
import Badge from '../../shared/ui/Badge'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import Select from '../../shared/forms/Select'
import { useAgroStore } from './store/agroStore'
import { isFirebaseConfigured } from '../../core/firebase'
import { exportExcel } from '../../utils/exportExcel'
import { migrerDepuisFirebase, migrerDepuisDB } from '../../utils/migration'
import { toast } from '../../core/notifications'
import { formatMoney, genId } from '../../utils/formatters'
import { CAT_ANIMAUX, CAT_ALIMENTS } from './data'
import { PIN_KEY, getPin } from './Journal'

const TABS = [
  ['especes', 'Espèces'],
  ['aliments', 'Aliments'],
  ['donnees', 'Données'],
  ['systeme', 'Système']
]

export default function Params() {
  const [tab, setTab] = useState('especes')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg bg-white p-1">
        {TABS.map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`rounded px-3 py-1.5 text-sm font-semibold ${tab === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{l}</button>
        ))}
      </div>
      {tab === 'especes' && <ReferentielTab kind="espece" />}
      {tab === 'aliments' && <ReferentielTab kind="aliment" />}
      {tab === 'donnees' && <DonneesTab />}
      {tab === 'systeme' && <SystemeTab />}
    </div>
  )
}

// ── Référentiel espèces / aliments ──
function ReferentielTab({ kind }) {
  const store = useAgroStore()
  const items = kind === 'espece' ? store.especes : store.aliments
  const save = kind === 'espece' ? store.saveEspece : store.saveAliment
  const remove = kind === 'espece' ? store.removeEspece : store.removeAliment
  const cats = kind === 'espece' ? CAT_ANIMAUX : CAT_ALIMENTS
  const [modal, setModal] = useState(null)

  function openNew() { setModal({ id: '', nom: '', cat: cats[0], prix: 0, isNew: true }) }

  function submit() {
    if (!modal.nom.trim()) return toast.error('Nom requis')
    const id = modal.isNew ? (modal.nom.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_' + genId().slice(0, 3).toLowerCase()) : modal.id
    save({ id, nom: modal.nom.trim(), cat: modal.cat, prix: parseInt(modal.prix) || 0 })
    toast.success('Enregistré ✓')
    setModal(null)
  }

  return (
    <>
      <div className="flex justify-end"><Button onClick={openNew}><Plus size={16} /> Ajouter</Button></div>
      <Card className="p-0">
        <Table
          columns={[
            { key: 'nom', label: 'Nom' },
            { key: 'cat', label: 'Catégorie', render: (r) => <Badge tone="neutral">{r.cat}</Badge> },
            { key: 'prix', label: 'Prix', align: 'right', render: (r) => formatMoney(r.prix) },
            { key: 'actions', label: '', align: 'right', render: (r) => (
              <div className="flex justify-end gap-1">
                <button onClick={() => setModal({ ...r, isNew: false })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">✏️</button>
                <button onClick={() => { if (confirm(`Supprimer ${r.nom} ?`)) remove(r.id) }} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            ) }
          ]}
          rows={items}
          empty="Aucun élément."
        />
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.isNew ? 'Ajouter' : 'Modifier'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={submit}>Enregistrer</Button></>}>
        {modal && (
          <>
            <FormGroup label="Nom" required><Input value={modal.nom} onChange={(e) => setModal((m) => ({ ...m, nom: e.target.value }))} /></FormGroup>
            <FormGroup label="Catégorie"><Select value={modal.cat} onChange={(e) => setModal((m) => ({ ...m, cat: e.target.value }))} options={cats.map((c) => ({ value: c, label: c }))} /></FormGroup>
            <FormGroup label="Prix (FCFA)"><Input type="number" min="0" value={modal.prix} onChange={(e) => setModal((m) => ({ ...m, prix: e.target.value }))} /></FormGroup>
          </>
        )}
      </Modal>
    </>
  )
}

// ── Données : export / import JSON, export Excel ──
function DonneesTab() {
  const fileRef = useRef(null)
  const oldFileRef = useRef(null)
  const [migrating, setMigrating] = useState(false)
  const COLS = ['agro_inventaires', 'agro_factures', 'agro_demandes', 'agro_sante']

  const recapMsg = (r) =>
    `${r.inventaires} saisie(s), ${r.factures} facture(s), ${r.demandes} demande(s), ${r.sante} fiche(s) santé`

  // Migration depuis la Firebase de l'ancienne app (chemin maxiagro)
  async function migrerFirebase() {
    if (!confirm("Importer les données de l'ancienne app MAXI-AGRO depuis Firebase ?")) return
    setMigrating(true)
    try {
      const r = await migrerDepuisFirebase()
      const total = r.inventaires + r.factures + r.demandes + r.sante
      toast.success(total ? `Migration réussie : ${recapMsg(r)}` : 'Aucune donnée opérationnelle à migrer (référentiel déjà à jour).')
    } catch (e) {
      toast.error('Échec migration : ' + e.message)
    } finally {
      setMigrating(false)
    }
  }

  // Import d'un export JSON brut de l'ancienne app (format maxiagro_db_v1)
  function importOldJSON(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const oldDB = JSON.parse(reader.result)
        const r = await migrerDepuisDB(oldDB)
        toast.success(`Import ancienne app : ${recapMsg(r)}`)
      } catch {
        toast.error('Fichier de l\'ancienne app invalide')
      }
    }
    reader.readAsText(file)
  }

  function readCol(name) {
    try { return JSON.parse(localStorage.getItem('termitiere_col_' + name)) || [] } catch { return [] }
  }

  function exportJSON() {
    const dump = {}
    COLS.forEach((c) => (dump[c] = readCol(c)))
    dump.especes = useAgroStore.getState().especes
    dump.aliments = useAgroStore.getState().aliments
    dump.exportedAt = new Date().toISOString()
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'termitiere-agro-backup.json'
    a.click()
    toast.success('Export JSON généré ✓')
  }

  function importJSON(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        COLS.forEach((c) => { if (data[c]) localStorage.setItem('termitiere_col_' + c, JSON.stringify(data[c])) })
        if (data.especes) useAgroStore.getState().saveEspece && localStorage.setItem('termitiere_agro_especes', JSON.stringify(data.especes))
        if (data.aliments) localStorage.setItem('termitiere_agro_aliments', JSON.stringify(data.aliments))
        toast.success('Import réussi — rechargez la page')
      } catch (err) { toast.error('Fichier invalide') }
    }
    reader.readAsText(file)
  }

  function exportXLSX() {
    exportExcel(readCol('agro_factures').map((f) => ({ Numero: f.numero, Date: f.date, Client: f.client?.nom, TTC: f.totalTTC })), 'factures.xlsx', 'Factures')
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card title="Migration depuis l'ancienne app" className="md:col-span-2">
        <p className="mb-3 text-sm text-gray-500">
          Importe les données MAXI-AGRO (saisies, factures, demandes, santé) de l'ancienne application.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={migrerFirebase} loading={migrating}><Download size={16} /> Migrer depuis Firebase</Button>
          <Button variant="outline" onClick={() => oldFileRef.current?.click()}><Upload size={16} /> Importer un export de l'ancienne app</Button>
          <input ref={oldFileRef} type="file" accept="application/json" className="hidden" onChange={importOldJSON} />
        </div>
      </Card>
      <Card title="Sauvegarde">
        <p className="mb-3 text-sm text-gray-500">Exportez ou restaurez toutes les données AGRO (mode local).</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportJSON}><Download size={16} /> Export JSON</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload size={16} /> Import JSON</Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importJSON} />
          <Button variant="outline" onClick={exportXLSX}>📊 Export Excel</Button>
        </div>
      </Card>
      <Card title="Réinitialisation">
        <p className="mb-3 text-sm text-gray-500">Restaure les espèces et aliments aux valeurs d'usine.</p>
        <Button variant="danger" onClick={() => { if (confirm('Réinitialiser le référentiel ?')) { useAgroStore.getState().resetReferentiel(); toast.success('Référentiel réinitialisé') } }}>
          <RotateCcw size={16} /> Réinitialiser le référentiel
        </Button>
      </Card>
    </div>
  )
}

// ── Système : PIN journal, statut Firebase / EmailJS ──
function SystemeTab() {
  const [pin, setPin] = useState(getPin())
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card title="Code PIN du Journal">
        <FormGroup label="Code PIN" hint="Protège l'accès à l'historique des saisies.">
          <Input value={pin} onChange={(e) => setPin(e.target.value)} maxLength={8} />
        </FormGroup>
        <Button onClick={() => { localStorage.setItem(PIN_KEY, pin || '0000'); toast.success('PIN mis à jour') }}>Enregistrer le PIN</Button>
      </Card>
      <Card title="Connexions">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span>Firebase</span>
            <Badge tone={isFirebaseConfigured ? 'success' : 'warning'}>{isFirebaseConfigured ? 'Configuré' : 'Mode démo local'}</Badge>
          </li>
          <li className="flex items-center justify-between">
            <span>EmailJS (rapports)</span>
            <Badge tone={import.meta.env.VITE_EMAILJS_SERVICE_ID ? 'success' : 'neutral'}>{import.meta.env.VITE_EMAILJS_SERVICE_ID ? 'Configuré' : 'Non configuré'}</Badge>
          </li>
        </ul>
        <p className="mt-3 text-xs text-gray-400">La configuration se fait via les variables d'environnement (fichier .env / Netlify).</p>
      </Card>
    </div>
  )
}

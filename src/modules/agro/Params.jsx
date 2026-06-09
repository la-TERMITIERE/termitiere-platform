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
import { getAll, setItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { exportRapportExcel } from '../../utils/excelReport'
import { migrerDepuisFirebase, migrerDepuisDB } from '../../utils/migration'
import { toast } from '../../core/notifications'
import { genId } from '../../utils/formatters'
import { CAT_ANIMAUX, CAT_ALIMENTS, UNITES_ALIMENT } from './data'

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

  function openNew() {
    setModal({ id: '', nom: '', cat: cats[0], unite: kind === 'aliment' ? 'kg' : undefined, isNew: true })
  }

  function submit() {
    if (!modal.nom.trim()) return toast.error('Nom requis')
    const id = modal.isNew ? (modal.nom.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_' + genId().slice(0, 3).toLowerCase()) : modal.id
    const base = { id, nom: modal.nom.trim(), cat: modal.cat, prix: 0 }
    save(kind === 'aliment' ? { ...base, unite: (modal.unite || 'kg').trim() } : base)
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
            ...(kind === 'aliment' ? [{ key: 'unite', label: 'Unité', render: (r) => <span className="text-xs font-semibold text-gray-600">{r.unite || 'kg'}</span> }] : []),
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
            {kind === 'aliment' && (
              <FormGroup label="Unité de mesure" hint="Affichée dans la saisie journalière (kg, sacs, litres…)">
                <Select value={modal.unite || 'kg'} onChange={(e) => setModal((m) => ({ ...m, unite: e.target.value }))}>
                  {UNITES_ALIMENT.map((u) => <option key={u} value={u}>{u}</option>)}
                </Select>
              </FormGroup>
            )}
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
  const [resetting, setResetting] = useState(false)
  const COLS = ['agro_inventaires', 'agro_factures', 'agro_demandes', 'agro_sante']
  // Collections vidées par la réinitialisation totale (tout repart à zéro).
  const RESET_COLS = ['agro_inventaires', 'agro_factures', 'agro_demandes', 'agro_sante', 'agro_vaccins', 'audit_global', 'notifications']

  async function reinitialiserTout() {
    if (!confirm('⚠️ ATTENTION : ceci supprime DÉFINITIVEMENT toutes les saisies, factures, demandes, fiches santé, le stock de vaccins, le journal et les notifications. Tout repart à zéro (000000). Continuer ?')) return
    if (!confirm('Dernière confirmation : action IRRÉVERSIBLE. Réinitialiser maintenant ?')) return
    setResetting(true)
    try {
      let n = 0
      for (const c of RESET_COLS) {
        const rows = await getAll(c)
        for (const row of rows) { await removeItem(c, row.id); n++ }
      }
      await audit('agro', 'RESET', `Réinitialisation totale des données — ${n} enregistrement(s) supprimé(s)`)
      toast.success('Toutes les données ont été réinitialisées ✓ (tout est à zéro)')
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    } finally {
      setResetting(false)
    }
  }

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

  // Lit une collection depuis la base (cloud en temps réel, ou localStorage en démo).
  const readCol = (name) => getAll(name)

  async function exportJSON() {
    const dump = {}
    for (const c of COLS) dump[c] = await readCol(c)
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
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result)

        // Détection automatique du format de l'ancienne app standalone
        // (maxiagro_db_v1 : inventaires/factures/demandes/sanitaire, sans clés agro_*).
        const aFormatPortail = COLS.some((c) => Array.isArray(data[c]))
        const aFormatAncien = !aFormatPortail &&
          (data.inventaires || data.sanitaire || data.factures || data.demandes)
        if (aFormatAncien) {
          const r = await migrerDepuisDB(data)
          toast.success(`Import ancienne app : ${recapMsg(r)}`)
          return
        }

        // Format du portail : réécrit chaque enregistrement dans la base (synchronisé partout).
        let n = 0
        for (const c of COLS) {
          for (const row of data[c] || []) {
            if (row && row.id) { await setItem(c, row.id, row); n++ }
          }
        }
        // Référentiel espèces / aliments
        const store = useAgroStore.getState()
        for (const sp of data.especes || []) { await store.saveEspece(sp); n++ }
        for (const al of data.aliments || []) { await store.saveAliment(al); n++ }

        if (n === 0) {
          toast.error('Aucune donnée reconnue dans ce fichier (structure inattendue)')
          return
        }
        toast.success('Import réussi ✓ (données synchronisées)')
      } catch (err) { toast.error('Fichier invalide') }
    }
    reader.readAsText(file)
  }

  const EXPORT_OPTIONS = [
    { id: 'animaux', label: 'Animaux (espèces et effectifs)' },
    { id: 'aliments', label: 'Aliments & Divers (stocks)' },
    { id: 'vaccins', label: 'Vaccins & Produits vétérinaires' },
    { id: 'factures', label: 'Factures (historique)' }
  ]
  const [exportChoix, setExportChoix] = useState(() => Object.fromEntries(EXPORT_OPTIONS.map((o) => [o.id, true])))
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  async function exportXLSX() {
    const selections = EXPORT_OPTIONS.filter((o) => exportChoix[o.id])
    if (!selections.length) return toast.error('Choisissez au moins une section')
    setExporting(true)
    try {
      const sections = []
      if (exportChoix.animaux) {
        const especes = useAgroStore.getState().especes
        sections.push({
          id: 'animaux', name: 'Animaux', title: 'Référentiel animaux (espèces)',
          subtitle: `Exporté le ${new Date().toLocaleDateString('fr-FR')}`,
          columns: [
            { key: 'nom', label: 'Espèce', width: 26 },
            { key: 'cat', label: 'Catégorie', width: 16 },
            { key: 'prix', label: 'Prix indicatif', width: 18, type: 'money' }
          ],
          rows: especes.map((e) => ({ nom: e.nom, cat: e.cat, prix: e.prix || 0 }))
        })
      }
      if (exportChoix.aliments) {
        const aliments = useAgroStore.getState().aliments
        sections.push({
          id: 'aliments', name: 'Aliments & Divers', title: 'Référentiel aliments & divers',
          subtitle: `Exporté le ${new Date().toLocaleDateString('fr-FR')}`,
          columns: [
            { key: 'nom', label: 'Article', width: 26 },
            { key: 'cat', label: 'Catégorie', width: 16 },
            { key: 'unite', label: 'Unité', width: 12 }
          ],
          rows: aliments.map((a) => ({ nom: a.nom, cat: a.cat, unite: a.unite || 'kg' }))
        })
      }
      if (exportChoix.vaccins) {
        const vaccins = await readCol('agro_vaccins')
        sections.push({
          id: 'vaccins', name: 'Vaccins & Produits', title: 'Stock vaccins & produits vétérinaires',
          subtitle: `Exporté le ${new Date().toLocaleDateString('fr-FR')}`,
          columns: [
            { key: 'nom', label: 'Produit', width: 30 },
            { key: 'quantite', label: 'Quantité', width: 14, type: 'number' },
            { key: 'unite', label: 'Unité', width: 12 },
            { key: 'seuilAlerte', label: 'Seuil alerte', width: 14, type: 'number' }
          ],
          rows: vaccins.map((v) => ({ nom: v.nom || '—', quantite: v.quantite || 0, unite: v.unite || '', seuilAlerte: v.seuilAlerte || 5 }))
        })
      }
      if (exportChoix.factures) {
        const factures = await readCol('agro_factures')
        sections.push({
          id: 'factures', name: 'Factures', title: 'Historique des factures',
          subtitle: `Exporté le ${new Date().toLocaleDateString('fr-FR')} — ${factures.length} facture(s)`,
          columns: [
            { key: 'numero', label: 'N° Facture', width: 20 },
            { key: 'date', label: 'Date', width: 14 },
            { key: 'client', label: 'Client', width: 28 },
            { key: 'tel', label: 'Téléphone', width: 16 },
            { key: 'totalHT', label: 'Total HT', width: 18, type: 'money' },
            { key: 'totalTTC', label: 'Total TTC', width: 18, type: 'money' }
          ],
          rows: factures.map((f) => ({
            numero: f.numero, date: f.date, client: f.client?.nom || '—',
            tel: f.client?.tel || '—', totalHT: f.totalHT || 0, totalTTC: f.totalTTC || 0
          })),
          totals: { __label: 'TOTAL', totalHT: factures.reduce((s, f) => s + (f.totalHT || 0), 0), totalTTC: factures.reduce((s, f) => s + (f.totalTTC || 0), 0) }
        })
      }
      exportRapportExcel({ filename: `export-maxi-agro-${new Date().toISOString().slice(0,10)}.xlsx`, sections })
      toast.success('Export Excel généré ✓')
      setExportOpen(false)
    } catch (e) {
      toast.error('Erreur export : ' + e.message)
    } finally {
      setExporting(false)
    }
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
          <Button variant="outline" onClick={() => setExportOpen(true)}>📊 Export Excel multi-sections</Button>
        </div>
      </Card>
      <Card title="Réinitialisation">
        <p className="mb-3 text-sm text-gray-500">Restaure les espèces et aliments aux valeurs d'usine.</p>
        <Button variant="outline" onClick={() => { if (confirm('Réinitialiser le référentiel ?')) { useAgroStore.getState().resetReferentiel(); toast.success('Référentiel réinitialisé') } }}>
          <RotateCcw size={16} /> Réinitialiser le référentiel
        </Button>
      </Card>

      <Card title="⚠️ Tout réinitialiser" className="md:col-span-2 border border-red-200">
        <p className="mb-3 text-sm text-gray-500">
          Remet <strong>toutes les données à zéro</strong> : saisies, factures, demandes, fiches santé,
          stock de vaccins, journal d'activité et notifications. Le référentiel des espèces/aliments est conservé.
          <strong className="text-red-600"> Cette action est irréversible.</strong>
        </p>
        <Button variant="danger" onClick={reinitialiserTout} loading={resetting}>
          <RotateCcw size={16} /> Réinitialiser toutes les données
        </Button>
      </Card>

      {/* Modal export Excel multi-sections */}
      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export Excel — Choisir les sections"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>Annuler</Button>
            <Button onClick={exportXLSX} loading={exporting}>📊 Générer l'Excel</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-gray-500">
          Cochez les données à inclure dans le rapport Excel prêt à imprimer :
        </p>
        <div className="space-y-2">
          {EXPORT_OPTIONS.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={!!exportChoix[o.id]}
                onChange={() => setExportChoix((c) => ({ ...c, [o.id]: !c[o.id] }))}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm font-medium">{o.label}</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  )
}

// ── Système : PIN journal, statut Firebase / EmailJS ──
function SystemeTab() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
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

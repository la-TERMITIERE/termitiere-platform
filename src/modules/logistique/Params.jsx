// Paramètres Logistique — export multi-sections + réinitialisation des données.
import { useState } from 'react'
import { FileSpreadsheet, Trash2, AlertTriangle } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole } from '../../core/roles'
import { removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'

const EXPORT_OPTIONS = [
  { id: 'inventaires', label: 'Saisies magasin', emoji: '📦' },
  { id: 'factures', label: 'Factures', emoji: '🧾' },
  { id: 'prestations', label: 'Prestations', emoji: '🎪' },
  { id: 'demandes', label: 'Autorisations sortie', emoji: '📤' }
]

const RESET_COLLECTIONS = [
  { id: 'logistique_inventaires', label: 'Saisies magasin' },
  { id: 'logistique_factures', label: 'Factures' },
  { id: 'logistique_prestations', label: 'Prestations' },
  { id: 'logistique_demandes', label: 'Autorisations sortie' }
]

export default function Params() {
  const { role } = useAuth()
  const { data: inventaires } = useCollection('logistique_inventaires')
  const { data: factures } = useCollection('logistique_factures')
  const { data: prestations } = useCollection('logistique_prestations')
  const { data: demandes } = useCollection('logistique_demandes')

  const [exportChoix, setExportChoix] = useState(new Set(['inventaires', 'factures', 'prestations', 'demandes']))
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  const toggleExport = (id) => setExportChoix((prev) => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  async function exportXLSX() {
    setExporting(true)
    try {
      const sections = []
      if (exportChoix.has('inventaires')) {
        sections.push({
          id: 'inventaires', name: 'Saisies magasin',
          title: 'Saisies magasin — Logistique',
          subtitle: `Exporté le ${formatDateShort(todayStr())} · ${inventaires.length} saisie(s)`,
          columns: [
            { key: 'date', label: 'Date', width: 14 },
            { key: 'agentNom', label: 'Agent', width: 22 },
            { key: 'savedAt', label: 'Enregistré à', width: 20 }
          ],
          rows: inventaires.map((i) => ({ date: i.date, agentNom: i.agentNom || '—', savedAt: i.savedAt ? new Date(i.savedAt).toLocaleString('fr-FR') : '—' }))
        })
      }
      if (exportChoix.has('factures')) {
        sections.push({
          id: 'factures', name: 'Factures',
          title: 'Factures — Logistique',
          subtitle: `${factures.length} facture(s)`,
          columns: [
            { key: 'num', label: 'N° Facture', width: 16 },
            { key: 'date', label: 'Date', width: 14 },
            { key: 'clientNom', label: 'Client', width: 28 },
            { key: 'totalTTC', label: 'Montant TTC (FCFA)', width: 22 },
            { key: 'statut', label: 'Statut', width: 14 }
          ],
          rows: factures.map((f) => ({ num: f.num, date: f.date, clientNom: f.clientNom || '—', totalTTC: f.totalTTC || 0, statut: f.statut || '—' }))
        })
      }
      if (exportChoix.has('prestations')) {
        sections.push({
          id: 'prestations', name: 'Prestations',
          title: 'Prestations — Logistique',
          subtitle: `${prestations.length} prestation(s)`,
          columns: [
            { key: 'num', label: 'N°', width: 14 },
            { key: 'date', label: 'Date', width: 14 },
            { key: 'clientNom', label: 'Client', width: 28 },
            { key: 'total', label: 'Montant (FCFA)', width: 20 },
            { key: 'statut', label: 'Statut', width: 16 }
          ],
          rows: prestations.map((p) => ({ num: p.num, date: p.date, clientNom: p.clientNom || '—', total: p.total || 0, statut: p.statut || '—' }))
        })
      }
      if (exportChoix.has('demandes')) {
        sections.push({
          id: 'demandes', name: 'Autorisations',
          title: 'Autorisations de sortie — Logistique',
          subtitle: `${demandes.length} demande(s)`,
          columns: [
            { key: 'num', label: 'N°', width: 14 },
            { key: 'date', label: 'Date', width: 14 },
            { key: 'materielNom', label: 'Matériel', width: 28 },
            { key: 'qte', label: 'Qté', width: 10 },
            { key: 'agentNom', label: 'Agent', width: 22 },
            { key: 'statut', label: 'Statut', width: 14 }
          ],
          rows: demandes.map((d) => ({ num: d.num || '—', date: d.date, materielNom: d.materielNom || '—', qte: d.qte || '—', agentNom: d.agentNom || '—', statut: d.statut || '—' }))
        })
      }
      if (sections.length === 0) return toast.warning('Sélectionnez au moins une section')
      await exportRapportExcel({ filename: `export-logistique-${todayStr()}.xlsx`, sections })
      setExportOpen(false)
    } finally {
      setExporting(false)
    }
  }

  async function resetDonnees() {
    if (role !== 'admin') return toast.error('Action réservée à l\'administrateur')
    setResetting(true)
    try {
      for (const col of RESET_COLLECTIONS) {
        const data = col.id === 'logistique_inventaires' ? inventaires
          : col.id === 'logistique_factures' ? factures
          : col.id === 'logistique_prestations' ? prestations
          : demandes
        for (const item of data) await removeItem(col.id, item.id)
      }
      await audit('logistique', 'RESET', 'Réinitialisation complète des données logistique')
      toast.success('Données logistique réinitialisées ✓')
      setResetOpen(false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setResetting(false)
    }
  }

  const isAdmin = isFullAccessRole(role)

  return (
    <div className="space-y-4">
      <Card title="Export des données">
        <p className="mb-3 text-sm text-gray-500">Sélectionnez les sections à inclure dans l'export Excel.</p>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EXPORT_OPTIONS.map((opt) => (
            <label key={opt.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <input type="checkbox" checked={exportChoix.has(opt.id)} onChange={() => toggleExport(opt.id)} className="rounded" />
              <span className="text-sm">{opt.emoji} {opt.label}</span>
            </label>
          ))}
        </div>
        <Button onClick={() => setExportOpen(true)} disabled={exportChoix.size === 0}>
          <FileSpreadsheet size={16} /> Exporter en Excel
        </Button>
      </Card>

      {isAdmin && (
        <Card title="Réinitialisation des données" className="border-red-200">
          <div className="flex items-start gap-3 rounded-lg bg-red-50 p-4">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold text-red-900">Zone dangereuse</p>
              <p className="mt-1 text-sm text-red-700">
                Cette action supprime définitivement toutes les saisies, factures, prestations et autorisations de sortie.
                Les paramètres et le référentiel matériel sont conservés.
              </p>
              <Button variant="danger" size="sm" className="mt-3" onClick={() => setResetOpen(true)}>
                <Trash2 size={15} /> Réinitialiser les données
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Confirmer l'export"
        footer={<><Button variant="ghost" onClick={() => setExportOpen(false)}>Annuler</Button><Button onClick={exportXLSX} loading={exporting}><FileSpreadsheet size={16} /> Exporter</Button></>}>
        <p className="text-sm text-gray-600">Sections sélectionnées : <strong>{[...exportChoix].map((id) => EXPORT_OPTIONS.find((o) => o.id === id)?.label).filter(Boolean).join(', ')}</strong></p>
      </Modal>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Confirmer la réinitialisation"
        footer={<><Button variant="ghost" onClick={() => setResetOpen(false)}>Annuler</Button><Button variant="danger" onClick={resetDonnees} loading={resetting}><Trash2 size={15} /> Confirmer la réinitialisation</Button></>}>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-red-700">Les données suivantes seront supprimées :</p>
          <ul className="ml-4 list-disc space-y-1 text-gray-700">
            {RESET_COLLECTIONS.map((c) => <li key={c.id}>{c.label}</li>)}
          </ul>
          <p className="mt-3 text-gray-500">Cette action est irréversible.</p>
        </div>
      </Modal>
    </div>
  )
}

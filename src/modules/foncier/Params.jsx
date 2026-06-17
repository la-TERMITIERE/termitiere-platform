// Paramètres Foncier — export des dossiers + réinitialisation.
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
import { formatDateShort, todayStr } from '../../utils/formatters'
import { TYPES_DOSSIER, STATUTS_DOSSIER } from './data'

export default function Params() {
  const { role } = useAuth()
  const { data: dossiers } = useCollection('foncier_dossiers')

  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function exportXLSX() {
    setExporting(true)
    try {
      const rows = dossiers.map((d) => ({
        Référence: d.ref || '—',
        Type: TYPES_DOSSIER.find((t) => t.id === d.type)?.label || d.type || '—',
        Localisation: d.localisation || '—',
        'Date ouverture': formatDateShort(d.dateOuverture),
        Statut: STATUTS_DOSSIER[d.statut]?.label || d.statut || '—',
        'Mode acquisition': d.modeAcquisition || '—',
        Superficie: d.superficie ? `${d.superficie} ha` : '—',
        'Responsable dossier': d.responsable || '—',
        Notes: d.notes || ''
      }))
      await exportRapportExcel({
        filename: `dossiers-foncier-${todayStr()}.xlsx`,
        sections: [{
          id: 'dossiers', name: 'Dossiers fonciers',
          title: 'Portefeuille foncier — La Termitière',
          subtitle: `Exporté le ${formatDateShort(todayStr())} · ${dossiers.length} dossier(s)`,
          columns: [
            { key: 'Référence', label: 'Référence', width: 16 },
            { key: 'Type', label: 'Type de dossier', width: 34 },
            { key: 'Localisation', label: 'Localisation', width: 28 },
            { key: 'Date ouverture', label: 'Date ouverture', width: 16 },
            { key: 'Statut', label: 'Statut', width: 20 },
            { key: 'Mode acquisition', label: 'Mode acquisition', width: 22 },
            { key: 'Superficie', label: 'Superficie', width: 14 },
            { key: 'Responsable dossier', label: 'Responsable', width: 22 },
            { key: 'Notes', label: 'Notes', width: 40 }
          ],
          rows
        }]
      })
      setExportOpen(false)
    } finally {
      setExporting(false)
    }
  }

  async function resetDonnees() {
    if (role !== 'admin') return toast.error('Action réservée à l\'administrateur')
    setResetting(true)
    try {
      for (const d of dossiers) await removeItem('foncier_dossiers', d.id)
      await audit('foncier', 'RESET', 'Réinitialisation complète des dossiers fonciers')
      toast.success('Dossiers fonciers réinitialisés ✓')
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
      <Card title="Export des dossiers">
        <p className="mb-4 text-sm text-gray-500">
          Exporte l'ensemble du portefeuille foncier ({dossiers.length} dossier(s)) en fichier Excel professionnel.
        </p>
        <Button onClick={() => setExportOpen(true)}>
          <FileSpreadsheet size={16} /> Exporter en Excel
        </Button>
      </Card>

      <Card title="Statistiques rapides">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {TYPES_DOSSIER.map((t) => {
            const count = dossiers.filter((d) => d.type === t.id).length
            return (
              <div key={t.id} className="rounded-lg bg-gray-50 p-3">
                <p className="text-xl font-extrabold text-gray-800">{count}</p>
                <p className="text-xs text-gray-500">{t.label}</p>
              </div>
            )
          })}
        </div>
      </Card>

      {isAdmin && (
        <Card title="Réinitialisation des données" className="border-red-200">
          <div className="flex items-start gap-3 rounded-lg bg-red-50 p-4">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold text-red-900">Zone dangereuse</p>
              <p className="mt-1 text-sm text-red-700">
                Cette action supprime définitivement tous les dossiers fonciers et leur historique d'étapes.
              </p>
              <Button variant="danger" size="sm" className="mt-3" onClick={() => setResetOpen(true)}>
                <Trash2 size={15} /> Réinitialiser les dossiers
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Exporter les dossiers fonciers"
        footer={<><Button variant="ghost" onClick={() => setExportOpen(false)}>Annuler</Button><Button onClick={exportXLSX} loading={exporting}><FileSpreadsheet size={16} /> Exporter ({dossiers.length})</Button></>}>
        <p className="text-sm text-gray-600">
          Le fichier Excel contiendra tous les <strong>{dossiers.length} dossiers</strong> avec leur type, localisation, statut, mode d'acquisition et responsable.
        </p>
      </Modal>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Confirmer la réinitialisation"
        footer={<><Button variant="ghost" onClick={() => setResetOpen(false)}>Annuler</Button><Button variant="danger" onClick={resetDonnees} loading={resetting}><Trash2 size={15} /> Confirmer</Button></>}>
        <p className="text-sm text-red-700 font-semibold">Tous les {dossiers.length} dossiers fonciers seront supprimés définitivement.</p>
        <p className="mt-2 text-sm text-gray-500">Cette action est irréversible.</p>
      </Modal>
    </div>
  )
}

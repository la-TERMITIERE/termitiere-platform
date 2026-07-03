// Paramètres Dépenses — export des dépenses + réinitialisation.
import { useState } from 'react'
import { FileSpreadsheet, FileText, FileDown, Trash2, AlertTriangle } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { usePDF } from '../../hooks/usePDF'
import { isFullAccessRole } from '../../core/roles'
import { removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatDateShort, todayStr } from '../../utils/formatters'
import { SECTEURS } from './data'

const ENTETES = ['Date', 'Secteur', 'Catégorie', 'Montant (FCFA)', 'Description', 'Enregistré par']

function ligneDe(d) {
  return [
    formatDateShort(d.date),
    SECTEURS.find((s) => s.id === d.secteurId)?.label || d.secteurId || '—',
    d.categorie || '—',
    Number(d.montant) || 0,
    d.description || '—',
    d.enregistrePar || '—'
  ]
}

export default function Params() {
  const { role } = useAuth()
  const { data: depenses } = useCollection('depense_depenses')
  const { data: budgets }  = useCollection('depense_budgets')
  const { generateRapportPDF } = usePDF('depense')

  const [exportingXLSX, setExportingXLSX] = useState(false)
  const [exportingPDF, setExportingPDF] = useState(false)
  const [exportingCSV, setExportingCSV] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  const isAdmin = isFullAccessRole(role)

  async function exportXLSX() {
    setExportingXLSX(true)
    try {
      const rows = depenses.map((d) => ({
        Date: formatDateShort(d.date),
        Secteur: SECTEURS.find((s) => s.id === d.secteurId)?.label || d.secteurId || '—',
        Catégorie: d.categorie || '—',
        Montant: Number(d.montant) || 0,
        Description: d.description || '—',
        'Enregistré par': d.enregistrePar || '—'
      }))
      await exportRapportExcel({
        filename: `depenses-${todayStr()}.xlsx`,
        sections: [{
          id: 'depenses', name: 'Dépenses',
          title: 'Suivi des dépenses — La Termitière',
          subtitle: `Exporté le ${formatDateShort(todayStr())} · ${depenses.length} dépense(s)`,
          columns: [
            { key: 'Date', label: 'Date', width: 14 },
            { key: 'Secteur', label: 'Secteur', width: 22 },
            { key: 'Catégorie', label: 'Catégorie', width: 22 },
            { key: 'Montant', label: 'Montant (FCFA)', width: 16 },
            { key: 'Description', label: 'Description', width: 40 },
            { key: 'Enregistré par', label: 'Enregistré par', width: 20 }
          ],
          rows
        }]
      })
      toast.success('Export Excel généré ✓')
    } finally {
      setExportingXLSX(false)
    }
  }

  async function exportPDF() {
    setExportingPDF(true)
    try {
      await generateRapportPDF({
        titre: 'Suivi des dépenses',
        colonnes: ENTETES,
        lignes: depenses.map(ligneDe),
        fichier: `depenses-${todayStr()}.pdf`
      })
      toast.success('Export PDF généré ✓')
    } finally {
      setExportingPDF(false)
    }
  }

  function exportCSV() {
    setExportingCSV(true)
    try {
      const escape = (v) => {
        const s = String(v ?? '')
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const lignes = [ENTETES, ...depenses.map(ligneDe)]
      const csv = lignes.map((l) => l.map(escape).join(';')).join('\r\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `depenses-${todayStr()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export CSV généré ✓')
    } finally {
      setExportingCSV(false)
    }
  }

  async function resetDonnees() {
    if (!isAdmin) return toast.error('Action réservée à l\'administrateur')
    setResetting(true)
    try {
      for (const d of depenses) await removeItem('depense_depenses', d.id)
      for (const b of budgets) await removeItem('depense_budgets', b.id)
      await audit('depense', 'RESET', 'Réinitialisation complète des dépenses et budgets')
      toast.success('Données réinitialisées ✓')
      setResetOpen(false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Export des dépenses">
        <p className="mb-4 text-sm text-gray-500">
          Exporte l'ensemble des dépenses enregistrées ({depenses.length}) dans le format de ton choix.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportXLSX} loading={exportingXLSX}>
            <FileSpreadsheet size={16} /> Excel
          </Button>
          <Button variant="outline" onClick={exportPDF} loading={exportingPDF}>
            <FileText size={16} /> PDF
          </Button>
          <Button variant="outline" onClick={exportCSV} loading={exportingCSV}>
            <FileDown size={16} /> CSV
          </Button>
        </div>
      </Card>

      <Card title="Statistiques rapides">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SECTEURS.map((s) => {
            const count = depenses.filter((d) => d.secteurId === s.id).length
            return (
              <div key={s.id} className="rounded-2xl border border-gray-200/60 bg-white/50 p-3 shadow-[0_10px_24px_-14px_rgba(26,26,26,0.10)] backdrop-blur-md backdrop-saturate-150">
                <p className="text-xl font-extrabold text-gray-800">{count}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            )
          })}
        </div>
      </Card>

      {isAdmin && (
        <Card title="Réinitialisation des données" className="border-red-200">
          <div className="flex items-start gap-3 rounded-2xl border border-red-200/60 bg-red-50/60 p-4 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold text-red-900">Zone dangereuse</p>
              <p className="mt-1 text-sm text-red-700">
                Cette action supprime définitivement toutes les dépenses et tous les budgets alloués.
              </p>
              <Button variant="danger" size="sm" className="mt-3" onClick={() => setResetOpen(true)}>
                <Trash2 size={15} /> Réinitialiser les données
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Confirmer la réinitialisation"
        footer={<><Button variant="ghost" onClick={() => setResetOpen(false)}>Annuler</Button><Button variant="danger" onClick={resetDonnees} loading={resetting}>Confirmer</Button></>}>
        <p className="text-sm text-red-700 font-semibold">Toutes les {depenses.length} dépenses et {budgets.length} budgets seront supprimés définitivement.</p>
        <p className="mt-2 text-sm text-gray-500">Cette action est irréversible.</p>
      </Modal>
    </div>
  )
}

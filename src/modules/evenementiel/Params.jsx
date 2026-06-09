// Paramètres briqueterie — recettes matières / briques, tarifs, export, reset.
import { useState, useEffect } from 'react'
import { Save, FileSpreadsheet, Trash2, AlertTriangle } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useBriqueterieStore } from './store/referentielStore'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { MATIERES } from './data'

export default function Params() {
  const { role } = useAuth()
  const { briques, recettes, saveRecettes, saveBrique } = useBriqueterieStore()
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: demandes } = useCollection('evenementiel_demandes')

  const [localRecettes, setLocalRecettes] = useState(recettes)
  const [localTarifs, setLocalTarifs] = useState({})
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const isAdmin = role === 'admin'

  useEffect(() => {
    setLocalRecettes(recettes)
    const t = {}
    briques.forEach((b) => { t[b.id] = b.tarifVente })
    setLocalTarifs(t)
  }, [recettes, briques])

  const briquesProd = briques.filter((b) => b.id !== 'caillasses')

  function setRecette(briqueId, matiereId, val) {
    setLocalRecettes((r) => ({
      ...r,
      [briqueId]: { ...(r[briqueId] || {}), [matiereId]: parseFloat(val) || 0 }
    }))
  }

  async function saveAll() {
    await saveRecettes(localRecettes)
    for (const b of briques) {
      if (localTarifs[b.id] !== undefined) {
        await saveBrique({ ...b, tarifVente: parseInt(localTarifs[b.id]) || b.tarifVente })
      }
    }
    toast.success('Paramètres enregistrés ✓')
  }

  async function exportXLSX() {
    setExporting(true)
    try {
      const rows = productions.map((p) => ({
        Date: p.date,
        'Agent': p.agentNom || '—',
        'Briques produites': p.totalBriques || 0,
        Statut: p.statut || '—'
      }))
      await exportRapportExcel({
        filename: `export-briqueterie-${todayStr()}.xlsx`,
        sections: [{
          id: 'productions', name: 'Productions',
          title: 'Productions — Briqueterie',
          subtitle: `Exporté le ${formatDateShort(todayStr())} · ${productions.length} production(s)`,
          columns: [
            { key: 'Date', label: 'Date', width: 14 },
            { key: 'Agent', label: 'Agent', width: 22 },
            { key: 'Briques produites', label: 'Briques produites', width: 20 },
            { key: 'Statut', label: 'Statut', width: 14 }
          ],
          rows
        }]
      })
    } finally {
      setExporting(false)
    }
  }

  async function resetDonnees() {
    setResetting(true)
    try {
      const collections = [
        { id: 'evenementiel_inventaires', data: inventaires },
        { id: 'evenementiel_productions', data: productions },
        { id: 'evenementiel_ventes', data: ventes },
        { id: 'evenementiel_demandes', data: demandes }
      ]
      for (const col of collections) {
        for (const item of col.data) await removeItem(col.id, item.id)
      }
      await audit('evenementiel', 'RESET', 'Réinitialisation complète des données briqueterie')
      toast.success('Données briqueterie réinitialisées ✓')
      setResetOpen(false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Consommation matières par <strong>1000 briques</strong> produites. Ajustez selon vos mesures techniques.
      </p>
      <div className="flex justify-end"><Button onClick={saveAll}><Save size={16} /> Enregistrer</Button></div>

      <Card title="Recettes de production (pour 1000 briques)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Catégorie brique</th>
                {MATIERES.map((m) => <th key={m.id} className="px-2 py-2 text-center">{m.nom}<br /><span className="font-normal normal-case">({m.unite})</span></th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {briquesProd.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2 font-semibold">{b.nom}</td>
                  {MATIERES.map((m) => (
                    <td key={m.id} className="px-2 py-1.5 text-center">
                      <Input type="number" min="0" step="0.1" className="w-20 text-center"
                        value={localRecettes[b.id]?.[m.id] ?? recettes[b.id]?.[m.id] ?? 0}
                        onChange={(e) => setRecette(b.id, m.id, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Tarifs de vente">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {briques.map((b) => (
            <FormGroup key={b.id} label={b.nom}>
              <Input type="number" min="0" value={localTarifs[b.id] ?? b.tarifVente}
                onChange={(e) => setLocalTarifs((t) => ({ ...t, [b.id]: e.target.value }))} />
              <span className="text-xs text-gray-400">{formatMoney(localTarifs[b.id] ?? b.tarifVente)} / unité</span>
            </FormGroup>
          ))}
        </div>
      </Card>

      <Card title="Export des données">
        <p className="mb-3 text-sm text-gray-500">Exporter les productions briqueterie en fichier Excel.</p>
        <Button onClick={exportXLSX} loading={exporting}><FileSpreadsheet size={16} /> Exporter les productions</Button>
      </Card>

      {isAdmin && (
        <Card title="Réinitialisation des données" className="border-red-200">
          <div className="flex items-start gap-3 rounded-lg bg-red-50 p-4">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold text-red-900">Zone dangereuse</p>
              <p className="mt-1 text-sm text-red-700">
                Cette action supprime définitivement toutes les saisies, productions, ventes et autorisations de sortie.
                Les recettes et tarifs sont conservés.
              </p>
              <Button variant="danger" size="sm" className="mt-3" onClick={() => setResetOpen(true)}>
                <Trash2 size={15} /> Réinitialiser les données
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Confirmer la réinitialisation"
        footer={<><Button variant="ghost" onClick={() => setResetOpen(false)}>Annuler</Button><Button variant="danger" onClick={resetDonnees} loading={resetting}><Trash2 size={15} /> Confirmer</Button></>}>
        <p className="text-sm text-red-700 font-semibold">Les données suivantes seront supprimées :</p>
        <ul className="ml-4 mt-2 list-disc space-y-1 text-sm text-gray-700">
          <li>Saisies matières ({inventaires.length})</li>
          <li>Productions ({productions.length})</li>
          <li>Ventes ({ventes.length})</li>
          <li>Autorisations de sortie ({demandes.length})</li>
        </ul>
        <p className="mt-3 text-sm text-gray-500">Cette action est irréversible.</p>
      </Modal>
    </div>
  )
}

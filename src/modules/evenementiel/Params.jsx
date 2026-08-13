// Paramètres briqueterie — recettes matières / briques, tarifs, export, reset.
import { useState, useEffect } from 'react'
import { Save, FileSpreadsheet, Trash2, AlertTriangle, Settings } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useBriqueterieStore } from './store/referentielStore'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole } from '../../core/roles'
import { removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { exportRapportExcel } from '../../utils/excelReport'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { MATIERES } from './data'
import { rendementBrique, coutMatiereBrique } from './logic'

export default function Params() {
  const { role } = useAuth()
  const { briques, recettes, saveRecettes, saveBrique, prixSacCiment, saveMarge } = useBriqueterieStore()
  const { data: inventaires } = useCollection('evenementiel_inventaires')
  const { data: productions } = useCollection('evenementiel_productions')
  const { data: ventes } = useCollection('evenementiel_ventes')
  const { data: demandes } = useCollection('evenementiel_demandes')

  const [localRecettes, setLocalRecettes] = useState(recettes)
  const [localTarifs, setLocalTarifs] = useState({})
  const [localRendements, setLocalRendements] = useState({})
  const [prixCiment, setPrixCiment] = useState(prixSacCiment)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const isAdmin = isFullAccessRole(role)

  useEffect(() => {
    setLocalRecettes(recettes)
    const t = {}, r = {}
    briques.forEach((b) => { t[b.id] = b.tarifVente; r[b.id] = rendementBrique(b) })
    setLocalTarifs(t)
    setLocalRendements(r)
  }, [recettes, briques])
  useEffect(() => { setPrixCiment(prixSacCiment) }, [prixSacCiment])

  const briquesProd = briques.filter((b) => b.id !== 'caillasses')

  function setRecette(briqueId, matiereId, val) {
    setLocalRecettes((r) => ({
      ...r,
      [briqueId]: { ...(r[briqueId] || {}), [matiereId]: parseFloat(val) || 0 }
    }))
  }

  async function saveAll() {
    await saveRecettes(localRecettes)
    await saveMarge(prixCiment)
    for (const b of briques) {
      const patch = { ...b }
      if (localTarifs[b.id] !== undefined) patch.tarifVente = parseInt(localTarifs[b.id]) || b.tarifVente
      if (localRendements[b.id] !== undefined && localRendements[b.id] !== '') patch.rendement = parseFloat(localRendements[b.id]) || 0
      await saveBrique(patch)
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
    if (!isAdmin) return toast.error('Action réservée à l\'administrateur')
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
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(124,58,237,0.35),0_8px_20px_-8px_rgba(124,58,237,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.85) 0%, rgba(76,29,149,0.8) 100%)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#7c3aed', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55', flexShrink: 0
        }}>
          <Settings size={28} color="white" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Paramètres</h2>
          <p className="text-sm text-white/80">Recettes de production — consommation de matières pour 1000 briques</p>
        </div>
      </div>

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

      <Card title="Marge — coût du matériel (ciment)">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <FormGroup label="Prix d'un sac de ciment (FCFA)">
            <Input type="number" min="0" className="w-40" value={prixCiment} onChange={(e) => setPrixCiment(e.target.value)} />
          </FormGroup>
          <p className="pb-2 text-xs text-gray-400">
            Coût matériel d'une brique = <strong>prix du sac ÷ rendement</strong> du type.
            Le <strong>rendement</strong> = nombre de briques faites avec un sac de ciment. Utilisé dans l'onglet <strong>Marge &amp; Bénéfice</strong>.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Type de brique</th>
                <th className="px-2 py-2 text-center">Rendement (briques / sac)</th>
                <th className="px-3 py-2 text-right">Coût matériel / brique</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {briquesProd.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2 font-semibold">{b.nom}</td>
                  <td className="px-2 py-1.5 text-center">
                    <Input type="number" min="0" step="1" className="w-24 text-center"
                      value={localRendements[b.id] ?? ''}
                      onChange={(e) => setLocalRendements((r) => ({ ...r, [b.id]: e.target.value }))} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold text-amber-700">
                    {formatMoney(Math.round(coutMatiereBrique({ ...b, rendement: localRendements[b.id] }, prixCiment)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

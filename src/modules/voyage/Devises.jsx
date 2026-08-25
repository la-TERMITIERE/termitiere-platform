// Devises & taux — table des devises avec leur taux vers le FCFA. Édition manuelle
// + actualisation EN DIRECT (best-effort). Le prix FCFA des articles se recalcule
// automatiquement dès qu'un taux change ici.
import { useEffect, useState } from 'react'
import { Coins, RefreshCw, Save, Plus, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useAuth } from '../../hooks/useAuth'
import { useVoyageStore } from './store/voyageStore'
import { isReadOnlyRole } from '../../core/roles'
import { toast } from '../../core/notifications'
import { formatNumber, formatDateTime } from '../../utils/formatters'

export default function Devises() {
  const { role } = useAuth()
  const peutEditer = !isReadOnlyRole(role)
  const devises = useVoyageStore((s) => s.devises)
  const saveDevise = useVoyageStore((s) => s.saveDevise)
  const removeDevise = useVoyageStore((s) => s.removeDevise)
  const refreshTaux = useVoyageStore((s) => s.refreshTaux)

  const [local, setLocal] = useState({})
  const [refreshing, setRefreshing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [nouveau, setNouveau] = useState({ code: '', nom: '', symbole: '', tauxFCFA: '' })

  useEffect(() => {
    const m = {}; devises.forEach((d) => { m[d.code] = d.tauxFCFA }); setLocal(m)
  }, [devises])

  async function enregistrer() {
    await Promise.all(devises.map((d) => {
      const t = parseFloat(local[d.code])
      if (Number.isFinite(t) && t !== d.tauxFCFA && d.code !== 'XOF') return saveDevise({ ...d, tauxFCFA: t, source: 'manuel' })
      return null
    }))
    toast.success('Taux enregistrés ✓')
  }

  async function actualiser() {
    setRefreshing(true)
    try {
      const r = await refreshTaux()
      if (r.ok) toast.success(`Taux actualisés en direct ✓ (${r.maj} devise${r.maj > 1 ? 's' : ''})`)
      else toast.error(r.erreur || 'Actualisation impossible (hors ligne).')
    } finally { setRefreshing(false) }
  }

  async function ajouter() {
    const code = (nouveau.code || '').trim().toUpperCase()
    if (!code) return toast.error('Code de la devise requis (ex : JPY)')
    if (!(parseFloat(nouveau.tauxFCFA) > 0)) return toast.error('Taux vers le FCFA requis')
    await saveDevise({ code, nom: nouveau.nom.trim() || code, symbole: nouveau.symbole.trim() || code, tauxFCFA: parseFloat(nouveau.tauxFCFA), source: 'manuel' })
    toast.success(`${code} ajoutée ✓`)
    setAddOpen(false); setNouveau({ code: '', nom: '', symbole: '', tauxFCFA: '' })
  }

  const derniereMaj = devises.reduce((m, d) => Math.max(m, d.updatedAt || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600"><Coins size={22} /></div>
          <div>
            <h2 className="text-lg font-extrabold text-gray-900">Devises &amp; taux</h2>
            <p className="text-sm text-gray-500">1 unité de devise = X FCFA · les prix se convertissent en direct</p>
          </div>
        </div>
        {peutEditer && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={actualiser} loading={refreshing}><RefreshCw size={16} /> Actualiser en direct</Button>
            <Button style={{ backgroundColor: '#4f46e5' }} onClick={enregistrer}><Save size={16} /> Enregistrer</Button>
          </div>
        )}
      </div>

      {derniereMaj > 0 && <p className="text-xs text-gray-400">Dernière mise à jour d'un taux : {formatDateTime(derniereMaj)}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Devise</th>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-right">1 unité = ? FCFA</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {devises.map((d) => (
              <tr key={d.code} className={d.code === 'XOF' ? 'bg-gray-50/60' : ''}>
                <td className="px-3 py-2 font-semibold">{d.nom} <span className="text-gray-400">{d.symbole}</span></td>
                <td className="px-3 py-2 font-mono text-xs">{d.code}</td>
                <td className="px-3 py-2 text-right">
                  {d.code === 'XOF' ? <span className="font-bold">1</span> : peutEditer ? (
                    <Input type="number" min="0" step="0.01" className="ml-auto w-32 text-right"
                      value={local[d.code] ?? d.tauxFCFA} onChange={(e) => setLocal((m) => ({ ...m, [d.code]: e.target.value }))} />
                  ) : <span className="font-bold">{formatNumber(d.tauxFCFA)}</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {d.code === 'XOF' ? <span className="text-gray-400">base</span>
                    : d.source === 'live' ? <span className="font-semibold text-green-600">🌐 en direct</span>
                    : <span className="text-gray-500">✍️ manuel</span>}
                </td>
                <td className="px-2 py-2 text-right">
                  {peutEditer && d.code !== 'XOF' && (
                    <button onClick={() => { if (window.confirm(`Retirer ${d.code} ?`)) removeDevise(d.code) }} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {peutEditer && <Button variant="outline" onClick={() => setAddOpen(true)}><Plus size={15} /> Ajouter une devise</Button>}

      <p className="rounded-lg bg-indigo-50 px-4 py-3 text-xs text-indigo-800">
        💡 <strong>Temps réel</strong> : dès qu'un taux change ici (édition ou actualisation en direct), tous les prix FCFA des voyages en cours se recalculent automatiquement — sauf les articles déjà <strong>achetés</strong>, dont le prix a été figé au taux du jour de l'achat.
      </p>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} size="sm" title="Ajouter une devise"
        footer={<><Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button><Button style={{ backgroundColor: '#4f46e5' }} onClick={ajouter}>Ajouter</Button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormGroup label="Code (ISO)" required><Input value={nouveau.code} onChange={(e) => setNouveau((n) => ({ ...n, code: e.target.value.toUpperCase() }))} placeholder="ex : JPY" /></FormGroup>
            <FormGroup label="Symbole"><Input value={nouveau.symbole} onChange={(e) => setNouveau((n) => ({ ...n, symbole: e.target.value }))} placeholder="ex : ¥" /></FormGroup>
          </div>
          <FormGroup label="Nom"><Input value={nouveau.nom} onChange={(e) => setNouveau((n) => ({ ...n, nom: e.target.value }))} placeholder="ex : Yen japonais" /></FormGroup>
          <FormGroup label="1 unité = ? FCFA" required><Input type="number" min="0" step="0.01" value={nouveau.tauxFCFA} onChange={(e) => setNouveau((n) => ({ ...n, tauxFCFA: e.target.value }))} /></FormGroup>
        </div>
      </Modal>
    </div>
  )
}

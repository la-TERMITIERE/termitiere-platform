// Paramètres briqueterie — recettes matières / briques, tarifs.
import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import FormGroup from '../../shared/forms/FormGroup'
import Input from '../../shared/forms/Input'
import { useBriqueterieStore } from './store/referentielStore'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { MATIERES } from './data'

export default function Params() {
  const { briques, recettes, saveRecettes, saveBrique } = useBriqueterieStore()
  const [localRecettes, setLocalRecettes] = useState(recettes)
  const [localTarifs, setLocalTarifs] = useState({})

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
    </div>
  )
}

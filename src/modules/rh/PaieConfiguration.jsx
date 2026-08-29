// RH — Configuration de la paie (Temps & Paie). Taux CNSS & barème ITS.
import { useState } from 'react'
import { Settings, Save, Landmark } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import { useCollection } from '../../hooks/useFirestore'
import { setItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { PAIE_CONFIG_DEFAUT, COMPTA_PAIE, calculerBulletin, COL } from './store/rhStore'

export default function PaieConfiguration() {
  const { data: config } = useCollection(COL.config)
  const existant = config.find((c) => c.id === 'paie')
  const [form, setForm] = useState(() => ({
    tauxCnssSalarie: (existant?.tauxCnssSalarie ?? PAIE_CONFIG_DEFAUT.tauxCnssSalarie) * 100,
    tauxCnssEmployeur: (existant?.tauxCnssEmployeur ?? PAIE_CONFIG_DEFAUT.tauxCnssEmployeur) * 100,
    bareme: (existant?.bareme ?? PAIE_CONFIG_DEFAUT.bareme).map((t) => ({ plafond: t.plafond === Infinity ? '' : t.plafond, taux: t.taux * 100 }))
  }))
  const [demo, setDemo] = useState(150000)

  async function save() {
    const bareme = form.bareme.map((t) => ({ plafond: t.plafond === '' ? Infinity : Number(t.plafond), taux: Number(t.taux) / 100 }))
    await setItem(COL.config, 'paie', {
      tauxCnssSalarie: Number(form.tauxCnssSalarie) / 100,
      tauxCnssEmployeur: Number(form.tauxCnssEmployeur) / 100,
      bareme, devise: 'XOF'
    })
    toast.success('Configuration enregistrée ✓')
  }

  const configLive = {
    tauxCnssSalarie: Number(form.tauxCnssSalarie) / 100,
    tauxCnssEmployeur: Number(form.tauxCnssEmployeur) / 100,
    bareme: form.bareme.map((t) => ({ plafond: t.plafond === '' ? Infinity : Number(t.plafond), taux: Number(t.taux) / 100 }))
  }
  const calc = calculerBulletin(demo, 0, configLive)

  const setTranche = (i, key, val) => setForm((f) => ({ ...f, bareme: f.bareme.map((t, j) => j === i ? { ...t, [key]: val } : t) }))

  return (
    <div className="space-y-5">
      <header>
        <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Temps & Paie</div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
          <Settings className="text-sky-600" /> Configuration de la paie
        </h1>
        <p className="text-sm text-gray-500">Taux de cotisation et barème d'imposition appliqués au calcul des bulletins.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cotisations CNSS">
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Taux salarié (%)"><input type="number" step="0.1" value={form.tauxCnssSalarie} onChange={(e) => setForm({ ...form, tauxCnssSalarie: e.target.value })} className="input-base" /></Champ>
            <Champ label="Taux employeur (%)"><input type="number" step="0.1" value={form.tauxCnssEmployeur} onChange={(e) => setForm({ ...form, tauxCnssEmployeur: e.target.value })} className="input-base" /></Champ>
          </div>
          <p className="mt-2 text-xs text-gray-400">Togo : 4 % salarié, 17,5 % employeur (indicatif).</p>
        </Card>

        <Card title="Simulateur de bulletin">
          <Champ label="Salaire brut (XOF)"><input type="number" value={demo} onChange={(e) => setDemo(Number(e.target.value))} className="input-base" /></Champ>
          <div className="mt-3 space-y-1 text-sm">
            <Ligne label="Brut" value={calc.brutTotal} />
            <Ligne label="− CNSS salarié" value={-calc.cnssSalarie} />
            <Ligne label="− ITS" value={-calc.its} />
            <div className="border-t border-gray-100 pt-1 dark:border-white/10"><Ligne label="Net à payer" value={calc.net} bold /></div>
            <Ligne label="Coût employeur" value={calc.coutEmployeur} muted />
          </div>
        </Card>
      </div>

      <Card title="Barème ITS (tranches mensuelles)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="py-2">Plafond de tranche (XOF)</th><th className="py-2">Taux (%)</th></tr></thead>
            <tbody>
              {form.bareme.map((t, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3"><input value={t.plafond} placeholder="∞ (dernière tranche)" onChange={(e) => setTranche(i, 'plafond', e.target.value)} className="input-base" /></td>
                  <td className="py-1.5"><input type="number" step="0.1" value={t.taux} onChange={(e) => setTranche(i, 'taux', e.target.value)} className="input-base !w-28" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">Barème progressif : chaque tranche s'applique à la fraction du salaire imposable comprise dans ses bornes.</p>
      </Card>

      <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
        <Landmark size={16} className="mt-0.5 shrink-0" />
        <span>Comptabilisation : journal <strong>{COMPTA_PAIE.journal}</strong> · charge <strong>{COMPTA_PAIE.compteCharge}</strong> · personnel dû <strong>{COMPTA_PAIE.comptePersonnel}</strong> · CNSS <strong>{COMPTA_PAIE.compteCnss}</strong>.</span>
      </div>

      <div className="flex justify-end"><Button style={{ background: '#0284c7' }} onClick={save}><Save size={16} /> Enregistrer la configuration</Button></div>
    </div>
  )
}

function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}
function Ligne({ label, value, bold, muted }) {
  return <div className={`flex items-center justify-between ${bold ? 'font-bold' : ''} ${muted ? 'text-gray-400' : ''}`}><span className={muted ? '' : 'text-gray-500'}>{label}</span><span>{formatMoney(value)}</span></div>
}
